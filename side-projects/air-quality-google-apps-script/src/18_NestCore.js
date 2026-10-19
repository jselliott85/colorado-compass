/** Read-only Nest data model shared by the bound join and separate worker. */
const NEST_TABLE = 'Nest_15min';
const NEST_LEDGER = 'Nest_Observations';
const NEST_HEALTH = 'Nest_Collection_Health';
const NEST_TAKEOUT = 'Nest_Takeout_15min';
const NEST_TAKEOUT_HEADERS = Object.freeze(['bin_zone_key','timestamp_utc','interval_end_utc','zone_id','heating_seconds_reported','cooling_seconds_reported','fan_time_seconds_reported','mode_counter_sum_seconds','indoor_temp_source_value','indoor_humidity_source_value','heating_target_source_value','cooling_target_source_value','validation_status','source_file','export_sha256','retrieved_at_utc']);
const NEST_FIELDS = Object.freeze(['device_id', 'zone_id', 'hvac_status', 'thermostat_mode',
  'fan_timer_state', 'fan_timer_expiration_utc', 'temperature_c', 'relative_humidity_pct',
  'heat_setpoint_c', 'cool_setpoint_c', 'eco_mode', 'eco_heat_setpoint_c', 'eco_cool_setpoint_c', 'connectivity', 'latest_observation_utc',
  'heating_minutes', 'cooling_minutes', 'off_minutes', 'known_duration_minutes',
  'unknown_duration_minutes', 'known_duration_coverage_fraction', 'observation_count', 'duration_basis']);
const NEST_HEADERS = Object.freeze(['bin_zone_key', 'timestamp_utc', 'timestamp_local'].concat(NEST_FIELDS, ['ingested_at_utc']));
const NEST_LEDGER_HEADERS = Object.freeze(['observation_id', 'timestamp_utc', 'device_id', 'kind', 'traits_json', 'ingested_at_utc']);
const NEST_HEALTH_HEADERS = Object.freeze(['run_id', 'started_at_utc', 'finished_at_utc', 'drained', 'snapshot_ok', 'status']);
const NEST_CAVEAT = 'Read-only SDM observations. HVAC status is separate from thermostat mode. Fan timer ON/OFF and expiration are not measured physical blower operation or blower runtime. Durations describe provisional observed state persistence on a healthy event stream, not exact equipment runtime or interpolation. Outages/offline periods are unknown; API snapshots cannot recover missed short cycles. SDM cannot backfill history. Separate Takeout interval counters use duration_basis=takeout_reported_interval_seconds and retain provenance in Nest_Takeout_15min. Zones remain separate.';
const NEST_TRAIT_FIELDS = Object.freeze({
  ThermostatHvac: {status: 'hvac_status'}, ThermostatMode: {mode: 'thermostat_mode'},
  Fan: {timerMode: 'fan_timer_state', timerTimeout: 'fan_timer_expiration_utc'},
  Temperature: {ambientTemperatureCelsius: 'temperature_c'},
  Humidity: {ambientHumidityPercent: 'relative_humidity_pct'},
  ThermostatTemperatureSetpoint: {heatCelsius: 'heat_setpoint_c', coolCelsius: 'cool_setpoint_c'},
  ThermostatEco: {mode: 'eco_mode', heatCelsius: 'eco_heat_setpoint_c', coolCelsius: 'eco_cool_setpoint_c'},
  Connectivity: {status: 'connectivity'}
});
function nestIso_(value) { return new Date(value).toISOString().replace(/\.000Z$/, 'Z'); }
function nestLocal_(value) {
  const d = new Date(value), z = Utilities.formatDate(d, 'America/Denver', 'Z');
  return Utilities.formatDate(d, 'America/Denver', "yyyy-MM-dd'T'HH:mm:ss") + z.slice(0, 3) + ':' + z.slice(3);
}
function nestPatch_(traits) {
  const result = {};
  Object.keys(NEST_TRAIT_FIELDS).forEach(function(name) {
    const trait = traits['sdm.devices.traits.' + name];
    if (!trait) return;
    Object.keys(NEST_TRAIT_FIELDS[name]).forEach(function(key) {
      const field = NEST_TRAIT_FIELDS[name][key];
      const value = trait[key];
      result[field] = value === undefined ? null : value;
    });
  });
  if (result.hvac_status && ['HEATING', 'COOLING', 'OFF'].indexOf(result.hvac_status) < 0) result.hvac_status = null;
  return result;
}
/** Healthy contiguous consumer windows. Never bridge missed heartbeats or an undrained queue. */
function nestWindows_(health, maxGapMs) {
  const result = [], rows = health.slice().sort(function(a, b) { return Date.parse(a.finished_at_utc) - Date.parse(b.finished_at_utc); });
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1], b = rows[i], start = Date.parse(a.started_at_utc), end = Date.parse(b.finished_at_utc);
    if (a.status !== 'success' || b.status !== 'success' || !a.drained || !b.drained || end - start > maxGapMs || end <= start) continue;
    const previous = result[result.length - 1];
    if (previous && previous[1] >= start) previous[1] = end;
    else result.push([start, end]);
  }
  return result;
}
/** Deterministic replay of partial trait updates in event time, per device, within health windows. */
function nestAggregate_(observations, health, zones, start, end, ingestedAt, eventMode) {
  const first = Math.floor(Date.parse(start) / 900000) * 900000, last = Math.floor(Date.parse(end) / 900000) * 900000;
  const unique = {};
  observations.forEach(function(r) {
    const prior = unique[r.observation_id];
    if (prior && (prior.timestamp_utc !== r.timestamp_utc || prior.device_id !== r.device_id || prior.traits_json !== r.traits_json)) throw new Error('Nest conflicting duplicate');
    unique[r.observation_id] = r;
  });
  const all = Object.keys(unique).map(function(k) { return unique[k]; }).sort(function(a, b) {
    return Date.parse(a.timestamp_utc) - Date.parse(b.timestamp_utc) || ((a.kind === 'snapshot' ? 0 : 1) - (b.kind === 'snapshot' ? 0 : 1)) || a.observation_id.localeCompare(b.observation_id);
  });
  const windows = eventMode ? nestWindows_(health, 180000) : [];
  const output = [];
  Object.keys(zones).sort().forEach(function(device) {
    const rows = all.filter(function(r) { return r.device_id === device; });
    const segments = [], statuses = {}, ambiguous = {};
    rows.forEach(function(r) {
      const value = nestPatch_(JSON.parse(r.traits_json)).hvac_status;
      if (value) {
        const time = Date.parse(r.timestamp_utc);
        if (statuses[time] && statuses[time] !== value) ambiguous[time] = true;
        statuses[time] = value;
      }
    });
    windows.forEach(function(window) {
      // Each window/gap requires a fresh state anchor. No carry over an outage.
      let state = {}, cursor = window[0];
      rows.filter(function(r) { return Date.parse(r.timestamp_utc) >= window[0] && Date.parse(r.timestamp_utc) <= window[1]; }).forEach(function(r) {
        const time = Date.parse(r.timestamp_utc);
        if (time > cursor && state.connectivity === 'ONLINE' && ['HEATING', 'COOLING', 'OFF'].indexOf(state.hvac_status) >= 0) segments.push([cursor, time, state.hvac_status]);
        if (r.kind === 'snapshot') state = {};
        Object.assign(state, nestPatch_(JSON.parse(r.traits_json)));
        if (ambiguous[Date.parse(r.timestamp_utc)]) state.hvac_status = null;
        cursor = time;
      });
      if (cursor < window[1] && state.connectivity === 'ONLINE' && ['HEATING', 'COOLING', 'OFF'].indexOf(state.hvac_status) >= 0) segments.push([cursor, window[1], state.hvac_status]);
    });
    let state = {}, position = 0, latest = null;
    for (let bin = first; bin < last; bin += 900000) {
      const stop = bin + 900000, counts = {HEATING: 0, COOLING: 0, OFF: 0};
      segments.forEach(function(s) { counts[s[2]] += Math.max(0, Math.min(stop, s[1]) - Math.max(bin, s[0])) / 60000; });
      let count = 0;
      while (position < rows.length && Date.parse(rows[position].timestamp_utc) < stop) {
        const r = rows[position++];
        if (r.kind === 'snapshot') state = {};
        Object.assign(state, nestPatch_(JSON.parse(r.traits_json)));
        if (ambiguous[Date.parse(r.timestamp_utc)]) state.hvac_status = null;
        latest = r.timestamp_utc;
        if (Date.parse(r.timestamp_utc) >= bin) count += 1;
      }
      const known = counts.HEATING + counts.COOLING + counts.OFF;
      const row = {bin_zone_key: nestIso_(bin) + '|' + zones[device], timestamp_utc: nestIso_(bin), timestamp_local: nestLocal_(bin),
        device_id: device, zone_id: zones[device], latest_observation_utc: latest,
        heating_minutes: known ? counts.HEATING : null, cooling_minutes: known ? counts.COOLING : null, off_minutes: known ? counts.OFF : null,
        known_duration_minutes: known, unknown_duration_minutes: 15 - known, known_duration_coverage_fraction: known / 15,
        observation_count: count, duration_basis: eventMode ? 'observed_state_persistence_provisional' : 'snapshots_only_no_runtime', ingested_at_utc: ingestedAt};
      const fresh = latest && stop - Date.parse(latest) <= 600000;
      Object.keys(state).forEach(function(k) { row[k] = fresh ? state[k] : null; });
      output.push(row);
    }
  });
  return output;
}
function nestIndex_(rows) {
  const index = {};
  rows.forEach(function(r) {
    if (!index[r.timestamp_utc]) index[r.timestamp_utc] = [];
    const value = {};
    NEST_FIELDS.forEach(function(k) { value[k] = r[k] === undefined || r[k] === '' ? null : r[k]; });
    index[r.timestamp_utc].push(value);
  });
  return index;
}
function aqNestIndex_(first, last) {
  const rows = aqReadRowsBetween_(NEST_TABLE, NEST_HEADERS, first + '|', last + '|~');
  return nestIndex_(rows);
}
function nestSchema_(column) {
  const numeric = /minutes$|_c$|_pct$|fraction$|count$/.test(column);
  return [numeric ? 'number' : 'text/JSON', /minutes$/.test(column) ? 'minutes' : /_c$/.test(column) ? 'C' : /fraction$/.test(column) ? 'fraction' : '', column + '. ' + NEST_CAVEAT + ' Takeout duration fields are reported interval counter seconds divided by 60, not a reconstructed state timeline. Its off_minutes is interval time minus heating and cooling. Historical point-in-time HVAC/fan/sensor states remain blank when unsupported.',
    'Blank means unavailable/unsupported. Zero runtime only within known-duration coverage; earlier history missing.'];
}
/** Independent six-hour watchdog; timestamps also let readers detect staleness between checks. */
function aqRefreshNestStatus_() {
  const sheet = aqSpreadsheet_().getSheetByName(AQ_SHEETS.STATUS);
  if (!sheet || sheet.getLastRow() < 2) return;
  const rows = aqObjectRows_(AQ_STATUS_HEADERS, sheet.getRange(2, 1, sheet.getLastRow() - 1, AQ_STATUS_HEADERS.length).getValues());
  const prior = rows.filter(function(r) { return r.source === 'nest'; })[0];
  if (!prior) return;
  if (!prior.last_attempt_utc || Date.now() - Date.parse(prior.last_attempt_utc) > 300000) {
    prior.status = 'stale';
    prior.message = 'Nest worker has not reported within five minutes. Runtime coverage after its last healthy checkpoint is unknown. ' + NEST_CAVEAT;
    aqUpdateSourceStatus_(prior);
  }
  try { aqNestEmailAlert_(prior); } catch (error) {
    aqProperties_().setProperty('NEST_EMAIL_DELIVERY_STATUS', 'failed; collection continues');
  }
}
/** Owner-requested LHL alerts, using the bound project's existing mail scope. */
function aqNestEmailAlert_(status) {
  const recipient = aqProperties_().getProperty('NEST_ALERT_EMAIL') || DriveApp.getFileById(aqConfig_().spreadsheetId).getOwner().getEmail();
  if (!/^[^@\s]+@leehilllabs\.com$/i.test(recipient)) return;
  const p = aqProperties_(), now = Date.now(), unhealthy = status.status !== 'success';
  const previous = p.getProperty('NEST_EMAIL_STATE') || '';
  const last = Date.parse(p.getProperty('NEST_EMAIL_LAST_UTC') || '') || 0;
  if (previous && ((!unhealthy && previous === 'healthy') || (unhealthy && previous === 'unhealthy' && now - last < 86400000))) return;
  const kind = unhealthy ? 'attention needed' : previous ? 'collection recovered' : 'monitoring enabled';
  MailApp.sendEmail({to: recipient, subject: 'Air quality Nest collector: ' + kind,
    body: 'Nest collector status: ' + status.status + '.\nLast attempt UTC: ' + (status.last_attempt_utc || 'never') +
      '\nLast success UTC: ' + (status.last_success_utc || 'never') +
      '\nOpen Source_Status, Nest_Collection_Health and Nest_Usage in the private air-quality dataset.\n' +
      'https://docs.google.com/spreadsheets/d/' + aqConfig_().spreadsheetId + '/edit\n\n' +
      'This independent check runs with the existing six-hour collector. Alerts can be delayed up to six hours and require that collector to remain active. Usage flags are operational proxies, not billing alerts or spending caps.'});
  p.setProperty('NEST_EMAIL_DELIVERY_STATUS', 'sent');
  p.setProperties({NEST_EMAIL_STATE: unhealthy ? 'unhealthy' : 'healthy', NEST_EMAIL_LAST_UTC: new Date(now).toISOString()});
}

/** Takeout source values stay separate when their point/average or fan semantics are unverified. */
function nestTakeoutSchema_(column) {
  const duration = /seconds/.test(column), value = /source_value$/.test(column);
  return [duration || value ? 'number' : 'text', duration ? 'seconds' : value ? 'source-native; interpretation unverified' : '',
    column + '. Google Nest Takeout HvacRuntime.jsonl aligned 900-second interval. Direct heating/cooling counter scale is validated against 900-second mode coverage; canonical runtime divides by 60. fan_time is an exported field, not SDM fan timer state or independently measured physical blower runtime. Sensor/target source values are retained without asserting an averaging convention. ZIP SHA-256, source member and retrieval timestamp identify the evidence.',
    'Missing source intervals remain absent. Anomalous mode coverage creates unknown runtime, never clipped or filled.'];
}

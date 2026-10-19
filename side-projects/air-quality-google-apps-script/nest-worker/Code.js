/** Standalone Apps Script worker. Never deploy this directory over the bound collector. */
function nestProperties_() { return PropertiesService.getScriptProperties(); }
function nestConfig_() {
  const p = nestProperties_().getProperties(), zones = JSON.parse(p.NEST_ZONES_JSON || '{}');
  const values = Object.keys(zones).map(function(k) { return zones[k]; });
  if (values.some(function(v) { return !/^[a-z][a-z0-9_]{0,39}$/.test(v); }) || new Set(values).size !== values.length) throw new Error('Nest invalid/duplicate zone aliases');
  if (!p.SPREADSHEET_ID || !p.NEST_DEVICE_ACCESS_PROJECT_ID || !p.NEST_CLIENT_ID || !p.NEST_CLIENT_SECRET || !p.NEST_REFRESH_TOKEN) throw new Error('Nest setup incomplete');
  if (p.NEST_SUBSCRIPTION && !/^projects\/[a-z][a-z0-9-]+\/subscriptions\/[A-Za-z][A-Za-z0-9._~-]+$/.test(p.NEST_SUBSCRIPTION)) throw new Error('Nest invalid subscription');
  return {p: p, zones: zones, events: Boolean(p.NEST_SUBSCRIPTION)};
}
/** Transport allowlist deliberately contains no equipment-control endpoint. Never reflect response bodies. */
function nestFetch_(url, options) {
  if (!/^https:\/\/(oauth2\.googleapis\.com\/token|smartdevicemanagement\.googleapis\.com\/v1\/enterprises\/[A-Za-z0-9-]+\/devices|pubsub\.googleapis\.com\/v1\/projects\/[a-z][a-z0-9-]+\/subscriptions\/[A-Za-z][A-Za-z0-9._~-]+:(pull|acknowledge))$/.test(url)) throw new Error('Nest endpoint prohibited');
  const method = String((options || {}).method || 'get').toLowerCase();
  if (url.indexOf('smartdevicemanagement.googleapis.com') >= 0 && method !== 'get') throw new Error('Nest equipment commands prohibited');
  let response;
  try { response = UrlFetchApp.fetch(url, Object.assign({muteHttpExceptions: true, followRedirects: false}, options)); }
  catch (e) { throw new Error('Nest network unavailable'); }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('Nest HTTP ' + response.getResponseCode());
  try { return JSON.parse(response.getContentText() || '{}'); } catch (e) { throw new Error('Nest invalid response'); }
}
function nestToken_(force) {
  const c = nestConfig_(), p = c.p;
  if (!force && p.NEST_ACCESS_TOKEN && Number(p.NEST_ACCESS_EXPIRES_MS) > Date.now() + 60000) return p.NEST_ACCESS_TOKEN;
  const token = nestFetch_('https://oauth2.googleapis.com/token', {method: 'post', payload: {grant_type: 'refresh_token',
    client_id: p.NEST_CLIENT_ID, client_secret: p.NEST_CLIENT_SECRET, refresh_token: p.NEST_REFRESH_TOKEN}});
  if (!token.access_token || !Number.isFinite(Number(token.expires_in))) throw new Error('Nest token refresh failed');
  nestProperties_().setProperties({NEST_ACCESS_TOKEN: token.access_token, NEST_ACCESS_EXPIRES_MS: String(Date.now() + Number(token.expires_in) * 1000)});
  if (token.refresh_token) nestProperties_().setProperty('NEST_REFRESH_TOKEN', token.refresh_token);
  return token.access_token;
}
function nestSnapshot_() {
  const c = nestConfig_(), url = 'https://smartdevicemanagement.googleapis.com/v1/enterprises/' + c.p.NEST_DEVICE_ACCESS_PROJECT_ID + '/devices';
  try { return nestFetch_(url, {method: 'get', headers: {Authorization: 'Bearer ' + nestToken_(false)}}); }
  catch (e) {
    if (e.message !== 'Nest HTTP 401') throw e;
    return nestFetch_(url, {method: 'get', headers: {Authorization: 'Bearer ' + nestToken_(true)}});
  }
}
function nestPubsub_(action, body) {
  const request = function(force) { return nestFetch_('https://pubsub.googleapis.com/v1/' + nestConfig_().p.NEST_SUBSCRIPTION + ':' + action,
    {method: 'post', contentType: 'application/json', payload: JSON.stringify(body), headers: {Authorization: 'Bearer ' + nestPubsubToken_(force)}}); };
  try { return request(false); }
  catch (e) { if (e.message !== 'Nest HTTP 401') throw e; return request(true); }
}
function nestPubsubToken_(force) {
  const p = nestConfig_().p;
  if (!p.NEST_PUBSUB_REFRESH_TOKEN) throw new Error('Nest Pub/Sub authorization missing');
  if (!force && p.NEST_PUBSUB_ACCESS_TOKEN && Number(p.NEST_PUBSUB_EXPIRES_MS) > Date.now() + 60000) return p.NEST_PUBSUB_ACCESS_TOKEN;
  const token = nestFetch_('https://oauth2.googleapis.com/token', {method: 'post', payload: {grant_type: 'refresh_token', client_id: p.NEST_CLIENT_ID, client_secret: p.NEST_CLIENT_SECRET, refresh_token: p.NEST_PUBSUB_REFRESH_TOKEN}});
  if (!token.access_token || !Number.isFinite(Number(token.expires_in))) throw new Error('Nest token refresh failed');
  nestProperties_().setProperties({NEST_PUBSUB_ACCESS_TOKEN: token.access_token, NEST_PUBSUB_EXPIRES_MS: String(Date.now() + Number(token.expires_in) * 1000)});
  return token.access_token;
}
function nestSheet_(name, headers) {
  const book = SpreadsheetApp.openById(nestConfig_().p.SPREADSHEET_ID);
  let sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  if (sheet.getLastRow()) {
    const prior = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    if (prior.some(function(v, i) { return v !== headers[i]; })) throw new Error('Nest schema mismatch: ' + name);
  } else sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}
function nestRead_(name, headers) {
  const s = nestSheet_(name, headers);
  if (s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, headers.length).getValues().map(function(values) {
    const row = {}; headers.forEach(function(k, i) { row[k] = k === 'date_utc' && values[i] instanceof Date ? values[i].toISOString().slice(0, 10) : values[i] === '' ? null : values[i]; }); return row;
  });
}
/** Timestamp/zone and observation-id upserts. Preserve identical rows' original ingestion time. */
function nestUpsert_(name, headers, rows) {
  const sheet = nestSheet_(name, headers), current = nestRead_(name, headers), byKey = {};
  current.forEach(function(r, i) { byKey[r[headers[0]]] = i + 2; });
  const append = [], updates = [], dedupe = {};
  rows.forEach(function(r) { dedupe[r[headers[0]]] = r; });
  Object.keys(dedupe).sort().forEach(function(key) {
    const r = dedupe[key], values = headers.map(function(h) { return r[h] === null || r[h] === undefined ? '' : r[h]; });
    if (byKey[key]) updates.push({row: byKey[key], values: values});
    else append.push(values);
  });
  updates.sort(function(a, b) { return a.row - b.row; });
  for (let i = 0; i < updates.length;) {
    const start = updates[i].row, values = [updates[i++].values];
    while (i < updates.length && updates[i].row === start + values.length) values.push(updates[i++].values);
    sheet.getRange(start, 1, values.length, headers.length).setValues(values);
  }
  if (append.length) {
    const start = sheet.getLastRow() + 1;
    if (sheet.getMaxRows() < start + append.length - 1) sheet.insertRowsAfter(sheet.getMaxRows(), start + append.length - 1 - sheet.getMaxRows());
    sheet.getRange(start, 1, append.length, headers.length).setValues(append);
    if (name !== 'Source_Status' && sheet.getLastRow() > 2) sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).sort({column: 1, ascending: true});
  }
}
function nestArchive_(name, object) {
  const p = nestProperties_();
  if (!p.getProperty('NEST_RAW_FOLDER_ID')) throw new Error('Nest configure a private raw Drive folder');
  const root = DriveApp.getFolderById(p.getProperty('NEST_RAW_FOLDER_ID'));
  const month = nestIso_(Date.now()).slice(0, 7), matches = root.getFoldersByName(month);
  const folder = matches.hasNext() ? matches.next() : root.createFolder(month);
  if (!folder.getFilesByName(name + '.json.gz').hasNext()) {
    const blob = Utilities.gzip(Utilities.newBlob(JSON.stringify(object), 'application/json', name + '.json')).setName(name + '.json.gz');
    folder.createFile(blob);
    nestUsageAdd_('archive_bytes', blob.getBytes().length);
    nestUsageAdd_('archive_files', 1);
  }
}
/** Safe discovery: stores raw result privately; only reports trait names/aliases, never tokens. */
function inspectNestDevices() {
  const raw = nestSnapshot_(), stamp = nestIso_(Date.now());
  nestArchive_('discovery-' + stamp.replace(/:/g, '-'), raw);
  return (raw.devices || []).filter(function(d) { return d.type === 'sdm.devices.types.THERMOSTAT'; }).map(function(d) {
    return {device_id: d.name, room_names: (d.parentRelations || []).map(function(r) { return r.displayName; }), traits: Object.keys(d.traits || {})};
  });
}
function installNestTrigger() {
  const c = nestConfig_();
  if (!Object.keys(c.zones).length || !c.p.NEST_RAW_FOLDER_ID) throw new Error('Nest discovery/zone/archive setup required');
  if (c.p.NEST_ENABLED !== 'true') throw new Error('Nest enable only after real observation verification');
  ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'runNestCollection'; }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runNestCollection').timeBased().everyMinutes(1).create();
}
function runNestCollection() {
  const c = nestConfig_();
  if (c.p.NEST_ENABLED !== 'true') return {status: 'disabled'};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {status: 'busy'};
  const run = Utilities.getUuid(), start = nestIso_(Date.now());
  nestUsageAdd_('runs', 1);
  let drained = false, snapshotOk = false, lateCount = 0;
  try {
    const existing = nestRead_(NEST_LEDGER, NEST_LEDGER_HEADERS), seen = {};
    existing.forEach(function(r) { seen[r.observation_id] = r; });
    const fresh = [], acks = [];
    if (c.events) {
      for (let batch = 0; batch < 3; batch += 1) {
        const messages = nestPubsub_('pull', {maxMessages: 100, returnImmediately: true}).receivedMessages || [];
        nestUsageAdd_('pull_requests', 1);
        nestUsageAdd_('messages_received', messages.length);
        nestUsageAdd_('delivery_proxy_bytes', Math.max(1000, JSON.stringify(messages).length));
        if (!messages.length) { drained = true; break; }
        messages.forEach(function(message) {
          const data = JSON.parse(Utilities.newBlob(Utilities.base64Decode(message.message.data)).getDataAsString());
          nestArchive_('event-' + message.message.messageId, {message: message.message, event: data, ingested_at_utc: nestIso_(Date.now())});
          const update = data.resourceUpdate;
          if (update && c.zones[update.name] && update.traits) {
            if (Date.parse(data.timestamp) < Date.now() - 48 * 3600000) {
              lateCount += 1; acks.push(message.ackId); return; // archived for explicit replay; never silently apply to recent history
            }
            if (!data.eventId || !Number.isFinite(Date.parse(data.timestamp)) || Date.parse(data.timestamp) > Date.now() + 60000) throw new Error('Nest invalid event time/id');
            const r = {observation_id: 'event:' + data.eventId, timestamp_utc: nestIso_(data.timestamp), device_id: update.name,
              kind: 'event', traits_json: JSON.stringify(update.traits), ingested_at_utc: nestIso_(Date.now())};
            if (seen[r.observation_id] && seen[r.observation_id].traits_json !== r.traits_json) throw new Error('Nest conflicting duplicate');
            if (!seen[r.observation_id]) { fresh.push(r); seen[r.observation_id] = r; }
          }
          acks.push(message.ackId);
        });
      }
    }
    // Every recovery starts from a fresh full snapshot, not old cached HVAC state.
    const health = nestRead_(NEST_HEALTH, NEST_HEALTH_HEADERS), previous = health.slice().sort(function(a, b) { return Date.parse(a.finished_at_utc) - Date.parse(b.finished_at_utc); }).slice(-1)[0];
    if (!previous || !previous.drained || previous.status !== 'success' || Date.now() - Date.parse(previous.finished_at_utc) > 180000 || Date.now() - Number(c.p.NEST_LAST_SNAPSHOT_MS || 0) >= 300000) {
      nestUsageAdd_('snapshot_requests', 1);
      const raw = nestSnapshot_(), observed = nestIso_(Date.now());
      nestArchive_('snapshot-' + run, {response: raw, observed_at_utc: observed, ingested_at_utc: observed});
      const reported = {};
      (raw.devices || []).forEach(function(device) {
        reported[device.name] = true;
        if (c.zones[device.name] && device.type === 'sdm.devices.types.THERMOSTAT') fresh.push({observation_id: 'snapshot:' + run + ':' + c.zones[device.name], timestamp_utc: observed, device_id: device.name, kind: 'snapshot', traits_json: JSON.stringify(device.traits || {}), ingested_at_utc: observed});
      });
      Object.keys(c.zones).filter(function(device) { return !reported[device]; }).forEach(function(device) {
        fresh.push({observation_id: 'snapshot:' + run + ':' + c.zones[device], timestamp_utc: observed, device_id: device, kind: 'snapshot', traits_json: '{}', ingested_at_utc: observed});
      });
      snapshotOk = true;
      nestProperties_().setProperty('NEST_LAST_SNAPSHOT_MS', String(Date.now()));
    }
    nestUpsert_(NEST_LEDGER, NEST_LEDGER_HEADERS, fresh);
    if (acks.length) nestPubsub_('acknowledge', {ackIds: acks}); // durable raw + normalized observations before acknowledgement
    const finish = nestIso_(Date.now()), h = {run_id: run, started_at_utc: start, finished_at_utc: finish, drained: drained && !lateCount, snapshot_ok: snapshotOk, status: lateCount ? 'degraded' : 'success'};
    // Batch health archives while preserving every individual continuity checkpoint.
    if (Math.floor(Date.parse(finish) / 900000) !== Number(c.p.NEST_HEALTH_ARCHIVE_BIN || 0)) {
      const after = Date.parse(c.p.NEST_HEALTH_ARCHIVE_THROUGH || '1970-01-01T00:00:00Z');
      nestArchive_('health-batch-' + run, health.concat([h]).filter(function(v) { return Date.parse(v.finished_at_utc) > after; }));
      nestProperties_().setProperties({NEST_HEALTH_ARCHIVE_BIN: String(Math.floor(Date.parse(finish) / 900000)), NEST_HEALTH_ARCHIVE_THROUGH: finish});
    }
    nestUpsert_(NEST_HEALTH, NEST_HEALTH_HEADERS, [h]); health.push(h);
    if (!c.p.NEST_COLLECTION_START_UTC && fresh.length) nestProperties_().setProperty('NEST_COLLECTION_START_UTC', start);
    const beginning = nestProperties_().getProperty('NEST_COLLECTION_START_UTC');
    const earliest = existing.concat(fresh).map(function(r) { return r.timestamp_utc; }).sort()[0];
    const recordedEarliest = c.p.NEST_EARLIEST_OBSERVATION_UTC;
    if (earliest && (!recordedEarliest || earliest < recordedEarliest)) nestProperties_().setProperty('NEST_EARLIEST_OBSERVATION_UTC', earliest);
    const closed = Math.floor(Date.parse(finish) / 900000);
    const late = fresh.some(function(r) { return Date.parse(r.timestamp_utc) < closed * 900000; });
    const closedObservationCount = existing.concat(fresh).filter(function(r) { return Date.parse(r.timestamp_utc) < closed * 900000; }).length;
    if (beginning && (late || c.p.NEST_LAST_MATERIALIZE_BIN !== String(closed) || c.p.NEST_LAST_CLOSED_OBSERVATION_COUNT !== String(closedObservationCount))) {
      const observations = existing.concat(fresh);
      const replayStart = nestIso_(Math.max(Date.parse(beginning), Date.now() - 48 * 3600000));
      const rows = nestAggregate_(observations, health, c.zones, replayStart, finish, finish, c.events);
      nestUpsert_(NEST_TABLE, NEST_HEADERS, rows);
      nestPatchMaster_(rows);
      nestProperties_().setProperty('NEST_LAST_MATERIALIZE_BIN', String(closed));
      nestProperties_().setProperty('NEST_LAST_CLOSED_OBSERVATION_COUNT', String(closedObservationCount));
    }
    nestTrim_(NEST_LEDGER, NEST_LEDGER_HEADERS, 'timestamp_utc', 3);
    nestTrim_(NEST_HEALTH, NEST_HEALTH_HEADERS, 'finished_at_utc', 3);
    nestStatus_(lateCount ? 'degraded' : 'success', finish, lateCount ? 'Old events archived; manual replay required. Duration coverage unknown during recovery.' : c.events ? (drained ? 'Event queue drained; durations provisional.' : 'Backlog: duration coverage unknown.') : 'Snapshots only: no runtime estimates.');
    return {status: 'success', observations_received: fresh.length, event_queue_drained: drained};
  } catch (e) {
    // Static sanitized errors only; transport bodies and credentials never escape.
    const finish = nestIso_(Date.now());
    nestUpsert_(NEST_HEALTH, NEST_HEALTH_HEADERS, [{run_id: run, started_at_utc: start, finished_at_utc: finish, drained: false, snapshot_ok: false, status: 'error'}]);
    nestStatus_('error', finish, /^Nest (HTTP \d+|network unavailable|token refresh failed|setup incomplete|late event requires archive replay)$/.test(e.message) ? e.message : 'Nest collection/processing failed; inspect private archive and configuration.');
    return {status: 'error'};
  } finally {
    try { nestUsageAdd_('runtime_ms', Date.now() - Date.parse(start)); nestWriteUsage_(); } finally { lock.releaseLock(); }
  }
}
function nestStatus_(status, now, message) {
  const headers = ['source', 'last_attempt_utc', 'last_success_utc', 'status', 'consecutive_failures', 'rows_fetched', 'rows_upserted', 'earliest_observation_utc', 'latest_observation_utc', 'message', 'dyson_retention_risk', 'schema_version'];
  const prior = nestRead_('Source_Status', headers).filter(function(r) { return r.source === 'nest'; })[0] || {};
  nestUpsert_('Source_Status', headers, [{source: 'nest', last_attempt_utc: now, last_success_utc: status === 'success' ? now : prior.last_success_utc,
    status: status, consecutive_failures: status === 'success' ? 0 : Number(prior.consecutive_failures || 0) + 1,
    earliest_observation_utc: nestProperties_().getProperty('NEST_EARLIEST_OBSERVATION_UTC') || nestProperties_().getProperty('NEST_COLLECTION_START_UTC'), latest_observation_utc: nestProperties_().getProperty('NEST_LAST_SNAPSHOT_MS') ? nestIso_(Number(nestProperties_().getProperty('NEST_LAST_SNAPSHOT_MS'))) : null,
    message: message + ' ' + NEST_CAVEAT, schema_version: '1.2.0'}]);
}
/** Patch only Nest columns on existing UTC keys; never reconstruct other sources. */
function nestPatchMaster_(rows) {
  const book = SpreadsheetApp.openById(nestConfig_().p.SPREADSHEET_ID), sheet = book.getSheetByName('Master_15min');
  if (!sheet || sheet.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0], boundary = headers.indexOf('nest_present');
  if (boundary < 0 || headers.slice(boundary, boundary + 3).join(',') !== 'nest_present,nest_zone_count,nest_zones_json') throw new Error('Nest deploy bound Master schema first');
  const index = nestIndex_(rows), keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  const values = sheet.getRange(2, boundary + 1, keys.length, 3).getValues();
  keys.forEach(function(key, i) {
    if (index[key[0]]) values[i] = [true, index[key[0]].length, JSON.stringify(index[key[0]])];
  });
  sheet.getRange(2, boundary + 1, keys.length, 3).setValues(values);
}
function nestTrim_(name, headers, timeField, days) {
  const sheet = nestSheet_(name, headers), rows = nestRead_(name, headers), cutoff = Date.now() - days * 86400000;
  const retained = rows.filter(function(r) { return Date.parse(r[timeField]) >= cutoff; });
  if (retained.length === rows.length) return;
  if (retained.length) sheet.getRange(2, 1, retained.length, headers.length).setValues(retained.map(function(r) { return headers.map(function(k) { return r[k] === null ? '' : r[k]; }); }));
  sheet.getRange(retained.length + 2, 1, rows.length - retained.length, headers.length).clearContent();
}
/** Private setup web app: deploy access=MYSELF, never ANYONE. Credential contents are never echoed. */
function doGet() {
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Nest observation setup</title></head><body>'
    + '<h1>Nest observation setup</h1><p>Upload the private setup JSON prepared on your Mac. Its contents are saved in this private project’s Script Properties and are never shown here.</p>'
    + '<input type="file" id="file" accept="application/json"><button onclick="save()">Save private configuration</button>'
    + '<button onclick="google.script.run.withSuccessHandler(show).withFailureHandler(fail).verifyNestObservation()">Verify observation (read only)</button>'
    + '<button onclick="google.script.run.withSuccessHandler(show).withFailureHandler(fail).activateNestCollection()">Start collection</button><pre id="message"></pre>'
    + '<script>function show(v){document.getElementById("message").textContent=typeof v==="string"?v:JSON.stringify(v,null,2)}'
    + 'function fail(){show("Setup did not finish. Check project permissions and private configuration; no credentials displayed.")}'
    + 'async function save(){let f=document.getElementById("file").files[0];if(!f)return;google.script.run.withSuccessHandler(show).withFailureHandler(fail).saveNestSetupJson(await f.text())}</script></body></html>');
}
function saveNestSetupJson(contents) {
  const config = JSON.parse(contents), required = ['SPREADSHEET_ID', 'NEST_DEVICE_ACCESS_PROJECT_ID', 'NEST_CLIENT_ID', 'NEST_CLIENT_SECRET', 'NEST_REFRESH_TOKEN', 'NEST_ZONES_JSON', 'NEST_RAW_FOLDER_ID'];
  if (required.some(function(k) { return typeof config[k] !== 'string' || !config[k]; })) throw new Error('Nest incomplete setup file');
  const allowed = required.concat(['NEST_SUBSCRIPTION', 'NEST_PUBSUB_REFRESH_TOKEN']);
  if (Object.keys(config).some(function(k) { return allowed.indexOf(k) < 0; })) throw new Error('Nest unexpected configuration field');
  nestProperties_().setProperties(Object.assign({}, config, {NEST_ENABLED: 'false'}));
  nestConfig_();
  return 'Configuration saved privately. Next, verify a real observation. Collection is still disabled.';
}
function verifyNestObservation() {
  const c = nestConfig_(), result = inspectNestDevices();
  if (!Object.keys(c.zones).every(function(id) { return result.some(function(d) { return d.device_id === id; }); })) throw new Error('Nest configured thermostat not returned by SDM');
  nestProperties_().setProperty('NEST_ENABLED', 'true');
  try {
    const observed = runNestCollection();
    if (observed.status !== 'success') throw new Error('Nest observation verification failed');
    nestProperties_().setProperty('NEST_VERIFIED_UTC', nestIso_(Date.now()));
    return {status: 'verified_read_only', observation_count: observed.observations_received, event_queue_drained: observed.event_queue_drained, traits: result.map(function(d) { return d.traits; })};
  } finally { nestProperties_().setProperty('NEST_ENABLED', 'false'); }
}
function activateNestCollection() {
  if (!nestProperties_().getProperty('NEST_VERIFIED_UTC')) throw new Error('Nest verify a real observation first');
  nestProperties_().setProperty('NEST_ENABLED', 'true');
  installNestTrigger();
  return 'Nest collection enabled: event pull about every minute, snapshots every five minutes, completed quarter-hour bins. Check Source_Status for source=nest.';
}

/** Worker-only usage proxy, never an invoice or project-wide billing meter. */
function nestUsageAdd_(key, amount) {
  const p = nestProperties_(), day = nestIso_(Date.now()).slice(0, 10), prior = JSON.parse(p.getProperty('NEST_USAGE_CURRENT') || '{}');
  const u = prior.day === day ? prior : {day: day};
  u[key] = Number(u[key] || 0) + amount;
  p.setProperty('NEST_USAGE_CURRENT', JSON.stringify(u));
}
function nestWriteUsage_() {
  const u = JSON.parse(nestProperties_().getProperty('NEST_USAGE_CURRENT') || '{}');
  if (!u.day) return;
  const warning = Number(u.delivery_proxy_bytes || 0) >= 50 * 1024 * 1024 || Number(u.archive_bytes || 0) >= 10 * 1024 * 1024 || Number(u.runtime_ms || 0) >= 3 * 3600000;
  const headers = ['date_utc', 'updated_at_utc', 'runs', 'pull_requests', 'messages_received', 'snapshot_requests', 'delivery_proxy_bytes', 'archive_bytes', 'archive_files', 'runtime_minutes', 'status', 'scope'];
  nestUpsert_('Nest_Usage', headers, [{date_utc: u.day, updated_at_utc: nestIso_(Date.now()), runs: u.runs || 0, pull_requests: u.pull_requests || 0, messages_received: u.messages_received || 0, snapshot_requests: u.snapshot_requests || 0, delivery_proxy_bytes: u.delivery_proxy_bytes || 0, archive_bytes: u.archive_bytes || 0, archive_files: u.archive_files || 0, runtime_minutes: Number(u.runtime_ms || 0) / 60000, status: warning ? 'review_usage' : 'normal', scope: 'This worker only; delivery proxy is not billable volume. Excludes publisher, other subscriptions and services. Counters begin at telemetry deployment.'}]);
  if (warning) nestStatus_('degraded', nestIso_(Date.now()), 'Usage review: daily delivery proxy >=50 MiB, archive growth >=10 MiB or runtime >=180 minutes. Inspect Nest_Usage.');
}

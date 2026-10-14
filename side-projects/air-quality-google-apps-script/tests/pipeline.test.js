const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const project = path.resolve(__dirname, '..');
const sourceDir = path.join(project, 'src');

function formatDate(date, timeZone, pattern) {
  const zone = timeZone === 'GMT-07:00' ? 'Etc/GMT+7' : timeZone;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, weekday: 'long', timeZoneName: 'longOffset'
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
  const hour = parts.hour === '24' ? '00' : parts.hour;
  if (pattern === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
  if (pattern === 'HH:mm:ss') return `${hour}:${parts.minute}:${parts.second}`;
  if (pattern === 'EEEE') return parts.weekday;
  if (pattern === "yyyy-MM-dd'T'HH:mm:ss") return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}`;
  if (pattern === 'Z') {
    const match = parts.timeZoneName.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (!match) return '+0000';
    return `${match[1]}${match[2]}${match[3]}`;
  }
  throw new Error(`Unsupported test format: ${pattern}`);
}

function loadRuntime(exposed, propertyValues = {}) {
  const files = fs.readdirSync(sourceDir).filter((name) => name.endsWith('.js')).sort();
  const code = files.map((name) => fs.readFileSync(path.join(sourceDir, name), 'utf8')).join('\n');
  const context = {
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    RegExp,
    Error,
    isFinite,
    encodeURIComponent,
    Utilities: {
      formatDate,
      Charset: { UTF_8: 'UTF_8' },
      computeHmacSha256Signature: (value, key) => Array.from(
        crypto.createHmac('sha256', key).update(value, 'utf8').digest()
      )
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperties: () => ({ DYSON_INGEST_SECRET: 'test-secret-which-is-long-enough-for-hmac', ...propertyValues })
      })
    },
  };
  vm.createContext(context);
  vm.runInContext(`${code}\nglobalThis.__exposed = {${exposed.join(',')}};`, context);
  return context.__exposed;
}

test('local timestamps preserve the Denver daylight offset', () => {
  const runtime = loadRuntime(['aqLocalIso_', 'aqLocalMidnightUtc_']);
  assert.equal(runtime.aqLocalIso_(new Date('2026-09-24T15:00:00Z'), 'America/Denver'), '2026-09-24T09:00:00-06:00');
  assert.equal(runtime.aqLocalMidnightUtc_('2026-09-24', 'America/Denver').toISOString(), '2026-09-24T06:00:00.000Z');
});

test('Dyson normalization retains every validated pollutant channel', () => {
  const runtime = loadRuntime(['aqNormalizeDyson_']);
  const rows = runtime.aqNormalizeDyson_({
    start_time: '2026-09-24T15:00:00Z', resolution: 'PT15M',
    aqlm: [10], volm: [11], p25m: [12], p10m: [13], no2m: [14],
    tmpm: [2951], humm: [42], fnsp: [3], usage: [900]
  }, 'America/Denver');
  assert.equal(rows.length, 1);
  assert.deepEqual(
    [rows[0].combined_aqi, rows[0].voc_index, rows[0].pm25_ug_m3, rows[0].pm10_ug_m3, rows[0].no2_index],
    [10, 11, 12, 13, 14]
  );
  assert.equal(rows[0].temperature_c, 21.95);
  assert.equal(rows[0].timestamp_local, '2026-09-24T09:00:00-06:00');
});

test('signed Dyson intake accepts complete 15-minute rows and rejects tampering', () => {
  const runtime = loadRuntime(['aqVerifyDysonEnvelope_']);
  const now = new Date();
  const timestamp = new Date(Math.floor(now.getTime() / 900000) * 900000).toISOString().replace('.000Z', 'Z');
  const sent = new Date(Math.floor(now.getTime() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  const row = {
    timestamp_utc: timestamp,
    combined_aqi: 10, voc_index: 11, pm25_ug_m3: 12, pm10_ug_m3: 13,
    no2_index: 14, temperature_c: 21, temperature_f: 69.8,
    relative_humidity_pct: 42, fan_speed: null, usage_seconds: 900
  };
  const payload = JSON.stringify({ version: 1, sent_at_utc: sent, rows: [row] });
  const signature = crypto.createHmac('sha256', 'test-secret-which-is-long-enough-for-hmac')
    .update(payload, 'utf8').digest('hex');
  const event = { postData: { contents: JSON.stringify({ payload, signature }) } };
  const accepted = runtime.aqVerifyDysonEnvelope_(event);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].voc_index, 11);
  assert.equal(accepted[0].fan_speed, null);
  assert.equal(accepted[0].timestamp_local.endsWith('-06:00') || accepted[0].timestamp_local.endsWith('-07:00'), true);

  const altered = { postData: { contents: JSON.stringify({ payload: payload.replace('"voc_index":11', '"voc_index":99'), signature }) } };
  assert.throws(() => runtime.aqVerifyDysonEnvelope_(altered), /authentication_failed/);
  const stalePayload = JSON.stringify({ version: 1, sent_at_utc: '2020-01-01T00:00:00Z', rows: [row] });
  const staleSignature = crypto.createHmac('sha256', 'test-secret-which-is-long-enough-for-hmac')
    .update(stalePayload, 'utf8').digest('hex');
  assert.throws(() => runtime.aqVerifyDysonEnvelope_({
    postData: { contents: JSON.stringify({ payload: stalePayload, signature: staleSignature }) }
  }), /invalid_payload/);
});

test('bounded source reads include both requested UTC endpoints', () => {
  const runtime = loadRuntime(['aqFirstKeyIndex_']);
  const keys = ['2026-09-24T15:00:00Z', '2026-09-24T15:15:00Z', '2026-09-24T15:30:00Z'];
  assert.equal(runtime.aqFirstKeyIndex_(keys, keys[1], false), 1);
  assert.equal(runtime.aqFirstKeyIndex_(keys, keys[1], true), 2);
  assert.equal(runtime.aqFirstKeyIndex_(keys, '2026-09-24T16:00:00Z', false), 3);
});

test('Tempest aggregation calculates counts and sums precipitation without wind fields', () => {
  const runtime = loadRuntime(['aqAggregateTempest_']);
  const epoch = Date.parse('2026-09-24T15:00:00Z') / 1000;
  const obs = [];
  for (let minute = 0; minute < 15; minute += 1) {
    const row = Array(20).fill(null);
    row[0] = epoch + minute * 60;
    row[6] = 800;
    row[7] = 20;
    row[8] = 50;
    row[9] = 1000;
    row[10] = 2;
    row[11] = 300;
    row[12] = 0.1;
    row[13] = 1;
    row[14] = 10;
    row[15] = minute === 0 ? 1 : 0;
    row[16] = 2.5;
    row[17] = 1;
    row[19] = 0.1;
    obs.push(row);
  }
  const rows = runtime.aqAggregateTempest_(obs, new Date(epoch * 1000), new Date((epoch + 3600) * 1000), 'America/Denver');
  assert.equal(rows[0].observation_count, 15);
  assert.equal(rows[0].coverage_pct, 100);
  assert.equal(rows[0].temperature_f, 68);
  assert.equal(rows[0].precipitation_in, 0.05906);
  assert.equal(rows[0].lightning_strike_count, 1);
  assert.equal(Object.keys(rows[0]).some((key) => key.includes('wind')), false);
});

test('CDPHE expansion labels regional sources and repeats hourly values into four quarter bins', () => {
  const runtime = loadRuntime(['aqExpandCdphe_']);
  const records = {
    '2026-09-24T10:00:00-07:00': {
      pm25_1h_ug_m3: 3, pm25_24h_ug_m3: 4, pm25_aqi: 16,
      pm10_1h_ug_m3: 5, pm10_24h_ug_m3: 6, pm10_aqi: 8,
      ozone_1h_ppb: 44, ozone_8h_ppb: 35, ozone_aqi: 40
    }
  };
  const rows = runtime.aqExpandCdphe_(records, ['2026-09-24'], 'America/Denver');
  assert.equal(rows.length, 4);
  assert.equal(rows[0].combined_aqi, 40);
  assert.equal(rows[0].combined_aqi_pollutant, 'ozone');
  assert.equal(rows[0].comparator_scope, 'regional_comparator_not_home_measurement');
  assert.equal(rows[0].pm_station_aqs_id, '080131001');
});

test('CDPHE empty hourly placeholders are missing, while zero is an observation', () => {
  const runtime = loadRuntime(['aqExpandCdphe_', 'aqRegionalHasObservation_']);
  const empty = { pm25_1h_ug_m3: null, pm25_aqi: '', pm10_aqi: null, ozone_aqi: '' };
  assert.equal(runtime.aqRegionalHasObservation_(empty), false);
  assert.equal(runtime.aqRegionalHasObservation_({ pm25_1h_ug_m3: 0 }), true);
  assert.equal(runtime.aqExpandCdphe_({ '2026-09-24T10:00:00-07:00': empty }, ['2026-09-24'], 'America/Denver').length, 0);
});

test('safe errors redact bearer and query-token values', () => {
  const runtime = loadRuntime(['aqSafeMessage_']);
  const message = runtime.aqSafeMessage_(new Error('Bearer abc.def token https://x.test/?token=secret123&x=1'));
  assert.equal(message.includes('abc.def'), false);
  assert.equal(message.includes('secret123'), false);
});

const fixtureRepo = path.resolve(project, '..', '..');
const localFixturesAvailable = [
  'side-projects/dyson-air-quality/raw/daily.json',
  'side-projects/tempest-air-quality/raw/2026-09-24.json',
  'side-projects/air-quality-analysis/tmp/cdphe-raw/2026-09-24-pm25.html'
].every((filename) => fs.existsSync(path.join(fixtureRepo, filename)));

test('validated local source fixtures normalize with the hosted pipeline', { skip: !localFixturesAvailable }, () => {
  const runtime = loadRuntime([
    'aqNormalizeDyson_', 'aqAggregateTempest_', 'aqLocalMidnightUtc_',
    'aqParseCdphePage_', 'AQ_CDPHE_PARAMETERS'
  ]);
  const repo = path.resolve(project, '..', '..');
  const dysonPayload = JSON.parse(fs.readFileSync(path.join(repo, 'side-projects/dyson-air-quality/raw/daily.json'), 'utf8'));
  const dysonRows = runtime.aqNormalizeDyson_(dysonPayload, 'America/Denver');
  assert.ok(dysonRows.length >= 600);
  assert.ok(dysonRows.some((row) => row.voc_index !== null && row.pm25_ug_m3 !== null && row.pm10_ug_m3 !== null && row.no2_index !== null));

  const tempestPayload = JSON.parse(fs.readFileSync(path.join(repo, 'side-projects/tempest-air-quality/raw/2026-09-24.json'), 'utf8'));
  const start = runtime.aqLocalMidnightUtc_('2026-09-24', 'America/Denver');
  const end = runtime.aqLocalMidnightUtc_('2026-09-25', 'America/Denver');
  const tempestRows = runtime.aqAggregateTempest_(tempestPayload.obs, start, end, 'America/Denver');
  assert.equal(tempestRows.length, 96);
  assert.ok(tempestRows.every((row) => row.observation_count > 0 && row.observation_count <= 15));

  const page = fs.readFileSync(path.join(repo, 'side-projects/air-quality-analysis/tmp/cdphe-raw/2026-09-24-pm25.html'), 'utf8');
  const cdpheRows = runtime.aqParseCdphePage_(page, runtime.AQ_CDPHE_PARAMETERS[0]);
  assert.equal(cdpheRows.length, 24);
  assert.ok(cdpheRows.some((row) => row.pm25_1h_ug_m3 !== null));
});

function carriageObservation(epoch, overrides = {}) {
  return {
    stationID: 'KCOBOULD877', epoch, obsTimeUtc: new Date(epoch * 1000).toISOString(),
    tz: 'America/Denver', humidityAvg: null, winddirAvg: 360, qcStatus: -1,
    metric: { windspeedAvg: 0, windgustHigh: 3.2, tempAvg: null, dewptAvg: null,
      pressureMin: 1020, pressureMax: 1022, precipRate: 0, precipTotal: 12 }, ...overrides
  };
}

test('Carriage normalization preserves gaps, nulls, cumulative resets, QC and untrusted north', () => {
  const r = loadRuntime(['aqNormalizeCarriage_']);
  const first = Date.parse('2026-10-13T06:00:00Z') / 1000;
  const a = carriageObservation(first);
  const b = carriageObservation(first + 1800, {metric: {...a.metric, precipTotal: 0}});
  const rows = r.aqNormalizeCarriage_({observations: [a, b, a]}, '2026-10-13', new Date('2026-10-14T06:00:00Z'));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].wind_speed_kmh, 0);
  assert.equal(rows[0].temperature_c, null);
  assert.equal(rows[0].relative_humidity_pct, null);
  assert.equal(rows[0].wind_direction_deg, 360);
  assert.equal(rows[0].wind_direction_trust, 'untrusted');
  assert.equal(rows[0].qc_status, -1);
  assert.equal(rows[0].pressure_hpa, 1021);
  assert.equal(rows[0].precip_total_mm, 12);
  assert.equal(rows[1].precip_total_mm, 0);
  assert.equal(rows[1].epoch - rows[0].epoch, 1800);
});

test('Carriage uses UTC for repeated DST hours and refuses wrong station/date/cadence', () => {
  const r = loadRuntime(['aqNormalizeCarriage_']);
  const a = carriageObservation(Date.parse('2024-11-03T07:00:00Z') / 1000);
  const b = carriageObservation(a.epoch + 3600);
  const now = new Date('2024-11-04T08:00:00Z');
  const rows = r.aqNormalizeCarriage_({observations: [a,b]}, '2024-11-03', now);
  assert.equal(rows.length, 2);
  assert.match(rows[0].timestamp_local, /01:00:00-06:00$/);
  assert.match(rows[1].timestamp_local, /01:00:00-07:00$/);
  for (const bad of [{...a, stationID: 'OTHER'}, {...a, epoch: a.epoch + 60}, {...a, obsTimeUtc: b.obsTimeUtc}]) {
    assert.throws(() => r.aqNormalizeCarriage_({observations: [bad]}, '2024-11-03', now));
  }
  assert.throws(() => r.aqNormalizeCarriage_({observations: [a]}, '2024-11-04', now));
  assert.throws(() => r.aqNormalizeCarriage_({}, '2024-11-03', now));
});

test('Carriage history dates follow Denver and health distinguishes empty/stale observations', () => {
  const r = loadRuntime(['aqCarriageDates_', 'aqCarriageHealth_', 'aqSafeMessage_']);
  assert.equal(JSON.stringify(r.aqCarriageDates_(new Date('2026-10-14T05:00:00Z'))), JSON.stringify(['2026-10-11','2026-10-12','2026-10-13']));
  const now = new Date('2026-10-14T18:00:00Z');
  assert.equal(r.aqCarriageHealth_('', now).status, 'stale');
  assert.equal(r.aqCarriageHealth_('2026-10-14T05:00:00Z', now).status, 'stale');
  assert.equal(r.aqCarriageHealth_('2026-10-14T17:45:00Z', now).status, 'success');
  assert.equal(r.aqSafeMessage_('https://api.weather.com/?apiKey=private-secret&date=20261013').includes('private-secret'), false);
});

function ncarRow(timestamp, overrides = {}) {
  return {timestamp_utc: timestamp, temperature_c: 10, dew_point_c: 4,
    relative_humidity_pct: 60, station_pressure_hpa: 835, wind_speed_ms: 2,
    wind_direction_deg: 350, peak_gust_ms: 5, rain_accum_mm: 73.2,
    rain_daily_mm: 0, rain_event_mm: 0, ...overrides};
}

test('NCAR aggregation uses vectors, preserves missing values and never sums rain counters', () => {
  const r = loadRuntime(['aqAggregateNcar_']);
  const rows = r.aqAggregateNcar_([
    ncarRow('2026-09-24T12:00:00Z'),
    ncarRow('2026-09-24T12:05:00Z', {wind_direction_deg: 10, peak_gust_ms: 8, temperature_c: null}),
    ncarRow('2026-09-24T12:20:00Z', {rain_accum_mm: 0, relative_humidity_pct: null})
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].observation_count, 2);
  assert.equal(rows[0].expected_observation_count, 3);
  assert.equal(rows[0].coverage_fraction, 0.666667);
  assert.equal(rows[0].wind_direction_deg, 0);
  assert.equal(rows[0].peak_gust_ms, 8);
  assert.equal(rows[0].temperature_c, 10);
  assert.equal(rows[0].precipitation_mm, null);
  assert.equal(rows[1].precipitation_mm, null);
  assert.equal(rows[1].relative_humidity_pct, null);
  assert.equal(rows[1].wind_direction_deg, null, 'one wind sample is insufficient');
});

test('NCAR handles calm/cancelling wind, midnight duplicates, DST and invalid revisions', () => {
  const r = loadRuntime(['aqAggregateNcar_']);
  const rows = r.aqAggregateNcar_([
    ncarRow('2026-11-01T07:00:00Z', {wind_direction_deg: 90}),
    ncarRow('2026-11-01T07:05:00Z', {wind_direction_deg: 270}),
    ncarRow('2026-11-01T08:00:00Z', {wind_speed_ms: 0}),
    ncarRow('2026-11-01T08:05:00Z', {wind_speed_ms: 0}),
    ncarRow('2026-11-01T08:05:00Z', {wind_speed_ms: 0})
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].wind_direction_deg, null);
  assert.equal(rows[1].wind_direction_deg, null);
  assert.equal(rows[1].observation_count, 2);
  assert.match(rows[0].timestamp_local, /01:00:00-06:00$/);
  assert.match(rows[1].timestamp_local, /01:00:00-07:00$/);
  const invalid = ncarRow('2026-09-24T12:00:00Z');
  for (const key of Object.keys(invalid)) if (key !== 'timestamp_utc') invalid[key] = null;
  const cleared = r.aqAggregateNcar_([invalid]);
  assert.equal(cleared[0].observation_count, 0);
  assert.equal(cleared[0].coverage_fraction, 0);
  assert.equal(cleared[0].temperature_c, null);
});

test('NCAR intake requires activation and exact signed station/date/field constraints', () => {
  const r = loadRuntime(['aqVerifyNcarEnvelope_'], {NCAR_FOOTHILLS_ENABLED: 'true'});
  const now = new Date();
  const timestamp = new Date(Math.floor(now.getTime() / 300000) * 300000).toISOString().replace('.000Z','Z');
  const payload = {version: 1, source: 'ncar_foothills', file_date: timestamp.slice(0,10),
    sent_at_utc: now.toISOString().replace(/\.\d{3}Z$/, 'Z'), rows: [ncarRow(timestamp)], netcdf_base64: 'SE R G'.replace(/ /g,'')};
  function event(value) {
    const body = JSON.stringify(value);
    return {postData: {contents: JSON.stringify({payload: body,
      signature: crypto.createHmac('sha256','test-secret-which-is-long-enough-for-hmac').update(body).digest('hex')})}};
  }
  assert.equal(r.aqVerifyNcarEnvelope_(event(payload)).rows.length, 1);
  assert.throws(() => loadRuntime(['aqVerifyNcarEnvelope_'], {NCAR_FOOTHILLS_ENABLED: 'false'}).aqVerifyNcarEnvelope_(event(payload)), /authentication_failed/);
  assert.throws(() => r.aqVerifyNcarEnvelope_(event({...payload, source: 'dyson'})), /invalid_payload/);
  assert.throws(() => r.aqVerifyNcarEnvelope_(event({...payload, rows: [ncarRow(timestamp, {station_pressure_hpa: 0})]})), /invalid_payload/);
  assert.throws(() => r.aqVerifyNcarEnvelope_(event({...payload, sent_at_utc: '2020-01-01T00:00:00Z'})), /invalid_payload/);
  assert.throws(() => r.aqVerifyNcarEnvelope_(event({...payload, rows: [payload.rows[0],payload.rows[0]]})), /invalid_payload/);
  const tampered = event(payload);
  tampered.postData.contents = tampered.postData.contents.replace('ncar_foothills', 'other_source');
  assert.throws(() => r.aqVerifyNcarEnvelope_(tampered), /authentication_failed/);
});

test('NCAR publication-aware health flags missing/stale observations', () => {
  const r = loadRuntime(['aqNcarHealth_']);
  const now = new Date('2026-10-14T18:00:00Z');
  assert.equal(r.aqNcarHealth_('', now).status, 'stale');
  assert.equal(r.aqNcarHealth_('2026-10-14T00:00:00Z', now).status, 'success');
  assert.equal(r.aqNcarHealth_('2026-10-13T00:00:00Z', now).status, 'stale');
});

test('append-only master migration preserves populated legacy columns and rejects mismatches', () => {
  for (const oldSchema of ['original', 'carriage']) {
    let sheet;
    const r = loadRuntime(['AQ_MASTER_HEADERS', 'aqEnsureSheet_',
      'setSheet: function(mock) { aqSpreadsheet_ = function() { return {getSheetByName: function() { return mock; }}; }; }']);
    const headers = Array.from(r.AQ_MASTER_HEADERS);
    const boundary = headers.indexOf(oldSchema === 'original' ? 'carriage_wind_speed_kmh' : 'ncar_foothills_present');
    let stored = headers.slice(0,boundary);
    const cells = ['existing', 42, 'preserve'];
    const chain = {setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;},setWrap(){return this;}};
    sheet = {getMaxColumns: () => headers.length, getLastRow: () => 2,
      getRange: () => ({...chain, getDisplayValues: () => [[...stored,...Array(headers.length-stored.length).fill('')]],
        setValues: (values) => {stored = Array.from(values[0]);return chain;}}),
      setFrozenRows(){},setRowHeight(){},setColumnWidth(){},setColumnWidths(){}};
    r.setSheet(sheet);
    r.aqEnsureSheet_('Master_15min',r.AQ_MASTER_HEADERS);
    assert.deepEqual(Array.from(stored),headers);
    assert.deepEqual(cells,['existing',42,'preserve']);
    stored[2] = 'unexpected_column';
    assert.throws(() => r.aqEnsureSheet_('Master_15min',r.AQ_MASTER_HEADERS),/Schema mismatch/);
  }
});

test('latest NCAR archive refreshes current master missing flags without expanding old backfills', () => {
  const r = loadRuntime(['aqNcarMasterEnd_']);
  const now = new Date('2026-10-14T22:30:00Z');
  assert.equal(r.aqNcarMasterEnd_('2026-10-13','2026-10-14T00:00:00Z',now),'2026-10-14T22:30:00Z');
  assert.equal(r.aqNcarMasterEnd_('2026-09-20','2026-09-21T00:00:00Z',now),'2026-09-21T00:00:00Z');
});

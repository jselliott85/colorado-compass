/** Public NCAR NetCDF relay intake; provisional, disabled until explicitly activated. */
const AQ_NCAR_SOURCE = 'NCAR Foothills Lab';
const AQ_NCAR_COUNTERS = Object.freeze(['rain_accum_mm', 'rain_daily_mm', 'rain_event_mm']);
const AQ_NCAR_RANGES = Object.freeze({
  temperature_c: [-100, 65], dew_point_c: [-120, 65], relative_humidity_pct: [0, 100],
  station_pressure_hpa: [500, 1100], wind_speed_ms: [0, 100], wind_direction_deg: [0, 360],
  peak_gust_ms: [0, 150], rain_accum_mm: [0, 1000000], rain_daily_mm: [0, 1000000], rain_event_mm: [0, 1000000]
});

function aqAggregateNcar_(nativeRows) {
  const unique = aqIndexRows_(nativeRows);
  const buckets = {};
  Object.keys(unique).sort().forEach(function(key) {
    const row = unique[key];
    const bin = aqUtcIso_(aqFloorQuarter_(key));
    if (!buckets[bin]) buckets[bin] = [];
    buckets[bin].push(row);
  });
  return Object.keys(buckets).sort().map(function(key) {
    const readings = buckets[key].filter(function(value) {
      return AQ_NCAR_FIELDS.some(function(field) { return aqNumber_(value[field]) !== null; });
    });
    const pairs = readings.filter(function(row) {
      return aqNumber_(row.wind_speed_ms) !== null && row.wind_speed_ms > 0 &&
        aqNumber_(row.wind_direction_deg) !== null;
    });
    let direction = null;
    if (pairs.length >= 2) {
      const east = aqMean_(pairs.map(function(row) { return row.wind_speed_ms * Math.sin(row.wind_direction_deg * Math.PI / 180); }), 10);
      const north = aqMean_(pairs.map(function(row) { return row.wind_speed_ms * Math.cos(row.wind_direction_deg * Math.PI / 180); }), 10);
      if (Math.sqrt(east * east + north * north) > 0.01) {
        direction = aqRound_((Math.atan2(east, north) * 180 / Math.PI + 360) % 360, 3);
        if (direction === 360) direction = 0;
      }
    }
    const row = {
      timestamp_utc: key,
      timestamp_local: aqLocalIso_(key, AQ_DEFAULT_TIME_ZONE),
      observation_count: readings.length,
      expected_observation_count: 3,
      coverage_fraction: aqRound_(readings.length / 3, 6),
      wind_direction_deg: direction,
      wind_direction_observation_count: pairs.length,
      peak_gust_ms: aqMax_(readings.map(function(value) { return value.peak_gust_ms; })),
      precipitation_mm: null,
      source: AQ_NCAR_SOURCE,
      timestamp_convention: 'reported_observation_label_unshifted',
      gust_definition: 'reported_maximum_duration_unconfirmed',
      precipitation_status: 'withheld_pending_interval_definition',
      ingested_at_utc: aqUtcIso_(new Date())
    };
    AQ_NCAR_FIELDS.filter(function(field) { return field !== 'wind_direction_deg' && field !== 'peak_gust_ms'; }).forEach(function(field) {
      row[field] = aqMean_(readings.map(function(value) { return value[field]; }), 6);
    });
    return row;
  });
}

function aqVerifyNcarEnvelope_(event) {
  const raw = event && event.postData && event.postData.contents;
  const config = aqConfig_();
  if (!config.ncarEnabled || config.dysonIngestSecret.length < 32) throw new Error('authentication_failed');
  if (typeof raw !== 'string' || raw.length > 800000) throw new Error('invalid_payload');
  let envelope;
  try { envelope = JSON.parse(raw); } catch (error) { throw new Error('invalid_payload'); }
  if (!envelope || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string' ||
      !/^[a-f0-9]{64}$/.test(envelope.signature)) throw new Error('invalid_payload');
  const expected = Utilities.computeHmacSha256Signature(envelope.payload, config.dysonIngestSecret,
    Utilities.Charset.UTF_8).map(function(byte) { return ('0' + (byte & 255).toString(16)).slice(-2); }).join('');
  if (!aqConstantTimeEqual_(expected, envelope.signature)) throw new Error('authentication_failed');
  let payload;
  try { payload = JSON.parse(envelope.payload); } catch (error) { throw new Error('invalid_payload'); }
  if (!payload || payload.version !== 1 || payload.source !== 'ncar_foothills' ||
      typeof payload.file_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.file_date) ||
      typeof payload.netcdf_base64 !== 'string' || payload.netcdf_base64.length > 200000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.netcdf_base64) ||
      !Array.isArray(payload.rows) || payload.rows.length < 1 || payload.rows.length > 289) throw new Error('invalid_payload');
  const sent = aqRelayTimestamp_(payload.sent_at_utc);
  if (Math.abs(Date.now() - sent.getTime()) > 15 * 60000) throw new Error('invalid_payload');
  const day = Date.parse(payload.file_date + 'T00:00:00Z');
  if (!isFinite(day) || new Date(day).toISOString().slice(0, 10) !== payload.file_date ||
      payload.file_date < config.initialDate || day > sent.getTime()) throw new Error('invalid_payload');
  const firstAllowed = aqLocalMidnightUtc_(config.initialDate, config.timeZone).getTime();
  const seen = {};
  const rows = payload.rows.map(function(input) {
    if (!input || typeof input !== 'object') throw new Error('invalid_payload');
    const instant = aqRelayTimestamp_(input.timestamp_utc);
    const ms = instant.getTime();
    if (ms % 300000 !== 0 || ms < day || ms > day + 86400000 || ms > sent.getTime() ||
        seen[input.timestamp_utc]) throw new Error('invalid_payload');
    seen[input.timestamp_utc] = true;
    const row = { timestamp_utc: input.timestamp_utc, timestamp_local: aqLocalIso_(instant, config.timeZone),
      source: AQ_NCAR_SOURCE, ingested_at_utc: aqUtcIso_(new Date()) };
    AQ_NCAR_FIELDS.concat(AQ_NCAR_COUNTERS).forEach(function(field) {
      const value = input[field];
      const bounds = AQ_NCAR_RANGES[field];
      if (value !== null && (typeof value !== 'number' || !isFinite(value) ||
          value < bounds[0] || value > bounds[1])) throw new Error('invalid_payload');
      row[field] = value;
    });
    return row;
  }).filter(function(row) { return Date.parse(row.timestamp_utc) >= firstAllowed; });
  if (!rows.length) throw new Error('invalid_payload');
  return { rows: rows, fileDate: payload.file_date, netcdf: payload.netcdf_base64 };
}

function aqReceiveNcar_(event) {
  let data;
  try { data = aqVerifyNcarEnvelope_(event); } catch (error) {
    return aqDysonResponse_({ ok: false, error: error.message === 'invalid_payload' ? 'invalid_payload' : 'authentication_failed' });
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return aqDysonResponse_({ ok: false, error: 'busy' });
  try {
    const properties = aqProperties_();
    if (properties.getProperty('NCAR_SCHEMA_INITIALIZED_VERSION') !== AQ_SCHEMA_VERSION) {
      aqInitializeSheets_();
      properties.setProperty('NCAR_SCHEMA_INITIALIZED_VERSION', AQ_SCHEMA_VERSION);
    }
    const result = aqRunSource_(Utilities.getUuid(), 'ncar_foothills', function() {
      // Raw archive first: retry is safe if a later sheet write fails.
      aqArchiveNcarRaw_(data.fileDate, Utilities.base64Decode(data.netcdf));
      const nativeResult = aqUpsertRows_(AQ_SHEETS.NCAR_NATIVE, AQ_NCAR_NATIVE_HEADERS, data.rows);
      const first = aqUtcIso_(aqFloorQuarter_(nativeResult.earliest));
      const last = aqUtcIso_(new Date(aqFloorQuarter_(nativeResult.latest).getTime() + 899000));
      const native = aqReadRowsBetween_(AQ_SHEETS.NCAR_NATIVE, AQ_NCAR_NATIVE_HEADERS, first, last);
      const aggregate = aqUpsertRows_(AQ_SHEETS.NCAR, AQ_NCAR_HEADERS, aqAggregateNcar_(native));
      aqRebuildMaster_(first, aqNcarMasterEnd_(data.fileDate, aggregate.latest, new Date()));
      const health = aqNcarHealth_(aqLatestNcarObservation_(), new Date());
      aggregate.status = health.status;
      aggregate.message = health.message;
      return aggregate;
    });
    if (!result.upserted) return aqDysonResponse_({ ok: false, error: 'processing_failed' });
    SpreadsheetApp.flush();
    return aqDysonResponse_({ ok: true, rows_received: data.rows.length, rows_upserted: result.upserted });
  } catch (error) {
    return aqDysonResponse_({ ok: false, error: 'processing_failed' });
  } finally { lock.releaseLock(); }
}

function aqNcarHealth_(latest, now) {
  const age = latest ? (now.getTime() - Date.parse(latest)) / 3600000 : null;
  const stale = age === null || !isFinite(age) || age > 36;
  return { status: stale ? 'stale' : 'success', message: 'Provisional regional comparator; observation_age_hours=' +
    (age === null ? 'missing' : aqRound_(age, 2)) + '; stale=' + stale +
    '; daily archive publication expected; interval alignment/gust duration unconfirmed; precipitation withheld.' };
}

function aqRefreshNcarStatus_() {
  const config = aqConfig_();
  const properties = aqProperties_();
  const last = aqLatestNcarObservation_();
  const health = aqNcarHealth_(last, new Date());
  const prefix = 'STATUS_NCAR_FOOTHILLS_';
  const attempted = properties.getProperty(prefix + 'LAST_ATTEMPT_UTC') || '';
  const failure = properties.getProperty(prefix + 'LAST_ERROR') || '';
  aqUpdateSourceStatus_({ source: 'ncar_foothills', last_attempt_utc: attempted,
    last_success_utc: properties.getProperty(prefix + 'LAST_SUCCESS_UTC') || '',
    consecutive_failures: Number(properties.getProperty(prefix + 'CONSECUTIVE_FAILURES') || 0),
    latest_observation_utc: last,
    status: !config.ncarEnabled ? 'disabled' : (failure ? 'error' : health.status),
    message: !config.ncarEnabled ? 'NCAR relay disabled; no production collection activated.' :
      health.message + (failure ? ' Last intake error: ' + failure : ''), schema_version: AQ_SCHEMA_VERSION });
}

// A newly timestamped placeholder with no weather values is not a healthy source observation.
function aqLatestNcarObservation_() {
  const latest = aqLatestTimestamp_(AQ_SHEETS.NCAR_NATIVE);
  if (!latest) return '';
  const first = aqUtcIso_(new Date(Date.parse(latest) - 3 * 86400000));
  const valid = aqReadRowsBetween_(AQ_SHEETS.NCAR_NATIVE, AQ_NCAR_NATIVE_HEADERS, first, latest)
    .filter(function(row) { return AQ_NCAR_FIELDS.some(function(field) { return aqNumber_(row[field]) !== null; }); });
  return valid.length ? valid[valid.length - 1].timestamp_utc : '';
}

// Preserve every distinct raw revision; retries reuse the same immutable content-hash filename.
function aqArchiveNcarRaw_(dateText, bytes) {
  if (!aqConfig_().keepRaw) return '';
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function(byte) { return ('0' + (byte & 255).toString(16)).slice(-2); }).join('');
  const folder = aqChildFolder_(aqChildFolder_(aqChildFolder_(aqRawRootFolder_(), 'ncar_foothills'),
    dateText.slice(0, 4)), dateText.slice(5, 7));
  const name = 'flab.' + dateText.replace(/-/g, '') + '.' + digest + '.nc.gz';
  const existing = folder.getFilesByName(name);
  if (existing.hasNext()) return existing.next().getId();
  const blob = Utilities.newBlob(bytes, 'application/x-netcdf', name.slice(0, -3));
  return folder.createFile(Utilities.gzip(blob).setName(name)).getId();
}

function aqNcarMasterEnd_(fileDate, latest, now) {
  // Refresh missing/present flags after the newest published day, including existing indoor rows.
  const yesterday = aqAddLocalDays_(aqUtcIso_(now).slice(0, 10), -1);
  return fileDate >= yesterday ? aqUtcIso_(now) : latest;
}

/** Signed, read-only Dyson observation intake for the GitHub-hosted collector. */

const AQ_DYSON_RELAY_FIELDS = Object.freeze([
  'combined_aqi', 'voc_index', 'pm25_ug_m3', 'pm10_ug_m3', 'no2_index',
  'temperature_c', 'temperature_f', 'relative_humidity_pct', 'fan_speed',
  'usage_seconds'
]);

function doPost(e) {
  let rows;
  try {
    rows = aqVerifyDysonEnvelope_(e);
  } catch (error) {
    const category = error && error.message === 'invalid_payload' ? 'invalid_payload' : 'authentication_failed';
    return aqDysonResponse_({ ok: false, error: category });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return aqDysonResponse_({ ok: false, error: 'busy' });
  try {
    const runId = Utilities.getUuid();
    const dyson = aqRunSource_(runId, 'dyson', function() {
      return aqUpsertRows_(AQ_SHEETS.DYSON, AQ_DYSON_HEADERS, rows);
    });
    if (!dyson.ok) return aqDysonResponse_({ ok: false, error: 'processing_failed' });
    const master = aqRunSource_(runId, 'master', function() {
      return aqRebuildMaster_(dyson.earliest, aqUtcIso_(new Date()));
    });
    if (!master.ok) return aqDysonResponse_({ ok: false, error: 'processing_failed' });
    SpreadsheetApp.flush();
    return aqDysonResponse_({ ok: true, rows_received: rows.length, rows_upserted: dyson.upserted });
  } catch (error) {
    // No request body, URL, serial, or secret may be reflected to the caller.
    return aqDysonResponse_({ ok: false, error: 'processing_failed' });
  } finally {
    lock.releaseLock();
  }
}

function aqDysonResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function aqVerifyDysonEnvelope_(event) {
  const raw = event && event.postData && event.postData.contents;
  if (typeof raw !== 'string' || raw.length > 400000) throw new Error('invalid_payload');
  const secret = aqConfig_().dysonIngestSecret;
  if (secret.length < 32) throw new Error('authentication_failed');

  let envelope;
  try { envelope = JSON.parse(raw); } catch (error) { throw new Error('invalid_payload'); }
  if (!envelope || typeof envelope.payload !== 'string' ||
      typeof envelope.signature !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.signature)) {
    throw new Error('invalid_payload');
  }
  const expected = Utilities.computeHmacSha256Signature(
    envelope.payload, secret, Utilities.Charset.UTF_8
  ).map(function(byte) { return ('0' + (byte & 255).toString(16)).slice(-2); }).join('');
  if (!aqConstantTimeEqual_(expected, envelope.signature)) throw new Error('authentication_failed');

  let payload;
  try { payload = JSON.parse(envelope.payload); } catch (error) { throw new Error('invalid_payload'); }
  if (!payload || payload.version !== 1 || !Array.isArray(payload.rows) ||
      payload.rows.length < 1 || payload.rows.length > 700) throw new Error('invalid_payload');
  const sent = aqRelayTimestamp_(payload.sent_at_utc);
  if (Math.abs(Date.now() - sent.getTime()) > 15 * 60 * 1000) throw new Error('invalid_payload');

  const config = aqConfig_();
  const ingestedAt = aqUtcIso_(new Date());
  const seen = {};
  return payload.rows.map(function(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_payload');
    const timestamp = aqRelayTimestamp_(input.timestamp_utc);
    if (timestamp.getTime() % (15 * 60 * 1000) !== 0 ||
        timestamp.getTime() < sent.getTime() - 8 * 24 * 60 * 60 * 1000 ||
        timestamp.getTime() > sent.getTime() + 15 * 60 * 1000 ||
        seen[input.timestamp_utc]) throw new Error('invalid_payload');
    seen[input.timestamp_utc] = true;
    const row = {
      timestamp_utc: input.timestamp_utc,
      timestamp_local: aqLocalIso_(timestamp, config.timeZone),
      source_resolution_minutes: 15,
      ingested_at_utc: ingestedAt
    };
    let populated = false;
    AQ_DYSON_RELAY_FIELDS.forEach(function(field) {
      const value = input[field];
      if (value !== null && (typeof value !== 'number' || !isFinite(value) || Math.abs(value) > 1000000)) {
        throw new Error('invalid_payload');
      }
      row[field] = value;
      if (value !== null) populated = true;
    });
    if (!populated) throw new Error('invalid_payload');
    return row;
  });
}

function aqRelayTimestamp_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) {
    throw new Error('invalid_payload');
  }
  const date = new Date(value);
  if (!isFinite(date.getTime()) || aqUtcIso_(date) !== value) throw new Error('invalid_payload');
  return date;
}

function aqConstantTimeEqual_(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

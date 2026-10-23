/** Standalone Apps Script worker. Never deploy this directory over the bound collector. */
// Reset at each invocation; never cache mutable Script Properties or row positions across projects.
let nestExecution_ = null;
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
function nestBook_() {
  if (!nestExecution_) return SpreadsheetApp.openById(nestConfig_().p.SPREADSHEET_ID);
  if (!nestExecution_.book) nestExecution_.book = SpreadsheetApp.openById(nestConfig_().p.SPREADSHEET_ID);
  return nestExecution_.book;
}
function nestSheet_(name, headers) {
  if (nestExecution_ && nestExecution_.sheets[name]) return nestExecution_.sheets[name];
  const book = nestBook_();
  let sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  if (sheet.getLastRow()) {
    const prior = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    const usageExtension = headers.length > 12 && name === 'Nest_Usage' && prior.slice(0, 12).every(function(v, i) { return v === headers[i]; }) && prior.slice(12).every(function(v) { return v === ''; });
    if (usageExtension) sheet.getRange(1, 13, 1, headers.length - 12).setValues([headers.slice(12)]);
    else if (prior.some(function(v, i) { return v !== headers[i]; })) throw new Error('Nest schema mismatch: ' + name);
  } else sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (sheet.getFrozenRows() !== 1) sheet.setFrozenRows(1);
  if (nestExecution_) nestExecution_.sheets[name] = sheet;
  return sheet;
}
function nestCacheRows_(name, rows) {
  // These tables have a single live writer under this worker's script lock.
  // Never cache Source_Status or Master data shared with the bound project.
  if (nestExecution_ && [NEST_LEDGER, NEST_HEALTH, NEST_ATTEMPTS].indexOf(name) >= 0) nestExecution_.rows[name] = rows;
}
function nestRead_(name, headers) {
  if (nestExecution_ && nestExecution_.rows[name]) return nestExecution_.rows[name].map(function(r) { return Object.assign({}, r); });
  const s = nestSheet_(name, headers);
  if (s.getLastRow() < 2) { nestCacheRows_(name, []); return []; }
  const rows = s.getRange(2, 1, s.getLastRow() - 1, headers.length).getValues().map(function(values) {
    const row = {}; headers.forEach(function(k, i) { row[k] = k === 'date_utc' && values[i] instanceof Date ? values[i].toISOString().slice(0, 10) : values[i] === '' ? null : values[i]; }); return row;
  });
  nestCacheRows_(name, rows);
  return rows.map(function(r) { return Object.assign({}, r); });
}
/** Timestamp/zone and observation-id upserts. Preserve identical rows' original ingestion time. */
function nestUpsert_(name, headers, rows) {
  if (!rows.length) return;
  const sheet = nestSheet_(name, headers), current = nestRead_(name, headers), byKey = {};
  current.forEach(function(r, i) {
    const key = r[headers[0]];
    if (byKey[key] && name !== 'Nest_Usage') throw new Error('Nest duplicate stored key');
    // Existing daily duplicates are retained; update the latest snapshot only, never sum them.
    if (!byKey[key] || String(r.updated_at_utc || '') >= String(current[byKey[key] - 2].updated_at_utc || '')) byKey[key] = i + 2;
  });
  const append = [], updates = [], dedupe = {};
  rows.forEach(function(r) {
    const key = r[headers[0]], prior = dedupe[key];
    if (prior && headers.some(function(h) { return h !== 'ingested_at_utc' && nestCell_(prior[h]) !== nestCell_(r[h]); })) throw new Error('Nest conflicting input key');
    dedupe[key] = r;
  });
  Object.keys(dedupe).sort().forEach(function(key) {
    const r = dedupe[key], values = headers.map(function(h) { return nestCell_(r[h]); });
    if (byKey[key]) {
      const old = current[byKey[key] - 2];
      if (headers.every(function(h, i) { return h === 'ingested_at_utc' || nestCell_(old[h]) === values[i]; })) return;
      if (name === NEST_LEDGER) throw new Error('Nest conflicting stored observation');
      updates.push({row: byKey[key], values: values});
    }
    else append.push(values);
  });
  nestWriteBlocks_(sheet, 1, updates);
  if (append.length) {
    const start = sheet.getLastRow() + 1;
    if (sheet.getMaxRows() < start + append.length - 1) sheet.insertRowsAfter(sheet.getMaxRows(), start + append.length - 1 - sheet.getMaxRows());
    if (name === 'Nest_Usage') sheet.getRange(start, 1, append.length, 1).setNumberFormat('@');
    sheet.getRange(start, 1, append.length, headers.length).setValues(append);
    // Replay sorts observations/health in memory; do not sort their entire sheets per minute.
    if ([NEST_TABLE, 'Nest_Usage'].indexOf(name) >= 0 && sheet.getLastRow() > 2) sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).sort({column: 1, ascending: true});
  }
  function objectRow(values) {
    const r = {}; headers.forEach(function(k, i) { r[k] = values[i] === '' ? null : values[i]; }); return r;
  }
  const next = current.slice();
  updates.forEach(function(u) { next[u.row - 2] = objectRow(u.values); });
  append.forEach(function(values) { next.push(objectRow(values)); });
  if (append.length && [NEST_TABLE, 'Nest_Usage'].indexOf(name) >= 0) next.sort(function(a, b) { return String(a[headers[0]]).localeCompare(String(b[headers[0]])); });
  nestCacheRows_(name, next);
}
function nestCell_(value) { return value === null || value === undefined ? '' : value; }
function nestWriteBlocks_(sheet, column, updates) {
  updates.sort(function(a, b) { return a.row - b.row; });
  for (let i = 0; i < updates.length;) {
    const start = updates[i].row, values = [updates[i++].values];
    while (i < updates.length && updates[i].row === start + values.length) values.push(updates[i++].values);
    sheet.getRange(start, column, values.length, values[0].length).setValues(values);
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
  const started = Date.now(), run = Utilities.getUuid(), start = nestIso_(started);
  const attempt = {run_id: run, started_at_utc: start, outcome: 'running', counted: false, stage: 'configuration'};
  const pendingKey = 'NEST_PENDING_' + run, p = nestProperties_();
  // Unique keys allow busy/disabled invocations to record without racing a shared counter.
  const buffered = Object.keys(p.getProperties()).filter(function(k) { return k.indexOf('NEST_PENDING_') === 0; }).length < 512;
  if (buffered) p.setProperty(pendingKey, JSON.stringify(attempt));
  else p.setProperty('NEST_TELEMETRY_GAP_' + start.slice(0, 10), 'Pending buffer exceeded; attempt outcomes and elapsed totals incomplete.');
  let lock, locked = false, c, h;
  nestExecution_ = {sheets: {}, rows: {}};
  try {
    c = nestConfig_();
    if (c.p.NEST_ENABLED !== 'true') { attempt.outcome = 'disabled'; return {status: 'disabled'}; }
    lock = LockService.getScriptLock();
    attempt.stage = 'lock';
    if (!lock.tryLock(1000)) { attempt.outcome = 'busy'; return {status: 'busy'}; }
    locked = true;
    attempt.counted = true;
    attempt.stage = 'telemetry_recovery';
    p.setProperty(pendingKey, JSON.stringify(attempt));
    // A running record from a previous lock owner has no completion evidence.
    nestDrainAttempts_(run);
    attempt.stage = 'collection';
    nestUpsert_(NEST_ATTEMPTS, NEST_ATTEMPT_HEADERS, [attempt]);
    SpreadsheetApp.flush();
    let drained = false, snapshotOk = false, lateCount = 0;
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
    if (acks.length) {
      SpreadsheetApp.flush();
      nestPubsub_('acknowledge', {ackIds: acks}); // durable raw + normalized observations before acknowledgement
    }
    const finish = nestIso_(Date.now()); h = {run_id: run, started_at_utc: start, finished_at_utc: finish, drained: drained && !lateCount, snapshot_ok: snapshotOk, status: lateCount ? 'degraded' : 'success'};
    // Batch health archives while preserving every individual continuity checkpoint.
    if (Math.floor(Date.parse(finish) / 900000) !== Number(c.p.NEST_HEALTH_ARCHIVE_BIN || 0)) {
      const after = Date.parse(c.p.NEST_HEALTH_ARCHIVE_THROUGH || '1970-01-01T00:00:00Z');
      // Archive prior checkpoints after their completion/error is known. The current
      // checkpoint is deferred so an early status cannot become permanent raw success.
      const completed = health.filter(function(v) { return Date.parse(v.finished_at_utc) > after; });
      if (completed.length) nestArchive_('health-batch-' + run, completed);
      const through = completed.map(function(v) { return v.finished_at_utc; }).sort().slice(-1)[0] || c.p.NEST_HEALTH_ARCHIVE_THROUGH || '1970-01-01T00:00:00Z';
      nestProperties_().setProperties({NEST_HEALTH_ARCHIVE_BIN: String(Math.floor(Date.parse(finish) / 900000)), NEST_HEALTH_ARCHIVE_THROUGH: through});
    }
    attempt.checkpoint_at_utc = finish;
    attempt.stage = 'materialization';
    nestUpsert_(NEST_ATTEMPTS, NEST_ATTEMPT_HEADERS, [attempt]);
    // Checkpoint time supports stream coverage; it is not end-to-end completion.
    nestUpsert_(NEST_HEALTH, NEST_HEALTH_HEADERS, [Object.assign({}, h, {status: 'checkpoint'})]);
    health.push(h);
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
    attempt.stage = 'monitoring';
    nestWriteUsage_(); // Completed attempts appear in totals on the next lock-owning run.
    SpreadsheetApp.flush();
    nestUpsert_(NEST_HEALTH, NEST_HEALTH_HEADERS, [h]);
    nestStatus_(lateCount || (c.events && !drained) ? 'degraded' : 'success', nestIso_(Date.now()), lateCount ? 'Old events archived; manual replay required. Duration coverage unknown during recovery.' : c.events ? (drained ? 'Event queue drained; durations provisional.' : 'Backlog: duration coverage unknown.') : 'Snapshots only: no runtime estimates.');
    SpreadsheetApp.flush();
    attempt.outcome = 'success';
    attempt.stage = 'complete';
    attempt.completed_at_utc = nestIso_(Date.now());
    nestUpsert_(NEST_ATTEMPTS, NEST_ATTEMPT_HEADERS, [attempt]);
    SpreadsheetApp.flush();
    return {status: 'success', observations_received: fresh.length, event_queue_drained: drained};
  } catch (e) {
    attempt.outcome = 'error';
    attempt.error_code = nestErrorCode_(e);
    attempt.completed_at_utc = nestIso_(Date.now());
    // Only static errors are persisted; never transport bodies, tokens, or arbitrary exceptions.
    if (locked) {
      try {
        nestUpsert_(NEST_HEALTH, NEST_HEALTH_HEADERS, [{run_id: run, started_at_utc: start, finished_at_utc: nestIso_(Date.now()), drained: false, snapshot_ok: false, status: 'error'}]);
        nestStatus_('error', nestIso_(Date.now()), 'Nest collection/processing failed at ' + attempt.stage + ' (' + attempt.error_code + '); inspect attempt and platform history.');
        nestUpsert_(NEST_ATTEMPTS, NEST_ATTEMPT_HEADERS, [attempt]);
        SpreadsheetApp.flush();
      } catch (reportError) { /* Pending record remains the fallback; stale timestamps are independently detectable. */ }
    }
    return {status: 'error', stage: attempt.stage};
  } finally {
    try {
      attempt.completed_at_utc = nestIso_(Date.now());
      attempt.elapsed_ms = Date.now() - started;
      if (buffered || locked) p.setProperty(pendingKey, JSON.stringify(attempt));
    } finally {
      nestExecution_ = null;
      if (locked) lock.releaseLock();
    }
  }
}
function nestErrorCode_(error) {
  const message = String(error && error.message || '');
  const http = /^Nest HTTP (\d{3})$/.exec(message);
  if (http) return 'http_' + http[1];
  if (message === 'Nest network unavailable') return 'network_unavailable';
  if (message === 'Nest token refresh failed') return 'token_refresh_failed';
  if (/Service using too much computer time for one day/.test(message)) return 'platform_runtime_quota';
  if (/Service invoked too many times|Limit exceeded/.test(message)) return 'platform_service_limit';
  return 'processing_failed';
}
/** Under the worker lock only. Upsert before deletion makes deferred telemetry retry-safe. */
function nestDrainAttempts_(currentRun) {
  const p = nestProperties_(), props = p.getProperties();
  const keys = Object.keys(props).filter(function(k) {
    if (k.indexOf('NEST_PENDING_') !== 0 || k === 'NEST_PENDING_' + currentRun) return false;
    const a = JSON.parse(props[k]);
    // Another invocation may still be waiting for this lock. Only the previous
    // counted owner, a terminal record, or a record older than execution limits is recoverable.
    return a.outcome !== 'running' || a.counted === true || Date.now() - Date.parse(a.started_at_utc) > 7 * 60000;
  });
  const rows = keys.map(function(k) {
    const a = JSON.parse(props[k]);
    if (a.outcome === 'running') { a.outcome = 'unfinished'; a.stage = 'termination_unknown'; }
    return a;
  });
  if (!rows.length) return;
  nestUpsert_(NEST_ATTEMPTS, NEST_ATTEMPT_HEADERS, rows);
  SpreadsheetApp.flush();
  keys.forEach(function(k) { p.deleteProperty(k); });
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
  const sheet = nestBook_().getSheetByName('Master_15min');
  if (!sheet || sheet.getLastRow() < 2 || !rows.length) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0], boundary = headers.indexOf('nest_present');
  if (boundary < 0 || headers.slice(boundary, boundary + 3).join(',') !== 'nest_present,nest_zone_count,nest_zones_json') throw new Error('Nest deploy bound Master schema first');
  const index = nestIndex_(rows), keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues(), candidates = [], updates = [];
  const seenKeys = new Set();
  keys.forEach(function(key, i) {
    if (seenKeys.has(key[0])) throw new Error('Nest duplicate Master UTC key');
    seenKeys.add(key[0]);
    if (index[key[0]]) candidates.push({row: i + 2, key: key[0], values: [true, index[key[0]].length, JSON.stringify(index[key[0]])]});
  });
  // Read only affected spans, batching adjacent keys rather than one RPC per bin.
  for (let i = 0; i < candidates.length;) {
    const block = [candidates[i++]];
    while (i < candidates.length && candidates[i].row === block[0].row + block.length) block.push(candidates[i++]);
    const old = sheet.getRange(block[0].row, boundary + 1, block.length, 3).getValues();
    block.forEach(function(u, j) { if (!old[j].every(function(v, k) { return v === u.values[k]; })) updates.push(u); });
  }
  // Cross-project locks do NOT synchronize. Recheck each block immediately before writing.
  // The remaining bound-writer race requires deployment review; this is not a transaction.
  for (let i = 0; i < updates.length;) {
    const block = [updates[i++]];
    while (i < updates.length && updates[i].row === block[0].row + block.length) block.push(updates[i++]);
    const currentKeys = sheet.getRange(block[0].row, 1, block.length, 1).getDisplayValues();
    if (block.some(function(u, j) { return currentKeys[j][0] !== u.key; })) throw new Error('Nest Master keys changed concurrently');
    sheet.getRange(block[0].row, boundary + 1, block.length, 3).setValues(block.map(function(u) { return u.values; }));
  }
}
function nestTrim_(name, headers, timeField, days) {
  const sheet = nestSheet_(name, headers), rows = nestRead_(name, headers), cutoff = Date.now() - days * 86400000;
  const retained = rows.filter(function(r) {
    if (name === NEST_ATTEMPTS) return r.outcome === 'running' || Date.parse(r.completed_at_utc || r.started_at_utc) >= cutoff;
    return Date.parse(r[timeField]) >= cutoff;
  });
  if (retained.length === rows.length) return;
  if (retained.length) sheet.getRange(2, 1, retained.length, headers.length).setValues(retained.map(function(r) { return headers.map(function(k) { return r[k] === null ? '' : r[k]; }); }));
  sheet.getRange(retained.length + 2, 1, rows.length - retained.length, headers.length).clearContent();
  nestCacheRows_(name, retained);
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

/** UTC operational telemetry; never the platform quota window or an invoice. */
function nestUsageDay_(day) {
  const p = nestProperties_(), key = 'NEST_USAGE_DAY_' + day;
  const stored = p.getProperty(key);
  if (stored) return JSON.parse(stored);
  const legacy = JSON.parse(p.getProperty('NEST_USAGE_CURRENT') || '{}');
  return legacy.day === day ? legacy : {day: day};
}
function nestUsageAdd_(key, amount) {
  const day = nestIso_(Date.now()).slice(0, 10), u = nestUsageDay_(day);
  u[key] = Number(u[key] || 0) + amount;
  nestProperties_().setProperty('NEST_USAGE_DAY_' + day, JSON.stringify(u));
}
function nestAttemptTotals_(attempts) {
  const days = {};
  function dayAt(ms) {
    const day = nestIso_(ms).slice(0, 10);
    if (!days[day]) days[day] = {attempts: 0, counted_runs: 0, successful_runs: 0, failed_runs: 0, disabled_runs: 0, lock_busy_runs: 0, unfinished_runs: 0, elapsed_ms: 0};
    return days[day];
  }
  attempts.forEach(function(a) {
    const first = Date.parse(a.started_at_utc), d = dayAt(first);
    d.attempts += 1;
    if (a.counted === true) d.counted_runs += 1;
    const field = {success: 'successful_runs', error: 'failed_runs', disabled: 'disabled_runs', busy: 'lock_busy_runs', unfinished: 'unfinished_runs'}[a.outcome];
    if (field) d[field] += 1;
    // Unknown termination has no invented elapsed duration. Split measured elapsed at UTC midnight.
    if (a.elapsed_ms === null || a.elapsed_ms === undefined || a.elapsed_ms === '') return;
    const end = first + Number(a.elapsed_ms);
    for (let cursor = first; cursor < end;) {
      const stop = Math.min(end, (Math.floor(cursor / 86400000) + 1) * 86400000);
      dayAt(cursor).elapsed_ms += stop - cursor; cursor = stop;
    }
  });
  return days;
}
function nestWriteUsage_() {
  const totals = nestAttemptTotals_(nestRead_(NEST_ATTEMPTS, NEST_ATTEMPT_HEADERS).filter(function(a) { return a.outcome !== 'running'; }));
  const today = nestIso_(Date.now()).slice(0, 10);
  if (!totals[today]) totals[today] = {};
  const headers = ['date_utc', 'updated_at_utc', 'runs', 'pull_requests', 'messages_received', 'snapshot_requests', 'delivery_proxy_bytes', 'archive_bytes', 'archive_files', 'runtime_minutes', 'status', 'scope', 'attempts', 'counted_runs', 'successful_runs', 'failed_runs', 'disabled_runs', 'lock_busy_runs', 'unfinished_runs'];
  const cutoff = nestIso_(Date.now() - 3 * 86400000).slice(0, 10);
  const rows = Object.keys(totals).sort().map(function(day) {
    const u = nestUsageDay_(day), t = u.post_repair_totals || totals[day];
    // Compact whole days before pruning the attempt ledger; a retry cannot count them twice.
    if (day < cutoff && !u.post_repair_totals) {
      u.post_repair_totals = t;
      nestProperties_().setProperty('NEST_USAGE_DAY_' + day, JSON.stringify(u));
    }
    const minutes = (Number(u.runtime_ms || 0) + Number(t.elapsed_ms || 0)) / 60000;
    const warning = Number(u.delivery_proxy_bytes || 0) >= 50 * 1024 * 1024 || Number(u.archive_bytes || 0) >= 10 * 1024 * 1024 || minutes >= 180;
    const row = {date_utc: day, updated_at_utc: nestIso_(Date.now()), runs: Number(u.runs || 0) + Number(t.counted_runs || 0), pull_requests: u.pull_requests || 0, messages_received: u.messages_received || 0, snapshot_requests: u.snapshot_requests || 0, delivery_proxy_bytes: u.delivery_proxy_bytes || 0, archive_bytes: u.archive_bytes || 0, archive_files: u.archive_files || 0, runtime_minutes: minutes, status: warning ? 'review_usage' : 'normal', scope: 'This worker only; not billable volume or platform quota usage. Legacy baseline plus post-repair measured elapsed; outcome columns begin at repair. Completed telemetry deferred to next lock-owning run; hard terminations have unknown elapsed. Excludes final pending-property write, lock release and platform startup/teardown.'};
    const gap = nestProperties_().getProperty('NEST_TELEMETRY_GAP_' + day);
    if (gap) row.scope += ' TELEMETRY GAP: ' + gap;
    headers.slice(12).forEach(function(k) { row[k] = t[k] || 0; });
    return row;
  });
  const existing = nestRead_('Nest_Usage', headers);
  rows.forEach(function(row) {
    const prior = existing.filter(function(r) { return r.date_utc === row.date_utc; }).sort(function(a, b) { return String(a.updated_at_utc).localeCompare(String(b.updated_at_utc)); }).slice(-1)[0];
    if (prior && headers.every(function(k) { return k === 'updated_at_utc' || nestCell_(prior[k]) === nestCell_(row[k]); })) row.updated_at_utc = prior.updated_at_utc;
  });
  nestUpsert_('Nest_Usage', headers, rows);
  // Retain three complete UTC days plus today; compacted daily totals stay in Properties/Sheets.
  nestTrim_(NEST_ATTEMPTS, NEST_ATTEMPT_HEADERS, 'started_at_utc', (Date.now() - Date.parse(cutoff + 'T00:00:00Z')) / 86400000);
}

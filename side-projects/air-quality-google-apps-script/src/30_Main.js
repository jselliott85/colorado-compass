/** Scheduled orchestration and health monitoring. */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Air Quality Data')
    .addItem('Initialize / repair schema', 'initializeAirQualitySystem')
    .addItem('Run collection now', 'runScheduledCollection')
    .addItem('Continue historical backfill', 'runHistoricalBackfill')
    .addSeparator()
    .addItem('Install 6-hour trigger', 'installAirQualityTrigger')
    .addToUi();
}

function initializeAirQualitySystem() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Open the bound Google Sheet before initializing.');
  aqProperties_().setProperties({
    SPREADSHEET_ID: spreadsheet.getId(),
    TIME_ZONE: AQ_DEFAULT_TIME_ZONE,
    INITIAL_BACKFILL_DATE: AQ_INITIAL_DATE,
    KEEP_RAW: aqProperties_().getProperty('KEEP_RAW') || 'true'
  }, false);
  aqInitializeSheets_();
  aqRawRootFolder_();
  SpreadsheetApp.flush();
}

function installAirQualityTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'runScheduledCollection') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('runScheduledCollection').timeBased().everyHours(AQ_TRIGGER_HOURS).create();
}

function runScheduledCollection() {
  return aqRunCollection_(false);
}

function runHistoricalBackfill() {
  return aqRunCollection_(true);
}

function aqRunCollection_(extendedBackfill) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  const runStarted = new Date();
  const runId = Utilities.getUuid();
  let affectedStart = '';
  try {
    aqInitializeSheets_();
    const tempest = aqRunSource_(runId, 'tempest', function() {
      const dates = aqDatesForSourceRun_('TEMPEST_BACKFILL_CURSOR', extendedBackfill, runStarted);
      let rows = [];
      dates.forEach(function(dateText) {
        if (Date.now() - runStarted.getTime() > AQ_EXECUTION_BUDGET_MS) return;
        rows = rows.concat(aqCollectTempestDate_(dateText));
        aqAdvanceCursor_('TEMPEST_BACKFILL_CURSOR', dateText);
      });
      return aqUpsertRows_(AQ_SHEETS.TEMPEST, AQ_TEMPEST_HEADERS, rows);
    });
    affectedStart = aqEarliest_([affectedStart, tempest.earliest]);

    const regional = aqRunSource_(runId, 'cdphe', function() {
      const dates = aqDatesForSourceRun_('CDPHE_BACKFILL_CURSOR', extendedBackfill, runStarted);
      const rows = dates.length ? aqCollectCdpheDates_(dates) : [];
      dates.forEach(function(dateText) { aqAdvanceCursor_('CDPHE_BACKFILL_CURSOR', dateText); });
      return aqUpsertRows_(AQ_SHEETS.REGIONAL, AQ_REGIONAL_HEADERS, rows);
    });
    affectedStart = aqEarliest_([affectedStart, regional.earliest]);

    if (affectedStart) {
      aqRunSource_(runId, 'master', function() {
        return aqRebuildMaster_(affectedStart, aqUtcIso_(new Date()));
      });
    }
    aqRefreshDysonStatus_();
    aqCheckDysonAlert_();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function aqDatesForSourceRun_(cursorProperty, extendedBackfill, runStarted) {
  const config = aqConfig_();
  const today = aqLocalDate_(new Date(), config.timeZone);
  let cursor = aqProperties_().getProperty(cursorProperty) || config.initialDate;
  if (cursor < config.initialDate) cursor = config.initialDate;
  const limit = extendedBackfill ? 7 : AQ_MAX_BACKFILL_DAYS_PER_RUN;
  const chosen = {};
  let count = 0;
  while (cursor <= today && count < limit && Date.now() - runStarted.getTime() < AQ_EXECUTION_BUDGET_MS) {
    chosen[cursor] = true;
    cursor = aqAddLocalDays_(cursor, 1);
    count += 1;
  }
  for (let offset = AQ_RECENT_OVERLAP_DAYS; offset >= 0; offset -= 1) {
    const recent = aqAddLocalDays_(today, -offset);
    if (recent >= config.initialDate) chosen[recent] = true;
  }
  return Object.keys(chosen).sort();
}

function aqAdvanceCursor_(propertyName, completedDate) {
  const next = aqAddLocalDays_(completedDate, 1);
  const properties = aqProperties_();
  const current = properties.getProperty(propertyName) || aqConfig_().initialDate;
  // Recent overlap dates may be newer than an unfinished historical cursor.
  // Advance only the next contiguous backfill date so no date can be skipped.
  if (completedDate === current) properties.setProperty(propertyName, next);
}

function aqRunSource_(runId, source, callback) {
  const started = new Date();
  const properties = aqProperties_();
  const statusPrefix = 'STATUS_' + source.toUpperCase() + '_';
  let result = { fetched: 0, upserted: 0, earliest: '', latest: '' };
  let status = 'success';
  let category = '';
  let message = 'OK';
  try {
    result = callback() || result;
    properties.setProperties({
      [statusPrefix + 'LAST_SUCCESS_UTC']: aqUtcIso_(new Date()),
      [statusPrefix + 'CONSECUTIVE_FAILURES']: '0'
    }, false);
  } catch (error) {
    status = 'error';
    category = aqErrorCategory_(error);
    message = aqSafeMessage_(error);
    const failures = Number(properties.getProperty(statusPrefix + 'CONSECUTIVE_FAILURES') || 0) + 1;
    properties.setProperty(statusPrefix + 'CONSECUTIVE_FAILURES', String(failures));
  }
  const finished = new Date();
  const lastSuccess = properties.getProperty(statusPrefix + 'LAST_SUCCESS_UTC') || '';
  const failures = Number(properties.getProperty(statusPrefix + 'CONSECUTIVE_FAILURES') || 0);
  const retentionRisk = source === 'dyson' ? aqDysonRisk_(lastSuccess, failures) : '';
  const health = {
    run_id: runId,
    source: source,
    started_at_utc: aqUtcIso_(started),
    finished_at_utc: aqUtcIso_(finished),
    status: status,
    rows_fetched: result.fetched,
    rows_upserted: result.upserted,
    earliest_observation_utc: result.earliest,
    latest_observation_utc: result.latest,
    error_category: category,
    message: message,
    schema_version: AQ_SCHEMA_VERSION
  };
  aqAppendHealth_(health);
  aqUpdateSourceStatus_({
    source: source,
    last_attempt_utc: aqUtcIso_(finished),
    last_success_utc: lastSuccess,
    status: status,
    consecutive_failures: failures,
    rows_fetched: result.fetched,
    rows_upserted: result.upserted,
    earliest_observation_utc: result.earliest,
    latest_observation_utc: result.latest,
    message: message,
    dyson_retention_risk: retentionRisk,
    schema_version: AQ_SCHEMA_VERSION
  });
  result.ok = status === 'success';
  return result;
}

function aqDysonRisk_(lastSuccessUtc, failures) {
  if (!lastSuccessUtc) return 'critical_no_success';
  const hours = (Date.now() - new Date(lastSuccessUtc).getTime()) / 3600000;
  if (hours >= 120) return 'critical_under_48h_before_history_loss';
  if (hours >= 72) return 'high';
  if (hours >= 36 || failures >= 2) return 'warning';
  return 'normal';
}

function aqRefreshDysonStatus_() {
  const sheet = aqEnsureSheet_(AQ_SHEETS.STATUS, AQ_STATUS_HEADERS);
  const existing = sheet.getLastRow() > 1
    ? aqObjectRows_(AQ_STATUS_HEADERS, sheet.getRange(2, 1, sheet.getLastRow() - 1, AQ_STATUS_HEADERS.length).getValues())
    : [];
  const prior = existing.filter(function(row) { return row.source === 'dyson'; })[0] || {};
  const lastSuccess = aqProperties_().getProperty('STATUS_DYSON_LAST_SUCCESS_UTC') || '';
  const failures = Number(aqProperties_().getProperty('STATUS_DYSON_CONSECUTIVE_FAILURES') || 0);
  const risk = aqDysonRisk_(lastSuccess, failures);
  if (prior.dyson_retention_risk === risk && prior.status !== 'success') return;
  if (prior.dyson_retention_risk === risk && risk === 'normal') return;
  aqUpdateSourceStatus_({
    source: 'dyson',
    last_attempt_utc: prior.last_attempt_utc || '',
    last_success_utc: lastSuccess,
    status: risk === 'normal' ? (prior.status || 'success') : 'stale',
    consecutive_failures: failures,
    rows_fetched: prior.rows_fetched || 0,
    rows_upserted: prior.rows_upserted || 0,
    earliest_observation_utc: prior.earliest_observation_utc || '',
    latest_observation_utc: prior.latest_observation_utc || '',
    message: risk === 'normal' ? (prior.message || 'OK') : 'No recent successful signed Dyson intake.',
    dyson_retention_risk: risk,
    schema_version: AQ_SCHEMA_VERSION
  });
}

function aqCheckDysonAlert_() {
  const config = aqConfig_();
  const properties = aqProperties_();
  const lastSuccess = properties.getProperty('STATUS_DYSON_LAST_SUCCESS_UTC') || '';
  const failures = Number(properties.getProperty('STATUS_DYSON_CONSECUTIVE_FAILURES') || 0);
  const risk = aqDysonRisk_(lastSuccess, failures);
  if (risk === 'normal' || !config.alertEmail) return;
  const lastAlert = properties.getProperty('DYSON_LAST_ALERT_UTC') || '';
  if (lastAlert && Date.now() - new Date(lastAlert).getTime() < 24 * 3600000) return;
  MailApp.sendEmail({
    to: config.alertEmail,
    subject: 'Air quality collector: Dyson history retention risk',
    body: 'The read-only Dyson collector status is ' + risk + '. Consecutive failures: ' + failures +
      '. Last success: ' + (lastSuccess || 'never') + '. Open Source_Status and Health_Log in the private dataset.'
  });
  properties.setProperty('DYSON_LAST_ALERT_UTC', aqUtcIso_(new Date()));
}

/** Spreadsheet creation, idempotent upserts, documentation, and health records. */

function aqEnsureSheet_(name, headers) {
  const spreadsheet = aqSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (headers && headers.length) {
    if (sheet.getMaxColumns() < headers.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    }
    const current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    const differs = headers.some(function(header, index) { return current[index] !== header; });
    if (differs && sheet.getLastRow() > 1) {
      throw new Error('Schema mismatch in ' + name + '; refusing to overwrite populated data.');
    }
    if (differs) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    aqStyleTableSheet_(sheet, headers.length);
  }
  return sheet;
}

function aqStyleTableSheet_(sheet, columnCount) {
  sheet.setFrozenRows(1);
  const header = sheet.getRange(1, 1, 1, columnCount);
  header.setFontWeight('bold').setBackground('#e8eaed').setFontColor('#202124').setWrap(true);
  sheet.setRowHeight(1, 42);
  sheet.setColumnWidth(1, 170);
  if (columnCount > 1) sheet.setColumnWidths(2, columnCount - 1, 125);
}

function aqInitializeSheets_() {
  aqEnsureSheet_(AQ_SHEETS.README, ['field', 'value']);
  aqEnsureSheet_(AQ_SHEETS.MASTER, AQ_MASTER_HEADERS);
  aqEnsureSheet_(AQ_SHEETS.DYSON, AQ_DYSON_HEADERS);
  aqEnsureSheet_(AQ_SHEETS.TEMPEST, AQ_TEMPEST_HEADERS);
  aqEnsureSheet_(AQ_SHEETS.REGIONAL, AQ_REGIONAL_HEADERS);
  aqEnsureSheet_(AQ_SHEETS.EVENTS, AQ_EVENT_HEADERS);
  aqEnsureSheet_(AQ_SHEETS.STATUS, AQ_STATUS_HEADERS);
  aqEnsureSheet_(AQ_SHEETS.HEALTH, AQ_HEALTH_HEADERS);
  aqEnsureSheet_(AQ_SHEETS.SCHEMA, AQ_SCHEMA_HEADERS);
  aqEnsureSheet_(AQ_SHEETS.ARCHIVES, AQ_ARCHIVE_HEADERS);
  aqWriteReadme_();
  aqWriteSchema_();
  aqSeedEvents_();
}

function aqUpsertRows_(sheetName, headers, rows) {
  if (!rows.length) return { fetched: 0, upserted: 0, earliest: '', latest: '' };
  const sheet = aqEnsureSheet_(sheetName, headers);
  const deduped = {};
  rows.forEach(function(row) { if (row.timestamp_utc) deduped[String(row.timestamp_utc)] = row; });
  const ordered = Object.keys(deduped).sort().map(function(key) { return deduped[key]; });
  const lastRow = sheet.getLastRow();
  const existingKeys = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().map(function(row) { return row[0]; })
    : [];
  const rowByKey = {};
  existingKeys.forEach(function(key, index) { if (key) rowByKey[key] = index + 2; });
  const updates = [];
  const appends = [];
  ordered.forEach(function(row) {
    const values = headers.map(function(header) { return aqCellValue_(row[header]); });
    if (rowByKey[row.timestamp_utc]) updates.push({ row: rowByKey[row.timestamp_utc], values: values });
    else appends.push(values);
  });

  updates.sort(function(left, right) { return left.row - right.row; });
  let block = [];
  let blockStart = null;
  updates.forEach(function(update, index) {
    if (blockStart === null) blockStart = update.row;
    const expectedRow = blockStart + block.length;
    if (update.row !== expectedRow) {
      sheet.getRange(blockStart, 1, block.length, headers.length).setValues(block);
      block = [];
      blockStart = update.row;
    }
    block.push(update.values);
    if (index === updates.length - 1 && block.length) {
      sheet.getRange(blockStart, 1, block.length, headers.length).setValues(block);
    }
  });

  if (appends.length) {
    const appendStart = sheet.getLastRow() + 1;
    if (sheet.getMaxRows() < appendStart + appends.length - 1) {
      sheet.insertRowsAfter(sheet.getMaxRows(), appendStart + appends.length - 1 - sheet.getMaxRows());
    }
    sheet.getRange(appendStart, 1, appends.length, headers.length).setValues(appends);
    const lastExistingKey = existingKeys.filter(Boolean).slice(-1)[0] || '';
    const appendedKeys = ordered.filter(function(row) { return !rowByKey[row.timestamp_utc]; });
    if (lastExistingKey && appendedKeys.some(function(row) { return row.timestamp_utc < lastExistingKey; })) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).sort({ column: 1, ascending: true });
    }
  }
  aqRefreshFilter_(sheet, headers.length);
  return {
    fetched: ordered.length,
    upserted: updates.length + appends.length,
    earliest: ordered[0].timestamp_utc,
    latest: ordered[ordered.length - 1].timestamp_utc
  };
}

function aqRefreshFilter_(sheet, columnCount) {
  const existing = sheet.getFilter();
  if (existing) existing.remove();
  sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), columnCount).createFilter();
}

function aqReadRowsBetween_(sheetName, headers, startUtc, endUtc) {
  const sheet = aqSpreadsheet_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues()
    .map(function(row) { return row[0]; });
  const first = aqFirstKeyIndex_(keys, startUtc, false);
  const afterLast = aqFirstKeyIndex_(keys, endUtc, true);
  if (afterLast <= first) return [];
  const values = sheet.getRange(first + 2, 1, afterLast - first, headers.length).getValues();
  return aqObjectRows_(headers, values);
}

function aqFirstKeyIndex_(keys, target, strict) {
  let low = 0;
  let high = keys.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (keys[middle] < target || (strict && keys[middle] === target)) low = middle + 1;
    else high = middle;
  }
  return low;
}

function aqLatestTimestamp_(sheetName) {
  const sheet = aqSpreadsheet_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return '';
  return String(sheet.getRange(sheet.getLastRow(), 1).getDisplayValue() || '');
}

function aqWriteReadme_() {
  const sheet = aqEnsureSheet_(AQ_SHEETS.README, ['field', 'value']);
  const rows = [
    ['dataset_name', 'Private Home Air Quality Longitudinal Dataset'],
    ['purpose', 'Canonical read-only analytical history for ChatGPT and manual longitudinal analysis.'],
    ['canonical_table', AQ_SHEETS.MASTER],
    ['time_zone', AQ_DEFAULT_TIME_ZONE],
    ['cadence', '15 minutes'],
    ['schema_version', AQ_SCHEMA_VERSION],
    ['missing_values', 'Blank numeric cells are missing, never zero or interpolated. Presence, coverage, and missing_sources fields make missingness explicit.'],
    ['privacy', 'No home address or home coordinates are stored. Tempest credentials are in private Script Properties; Dyson bearer and serial are in GitHub Actions secrets. A separate intake secret is held in both systems.'],
    ['dyson_source', 'MyDyson read-only environmental history from a GitHub-hosted collector; rolling seven calendar dates; refreshed with overlap and timestamp upserts.'],
    ['tempest_source', 'On-site Tempest native one-minute history aggregated to 15-minute UTC bins. Wind is intentionally excluded because station siting makes it unreliable.'],
    ['regional_aq_source', 'CDPHE preliminary regional comparator data. PM2.5/PM10: Boulder-CU/Athens (AQS 080131001, about 5,322 ft). Ozone: Boulder Reservoir (AQS 080130014, about 5,203 ft).'],
    ['regional_caveat', 'Regional monitors are not measurements at the home. The home environment is roughly 2,000 ft higher and west in the foothills.'],
    ['events', 'Events are manually recorded interventions/context only. No inferred occupancy, window, traffic, vegetation, or smoke events are added.'],
    ['raw_archive', 'Private compressed Drive files preserve source responses when KEEP_RAW=true.'],
    ['chatgpt_retrieval', 'Ask ChatGPT to use Google Drive, open this Sheet, read Schema first, then query bounded ranges in Master_15min and Events.'],
    ['longitudinal_storage', 'Monitor Source_Status and workbook size. At 15 million allocated cells, create yearly archive workbooks with the same schema before the current Google Sheets limit is approached.'],
    ['maintainer', 'Codex maintains collection/schema infrastructure; ChatGPT performs analysis. Analytical conclusions are not encoded in collection.']
  ];
  const target = sheet.getRange(2, 1, rows.length, 2);
  target.setValues(rows).setWrap(true).setVerticalAlignment('top');
  if (sheet.getLastRow() > rows.length + 1) sheet.getRange(rows.length + 2, 1, sheet.getLastRow() - rows.length - 1, 2).clearContent();
  sheet.setColumnWidth(1, 190);
  sheet.setColumnWidth(2, 760);
  aqRefreshFilter_(sheet, 2);
}

function aqSchemaDescription_(table, column) {
  const definitions = {
    timestamp_utc: ['timestamp', 'UTC', 'Quarter-hour observation key in UTC.', 'required key'],
    timestamp_local: ['timestamp', 'America/Denver', 'Same instant rendered with local DST-aware offset.', 'required key'],
    local_date: ['date', 'America/Denver', 'Local calendar date derived from timestamp.', 'derived, never inferred from sensor data'],
    local_time: ['time', 'America/Denver', 'Local clock time derived from timestamp.', 'derived, never inferred from sensor data'],
    utc_offset: ['text', 'UTC offset', 'Local UTC offset for DST-safe interpretation.', 'derived'],
    day_of_week: ['text', '', 'Local weekday name.', 'derived'],
    is_weekend: ['boolean', '', 'True for local Saturday or Sunday.', 'derived'],
    missing_sources: ['text', '', 'Comma-separated expected sources absent in this bin.', 'blank means no source is missing'],
    event_id: ['text', '', 'Stable manual-event identifier.', 'required'],
    event_type: ['text', '', 'Manually assigned event category.', 'required'],
    description: ['text', '', 'Human-entered factual intervention/context.', 'required'],
    time_precision: ['text', '', 'Precision qualifier such as approximate or exact.', 'required'],
    schema_version: ['text', '', 'Schema version used to write the row.', 'required']
  };
  if (definitions[column]) return definitions[column];
  let type = 'number';
  let unit = '';
  let description = column.replace(/_/g, ' ');
  let missing = 'blank means source did not report a value; never interpolated';
  if (/_present$/.test(column)) { type = 'boolean'; description = 'Whether this source reported this 15-minute bin.'; missing = 'never blank in master table'; }
  else if (/count$/.test(column)) unit = 'observations';
  else if (/coverage_pct$|humidity_pct$/.test(column)) unit = 'percent';
  else if (/temperature_[cf]$|_point_f$/.test(column)) unit = column.slice(-1).toUpperCase();
  else if (/pressure_mb$/.test(column)) unit = 'millibar';
  else if (/radiation_w_m2$/.test(column)) unit = 'W/m²';
  else if (/illuminance_lux$/.test(column)) unit = 'lux';
  else if (/precipitation_in$/.test(column)) unit = 'inch per 15-minute bin';
  else if (/distance_mi$/.test(column)) unit = 'mile';
  else if (/battery_volts$/.test(column)) unit = 'volt';
  else if (/pm25|pm10/.test(column) && /ug_m3/.test(column)) unit = 'µg/m³';
  else if (/ozone.*ppb/.test(column)) unit = 'ppb';
  else if (/aqi|index/.test(column)) unit = 'source index';
  else if (/seconds$/.test(column)) unit = 'second';
  else if (/minutes$/.test(column)) unit = 'minute';
  else if (/station|pollutant|scope|message|status|source|notes|run_id|category/.test(column)) type = 'text';
  return [type, unit, description, missing];
}

function aqWriteSchema_() {
  const sheet = aqEnsureSheet_(AQ_SHEETS.SCHEMA, AQ_SCHEMA_HEADERS);
  const tables = [
    [AQ_SHEETS.MASTER, AQ_MASTER_HEADERS, 'joined canonical table'],
    [AQ_SHEETS.DYSON, AQ_DYSON_HEADERS, 'MyDyson'],
    [AQ_SHEETS.TEMPEST, AQ_TEMPEST_HEADERS, 'Tempest'],
    [AQ_SHEETS.REGIONAL, AQ_REGIONAL_HEADERS, 'CDPHE regional comparator'],
    [AQ_SHEETS.EVENTS, AQ_EVENT_HEADERS, 'manual only'],
    [AQ_SHEETS.STATUS, AQ_STATUS_HEADERS, 'collector health']
  ];
  const rows = [];
  tables.forEach(function(entry) {
    entry[1].forEach(function(column) {
      const definition = aqSchemaDescription_(entry[0], column);
      rows.push([entry[0], column, definition[0], definition[1], definition[2], definition[3], entry[2], AQ_SCHEMA_VERSION]);
    });
  });
  sheet.getRange(2, 1, rows.length, AQ_SCHEMA_HEADERS.length).setValues(rows).setWrap(true).setVerticalAlignment('top');
  if (sheet.getLastRow() > rows.length + 1) sheet.getRange(rows.length + 2, 1, sheet.getLastRow() - rows.length - 1, AQ_SCHEMA_HEADERS.length).clearContent();
  sheet.setColumnWidth(1, 155);
  sheet.setColumnWidth(2, 230);
  sheet.setColumnWidth(5, 420);
  sheet.setColumnWidth(6, 320);
  aqRefreshFilter_(sheet, AQ_SCHEMA_HEADERS.length);
}

function aqSeedEvents_() {
  const sheet = aqEnsureSheet_(AQ_SHEETS.EVENTS, AQ_EVENT_HEADERS);
  const eventId = '2026-09-24-filter-change';
  const ids = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat() : [];
  if (ids.indexOf(eventId) >= 0) return;
  sheet.appendRow([
    eventId,
    '2026-09-24T09:00:00-06:00',
    '2026-09-24T15:00:00Z',
    'approximate',
    'filter_change',
    'Dyson HEPA/activated-carbon filter replaced',
    'Manually recorded intervention; time is approximately 09:00 America/Denver.',
    aqUtcIso_(new Date())
  ]);
  aqRefreshFilter_(sheet, AQ_EVENT_HEADERS.length);
}

function aqAppendHealth_(record) {
  const sheet = aqEnsureSheet_(AQ_SHEETS.HEALTH, AQ_HEALTH_HEADERS);
  sheet.appendRow(AQ_HEALTH_HEADERS.map(function(header) { return aqCellValue_(record[header]); }));
  const maxRows = 2001;
  if (sheet.getLastRow() > maxRows) sheet.deleteRows(2, sheet.getLastRow() - maxRows);
}

function aqUpdateSourceStatus_(record) {
  const sheet = aqEnsureSheet_(AQ_SHEETS.STATUS, AQ_STATUS_HEADERS);
  const sources = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat() : [];
  const index = sources.indexOf(record.source);
  const rowNumber = index >= 0 ? index + 2 : sheet.getLastRow() + 1;
  sheet.getRange(rowNumber, 1, 1, AQ_STATUS_HEADERS.length).setValues([
    AQ_STATUS_HEADERS.map(function(header) { return aqCellValue_(record[header]); })
  ]);
}

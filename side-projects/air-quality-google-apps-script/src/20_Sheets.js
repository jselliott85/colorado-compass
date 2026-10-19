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
    // Explicit append-only migration: preserve every existing column and cell.
    const appendMigration = name === AQ_SHEETS.MASTER &&
      ['carriage_wind_speed_kmh', 'ncar_foothills_present', 'nr1_present'].some(function(firstNewColumn) {
        const boundary = headers.indexOf(firstNewColumn);
        return boundary > 0 && current.slice(0, boundary).every(function(value, index) {
          return value === headers[index];
        }) && current.slice(boundary).every(function(value) { return value === ''; });
      });
    if (differs && sheet.getLastRow() > 1 && !appendMigration) {
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
  aqEnsureSheet_(AQ_SHEETS.CARRIAGE, AQ_CARRIAGE_HEADERS);
  aqEnsureSheet_(AQ_SHEETS.NCAR, AQ_NCAR_HEADERS);
  aqEnsureSheet_(AQ_SHEETS.NCAR_NATIVE, AQ_NCAR_NATIVE_HEADERS);
  aqEnsureSheet_(AQ_SHEETS.NR1_NATIVE, AQ_NR1_NATIVE_HEADERS);
  aqEnsureSheet_(AQ_SHEETS.NR1, AQ_NR1_HEADERS);
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
      aqFormatIdentifierColumns_(sheet, sheetName, blockStart, block.length);
      sheet.getRange(blockStart, 1, block.length, headers.length).setValues(block);
      block = [];
      blockStart = update.row;
    }
    block.push(update.values);
    if (index === updates.length - 1 && block.length) {
      aqFormatIdentifierColumns_(sheet, sheetName, blockStart, block.length);
      sheet.getRange(blockStart, 1, block.length, headers.length).setValues(block);
    }
  });

  if (appends.length) {
    const appendStart = sheet.getLastRow() + 1;
    if (sheet.getMaxRows() < appendStart + appends.length - 1) {
      sheet.insertRowsAfter(sheet.getMaxRows(), appendStart + appends.length - 1 - sheet.getMaxRows());
    }
    aqFormatIdentifierColumns_(sheet, sheetName, appendStart, appends.length);
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

function aqFormatIdentifierColumns_(sheet, sheetName, startRow, rowCount) {
  const columns = sheetName === AQ_SHEETS.MASTER ? [5, 49, 51]
    : sheetName === AQ_SHEETS.REGIONAL ? [17, 19] : [];
  columns.forEach(function(column) {
    sheet.getRange(startRow, column, rowCount, 1).setNumberFormat('@');
  });
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
    ['carriage_hills_pilot', 'KCOBOULD877 / Carriage Hills: optional provisional comparator and labeled fallback only; never replaces Tempest. Wind speed/gust provisional; direction untrusted (repeated 360 degrees). Pressure likely sea-level, distinct from Tempest station pressure. Precipitation total is the source accumulation, never summed. Review after at least 14 days of live collection; no automatic promotion.'],
    ['carriage_hills_analysis', 'After a manually recorded Tempest relocation, evaluate wind speed/gust agreement, evening VOC associations and winter coverage. Tempest wind remains excluded pending a separate validated collector change; no causal conclusions from association.'],
    ['us_nr1', AQ_NR1_CAVEAT],
    ['ncar_foothills', 'NCAR Foothills Lab, 1625 m / 5331 ft; roughly 2000 ft below home. Regional rooftop weather/wind comparator only; never overwrites or substitutes for Tempest. Building wind shading and roof heating are known limitations; not research-quality or QC-certified. Differences across elevations may be informative.'],
    ['ncar_provisional', 'Bins use exact source UTC observation labels with no time shift; start/center/end averaging convention unconfirmed. Gust is the maximum reported wspd_max; its duration/reset definition remains unconfirmed. Precipitation_mm is missing pending interval semantics; cumulative counters retained only in native/raw data. Rain sensor does not measure snow reliably.'],
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
  if (table === AQ_SHEETS.NR1 || table === AQ_SHEETS.NR1_NATIVE || column.indexOf('nr1_') === 0) {
    return aqNr1SchemaDefinition_(table, column);
  }
  const ncarField = column.replace(/^ncar_foothills_/, '');
  if (table === AQ_SHEETS.NCAR || table === AQ_SHEETS.NCAR_NATIVE || column.indexOf('ncar_foothills_') === 0) {
    const ncarDefinitions = {
      temperature_c: ['number', 'C', 'Mean NCAR tdry at reported UTC labels; regional rooftop comparator, not home weather.'],
      dew_point_c: ['number', 'C', 'Mean source-derived dewpoint.'],
      relative_humidity_pct: ['number', 'percent', 'Mean NCAR rh.'],
      station_pressure_hpa: ['number', 'hPa', 'Mean pres (station pressure); cp res/sea-level corrected pressure is not substituted.'],
      wind_speed_ms: ['number', 'm/s', 'Mean reported wspd; subject to building shading and rooftop siting.'],
      wind_direction_deg: ['number', 'degrees from north', 'Direction of speed-weighted vector mean from valid wspd/wdir pairs; requires at least two pairs and resultant > 0.01 m/s; calm/cancelling vectors are missing.'],
      peak_gust_ms: ['number', 'm/s', 'Maximum source wspd_max. Provisional: gust averaging duration/reset window unconfirmed.'],
      precipitation_mm: ['number', 'mm', 'Always missing until rain interval semantics verified; cumulative totals are never summed.'],
      rain_accum_mm: ['number', 'mm', 'Native cumulative rain_accum; counter can reset; never sum.'],
      rain_daily_mm: ['number', 'mm', 'Native raina_daily: cumulative total resetting at source local midnight; never sum.'],
      rain_event_mm: ['number', 'mm', 'Native raina_event: cumulative event total resetting after one dry hour; never sum.'],
      coverage_fraction: ['number', 'fraction 0–1', 'Populated native record count divided by three expected 5-minute observation labels; not per-field completeness.'],
      observation_count: ['number', 'observations', 'Populated native records in this UTC quarter-hour.'],
      expected_observation_count: ['number', 'observations', 'Three 5-minute records per UTC quarter-hour.'],
      wind_direction_observation_count: ['number', 'observations', 'Valid positive-speed direction pairs used in vector average.'],
      timestamp_convention: ['text', '', 'reported_observation_label_unshifted; averaging interval alignment unresolved.'],
      gust_definition: ['text', '', 'reported_maximum_duration_unconfirmed'],
      precipitation_status: ['text', '', 'withheld_pending_interval_definition'],
      source: ['text', '', 'NCAR Foothills Lab regional comparator; https://archive.eol.ucar.edu/weather/data/foothills/']
    };
    if (ncarDefinitions[ncarField]) {
      const definition = ncarDefinitions[ncarField].slice();
      if (table === AQ_SHEETS.NCAR_NATIVE && AQ_NCAR_FIELDS.indexOf(ncarField) >= 0) {
        definition[2] = 'Native source reading at reported UTC observation timestamp; ' + definition[2];
      }
      return definition.concat(['blank is missing, never zero-filled or interpolated']);
    }
  }
  const carriageColumn = table === AQ_SHEETS.CARRIAGE || column.indexOf('carriage_') === 0;
  const carriageField = column.replace(/^carriage_/, '');
  if (carriageColumn) {
    const metadata = {
      wind_speed_kmh: ['km/h', 'WU windspeedAvg; provisional comparison value; interval support unverified.'],
      wind_gust_kmh: ['km/h', 'WU windgustHigh; provisional; capture of all interval gusts unverified.'],
      wind_direction_deg: ['degree', 'WU winddirAvg retained verbatim; UNTRUSTED, including repeated 360 values; exclude from directional conclusions.'],
      temperature_c: ['C', 'WU tempAvg; nearby comparator only.'],
      relative_humidity_pct: ['percent', 'WU humidityAvg.'],
      dew_point_c: ['C', 'WU dewptAvg.'],
      pressure_hpa: ['hPa', 'WU midpoint of pressureMin/Max (or available bound); likely sea-level pressure, not Tempest station pressure. Raw bounds archived.'],
      precip_rate_mm_h: ['mm/h', 'WU source precipitation rate.'],
      precip_total_mm: ['mm', 'WU cumulative precipitation total; source local-day/reset semantics retained. Never sum totals or infer interval rain across gaps/resets.'],
      qc_status: ['', 'WU numeric qcStatus retained; not a guarantee of sensor accuracy.']
    };
    if (metadata[carriageField]) return ['number', metadata[carriageField][0], metadata[carriageField][1], 'blank means missing; never interpolated'];
    if (['wind_direction_trust', 'pressure_basis', 'precip_total_semantics', 'station_id'].indexOf(carriageField) >= 0) return ['text', '', carriageField.replace(/_/g, ' '), 'source metadata'];
    if (carriageField === 'epoch') return ['number', 'Unix seconds', 'Exact source observation instant; UTC deduplication key, never local clock alone.', 'required'];
  }
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
    [AQ_SHEETS.CARRIAGE, AQ_CARRIAGE_HEADERS, 'WU KCOBOULD877 provisional pilot'],
    [AQ_SHEETS.NCAR, AQ_NCAR_HEADERS, 'NCAR Foothills regional comparator (provisional)'],
    [AQ_SHEETS.NCAR_NATIVE, AQ_NCAR_NATIVE_HEADERS, 'NCAR Foothills native 5-minute readings'],
    [AQ_SHEETS.NR1_NATIVE, AQ_NR1_NATIVE_HEADERS, 'Sean Burns supplied US-NR1 raw batch'],
    [AQ_SHEETS.NR1, AQ_NR1_HEADERS, 'US-NR1 raw-statistics comparator'],
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

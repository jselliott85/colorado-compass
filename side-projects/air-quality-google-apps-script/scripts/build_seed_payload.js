#!/usr/bin/env node

/** Build a credential-free initial Sheet payload from the already validated local fixtures. */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const project = path.resolve(__dirname, '..');
const repo = path.resolve(project, '..', '..');

function formatDate(date, timeZone, pattern) {
  const zone = timeZone === 'GMT-07:00' ? 'Etc/GMT+7' : timeZone;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, weekday: 'long', timeZoneName: 'longOffset'
  }).formatToParts(date).map((part) => [part.type, part.value]));
  const hour = parts.hour === '24' ? '00' : parts.hour;
  if (pattern === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
  if (pattern === 'HH:mm:ss') return `${hour}:${parts.minute}:${parts.second}`;
  if (pattern === 'EEEE') return parts.weekday;
  if (pattern === "yyyy-MM-dd'T'HH:mm:ss") return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}`;
  if (pattern === 'Z') {
    const match = parts.timeZoneName.match(/GMT([+-])(\d{2}):(\d{2})/);
    return match ? `${match[1]}${match[2]}${match[3]}` : '+0000';
  }
  throw new Error(`Unsupported seed date format ${pattern}`);
}

const sourceDir = path.join(project, 'src');
const code = fs.readdirSync(sourceDir)
  .filter((name) => name.endsWith('.js')).sort()
  .map((name) => fs.readFileSync(path.join(sourceDir, name), 'utf8')).join('\n');
const context = {
  Date, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Error,
  isFinite, encodeURIComponent, console,
  Utilities: { formatDate }
};
vm.createContext(context);
vm.runInContext(code + `
globalThis.__seed = {
  AQ_CDPHE_PARAMETERS, AQ_SHEETS, AQ_MASTER_HEADERS, AQ_DYSON_HEADERS,
  AQ_TEMPEST_HEADERS, AQ_REGIONAL_HEADERS, AQ_EVENT_HEADERS, AQ_STATUS_HEADERS,
  AQ_HEALTH_HEADERS, AQ_SCHEMA_HEADERS, AQ_ARCHIVE_HEADERS, AQ_SCHEMA_VERSION
};`, context);
Object.assign(context, context.__seed);

const timeZone = 'America/Denver';
const dysonPayload = JSON.parse(fs.readFileSync(path.join(repo, 'side-projects/dyson-air-quality/raw/daily.json'), 'utf8'));
const dyson = context.aqNormalizeDyson_(dysonPayload, timeZone);

let tempest = [];
for (const dateText of ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26']) {
  const payload = JSON.parse(fs.readFileSync(path.join(repo, `side-projects/tempest-air-quality/raw/${dateText}.json`), 'utf8'));
  tempest = tempest.concat(context.aqAggregateTempest_(
    payload.obs || [],
    context.aqLocalMidnightUtc_(dateText, timeZone),
    context.aqLocalMidnightUtc_(context.aqAddLocalDays_(dateText, 1), timeZone),
    timeZone
  ));
}

const cdpheRecords = {};
for (const dateText of ['2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26']) {
  for (const parameter of context.AQ_CDPHE_PARAMETERS) {
    const filename = path.join(repo, `side-projects/air-quality-analysis/tmp/cdphe-raw/${dateText}-${parameter.slug}.html`);
    if (!fs.existsSync(filename)) continue;
    for (const row of context.aqParseCdphePage_(fs.readFileSync(filename, 'utf8'), parameter)) {
      cdpheRecords[row.source_hour_ending_mst] = Object.assign(cdpheRecords[row.source_hour_ending_mst] || {}, row);
    }
  }
}
const dates = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'];
const regional = context.aqExpandCdphe_(cdpheRecords, dates, timeZone);

const sourceRows = {
  [context.AQ_SHEETS.DYSON]: dyson,
  [context.AQ_SHEETS.TEMPEST]: tempest,
  [context.AQ_SHEETS.REGIONAL]: regional
};
let master = [];
context.aqConfig_ = () => ({ timeZone });
context.aqReadRowsBetween_ = (sheetName, headers, start, end) =>
  (sourceRows[sheetName] || []).filter((row) => row.timestamp_utc >= start && row.timestamp_utc <= end);
context.aqUpsertRows_ = (sheetName, headers, rows) => {
  master = rows;
  return { fetched: rows.length, upserted: rows.length, earliest: rows[0]?.timestamp_utc || '', latest: rows.at(-1)?.timestamp_utc || '' };
};
const start = dyson[0].timestamp_utc;
const end = [dyson.at(-1)?.timestamp_utc, tempest.at(-1)?.timestamp_utc, regional.at(-1)?.timestamp_utc].filter(Boolean).sort()[0];
context.aqRebuildMaster_(start, end);

const event = [{
  event_id: '2026-09-24-filter-change',
  timestamp_local: '2026-09-24T09:00:00-06:00',
  timestamp_utc: '2026-09-24T15:00:00Z',
  time_precision: 'approximate',
  event_type: 'filter_change',
  description: 'Dyson HEPA/activated-carbon filter replaced',
  notes: 'Manually recorded intervention; time is approximately 09:00 America/Denver.',
  recorded_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}];

function arrays(headers, rows) {
  return rows.map((row) => headers.map((header) => row[header] ?? ''));
}

const payload = {
  headers: {
    README: ['field', 'value'],
    Master_15min: context.AQ_MASTER_HEADERS,
    Dyson_15min: context.AQ_DYSON_HEADERS,
    Tempest_15min: context.AQ_TEMPEST_HEADERS,
    Regional_AQ_15min: context.AQ_REGIONAL_HEADERS,
    Events: context.AQ_EVENT_HEADERS,
    Source_Status: context.AQ_STATUS_HEADERS,
    Health_Log: context.AQ_HEALTH_HEADERS,
    Schema: context.AQ_SCHEMA_HEADERS,
    Archive_Index: context.AQ_ARCHIVE_HEADERS
  },
  readme: [
    ['dataset_name', 'Private Home Air Quality Longitudinal Dataset'],
    ['purpose', 'Canonical read-only analytical history for ChatGPT and manual longitudinal analysis.'],
    ['canonical_table', context.AQ_SHEETS.MASTER],
    ['time_zone', 'America/Denver'],
    ['cadence', '15 minutes'],
    ['schema_version', context.AQ_SCHEMA_VERSION],
    ['missing_values', 'Blank numeric cells are missing, never zero or interpolated. Presence, coverage, and missing_sources fields make missingness explicit.'],
    ['privacy', 'No home address or home coordinates are stored. Credentials exist only in Apps Script private Script Properties.'],
    ['tempest_source', 'On-site Tempest native one-minute history aggregated to 15-minute UTC bins. Wind is intentionally excluded because station siting makes it unreliable.'],
    ['regional_aq_source', 'CDPHE regional comparators: Boulder-CU/Athens PM2.5/PM10 (AQS 080131001) and Boulder Reservoir ozone (AQS 080130014).'],
    ['regional_caveat', 'Regional monitors are not home measurements. The home environment is roughly 2,000 ft higher and west in the foothills.'],
    ['events', 'Events contain manually recorded interventions/context only; no inferred events are added.'],
    ['chatgpt_retrieval', 'Use Google Drive to open this Sheet, read Schema first, then query bounded ranges in Master_15min and Events.'],
    ['maintainer', 'Codex maintains collection/schema infrastructure; ChatGPT performs analysis. Analytical conclusions are not encoded in collection.']
  ],
  master: arrays(context.AQ_MASTER_HEADERS, master),
  dyson: arrays(context.AQ_DYSON_HEADERS, dyson),
  tempest: arrays(context.AQ_TEMPEST_HEADERS, tempest),
  regional: arrays(context.AQ_REGIONAL_HEADERS, regional),
  events: arrays(context.AQ_EVENT_HEADERS, event),
  schema: (() => {
    const tables = [
      [context.AQ_SHEETS.MASTER, context.AQ_MASTER_HEADERS, 'joined canonical table'],
      [context.AQ_SHEETS.DYSON, context.AQ_DYSON_HEADERS, 'MyDyson'],
      [context.AQ_SHEETS.TEMPEST, context.AQ_TEMPEST_HEADERS, 'Tempest'],
      [context.AQ_SHEETS.REGIONAL, context.AQ_REGIONAL_HEADERS, 'CDPHE regional comparator'],
      [context.AQ_SHEETS.EVENTS, context.AQ_EVENT_HEADERS, 'manual only'],
      [context.AQ_SHEETS.STATUS, context.AQ_STATUS_HEADERS, 'collector health']
    ];
    return tables.flatMap(([table, headers, source]) => headers.map((column) => {
      const definition = context.aqSchemaDescription_(table, column);
      return [table, column, definition[0], definition[1], definition[2], definition[3], source, context.AQ_SCHEMA_VERSION];
    }));
  })()
};
process.stdout.write(JSON.stringify(payload));

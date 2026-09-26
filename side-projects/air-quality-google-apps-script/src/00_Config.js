/**
 * Air-quality longitudinal dataset configuration.
 * Tempest credentials and the Dyson intake secret live in Script Properties.
 */

const AQ_SCHEMA_VERSION = '1.0.0';
const AQ_DEFAULT_TIME_ZONE = 'America/Denver';
const AQ_INITIAL_DATE = '2026-09-20';
const AQ_BIN_MINUTES = 15;
const AQ_TRIGGER_HOURS = 6;
const AQ_RECENT_OVERLAP_DAYS = 2;
const AQ_DYSON_RETENTION_DAYS = 7;
const AQ_MAX_BACKFILL_DAYS_PER_RUN = 3;
const AQ_EXECUTION_BUDGET_MS = 5 * 60 * 1000;

const AQ_SHEETS = Object.freeze({
  README: 'README',
  MASTER: 'Master_15min',
  DYSON: 'Dyson_15min',
  TEMPEST: 'Tempest_15min',
  REGIONAL: 'Regional_AQ_15min',
  EVENTS: 'Events',
  STATUS: 'Source_Status',
  HEALTH: 'Health_Log',
  SCHEMA: 'Schema',
  ARCHIVES: 'Archive_Index'
});

const AQ_MASTER_HEADERS = Object.freeze([
  'timestamp_utc',
  'timestamp_local',
  'local_date',
  'local_time',
  'utc_offset',
  'day_of_week',
  'is_weekend',
  'dyson_present',
  'dyson_combined_aqi',
  'dyson_voc_index',
  'dyson_pm25_ug_m3',
  'dyson_pm10_ug_m3',
  'dyson_no2_index',
  'indoor_temperature_c',
  'indoor_temperature_f',
  'indoor_relative_humidity_pct',
  'dyson_fan_speed',
  'dyson_usage_seconds',
  'tempest_present',
  'tempest_observation_count',
  'tempest_expected_count',
  'tempest_coverage_pct',
  'outdoor_temperature_f',
  'outdoor_relative_humidity_pct',
  'outdoor_dew_point_f',
  'outdoor_station_pressure_mb',
  'outdoor_solar_radiation_w_m2',
  'outdoor_illuminance_lux',
  'outdoor_uv_index',
  'outdoor_precipitation_in',
  'outdoor_precipitation_type',
  'outdoor_lightning_strike_count',
  'outdoor_lightning_avg_distance_mi',
  'tempest_battery_volts',
  'tempest_report_interval_minutes',
  'regional_aq_present',
  'regional_pm25_1h_ug_m3',
  'regional_pm25_24h_ug_m3',
  'regional_pm25_aqi',
  'regional_pm10_1h_ug_m3',
  'regional_pm10_24h_ug_m3',
  'regional_pm10_aqi',
  'regional_ozone_1h_ppb',
  'regional_ozone_8h_ppb',
  'regional_ozone_aqi',
  'regional_combined_aqi',
  'regional_combined_aqi_pollutant',
  'regional_pm_station',
  'regional_pm_station_aqs_id',
  'regional_ozone_station',
  'regional_ozone_station_aqs_id',
  'regional_source_hour_ending_mst',
  'regional_source_resolution_minutes',
  'missing_sources',
  'schema_version'
]);

const AQ_DYSON_HEADERS = Object.freeze([
  'timestamp_utc', 'timestamp_local', 'combined_aqi', 'voc_index',
  'pm25_ug_m3', 'pm10_ug_m3', 'no2_index', 'temperature_c',
  'temperature_f', 'relative_humidity_pct', 'fan_speed', 'usage_seconds',
  'source_resolution_minutes', 'ingested_at_utc'
]);

const AQ_TEMPEST_HEADERS = Object.freeze([
  'timestamp_utc', 'timestamp_local', 'observation_count', 'expected_count',
  'coverage_pct', 'temperature_f', 'relative_humidity_pct', 'dew_point_f',
  'station_pressure_mb', 'solar_radiation_w_m2', 'illuminance_lux',
  'uv_index', 'precipitation_in', 'precipitation_type',
  'lightning_strike_count', 'lightning_avg_distance_mi', 'battery_volts',
  'report_interval_minutes', 'ingested_at_utc'
]);

const AQ_REGIONAL_HEADERS = Object.freeze([
  'timestamp_utc', 'timestamp_local', 'source_hour_ending_mst',
  'source_resolution_minutes', 'pm25_1h_ug_m3', 'pm25_24h_ug_m3',
  'pm25_aqi', 'pm10_1h_ug_m3', 'pm10_24h_ug_m3', 'pm10_aqi',
  'ozone_1h_ppb', 'ozone_8h_ppb', 'ozone_aqi', 'combined_aqi',
  'combined_aqi_pollutant', 'pm_station', 'pm_station_aqs_id',
  'ozone_station', 'ozone_station_aqs_id', 'comparator_scope',
  'ingested_at_utc'
]);

const AQ_EVENT_HEADERS = Object.freeze([
  'event_id', 'timestamp_local', 'timestamp_utc', 'time_precision',
  'event_type', 'description', 'notes', 'recorded_at_utc'
]);

const AQ_STATUS_HEADERS = Object.freeze([
  'source', 'last_attempt_utc', 'last_success_utc', 'status',
  'consecutive_failures', 'rows_fetched', 'rows_upserted',
  'earliest_observation_utc', 'latest_observation_utc', 'message',
  'dyson_retention_risk', 'schema_version'
]);

const AQ_HEALTH_HEADERS = Object.freeze([
  'run_id', 'source', 'started_at_utc', 'finished_at_utc', 'status',
  'rows_fetched', 'rows_upserted', 'earliest_observation_utc',
  'latest_observation_utc', 'error_category', 'message', 'schema_version'
]);

const AQ_SCHEMA_HEADERS = Object.freeze([
  'table', 'column', 'data_type', 'unit', 'description',
  'missing_value_semantics', 'source', 'schema_version'
]);

const AQ_ARCHIVE_HEADERS = Object.freeze([
  'year', 'spreadsheet_url', 'created_at_utc', 'row_count',
  'schema_version', 'status', 'notes'
]);

const AQ_REQUIRED_SECRET_PROPERTIES = Object.freeze([
  'DYSON_INGEST_SECRET',
  'TEMPEST_TOKEN',
  'TEMPEST_STATION_ID',
  'TEMPEST_DEVICE_ID'
]);

function aqProperties_() {
  return PropertiesService.getScriptProperties();
}

function aqConfig_() {
  const properties = aqProperties_().getProperties();
  return {
    spreadsheetId: properties.SPREADSHEET_ID || '',
    rawFolderId: properties.RAW_FOLDER_ID || '',
    timeZone: properties.TIME_ZONE || AQ_DEFAULT_TIME_ZONE,
    initialDate: properties.INITIAL_BACKFILL_DATE || AQ_INITIAL_DATE,
    keepRaw: String(properties.KEEP_RAW || 'true').toLowerCase() !== 'false',
    alertEmail: properties.ALERT_EMAIL || '',
    dysonIngestSecret: properties.DYSON_INGEST_SECRET || '',
    tempestToken: properties.TEMPEST_TOKEN || '',
    tempestStationId: properties.TEMPEST_STATION_ID || '',
    tempestDeviceId: properties.TEMPEST_DEVICE_ID || ''
  };
}

function aqRequireSourceConfig_(source) {
  const config = aqConfig_();
  const missing = [];
  if (source === 'tempest') {
    if (!config.tempestToken) missing.push('TEMPEST_TOKEN');
    if (!config.tempestStationId) missing.push('TEMPEST_STATION_ID');
    if (!config.tempestDeviceId) missing.push('TEMPEST_DEVICE_ID');
  }
  if (missing.length) {
    throw new Error('Missing required private Script Properties: ' + missing.join(', ') + '.');
  }
  return config;
}

function aqSpreadsheet_() {
  const config = aqConfig_();
  if (config.spreadsheetId) return SpreadsheetApp.openById(config.spreadsheetId);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('SPREADSHEET_ID is not configured. Run initializeAirQualitySystem once.');
  return active;
}

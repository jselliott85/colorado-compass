/** Canonical 15-minute join. No analytical conclusions or inferred events. */

function aqRebuildMaster_(startUtc, endUtc) {
  const config = aqConfig_();
  const start = aqFloorQuarter_(new Date(startUtc));
  const end = aqFloorQuarter_(new Date(endUtc));
  const first = aqUtcIso_(start);
  const last = aqUtcIso_(end);
  const dyson = aqIndexRows_(aqReadRowsBetween_(AQ_SHEETS.DYSON, AQ_DYSON_HEADERS, first, last));
  const tempest = aqIndexRows_(aqReadRowsBetween_(AQ_SHEETS.TEMPEST, AQ_TEMPEST_HEADERS, first, last));
  const regional = aqIndexRows_(aqReadRowsBetween_(AQ_SHEETS.REGIONAL, AQ_REGIONAL_HEADERS, first, last));
  const rows = [];
  for (let instant = start.getTime(); instant <= end.getTime(); instant += AQ_BIN_MINUTES * 60000) {
    const timestamp = new Date(instant);
    const key = aqUtcIso_(timestamp);
    const local = aqLocalIso_(timestamp, config.timeZone);
    const localParts = local.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})([+-]\d{2}:\d{2})$/);
    const dayName = Utilities.formatDate(timestamp, config.timeZone, 'EEEE');
    const d = dyson[key] || null;
    const t = tempest[key] || null;
    const sourceRegional = regional[key] || null;
    const r = aqRegionalHasObservation_(sourceRegional) ? sourceRegional : null;
    const missing = [];
    if (!d) missing.push('dyson');
    if (!t) missing.push('tempest');
    if (!r) missing.push('regional_aq');
    rows.push({
      timestamp_utc: key,
      timestamp_local: local,
      local_date: localParts ? localParts[1] : aqLocalDate_(timestamp, config.timeZone),
      local_time: localParts ? localParts[2] : Utilities.formatDate(timestamp, config.timeZone, 'HH:mm:ss'),
      utc_offset: localParts ? localParts[3] : '',
      day_of_week: dayName,
      is_weekend: dayName === 'Saturday' || dayName === 'Sunday',
      dyson_present: Boolean(d),
      dyson_combined_aqi: d && d.combined_aqi,
      dyson_voc_index: d && d.voc_index,
      dyson_pm25_ug_m3: d && d.pm25_ug_m3,
      dyson_pm10_ug_m3: d && d.pm10_ug_m3,
      dyson_no2_index: d && d.no2_index,
      indoor_temperature_c: d && d.temperature_c,
      indoor_temperature_f: d && d.temperature_f,
      indoor_relative_humidity_pct: d && d.relative_humidity_pct,
      dyson_fan_speed: d && d.fan_speed,
      dyson_usage_seconds: d && d.usage_seconds,
      tempest_present: Boolean(t),
      tempest_observation_count: t ? t.observation_count : 0,
      tempest_expected_count: AQ_BIN_MINUTES,
      tempest_coverage_pct: t ? t.coverage_pct : 0,
      outdoor_temperature_f: t && t.temperature_f,
      outdoor_relative_humidity_pct: t && t.relative_humidity_pct,
      outdoor_dew_point_f: t && t.dew_point_f,
      outdoor_station_pressure_mb: t && t.station_pressure_mb,
      outdoor_solar_radiation_w_m2: t && t.solar_radiation_w_m2,
      outdoor_illuminance_lux: t && t.illuminance_lux,
      outdoor_uv_index: t && t.uv_index,
      outdoor_precipitation_in: t && t.precipitation_in,
      outdoor_precipitation_type: t && t.precipitation_type,
      outdoor_lightning_strike_count: t && t.lightning_strike_count,
      outdoor_lightning_avg_distance_mi: t && t.lightning_avg_distance_mi,
      tempest_battery_volts: t && t.battery_volts,
      tempest_report_interval_minutes: t && t.report_interval_minutes,
      regional_aq_present: Boolean(r),
      regional_pm25_1h_ug_m3: r && r.pm25_1h_ug_m3,
      regional_pm25_24h_ug_m3: r && r.pm25_24h_ug_m3,
      regional_pm25_aqi: r && r.pm25_aqi,
      regional_pm10_1h_ug_m3: r && r.pm10_1h_ug_m3,
      regional_pm10_24h_ug_m3: r && r.pm10_24h_ug_m3,
      regional_pm10_aqi: r && r.pm10_aqi,
      regional_ozone_1h_ppb: r && r.ozone_1h_ppb,
      regional_ozone_8h_ppb: r && r.ozone_8h_ppb,
      regional_ozone_aqi: r && r.ozone_aqi,
      regional_combined_aqi: r && r.combined_aqi,
      regional_combined_aqi_pollutant: r && r.combined_aqi_pollutant,
      regional_pm_station: r && r.pm_station,
      regional_pm_station_aqs_id: r && r.pm_station_aqs_id,
      regional_ozone_station: r && r.ozone_station,
      regional_ozone_station_aqs_id: r && r.ozone_station_aqs_id,
      regional_source_hour_ending_mst: r && r.source_hour_ending_mst,
      regional_source_resolution_minutes: r && r.source_resolution_minutes,
      missing_sources: missing.join(','),
      schema_version: AQ_SCHEMA_VERSION
    });
  }
  return aqUpsertRows_(AQ_SHEETS.MASTER, AQ_MASTER_HEADERS, rows);
}

function aqIndexRows_(rows) {
  const index = {};
  rows.forEach(function(row) { index[String(row.timestamp_utc)] = row; });
  return index;
}

function aqRegionalHasObservation_(row) {
  if (!row) return false;
  return [
    'pm25_1h_ug_m3', 'pm25_24h_ug_m3', 'pm25_aqi',
    'pm10_1h_ug_m3', 'pm10_24h_ug_m3', 'pm10_aqi',
    'ozone_1h_ppb', 'ozone_8h_ppb', 'ozone_aqi', 'combined_aqi'
  ].some(function(field) { return aqNumber_(row[field]) !== null; });
}

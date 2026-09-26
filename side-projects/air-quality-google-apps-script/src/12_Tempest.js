/** Read-only Tempest history collector and 15-minute aggregation. Wind is excluded. */

const AQ_TEMPEST_API_BASE = 'https://swd.weatherflow.com/swd/rest';

function aqCollectTempestDate_(dateText) {
  const config = aqRequireSourceConfig_('tempest');
  const start = aqLocalMidnightUtc_(dateText, config.timeZone);
  const end = aqLocalMidnightUtc_(aqAddLocalDays_(dateText, 1), config.timeZone);
  const query = [
    'time_start=' + Math.floor(start.getTime() / 1000),
    'time_end=' + Math.floor(end.getTime() / 1000),
    'token=' + encodeURIComponent(config.tempestToken)
  ].join('&');
  const url = AQ_TEMPEST_API_BASE + '/observations/device/' +
    encodeURIComponent(config.tempestDeviceId) + '?' + query;
  const fetched = aqFetchJson_('Tempest', url, {
    method: 'get',
    headers: { Accept: 'application/json', 'User-Agent': 'co-compass-air-quality/1.0' }
  });
  const status = fetched.payload.status || {};
  if (status.status_code !== undefined && Number(status.status_code) !== 0) {
    throw new Error('Tempest API returned a non-success status.');
  }
  if (fetched.payload.type !== 'obs_st') throw new Error('Tempest history response was not obs_st.');
  aqArchiveRaw_('tempest', dateText, dateText + '.json', fetched.raw, 'application/json');
  return aqAggregateTempest_(fetched.payload.obs || [], start, end, config.timeZone);
}

function aqTempestDewPointC_(temperatureC, humidityPct) {
  const temp = aqNumber_(temperatureC);
  const humidity = aqNumber_(humidityPct);
  if (temp === null || humidity === null || humidity <= 0) return null;
  const alpha = Math.log(humidity / 100) + (17.625 * temp) / (243.04 + temp);
  return (243.04 * alpha) / (17.625 - alpha);
}

function aqAggregateTempest_(observations, start, end, timeZone) {
  const buckets = {};
  observations.forEach(function(values) {
    if (!Array.isArray(values) || !values.length) return;
    const timestamp = new Date(Number(values[0]) * 1000);
    if (timestamp < start || timestamp >= end) return;
    const key = aqUtcIso_(aqFloorQuarter_(timestamp));
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(values);
  });
  const ingestedAt = aqUtcIso_(new Date());
  return Object.keys(buckets).sort().map(function(key) {
    const rows = buckets[key];
    const temperaturesC = rows.map(function(row) { return aqNumber_(row[7]); });
    const humidities = rows.map(function(row) { return aqNumber_(row[8]); });
    const dewPointsF = rows.map(function(row, index) {
      const dewC = aqTempestDewPointC_(temperaturesC[index], humidities[index]);
      return dewC === null ? null : dewC * 9 / 5 + 32;
    });
    const precipitation = rows.map(function(row) {
      const corrected = aqNumber_(row[19]);
      const millimeters = corrected === null ? aqNumber_(row[12]) : corrected;
      return millimeters === null ? null : millimeters / 25.4;
    });
    const timestamp = new Date(key);
    return {
      timestamp_utc: key,
      timestamp_local: aqLocalIso_(timestamp, timeZone),
      observation_count: rows.length,
      expected_count: AQ_BIN_MINUTES,
      coverage_pct: aqRound_(Math.min(100, rows.length / AQ_BIN_MINUTES * 100), 1),
      temperature_f: aqMean_(temperaturesC.map(function(value) { return value === null ? null : value * 9 / 5 + 32; }), 2),
      relative_humidity_pct: aqMean_(humidities, 2),
      dew_point_f: aqMean_(dewPointsF, 2),
      station_pressure_mb: aqMean_(rows.map(function(row) { return row[6]; }), 2),
      solar_radiation_w_m2: aqMean_(rows.map(function(row) { return row[11]; }), 2),
      illuminance_lux: aqMean_(rows.map(function(row) { return row[9]; }), 2),
      uv_index: aqMean_(rows.map(function(row) { return row[10]; }), 2),
      precipitation_in: aqSum_(precipitation, 5),
      precipitation_type: aqMax_(rows.map(function(row) { return row[13]; })),
      lightning_strike_count: aqSum_(rows.map(function(row) { return row[15]; }), 0),
      lightning_avg_distance_mi: aqMean_(rows.map(function(row) {
        const km = aqNumber_(row[14]);
        return km === null ? null : km * 0.621371;
      }), 2),
      battery_volts: aqMean_(rows.map(function(row) { return row[16]; }), 3),
      report_interval_minutes: aqMean_(rows.map(function(row) { return row[17]; }), 2),
      ingested_at_utc: ingestedAt
    };
  });
}

/** Dyson history normalization for local backfill and fixture verification. */

function aqNormalizeDyson_(payload, timeZone) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('MyDyson 15-minute history response had an unexpected shape.');
  }
  const seriesNames = ['aqlm', 'volm', 'p25m', 'p10m', 'no2m', 'tmpm', 'humm', 'fnsp', 'usage'];
  const series = {};
  seriesNames.forEach(function(name) {
    if (Array.isArray(payload[name])) series[name] = payload[name];
  });
  if (!Object.keys(series).length) throw new Error('MyDyson history contained no validated sensor arrays.');
  const start = new Date(payload.start_time);
  if (!isFinite(start.getTime())) throw new Error('MyDyson history had an invalid start_time.');
  const resolutionMatch = String(payload.resolution || 'PT15M').match(/^PT(\d+)M$/);
  const resolution = resolutionMatch ? Number(resolutionMatch[1]) : 15;
  const slotCount = Math.max.apply(null, Object.keys(series).map(function(name) { return series[name].length; }));
  const ingestedAt = aqUtcIso_(new Date());
  const rows = [];
  for (let index = 0; index < slotCount; index += 1) {
    const timestamp = new Date(start.getTime() + index * resolution * 60000);
    const rawTemperature = aqNumber_(series.tmpm && series.tmpm[index]);
    const temperatureC = rawTemperature === null ? null : aqRound_(rawTemperature / 10 - 273.15, 2);
    const row = {
      timestamp_utc: aqUtcIso_(timestamp),
      timestamp_local: aqLocalIso_(timestamp, timeZone),
      combined_aqi: aqNumber_(series.aqlm && series.aqlm[index]),
      voc_index: aqNumber_(series.volm && series.volm[index]),
      pm25_ug_m3: aqNumber_(series.p25m && series.p25m[index]),
      pm10_ug_m3: aqNumber_(series.p10m && series.p10m[index]),
      no2_index: aqNumber_(series.no2m && series.no2m[index]),
      temperature_c: temperatureC,
      temperature_f: temperatureC === null ? null : aqRound_(temperatureC * 9 / 5 + 32, 2),
      relative_humidity_pct: aqNumber_(series.humm && series.humm[index]),
      fan_speed: aqNumber_(series.fnsp && series.fnsp[index]),
      usage_seconds: aqNumber_(series.usage && series.usage[index]),
      source_resolution_minutes: resolution,
      ingested_at_utc: ingestedAt
    };
    const hasObservation = AQ_DYSON_HEADERS.slice(2, 12).some(function(field) { return row[field] !== null; });
    if (hasObservation) rows.push(row);
  }
  return rows;
}

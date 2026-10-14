/** Optional WU pilot. Only an account-issued key in private Script Properties is used. */
const AQ_CARRIAGE_STATION = 'KCOBOULD877';
const AQ_CARRIAGE_ZONE = 'America/Denver';
const AQ_CARRIAGE_STALE_HOURS = 12;

function aqCarriageDates_(now) {
  const today = aqLocalDate_(now, AQ_CARRIAGE_ZONE);
  return [-2, -1, 0].map(function(offset) { return aqAddLocalDays_(today, offset); });
}

function aqCollectCarriageDate_(dateText) {
  const config = aqConfig_();
  if (!config.carriageEnabled || !config.wuApiKey) {
    throw new Error('Carriage Hills requires CARRIAGE_HILLS_ENABLED=true and an authorized account-issued WU_API_KEY.');
  }
  if (aqProperties_().getProperty('WU_CARRIAGE_ACCESS_CONFIRMED') !== 'true') {
    throw new Error('Carriage Hills historical access must be verified with the account-issued key and permitted third-party use confirmed before collection.');
  }
  const query = 'stationId=' + AQ_CARRIAGE_STATION + '&date=' + dateText.replace(/-/g, '') +
    '&format=json&units=m&numericPrecision=decimal&apiKey=' + encodeURIComponent(config.wuApiKey);
  const fetched = aqFetchJson_('Carriage Hills', 'https://api.weather.com/v2/pws/history/all?' + query,
    { method: 'get', headers: { Accept: 'application/json' } });
  const rows = aqNormalizeCarriage_(fetched.payload, dateText, new Date());
  aqArchiveRaw_('carriage_hills', dateText, dateText + '.json', fetched.raw, 'application/json');
  return rows;
}

function aqNormalizeCarriage_(payload, dateText, now) {
  if (!payload || !Array.isArray(payload.observations)) throw new Error('Invalid Carriage Hills observations array.');
  const byUtc = {};
  payload.observations.forEach(function(obs) {
    if (!obs || obs.stationID !== AQ_CARRIAGE_STATION) throw new Error('Invalid Carriage Hills station identity.');
    const epoch = aqNumber_(obs.epoch);
    const timestamp = new Date(epoch === null ? NaN : epoch * 1000);
    if (!isFinite(timestamp.getTime()) || epoch % 900 !== 0 ||
        aqLocalDate_(timestamp, AQ_CARRIAGE_ZONE) !== dateText ||
        Date.parse(obs.obsTimeUtc) !== timestamp.getTime() || timestamp > now) {
      throw new Error('Invalid Carriage Hills observation timestamp or changed cadence; refusing to shift observations.');
    }
    if (obs.tz !== AQ_CARRIAGE_ZONE || !obs.metric || typeof obs.metric !== 'object') {
      throw new Error('Invalid Carriage Hills timezone or metric measurements.');
    }
    const metric = obs.metric;
    const pressure = [metric.pressureMin, metric.pressureMax].map(aqNumber_).filter(function(value) { return value !== null; });
    const key = aqUtcIso_(timestamp);
    byUtc[key] = {
      timestamp_utc: key,
      timestamp_local: aqLocalIso_(timestamp, AQ_CARRIAGE_ZONE),
      station_id: AQ_CARRIAGE_STATION,
      epoch: epoch,
      wind_speed_kmh: aqNumber_(metric.windspeedAvg),
      wind_gust_kmh: aqNumber_(metric.windgustHigh),
      wind_direction_deg: aqNumber_(obs.winddirAvg),
      temperature_c: aqNumber_(metric.tempAvg),
      relative_humidity_pct: aqNumber_(obs.humidityAvg),
      dew_point_c: aqNumber_(metric.dewptAvg),
      pressure_hpa: pressure.length ? pressure.reduce(function(sum, value) { return sum + value; }, 0) / pressure.length : null,
      precip_rate_mm_h: aqNumber_(metric.precipRate),
      precip_total_mm: aqNumber_(metric.precipTotal),
      qc_status: aqNumber_(obs.qcStatus),
      wind_direction_trust: 'untrusted',
      pressure_basis: 'likely_sea_level_unconfirmed',
      precip_total_semantics: 'source_cumulative_total_resets_not_differenced',
      ingested_at_utc: aqUtcIso_(now)
    };
  });
  return Object.keys(byUtc).sort().map(function(key) { return byUtc[key]; });
}

function aqCarriageHealth_(latest, now) {
  const age = latest ? (now.getTime() - new Date(latest).getTime()) / 3600000 : null;
  const stale = age === null || !isFinite(age) || age > AQ_CARRIAGE_STALE_HOURS;
  return {
    status: stale ? 'stale' : 'success',
    message: 'Provisional pilot; stale=' + stale + '; observation_age_hours=' +
      (age === null ? 'missing' : aqRound_(age, 2)) +
      '; wind direction untrusted; no automatic promotion.'
  };
}

function aqRunCarriagePilot_(runId, runStarted) {
  const config = aqConfig_();
  if (!config.carriageEnabled) {
    aqUpdateSourceStatus_({ source: 'carriage_hills', status: 'disabled',
      message: 'Pilot disabled. Configure an authorized account-issued WU_API_KEY and CARRIAGE_HILLS_ENABLED=true.',
      schema_version: AQ_SCHEMA_VERSION });
    return { earliest: '' };
  }
  return aqRunSource_(runId, 'carriage_hills', function() {
    if (!config.wuApiKey) throw new Error('Missing configured authorized account-issued WU_API_KEY.');
    const result = { fetched: 0, upserted: 0, earliest: '', latest: '' };
    aqCarriageDates_(runStarted).forEach(function(dateText) {
      if (Date.now() - runStarted.getTime() > AQ_EXECUTION_BUDGET_MS) throw new Error('Carriage Hills execution budget reached.');
      const part = aqUpsertRows_(AQ_SHEETS.CARRIAGE, AQ_CARRIAGE_HEADERS, aqCollectCarriageDate_(dateText));
      result.fetched += part.fetched;
      result.upserted += part.upserted;
      result.earliest = aqEarliest_([result.earliest, part.earliest]);
      result.latest = aqLatest_([result.latest, part.latest]);
    });
    const properties = aqProperties_();
    if (result.fetched && !properties.getProperty('CARRIAGE_PILOT_STARTED_UTC')) {
      properties.setProperty('CARRIAGE_PILOT_STARTED_UTC', aqUtcIso_(new Date()));
    }
    const health = aqCarriageHealth_(aqLatestTimestamp_(AQ_SHEETS.CARRIAGE), new Date());
    result.status = health.status;
    const started = properties.getProperty('CARRIAGE_PILOT_STARTED_UTC');
    result.message = health.message + ' Pilot started: ' + (started || 'no observations yet') +
      '; review no earlier than ' + (started ? aqUtcIso_(new Date(Date.parse(started) + 14 * 86400000)) : '14 days after first collection') + '.';
    return result;
  });
}

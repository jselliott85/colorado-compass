/** Public CDPHE regional comparator collector. Values are not home measurements. */

const AQ_CDPHE_BASE_URL = 'https://www.colorado.gov/airquality/param_summary.aspx';
const AQ_CDPHE_PARAMETERS = Object.freeze([
  {
    slug: 'pm25', code: '88101', site: 'BOU', siteName: 'Boulder-CU/Athens',
    aqsId: '080131001', fields: ['pm25_1h_ug_m3', 'pm25_24h_ug_m3', 'pm25_aqi']
  },
  {
    slug: 'pm10', code: '81102', site: 'BOU', siteName: 'Boulder-CU/Athens',
    aqsId: '080131001', fields: ['pm10_1h_ug_m3', 'pm10_24h_ug_m3', 'pm10_aqi']
  },
  {
    slug: 'ozone', code: '44201', site: 'BOUR', siteName: 'Boulder Reservoir',
    aqsId: '080130014', fields: ['ozone_1h_ppb', 'ozone_8h_ppb', 'ozone_aqi']
  }
]);

function aqCollectCdpheDates_(localDates) {
  const config = aqConfig_();
  const sourceDates = {};
  localDates.forEach(function(dateText) {
    sourceDates[dateText] = true;
    sourceDates[aqAddLocalDays_(dateText, -1)] = true;
  });
  const records = {};
  Object.keys(sourceDates).sort().forEach(function(sourceDate) {
    AQ_CDPHE_PARAMETERS.forEach(function(parameter) {
      const query = [
        'parametercode=' + encodeURIComponent(parameter.code),
        'seeddate=' + encodeURIComponent(aqUsDate_(sourceDate)),
        'export=False'
      ].join('&');
      const response = aqHttpFetch_('CDPHE', AQ_CDPHE_BASE_URL + '?' + query, {
        method: 'get',
        headers: { 'User-Agent': 'co-compass-air-quality/1.0 (read-only)' }
      });
      const page = response.getContentText();
      aqArchiveRaw_('cdphe', sourceDate, sourceDate + '-' + parameter.slug + '.html', page, 'text/html');
      aqParseCdphePage_(page, parameter).forEach(function(row) {
        const key = row.source_hour_ending_mst;
        if (!records[key]) records[key] = {};
        Object.keys(row).forEach(function(field) { records[key][field] = row[field]; });
      });
    });
  });
  return aqExpandCdphe_(records, localDates, config.timeZone);
}

function aqUsDate_(dateText) {
  const parts = dateText.split('-');
  return parts[1] + '/' + parts[2] + '/' + parts[0];
}

function aqHtmlText_(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '|')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function aqParseCdphePage_(page, parameter) {
  const dateMatch = page.match(/Hourly averages[\s\S]*?for\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (!dateMatch) throw new Error('CDPHE page did not include a source date for ' + parameter.slug + '.');
  const sourceParts = dateMatch[1].split('/').map(Number);
  const sitePattern = new RegExp(
    'onclick="table_highlight\\(\'cell\', \'col\',\\s*(\\d+)\\);"[^>]*>(?:\\*\\*)?' + parameter.site + '<\\/td>',
    'i'
  );
  const siteMatch = page.match(sitePattern);
  if (!siteMatch) throw new Error('CDPHE site ' + parameter.site + ' was absent for ' + parameter.slug + '.');
  const column = siteMatch[1];
  const cellPattern = new RegExp('id="cell(\\d+)-' + column + '"[^>]*>([\\s\\S]*?)<\\/td>', 'gi');
  const rows = [];
  let match;
  while ((match = cellPattern.exec(page)) !== null) {
    const hour = Number(match[1]);
    if (hour < 1 || hour > 24) continue;
    const values = aqHtmlText_(match[2]).split('|').slice(0, 3);
    while (values.length < 3) values.push('');
    const hourEndingUtc = new Date(Date.UTC(sourceParts[2], sourceParts[0] - 1, sourceParts[1], 7 + hour));
    const row = {
      source_hour_ending_mst: Utilities.formatDate(hourEndingUtc, 'GMT-07:00', "yyyy-MM-dd'T'HH:mm:ss") + '-07:00'
    };
    parameter.fields.forEach(function(field, index) { row[field] = aqNumber_(values[index].replace(/\s/g, '')); });
    rows.push(row);
  }
  if (rows.length !== 24) throw new Error('CDPHE ' + parameter.slug + ' page did not contain 24 hourly rows.');
  return rows;
}

function aqExpandCdphe_(records, requestedDates, timeZone) {
  const requested = {};
  requestedDates.forEach(function(value) { requested[value] = true; });
  const ingestedAt = aqUtcIso_(new Date());
  const rows = [];
  Object.keys(records).sort().forEach(function(hourEndingMst) {
    const source = records[hourEndingMst];
    const hourEnding = new Date(hourEndingMst);
    const candidates = [
      ['PM2.5', source.pm25_aqi], ['PM10', source.pm10_aqi], ['ozone', source.ozone_aqi]
    ].filter(function(item) { return aqNumber_(item[1]) !== null; });
    candidates.sort(function(left, right) { return Number(right[1]) - Number(left[1]); });
    [60, 45, 30, 15].forEach(function(minutesBefore) {
      const timestamp = new Date(hourEnding.getTime() - minutesBefore * 60000);
      if (!requested[aqLocalDate_(timestamp, timeZone)]) return;
      rows.push({
        timestamp_utc: aqUtcIso_(timestamp),
        timestamp_local: aqLocalIso_(timestamp, timeZone),
        source_hour_ending_mst: hourEndingMst,
        source_resolution_minutes: 60,
        pm25_1h_ug_m3: aqNumber_(source.pm25_1h_ug_m3),
        pm25_24h_ug_m3: aqNumber_(source.pm25_24h_ug_m3),
        pm25_aqi: aqNumber_(source.pm25_aqi),
        pm10_1h_ug_m3: aqNumber_(source.pm10_1h_ug_m3),
        pm10_24h_ug_m3: aqNumber_(source.pm10_24h_ug_m3),
        pm10_aqi: aqNumber_(source.pm10_aqi),
        ozone_1h_ppb: aqNumber_(source.ozone_1h_ppb),
        ozone_8h_ppb: aqNumber_(source.ozone_8h_ppb),
        ozone_aqi: aqNumber_(source.ozone_aqi),
        combined_aqi: candidates.length ? Number(candidates[0][1]) : null,
        combined_aqi_pollutant: candidates.length ? candidates[0][0] : null,
        pm_station: 'Boulder-CU/Athens',
        pm_station_aqs_id: '080131001',
        ozone_station: 'Boulder Reservoir',
        ozone_station_aqs_id: '080130014',
        comparator_scope: 'regional_comparator_not_home_measurement',
        ingested_at_utc: ingestedAt
      });
    });
  });
  return rows.sort(function(left, right) { return left.timestamp_utc.localeCompare(right.timestamp_utc); });
}

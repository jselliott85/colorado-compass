/** Pure and shared utility functions. */

function aqUtcIso_(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!isFinite(date.getTime())) throw new Error('Invalid timestamp.');
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function aqRound_(value, digits) {
  if (value === null || value === undefined || value === '' || !isFinite(Number(value))) return null;
  const scale = Math.pow(10, digits || 0);
  return Math.round(Number(value) * scale) / scale;
}

function aqNumber_(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return isFinite(number) ? number : null;
}

function aqMean_(values, digits) {
  const numbers = values.map(aqNumber_).filter(function(value) { return value !== null; });
  if (!numbers.length) return null;
  return aqRound_(numbers.reduce(function(sum, value) { return sum + value; }, 0) / numbers.length, digits);
}

function aqSum_(values, digits) {
  const numbers = values.map(aqNumber_).filter(function(value) { return value !== null; });
  if (!numbers.length) return null;
  return aqRound_(numbers.reduce(function(sum, value) { return sum + value; }, 0), digits);
}

function aqMax_(values) {
  const numbers = values.map(aqNumber_).filter(function(value) { return value !== null; });
  return numbers.length ? Math.max.apply(null, numbers) : null;
}

function aqFloorQuarter_(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  const size = AQ_BIN_MINUTES * 60 * 1000;
  return new Date(Math.floor(date.getTime() / size) * size);
}

function aqTimeZoneOffset_(date, timeZone) {
  const raw = Utilities.formatDate(date, timeZone, 'Z');
  const sign = raw.charAt(0) === '-' ? -1 : 1;
  return sign * (Number(raw.slice(1, 3)) * 60 + Number(raw.slice(3, 5)));
}

function aqLocalIso_(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  const base = Utilities.formatDate(date, timeZone, "yyyy-MM-dd'T'HH:mm:ss");
  const rawOffset = Utilities.formatDate(date, timeZone, 'Z');
  return base + rawOffset.slice(0, 3) + ':' + rawOffset.slice(3);
}

function aqLocalDate_(value, timeZone) {
  return Utilities.formatDate(value instanceof Date ? value : new Date(value), timeZone, 'yyyy-MM-dd');
}

function aqAddLocalDays_(dateText, days) {
  const parts = dateText.split('-').map(Number);
  const value = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return value.toISOString().slice(0, 10);
}

function aqLocalMidnightUtc_(dateText, timeZone) {
  const parts = dateText.split('-').map(Number);
  let guess = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0));
  for (let index = 0; index < 3; index += 1) {
    const offset = aqTimeZoneOffset_(guess, timeZone);
    guess = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0) - offset * 60000);
  }
  return guess;
}

function aqDateRange_(startDate, endDate) {
  const dates = [];
  let current = startDate;
  while (current <= endDate) {
    dates.push(current);
    current = aqAddLocalDays_(current, 1);
  }
  return dates;
}

function aqSafeMessage_(error) {
  const raw = String(error && error.message ? error.message : error || 'Unknown error');
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:token|key|api_key|access_token)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500);
}

function aqErrorCategory_(error) {
  const message = aqSafeMessage_(error).toLowerCase();
  if (message.indexOf('401') >= 0 || message.indexOf('authentication') >= 0 || message.indexOf('expired') >= 0) return 'authentication';
  if (message.indexOf('429') >= 0 || message.indexOf('rate') >= 0) return 'rate_limit';
  if (message.indexOf('timeout') >= 0 || message.indexOf('reach') >= 0 || message.indexOf('network') >= 0) return 'network';
  if (message.indexOf('property') >= 0 || message.indexOf('configured') >= 0) return 'configuration';
  if (message.indexOf('parse') >= 0 || message.indexOf('expected') >= 0 || message.indexOf('invalid') >= 0) return 'source_format';
  return 'unknown';
}

function aqHttpFetch_(source, url, options) {
  const request = Object.assign({ muteHttpExceptions: true, followRedirects: true }, options || {});
  let lastStatus = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = UrlFetchApp.fetch(url, request);
      const status = response.getResponseCode();
      lastStatus = status;
      if (status >= 200 && status < 300) return response;
      if (status === 401 || status === 403) throw new Error(source + ' authentication failed with HTTP ' + status + '.');
      if (status !== 429 && status < 500) throw new Error(source + ' request failed with HTTP ' + status + '.');
    } catch (error) {
      if (attempt === 3 || /authentication|HTTP 4(?!29)/i.test(aqSafeMessage_(error))) throw error;
    }
    Utilities.sleep(attempt * 1000);
  }
  throw new Error(source + ' request failed with HTTP ' + String(lastStatus || 'unknown') + '.');
}

function aqFetchJson_(source, url, options) {
  const response = aqHttpFetch_(source, url, options);
  try {
    return { payload: JSON.parse(response.getContentText()), raw: response.getContentText() };
  } catch (error) {
    throw new Error(source + ' returned invalid JSON.');
  }
}

function aqObjectRows_(headers, values) {
  return values.map(function(row) {
    const object = {};
    headers.forEach(function(header, index) { object[header] = row[index]; });
    return object;
  });
}

function aqCellValue_(value) {
  return value === null || value === undefined ? '' : value;
}

function aqEarliest_(values) {
  const present = values.filter(Boolean).sort();
  return present.length ? present[0] : '';
}

function aqLatest_(values) {
  const present = values.filter(Boolean).sort();
  return present.length ? present[present.length - 1] : '';
}

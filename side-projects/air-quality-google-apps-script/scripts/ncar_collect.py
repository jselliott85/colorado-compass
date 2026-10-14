#!/usr/bin/env python3
"""Read public NCAR daily NetCDF archives. Publishing requires an explicit flag.

No HTML scraping, source API keys, interpolation or cumulative-rain summation.
"""
import argparse
import base64
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

import netCDF4
import numpy as np

BASE = 'https://archive.eol.ucar.edu/weather/data/foothills/'
FIELDS = {
    'temperature_c': ('tdry', 'degC', -100, 65),
    'dew_point_c': ('dewpoint', 'degC', -120, 65),
    'relative_humidity_pct': ('rh', '%', 0, 100),
    'station_pressure_hpa': ('pres', 'hPa', 500, 1100),
    'wind_speed_ms': ('wspd', 'm/s', 0, 100),
    'wind_direction_deg': ('wdir', 'degrees', 0, 360),
    'peak_gust_ms': ('wspd_max', 'm/s', 0, 150),
    'rain_accum_mm': ('rain_accum', 'mm', 0, 1000000),
    'rain_daily_mm': ('raina_daily', 'mm', 0, 1000000),
    'rain_event_mm': ('raina_event', 'mm', 0, 1000000),
}


def iso(instant):
    return instant.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def normalize(raw, file_day):
    """Preserve UTC observation labels and source nulls; fail on metadata changes."""
    with netCDF4.Dataset('ncar-memory', memory=raw) as dataset:
        if dataset.getncattr('site_name') != 'NSF NCAR Foothills Lab':
            raise ValueError('Unexpected NCAR station identity')
        for key, expected in [('lat', 40.035), ('lon', -105.243), ('alt', 1625)]:
            if abs(float(dataset[key][...]) - expected) > 0.01:
                raise ValueError('Unexpected NCAR station location')
        axis = dataset['time']
        expected_units = 'seconds since ' + file_day.isoformat() + ' 00:00:00 +0000'
        if axis.units != expected_units or axis.calendar != 'standard':
            raise ValueError('Unexpected NCAR UTC time metadata')
        offsets = axis[:]
        if offsets.ndim != 1 or len(offsets) < 1 or len(offsets) > 289:
            raise ValueError('Unexpected NCAR time dimension')
        arrays = {}
        for field, (variable, units, _, _) in FIELDS.items():
            value = dataset[variable]
            if value.units != units or value.dimensions != ('time',) or value.shape != offsets.shape:
                raise ValueError('Unexpected NCAR field metadata: ' + variable)
            arrays[field] = value[:]
        midnight = datetime.combine(file_day, datetime.min.time(), timezone.utc)
        result = []
        last_offset = -1
        for index, offset in enumerate(offsets):
            if np.ma.is_masked(offset) or not math.isfinite(float(offset)):
                raise ValueError('Missing NCAR observation timestamp')
            offset = float(offset)
            if offset % 300 != 0 or offset < 0 or offset > 86400 or offset <= last_offset:
                raise ValueError('Unexpected NCAR cadence or duplicate timestamp')
            last_offset = offset
            row = {'timestamp_utc': iso(midnight + timedelta(seconds=offset))}
            for field, (_, _, low, high) in FIELDS.items():
                value = arrays[field][index]
                number = None if np.ma.is_masked(value) else float(value)
                if number is not None and (not math.isfinite(number) or
                        math.isclose(number, -99.9, abs_tol=0.001) or not low <= number <= high):
                    number = None
                row[field] = number
            result.append(row)
        return result


def fetch_day(day):
    url = BASE + 'flab.' + day.strftime('%Y%m%d') + '.nc'
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=45) as response:
                raw = response.read(150001)
            if len(raw) > 150000:
                raise ValueError('NCAR file exceeds expected size; inspect format')
            return raw
        except urllib.error.HTTPError as error:
            if error.code != 429 and error.code < 500:
                raise ValueError('NCAR archive HTTP ' + str(error.code) + ' for ' + day.isoformat()) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            pass
        if attempt < 2:
            time.sleep(2 ** attempt)
    raise ValueError('NCAR download failed after retries for ' + day.isoformat())


def envelope(day, raw, rows, secret):
    payload = json.dumps({'version': 1, 'source': 'ncar_foothills', 'file_date': day.isoformat(),
                          'sent_at_utc': iso(datetime.now(timezone.utc)), 'rows': rows,
                          'netcdf_base64': base64.b64encode(raw).decode('ascii')},
                         separators=(',', ':'), allow_nan=False)
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return json.dumps({'payload': payload, 'signature': signature}, separators=(',', ':')).encode()


def publish(day, raw, rows, url, secret):
    body = envelope(day, raw, rows, secret)
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, data=body, method='POST', headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(request, timeout=90) as response:
                result = json.loads(response.read(65536))
            if result.get('ok') is True and result.get('rows_received') == len(rows):
                return
            if result.get('error') not in ('busy',):
                raise ValueError('NCAR intake rejected observations')
        except urllib.error.HTTPError as error:
            if error.code not in (404, 429) and error.code < 500:
                raise ValueError('NCAR intake HTTP rejection') from None
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
            pass
        if attempt < 2:
            time.sleep(5 * (attempt + 1))
    raise ValueError('NCAR intake did not acknowledge observations')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start', type=date.fromisoformat)
    parser.add_argument('--end', type=date.fromisoformat)
    parser.add_argument('--cache-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'tmp/ncar-foothills')
    parser.add_argument('--offline', action='store_true', help='Read cached files only')
    parser.add_argument('--publish', action='store_true', help='Send signed files to the private Sheet; disabled by default')
    args = parser.parse_args()
    today = datetime.now(timezone.utc).date()
    if bool(args.start) != bool(args.end):
        parser.error('Use --start and --end together')
    start, end = args.start or today - timedelta(days=3), args.end or today - timedelta(days=1)
    if start < date(2026, 9, 20) or start > end or end >= today or (end - start).days > 365:
        parser.error('Request completed UTC dates from 2026-09-20 onward, at most 366 per invocation')
    url, secret = os.environ.get('DYSON_INGEST_URL', ''), os.environ.get('DYSON_INGEST_SECRET', '')
    if args.publish and (not url.startswith('https://script.google.com/macros/s/') or
                         not url.endswith('/exec') or len(secret) < 32):
        parser.error('Publishing requires the existing private intake URL and signing secret')
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    summary = []
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        path = args.cache_dir / ('flab.' + day.strftime('%Y%m%d') + '.nc')
        raw = path.read_bytes() if args.offline else fetch_day(day)
        rows = normalize(raw, day)
        if any(datetime.fromisoformat(row['timestamp_utc'].replace('Z', '+00:00')) > datetime.now(timezone.utc) for row in rows):
            raise ValueError('NCAR file contains future observations')
        if not args.offline:
            temporary = path.with_suffix('.nc.tmp')
            temporary.write_bytes(raw)
            temporary.replace(path)
        # Keep pre-start native observations only in the original raw file.
        from zoneinfo import ZoneInfo
        boundary = datetime(2026, 9, 20, tzinfo=ZoneInfo('America/Denver'))
        rows = [row for row in rows if datetime.fromisoformat(row['timestamp_utc'].replace('Z', '+00:00')) >= boundary]
        if args.publish:
            publish(day, raw, rows, url, secret)
        record = {'date': day.isoformat(), 'observations': len(rows),
                  'sha256': hashlib.sha256(raw).hexdigest(), 'published': args.publish}
        summary.append(record)
        print(json.dumps(record))
    (args.cache_dir / 'last-run.json').write_text(json.dumps(summary, indent=2) + '\n')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, AttributeError, OSError) as error:
        # Never include request URLs, envelopes, or credentials in logs.
        print('NCAR collection failed: ' + type(error).__name__ + '. Inspect source/configuration and retry.', file=sys.stderr)
        sys.exit(1)

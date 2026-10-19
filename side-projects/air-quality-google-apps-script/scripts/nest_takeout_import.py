"""Validate Nest Takeout quarter-hour counters; never infer runtime from temperature.

The original ZIP is immutable evidence. No network or credentials are used here.
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import zipfile

MODE_FIELDS = ('heat_mode_time', 'cool_mode_time', 'heatcool_mode_time', 'off_mode_time')

def timestamp(value):
    if not isinstance(value, str) or not value.endswith('Z'):
        raise ValueError('Explicit UTC timestamp required')
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00'))

def decode_line(line):
    try:
        result = json.loads(line)
    except json.JSONDecodeError:
        result = json.loads(next(csv.reader([line], strict=True))[0])
    if not isinstance(result, dict):
        raise ValueError('Expected object record')
    return result

def number(row, key):
    value = row.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('Missing/nonfinite duration: ' + key)
    return value

def validate(row):
    start, end = timestamp(row['interval_start']), timestamp(row['interval_end'])
    seconds = (end - start).total_seconds()
    if seconds != 900 or start.timestamp() % 900:
        raise ValueError('Only aligned 900-second source intervals are supported')
    heat, cool = number(row, 'heating_time'), number(row, 'cooling_time')
    if min(heat, cool) < 0 or heat + cool > seconds:
        raise ValueError('Invalid exported heating/cooling durations')
    modes = [number(row, k) for k in MODE_FIELDS]
    if any(v < 0 for v in modes):
        raise ValueError('Invalid mode counter')
    # Counters have the 0..900 scale of each 900-second interval. Do not clip anomalous sums.
    supported = sum(modes) == seconds
    if any(number(row, k) != 0 for k in ('alt_heat1_time', 'alt_heat2_time', 'aux_heat_time', 'emergency_heat_time')):
        supported = False  # unvalidated equipment-stage overlap semantics
    return {'supported': supported, 'coverage_seconds': seconds if supported else 0,
            'heating_minutes': heat / 60 if supported else None,
            'cooling_minutes': cool / 60 if supported else None,
            'off_minutes': (seconds - heat - cool) / 60 if supported else None}

def load_zip(path):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    by_key = {}
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.endswith('/HvacRuntime.jsonl'):
                continue
            for line in archive.read(name).decode('utf-8-sig').splitlines():
                if not line.strip():
                    continue
                row = decode_line(line)
                key = (row['device_id'], row['interval_start'])
                validate(row)
                if key in by_key and by_key[key][0] != row:
                    raise ValueError('Conflicting duplicate exported interval')
                by_key[key] = (row, name)
    return digest, sorted(by_key.values(), key=lambda item: (item[0]['interval_start'], item[0]['device_id']))

def build(path, start, sdm_device, zone, retrieved):
    digest, all_rows = load_zip(path)
    devices = {r['device_id'] for r, _ in all_rows}
    if len(devices) != 1:
        raise ValueError('Explicit mapping required for each additional thermostat')
    native, bins = [], []
    from zoneinfo import ZoneInfo
    for raw, source in all_rows:
        if timestamp(raw['interval_start']) < timestamp(start):
            continue
        v = validate(raw)
        key = raw['interval_start'] + '|' + zone
        native.append({'bin_zone_key': key, 'timestamp_utc': raw['interval_start'], 'interval_end_utc': raw['interval_end'], 'zone_id': zone,
                       'heating_seconds_reported': raw['heating_time'], 'cooling_seconds_reported': raw['cooling_time'],
                       'fan_time_seconds_reported': raw.get('fan_time'), 'mode_counter_sum_seconds': sum(raw[k] for k in MODE_FIELDS),
                       'indoor_temp_source_value': raw.get('indoor_temp'), 'indoor_humidity_source_value': raw.get('indoor_humidity'),
                       'heating_target_source_value': raw.get('heating_target'), 'cooling_target_source_value': raw.get('cooling_target'),
                       'validation_status': 'supported_900_second_interval' if v['supported'] else 'unknown_anomalous_counters',
                       'source_file': '/'.join(source.split('/')[-3:]), 'export_sha256': digest, 'retrieved_at_utc': retrieved})
        # No point-in-time HVAC/fan status or sensor averaging convention is fabricated.
        bins.append({'bin_zone_key': key, 'timestamp_utc': raw['interval_start'],
                     'timestamp_local': timestamp(raw['interval_start']).astimezone(ZoneInfo('America/Denver')).isoformat(),
                     'device_id': sdm_device, 'zone_id': zone,
                     'heating_minutes': v['heating_minutes'], 'cooling_minutes': v['cooling_minutes'], 'off_minutes': v['off_minutes'],
                     'known_duration_minutes': v['coverage_seconds'] / 60, 'unknown_duration_minutes': 15 - v['coverage_seconds'] / 60,
                     'known_duration_coverage_fraction': v['coverage_seconds'] / 900, 'observation_count': 1,
                     'duration_basis': 'takeout_reported_interval_seconds' if v['supported'] else 'takeout_anomalous_interval_unknown',
                     'ingested_at_utc': retrieved})
    return {'sha256': digest, 'all_records': len(all_rows), 'all_first': all_rows[0][0]['interval_start'], 'all_end': all_rows[-1][0]['interval_end'],
            'native': native, 'bins': bins, 'excluded_from_runtime_all_export': sum(not validate(r)['supported'] for r, _ in all_rows)}

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--zip', type=Path, required=True);p.add_argument('--start', required=True)
    p.add_argument('--sdm-device', required=True);p.add_argument('--zone', required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();r=build(a.zip,a.start,a.sdm_device,a.zone,dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z'))
    a.output.write_text(json.dumps(r));a.output.chmod(0o600)
    print(json.dumps({k:v for k,v in r.items() if k not in ('native','bins')}))

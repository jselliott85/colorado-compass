#!/usr/bin/env python3
"""Offline US-NR1 batch importer. Accept a supplied ZIP or folder; never poll a URL.

SQLite is the incremental local archive; exports are private, reviewable staging files.
Second moments and QC are retained as ordered native samples in the 15-minute table,
not pooled or averaged. Counts describe records, not quality-approved measurements.
"""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import sqlite3
import zipfile
from zoneinfo import ZoneInfo

import netCDF4
import numpy as np

MEANS = {'air_temperature_c': ('T3_21m', 'C'),
         'sonic_temperature_c': ('tc_csi_24m', 'C'),
         'vertical_velocity_ms': ('w_csi_24m', 'm/s')}
CAVEAT = ('Preliminary raw US-NR1 statistics; subalpine forest at ~10000 ft vs home ~7300 ft. '
          'Regional research comparator, not local weather or final AmeriFlux products. '
          'Sonic coordinates, no rotation/tilt correction. w is instrument-axis w. '
          'VOC association cannot establish source or causation. No validated QC screening. '
          '15min means are equal-duration means of available 5min statistics; second moments '
          'and diagnostic fields remain ordered native samples, not 15min moments.')


def iso(seconds):
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def plain(value):
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    return value


def dumps(value):
    return json.dumps(value, default=plain, allow_nan=False, sort_keys=True, separators=(',', ':'))


def inspect_file(name, raw):
    match = re.fullmatch(r'niwot_(\d{8})\.nc', name)
    if not match:
        raise ValueError('Unexpected source file name: ' + name)
    day = datetime.strptime(match[1], '%Y%m%d').replace(tzinfo=timezone.utc)
    with netCDF4.Dataset('nr1-memory', memory=raw) as ds:
        metadata = {'dimensions': {k: len(v) for k, v in ds.dimensions.items()},
                    'global_attributes': ds.__dict__,
                    'variables': {k: {'dimensions': v.dimensions, 'dtype': str(v.dtype),
                                      'attributes': v.__dict__} for k, v in ds.variables.items()}}
        if ds.wind3d_horiz_coordinates != 'instrument' or ds.wind3d_horiz_rotation != 0 or ds.wind3d_tilt_correction != 0:
            raise ValueError('Coordinate metadata changed; review before importing')
        axis = ds['time']
        if axis.units != 'seconds since ' + day.strftime('%Y-%m-%d') + ' 00:00:00 00:00' or axis.getncattr('interval(sec)') != 300:
            raise ValueError('Time metadata changed')
        if float(ds['base_time'][...]) != day.timestamp():
            raise ValueError('base_time disagrees with source date')
        offsets = axis[:]
        if len(offsets) != 288 or not np.array_equal(offsets, np.arange(150, 86400, 300)):
            raise ValueError('Unexpected daily centered 5-minute grid')
        for field, units in MEANS.values():
            if ds[field].units != units:
                raise ValueError('Units changed: ' + field)
        arrays = {}
        for key, var in ds.variables.items():
            if key in ('time', 'base_time'):
                continue
            if var.dimensions != ('time',):
                raise ValueError('Unexpected variable dimensions: ' + key)
            arrays[key] = var[:]
        rows = []
        for i, offset in enumerate(offsets):
            instant = day.timestamp() + float(offset)
            row = {'timestamp_utc': iso(instant),
                   'timestamp_local': datetime.fromtimestamp(instant, ZoneInfo('America/Denver')).isoformat(),
                   'source_file': name}
            for key, values in arrays.items():
                value = values[i]
                row[key] = None if np.ma.is_masked(value) or not math.isfinite(float(value)) else plain(value)
            rows.append(row)
    return metadata, rows


def sources(path):
    if path.is_dir():
        return [(p.name, p.read_bytes()) for p in sorted(path.glob('*.nc'))]
    with zipfile.ZipFile(path) as archive:
        names = [n for n in archive.namelist() if n.endswith('.nc')]
        if len({Path(n).name for n in names}) != len(names):
            raise ValueError('Duplicate ZIP basenames')
        return [(Path(n).name, archive.read(n)) for n in sorted(names)]


def aggregate(rows):
    bins = {}
    for row in rows:
        epoch = datetime.fromisoformat(row['timestamp_utc'].replace('Z', '+00:00')).timestamp()
        bins.setdefault(iso(epoch // 900 * 900), []).append(row)
    result = []
    for stamp, samples in sorted(bins.items()):
        samples.sort(key=lambda r: r['timestamp_utc'])
        row = {'timestamp_utc': stamp, 'timestamp_local': datetime.fromisoformat(stamp.replace('Z', '+00:00')).astimezone(ZoneInfo('America/Denver')).isoformat(),
               'observation_count': len(samples), 'expected_observation_count': 3,
               'coverage_fraction': len(samples) / 3,
               'source_file': ','.join(sorted({s['source_file'] for s in samples})),
               'native_samples_json': dumps([{k: v for k, v in sample.items() if (k in ('timestamp_utc', 'timestamp_local', 'source_file', 'ingested_at_utc', 'T3_21m', 'diag', 'GPSstat_niwot', 'GPSnsat_niwot', 'Stratum', 'Timeoffset') or k.endswith('csi_24m') or k.startswith('counts_') or 'diag' in k or k == 'status_ec')} for sample in samples])}
        for target, (source, _) in MEANS.items():
            values = [s[source] for s in samples if s[source] is not None]
            row[target] = sum(values) / len(values) if values else None
            row[target + '_observation_count'] = len(values)
        result.append(row)
    return result


def write_csv(path, rows):
    with path.open('w', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def run(source, output):
    output.mkdir(parents=True, exist_ok=True)
    # Inspect every file before a transaction changes the persistent archive.
    inspected = [(name, raw, *inspect_file(name, raw)) for name, raw in sources(source)]
    if not inspected:
        raise ValueError('No NetCDF files')
    now = iso(datetime.now(timezone.utc).timestamp())
    db = sqlite3.connect(output / 'usnr1.sqlite')
    db.execute('CREATE TABLE IF NOT EXISTS files (name TEXT PRIMARY KEY, sha256 TEXT, metadata TEXT)')
    db.execute('CREATE TABLE IF NOT EXISTS native (timestamp_utc TEXT PRIMARY KEY, source_file TEXT, body TEXT)')
    with db:
        for name, raw, metadata, rows in inspected:
            digest = hashlib.sha256(raw).hexdigest()
            prior = db.execute('SELECT sha256 FROM files WHERE name=?', (name,)).fetchone()
            if prior and prior[0] == digest:
                continue
            for row in rows:
                owner = db.execute('SELECT source_file FROM native WHERE timestamp_utc=?', (row['timestamp_utc'],)).fetchone()
                if owner and owner[0] != name:
                    raise ValueError('Conflicting file ownership at ' + row['timestamp_utc'])
                row['ingested_at_utc'] = now
                db.execute('INSERT OR REPLACE INTO native VALUES (?,?,?)', (row['timestamp_utc'], name, dumps(row)))
            db.execute('INSERT OR REPLACE INTO files VALUES (?,?,?)', (name, digest, dumps(metadata)))
    native = [json.loads(r[0]) for r in db.execute('SELECT body FROM native ORDER BY timestamp_utc')]
    # Homogeneous schema required for a rectangular native export; metadata changes are explicit.
    keys = set(native[0])
    if any(set(r) != keys for r in native):
        raise ValueError('Variable schema changed; archive retained, export requires review')
    quarters = aggregate(native)
    write_csv(output / 'US_NR1_5min.csv', native)
    write_csv(output / 'US_NR1_15min.csv', quarters)
    inventory = {r[0]: json.loads(r[1]) for r in db.execute('SELECT name,metadata FROM files ORDER BY name')}
    (output / 'inventory.json').write_text(dumps(inventory))
    overlap = [r for r in quarters if '2026-09-20' <= r['timestamp_utc'] < '2026-10-12']
    summary = {'files': len(inventory), 'native_records': len(native), 'quarter_hours': len(quarters),
               'first': native[0]['timestamp_utc'], 'last': native[-1]['timestamp_utc'],
               'overlap_quarter_hours': len(overlap), 'overlap_expected_quarter_hours': 22 * 96,
               'incomplete_overlap_bins': sum(r['observation_count'] != 3 for r in overlap),
               'missing_by_variable': {k: sum(r[k] is None for r in native) for k in sorted(keys)},
               'caveat': CAVEAT}
    (output / 'validation.json').write_text(json.dumps(summary, indent=2))
    # Daily chunks allow bounded manual Apps Script imports. Earlier September is preserved.
    for name, _, _, _ in inspected:
        samples = [r for r in native if r['source_file'] == name]
        (output / (name + '.json')).write_text(dumps({'version': 1, 'source': 'us_nr1',
            'caveat': CAVEAT, 'native': samples, 'quarters': aggregate(samples)}))
    db.close()
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, required=True, help='Private ignored directory')
    args = parser.parse_args()
    result = run(args.source, args.output)
    print(json.dumps({k: v for k, v in result.items() if k != 'missing_by_variable'}, indent=2))

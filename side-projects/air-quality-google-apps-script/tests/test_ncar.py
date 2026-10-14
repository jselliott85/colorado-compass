"""Meaningful NetCDF reader checks, including invalid source metadata and gaps."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from datetime import date
import netCDF4
import numpy as np

SPEC = importlib.util.spec_from_file_location('ncar_collect', Path(__file__).resolve().parents[1] / 'scripts/ncar_collect.py')
ncar = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ncar)


def fixture(offsets=(0, 300, 900), units_override=None, site='NSF NCAR Foothills Lab'):
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / 'test.nc'
        with netCDF4.Dataset(path, 'w') as dataset:
            dataset.site_name = site
            dataset.createDimension('time', len(offsets))
            for key, value in [('lat', 40.035), ('lon', -105.243), ('alt', 1625)]:
                dataset.createVariable(key, 'f8')[...] = value
            axis = dataset.createVariable('time', 'i4', ('time',))
            axis.units = 'seconds since 2026-09-24 00:00:00 +0000'
            axis.calendar = 'standard'
            axis[:] = offsets
            for field, (name, units, low, high) in ncar.FIELDS.items():
                variable = dataset.createVariable(name, 'f8', ('time',), fill_value=-9999)
                variable.units = units_override if units_override and name == 'pres' else units
                variable[:] = [max(low, 0)] * len(offsets)
            dataset['tdry'][:] = [12, -99.9, np.nan]
            dataset['rh'][:] = [0, -9999, 101]
            dataset['rain_accum'][:] = [73.2, 73.2, 0]
            dataset['pres'][:] = [835, 836, 837]
        return path.read_bytes()


class NcarTests(unittest.TestCase):
    def test_missing_values_gaps_and_counters_remain_explicit(self):
        rows = ncar.normalize(fixture(), date(2026,9,24))
        self.assertEqual([r['timestamp_utc'] for r in rows], ['2026-09-24T00:00:00Z','2026-09-24T00:05:00Z','2026-09-24T00:15:00Z'])
        self.assertEqual([r['temperature_c'] for r in rows], [12, None, None])
        self.assertEqual([r['relative_humidity_pct'] for r in rows], [0, None, None])
        self.assertEqual([r['rain_accum_mm'] for r in rows], [73.2,73.2,0])
        self.assertEqual(rows[0]['station_pressure_hpa'], 835)
        json.dumps(rows, allow_nan=False)

    def test_metadata_identity_and_timestamps_fail_closed(self):
        for raw in [fixture(units_override='Pa'), fixture(site='Other Site'), fixture(offsets=(0,300,301))]:
            with self.assertRaises(ValueError):
                ncar.normalize(raw, date(2026,9,24))
        with self.assertRaises(ValueError):
            ncar.normalize(fixture(), date(2026,9,25))

    def test_envelope_signs_source_and_preserves_binary(self):
        import base64, hashlib, hmac
        raw = fixture()
        body = json.loads(ncar.envelope(date(2026,9,24), raw, ncar.normalize(raw,date(2026,9,24)), 'test-secret'))
        self.assertEqual(body['signature'],hmac.new(b'test-secret',body['payload'].encode(),hashlib.sha256).hexdigest())
        payload = json.loads(body['payload'])
        self.assertEqual(payload['source'], 'ncar_foothills')
        self.assertEqual(base64.b64decode(payload['netcdf_base64']),raw)


if __name__ == '__main__':
    unittest.main()

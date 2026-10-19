import importlib.util
import json
from pathlib import Path
import unittest

PATH = Path(__file__).resolve().parents[1] / 'scripts/usnr1_import.py'
spec = importlib.util.spec_from_file_location('usnr1', PATH)
nr1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nr1)


class AggregationTests(unittest.TestCase):
    def test_centered_labels_and_missing_values(self):
        samples = []
        for stamp, value in [('00:02:30', 0), ('00:07:30', None), ('00:12:30', 6)]:
            samples.append({'timestamp_utc': '2026-09-20T' + stamp + 'Z',
                            'source_file': 'niwot_20260920.nc', 'T3_21m': value,
                            'tc_csi_24m': value, 'w_csi_24m': value,
                            'w_w__csi_24m': 123})
        result = nr1.aggregate(samples)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['timestamp_utc'], '2026-09-20T00:00:00Z')
        self.assertEqual(result[0]['timestamp_local'], '2026-09-19T18:00:00-06:00')
        self.assertEqual(result[0]['coverage_fraction'], 1)
        self.assertEqual(result[0]['air_temperature_c'], 3)
        self.assertEqual(result[0]['air_temperature_c_observation_count'], 2)
        self.assertNotIn('w_w__csi_24m', result[0])
        self.assertEqual(json.loads(result[0]['native_samples_json']), samples)

    def test_partial_bin(self):
        row = {'timestamp_utc': '2026-11-01T08:02:30Z', 'source_file': 'x',
               'T3_21m': None, 'tc_csi_24m': None, 'w_csi_24m': None}
        result = nr1.aggregate([row])[0]
        self.assertEqual(result['coverage_fraction'], 1/3)
        self.assertIsNone(result['air_temperature_c'])
        self.assertEqual(result['timestamp_local'], '2026-11-01T01:00:00-07:00')


if __name__ == '__main__':
    unittest.main()

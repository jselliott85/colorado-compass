import hashlib
import hmac
import importlib.util
import json
import sys
import unittest
from pathlib import Path


MODULE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE_DIR))
SPEC = importlib.util.spec_from_file_location("relay", MODULE_DIR / "relay.py")
relay = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(relay)


class RelayTests(unittest.TestCase):
    def test_normalized_rows_preserve_pollutants_and_missing_values(self):
        payload = {
            "start_time": "2026-09-24T15:00:00Z",
            "resolution": "PT15M",
            "aqlm": [10, None], "volm": [11, None], "p25m": [12, None],
            "p10m": [13, None], "no2m": [14, None], "tmpm": [2951, None],
            "humm": [42, None], "fnsp": [3, None], "usage": [900, None],
        }
        rows = relay.normalized_observations(payload)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["voc_index"], 11)
        self.assertEqual(rows[0]["pm25_ug_m3"], 12)
        self.assertEqual(rows[0]["pm10_ug_m3"], 13)
        self.assertEqual(rows[0]["no2_index"], 14)
        self.assertNotIn("slot", rows[0])
        self.assertNotIn("timestamp_local", rows[0])

    def test_signed_envelope_authenticates_exact_payload(self):
        body = relay.signed_envelope([{"timestamp_utc": "2026-09-24T15:00:00Z"}], "secret" * 8)
        envelope = json.loads(body)
        expected = hmac.new(b"secret" * 8, envelope["payload"].encode(), hashlib.sha256).hexdigest()
        self.assertEqual(envelope["signature"], expected)
        self.assertNotIn("secret", envelope["payload"])


if __name__ == "__main__":
    unittest.main()

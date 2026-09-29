import hashlib
import hmac
import importlib.util
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError


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

    def test_retries_404_after_a_completed_write_with_the_same_signed_body(self):
        url = "https://script.google.com/macros/s/test/exec"
        body = b"signed-envelope"
        failure = HTTPError(url, 404, "Not Found", {}, None)
        acknowledgement = io.BytesIO(b'{"ok":true,"rows_received":2}')
        with patch.object(relay.urllib.request, "urlopen", side_effect=[failure, acknowledgement]) as fetch, \
                patch.object(relay.time, "sleep") as sleep:
            result = relay.post_envelope(url, body)
        self.assertEqual(result["rows_received"], 2)
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual([call.args[0].full_url for call in fetch.call_args_list], [url, url])
        self.assertEqual([call.args[0].data for call in fetch.call_args_list], [body, body])
        sleep.assert_called_once_with(1)

    def test_retries_unreadable_acknowledgement(self):
        url = "https://script.google.com/macros/s/test/exec"
        with patch.object(relay.urllib.request, "urlopen", side_effect=[
            io.BytesIO(b"not-json"), io.BytesIO(b'{"ok":true,"rows_received":1}')
        ]) as fetch, patch.object(relay.time, "sleep") as sleep:
            result = relay.post_envelope(url, b"signed-envelope")
        self.assertEqual(result["rows_received"], 1)
        self.assertEqual(fetch.call_count, 2)
        sleep.assert_called_once_with(1)

    def test_persistent_404_still_fails_after_three_attempts(self):
        url = "https://script.google.com/macros/s/test/exec"
        with patch.object(relay.urllib.request, "urlopen", side_effect=[
            HTTPError(url, 404, "Not Found", {}, None) for _ in range(3)
        ]) as fetch, patch.object(relay.time, "sleep") as sleep:
            with self.assertRaisesRegex(relay.RelayError, "HTTP 404"):
                relay.post_envelope(url, b"signed-envelope")
        self.assertEqual(fetch.call_count, 3)
        self.assertEqual([call.args[0].full_url for call in fetch.call_args_list], [url] * 3)
        self.assertEqual([call.args[0].data for call in fetch.call_args_list], [b"signed-envelope"] * 3)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [1, 2])

    def test_persistent_unreadable_response_still_fails(self):
        url = "https://script.google.com/macros/s/test/exec"
        with patch.object(relay.urllib.request, "urlopen", side_effect=[
            io.BytesIO(b"not-json") for _ in range(3)
        ]) as fetch, patch.object(relay.time, "sleep") as sleep:
            with self.assertRaisesRegex(relay.RelayError, "invalid response"):
                relay.post_envelope(url, b"signed-envelope")
        self.assertEqual(fetch.call_count, 3)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [1, 2])

    def test_rejected_signature_is_not_retried(self):
        url = "https://script.google.com/macros/s/test/exec"
        with patch.object(relay.urllib.request, "urlopen", return_value=io.BytesIO(
            b'{"ok":false,"error":"authentication_failed"}'
        )) as fetch, patch.object(relay.time, "sleep") as sleep:
            with self.assertRaisesRegex(relay.RelayError, "authentication_failed"):
                relay.post_envelope(url, b"signed-envelope")
        fetch.assert_called_once()
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()

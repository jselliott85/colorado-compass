import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "dyson.py"
SPEC = importlib.util.spec_from_file_location("dyson", MODULE_PATH)
dyson = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(dyson)


class DysonTests(unittest.TestCase):
    @patch.object(dyson, "_keychain_native_set")
    @patch.object(dyson.getpass, "getuser", return_value="owner")
    @patch.object(dyson.sys, "platform", "darwin")
    def test_keychain_set_uses_native_api(self, _user, native_set):
        dyson.keychain_set("test-service", "secret-value")
        native_set.assert_called_once_with("owner", "test-service", "secret-value")

    def test_safe_device_omits_serial_and_mqtt_credential(self):
        device = {
            "serialNumber": "ABC-US-12345678",
            "name": "Bedroom",
            "category": "ec",
            "connectionCategory": "wifiOnly",
            "model": "TP09",
            "type": "438",
            "variant": "K",
            "connectedConfiguration": {
                "firmware": {
                    "version": "1.2.3",
                    "capabilities": ["EnvironmentalData", "ExtendedAQ"],
                },
                "mqtt": {"localBrokerCredentials": "encrypted-secret"},
            },
        }
        safe = dyson.safe_device(device)
        self.assertEqual(safe["model"], "TP09")
        self.assertTrue(safe["has_local_mqtt_credentials"])
        self.assertNotIn("serialNumber", safe)
        self.assertNotIn("name", safe)
        self.assertNotIn("encrypted-secret", str(safe))

    def test_flatten_observed_multiday_shape(self):
        payload = [
            {
                "Date": "2026-09-24",
                "Aqi": {"0": 1, "1": 3},
                "Humidity": {"0": 40, "1": 42},
                "Temperature": {"0": 2940, "1": 2950},
                "Usage": {"0": 0, "1": 1},
            }
        ]
        rows, fields = dyson.flatten_history(payload)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1]["date"], "2026-09-24")
        self.assertEqual(rows[1]["slot"], "1")
        self.assertEqual(rows[1]["aqi"], 3)
        self.assertEqual(fields, ["date", "slot", "aqi", "humidity", "temperature", "usage"])
        summary = dyson.summarize_multiday(payload, rows, fields)
        self.assertEqual(summary["inferred_resolution_minutes"], 60)

    def test_flatten_preserves_unexpected_pollutant_series(self):
        payload = {
            "days": [
                {
                    "date": "2026-09-24",
                    "PM25": [0, 1],
                    "PM10": [1, 2],
                    "VOC": [5, 8],
                    "NO2": [0, 0],
                }
            ]
        }
        rows, fields = dyson.flatten_history(payload)
        self.assertEqual(rows[1]["voc"], 8)
        self.assertEqual(fields, ["date", "slot", "no2", "pm10", "pm25", "voc"])

    def test_export_daily_extended_air_quality(self):
        payload = {
            "start_time": "2026-09-24T06:00:00Z",
            "resolution": "PT15M",
            "aqlm": [1, None, 3],
            "volm": [1, None, 3],
            "p25m": [0.1, None, 0.2],
            "p10m": [0.1, None, 0.3],
            "no2m": [2, None, 3],
            "tmpm": [2942, None, 2952],
            "humm": [38, None, 40],
            "fnsp": [6, None, 6],
            "usage": [900, None, 900],
        }
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "daily.csv"
            summary = dyson.export_daily(payload, output)
            self.assertEqual(summary["resolution_minutes"], 15)
            self.assertEqual(summary["series_non_null_samples"]["volm"], 2)
            self.assertEqual(summary["first_populated_time"], "2026-09-24T06:00:00Z")
            self.assertEqual(summary["last_populated_time"], "2026-09-24T06:30:00Z")
            rows = output.read_text(encoding="utf-8").splitlines()
            self.assertIn("voc_index", rows[0])
            self.assertIn("pm25_ug_m3", rows[0])
            self.assertIn("no2_index", rows[0])
            self.assertIn("69.89", rows[1])

    def test_report_detects_extended_pollutants_and_empty_multiday(self):
        daily = {
            "fields": ["aqlm", "p25m", "p10m", "volm", "no2m"],
            "series_fields": ["aqlm", "p25m", "p10m", "volm", "no2m"],
        }
        multiday = {"series_non_null_samples": {"aqi": 0}}
        report = dyson.build_history_report(
            daily, multiday, ["date", "slot", "aqi"]
        )
        self.assertFalse(report["interpretation"]["daily_endpoint_is_combined_aqi_only"])
        self.assertEqual(
            report["interpretation"]["separate_pollutant_fields_found"],
            ["no2m", "p10m", "p25m", "volm"],
        )
        self.assertFalse(
            report["interpretation"]["multiday_endpoint_has_populated_samples"]
        )


if __name__ == "__main__":
    unittest.main()

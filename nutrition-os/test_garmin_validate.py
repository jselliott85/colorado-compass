"""Synthetic validation boundaries only. No Keychain/network/Sheets access."""
import unittest
import contextlib
import io
import json
from pathlib import Path
import tempfile
from datetime import date
from unittest.mock import patch

import garmin_validate as g


class ValidationTests(unittest.TestCase):
    def test_confirmed_profile_and_exact_source_dedup(self):
        raw = {"samplePk": 1234567890123, "sourceType": "INDEX_SCALE", "timestampGMT": 1793016000000,
               "weight": 75000, "bodyFat": 20, "bodyWater": 50, "muscleMass": 30000, "boneMass": 3000, "bmi": 24}
        first = g.normalize_index_s2(raw, observed_at_utc="2026-10-26T18:00:00Z")
        self.assertEqual(first["source_id"], "1234567890123")
        self.assertEqual(first["weight_kg"], 75)
        self.assertEqual(first["muscle_mass_kg"], 30)
        self.assertEqual(first["bone_mass_kg"], 3)
        self.assertEqual(first["local_date"], "2026-10-26")
        self.assertEqual(json.loads(first["source_record_json"])["timestampGMT"], raw["timestampGMT"])
        self.assertEqual(g.reconcile_measurement([], first)[0], "insert")
        repeat = g.normalize_index_s2(raw, observed_at_utc="2026-10-27T18:00:00Z")
        self.assertEqual(g.reconcile_measurement([first], repeat)[0], "noop")
        changed = dict(repeat, weight_kg=76)
        with self.assertRaises(g.ValidationError):
            g.reconcile_measurement([first], changed)
        with self.assertRaises(g.ValidationError):
            g.reconcile_measurement([first, first], repeat)
        with self.assertRaises(g.ValidationError):
            g.normalize_index_s2(dict(raw, samplePk=None), observed_at_utc="2026-10-26T18:00:00Z")

    def test_missing_and_explicit_zero_metrics(self):
        raw = {"samplePk": 123, "sourceType": "INDEX_SCALE", "timestampGMT": 1793016000000, "weight": 75000, "bodyFat": 0, "bodyWater": None}
        row = g.normalize_index_s2(raw, observed_at_utc="2026-10-26T18:00:00Z")
        self.assertEqual(row["body_fat_pct"], 0)
        self.assertIsNone(row["body_water_pct"])
        self.assertIsNone(row["muscle_mass_kg"])

    def test_empty_window_not_successful_measurement_validation(self):
        report = g.inspect_records([])
        self.assertEqual(report["validation_state"], "no_in_window_measurements")
        self.assertFalse(report["units_verified_against_connect"])

    def test_capture_is_private_and_read_only(self):
        records = [{"weight": 75.4321, "timestampGMT": "2026-10-26T12:00:00Z", "samplePk": "private-id"}]
        with tempfile.TemporaryDirectory() as directory:
            private = Path(directory) / "garmin"
            output = io.StringIO()
            with patch.object(g, "PRIVATE_DIR", private), patch.object(g.ssl, "HAS_TLSv1_3", True), patch.object(g, "keychain_key", return_value="synthetic-key"), patch.object(g, "request_json", side_effect=["aaa.bbb.ccc", records]) as request, contextlib.redirect_stdout(output):
                g.capture(date(2026, 10, 26), date(2026, 10, 26))
            files = list(private.glob("*.json"))
            self.assertEqual(len(files), 1)
            self.assertEqual(files[0].stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(files[0].read_text()), records)
            self.assertEqual(request.call_count, 2)
            self.assertEqual(request.call_args_list[1].args[0], "/weight-service/weight/range/2026-10-26/2026-10-26?includeAll=true")
            for private_value in ("synthetic-key", "aaa.bbb.ccc", "75.4321", "private-id"):
                self.assertNotIn(private_value, output.getvalue())
                if private_value in ("synthetic-key", "aaa.bbb.ccc"):
                    self.assertNotIn(private_value, files[0].read_text())

    def test_documented_plain_text_token(self):
        self.assertEqual(g.bearer_text("aaa.bbb.ccc"), "aaa.bbb.ccc")
        for value in ({"access_token": "aaa.bbb.ccc"}, "aaa.bbb.ccc\nInjected: header", ""):
            with self.assertRaises(g.ValidationError):
                g.bearer_text(value)

    def test_range_ignores_adjacent_and_summary_records(self):
        row = {"weight": 75, "timestampGMT": "2026-10-26T12:00:00Z"}
        self.assertEqual(g.measurement_records({"dailyWeightSummaries": [{"allWeightMetrics": [row], "latestWeight": row}], "previousDateWeight": row, "totalAverage": {"weight": 75}}), [row])
        with self.assertRaises(g.ValidationError):
            g.measurement_records({"dailyWeightSummaries": [{"latestWeight": row}]})

    def test_explicit_units_only(self):
        self.assertEqual(g.weight_to_kg(75, "kg"), 75)
        self.assertEqual(g.weight_to_kg(75000, "g"), 75)
        self.assertAlmostEqual(g.weight_to_kg(165, "lb"), 74.84274105)
        for value, unit in [(75000, None), (0, "kg"), (True, "kg"), (float("nan"), "kg")]:
            with self.assertRaises(g.ValidationError):
                g.weight_to_kg(value, unit)

    def test_denver_midnight_and_dst(self):
        before = g.parse_instant("2026-10-27T05:59:00Z").astimezone(g.ZoneInfo("America/Denver"))
        after = g.parse_instant("2026-10-27T06:00:00Z").astimezone(g.ZoneInfo("America/Denver"))
        self.assertEqual(str(before.date()), "2026-10-26")
        self.assertEqual(str(after.date()), "2026-10-27")
        first = g.parse_instant("2026-11-01T01:30:00-06:00")
        second = g.parse_instant("2026-11-01T01:30:00-07:00")
        self.assertNotEqual(first, second)

    def test_ambiguous_timestamp_rejected(self):
        for value in ("2026-11-01T01:30:00", "2026-10-26", 1793034000000, None):
            with self.assertRaises(g.ValidationError):
                g.parse_instant(value)

    def test_duplicate_instants_and_unknown_body_fields(self):
        report = g.inspect_records([
            {"weight": 75.0, "timestampGMT": "2026-10-26T12:00:00Z", "bodyFat": None},
            {"weight": 75.1, "timestampGMT": "2026-10-26T06:00:00-06:00", "bodyFat": 0},
        ])
        self.assertEqual(report["duplicate_exact_instants"], 1)
        self.assertEqual(report["nonnull_body_fields"]["bodyFat"], 1)
        self.assertFalse(report["stable_identity_verified"])
        self.assertFalse(report["units_verified_against_connect"])

    def test_private_values_not_in_inspection_report(self):
        report = g.inspect_records([{"weight": 75.4321, "timestampGMT": "2026-10-26T12:00:00Z", "samplePk": "private-id"}])
        text = str(report)
        self.assertNotIn("75.4321", text)
        self.assertNotIn("private-id", text)

    @patch.object(g, "keychain_key")
    def test_large_window_rejected_before_key_access(self, key):
        with self.assertRaises(g.ValidationError):
            g.capture(date(2026, 10, 1), date(2026, 10, 8))
        key.assert_not_called()

    def test_redirect_refused(self):
        with self.assertRaises(g.ValidationError):
            g.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.example")

    @patch.object(g, "subprocess")
    def test_key_not_in_process_arguments(self, process):
        process.run.return_value.returncode = 0
        process.run.return_value.stdout = b"synthetic-secret\n"
        self.assertEqual(g.keychain_key(), "synthetic-secret")
        self.assertNotIn("synthetic-secret", str(process.run.call_args))


if __name__ == "__main__":
    unittest.main()

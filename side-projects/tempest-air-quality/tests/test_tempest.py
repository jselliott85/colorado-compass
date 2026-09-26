import csv
import importlib.util
import io
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo


MODULE_PATH = Path(__file__).resolve().parents[1] / "tempest.py"
SPEC = importlib.util.spec_from_file_location("tempest", MODULE_PATH)
tempest = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(tempest)


class TempestTests(unittest.TestCase):
    def sample_observation(self, epoch):
        return [
            epoch,
            0.1,
            0.2,
            0.3,
            180,
            3,
            834.5,
            20.0,
            40.0,
            12000,
            2.1,
            450,
            0.254,
            1,
            10,
            2,
            2.5,
            1,
            0.254,
            0.508,
            0.508,
            1,
        ]

    def test_denver_day_bounds_and_dst(self):
        start, end = tempest.local_day_bounds(date(2026, 9, 24), "America/Denver")
        self.assertEqual(end - start, 24 * 60 * 60)
        local = tempest.datetime.fromtimestamp(start, tz=ZoneInfo("America/Denver"))
        self.assertEqual(local.isoformat(), "2026-09-24T00:00:00-06:00")

        dst_start, dst_end = tempest.local_day_bounds(date(2026, 11, 1), "America/Denver")
        self.assertEqual(dst_end - dst_start, 25 * 60 * 60)

    @patch.object(tempest.subprocess, "run")
    @patch.object(tempest.getpass, "getuser", return_value="weather-owner")
    @patch.object(tempest.sys, "platform", "darwin")
    def test_keychain_token_is_read_without_putting_secret_in_arguments(self, _user, run):
        run.return_value.returncode = 0
        run.return_value.stdout = "secret-value\n"
        self.assertEqual(tempest.keychain_token(), "secret-value")
        arguments = run.call_args.args[0]
        self.assertNotIn("secret-value", arguments)
        self.assertEqual(arguments[-1], "-w")

    def test_normalization_converts_units_and_omits_wind(self):
        start, end = tempest.local_day_bounds(date(2026, 9, 24), "America/Denver")
        payload = {"type": "obs_st", "obs": [self.sample_observation(start + 60)]}
        rows = tempest.normalize_observations(payload, start, end, "America/Denver")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["timestamp_local"], "2026-09-24T00:01:00-06:00")
        self.assertEqual(rows[0]["temperature_f"], 68.0)
        self.assertEqual(rows[0]["precipitation_in"], 0.02)
        self.assertAlmostEqual(rows[0]["lightning_avg_distance_mi"], 6.21)
        self.assertFalse(any("wind" in key for key in rows[0]))

    def test_end_boundary_is_excluded_and_duplicates_are_removed(self):
        start, end = tempest.local_day_bounds(date(2026, 9, 24), "America/Denver")
        observation = self.sample_observation(start + 60)
        payload = {
            "type": "obs_st",
            "obs": [observation, observation, self.sample_observation(end)],
        }
        rows = tempest.normalize_observations(payload, start, end, "America/Denver")
        self.assertEqual(len(rows), 1)

    def test_csv_schema(self):
        start, end = tempest.local_day_bounds(date(2026, 9, 24), "America/Denver")
        row = tempest.normalize_observations(
            {"type": "obs_st", "obs": [self.sample_observation(start + 60)]},
            start,
            end,
            "America/Denver",
        )[0]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "day.csv"
            tempest.write_csv(path, [row])
            with path.open(newline="", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                self.assertEqual(reader.fieldnames, tempest.CSV_COLUMNS)
                self.assertEqual(len(list(reader)), 1)

    def test_summary_reports_gaps_and_no_interpolation(self):
        start, end = tempest.local_day_bounds(date(2026, 9, 24), "America/Denver")
        observations = [
            self.sample_observation(start + 60),
            self.sample_observation(start + 120),
            self.sample_observation(start + 300),
        ]
        rows = tempest.normalize_observations(
            {"type": "obs_st", "obs": observations}, start, end, "America/Denver"
        )
        summary = tempest.summarize(date(2026, 9, 24), rows)
        self.assertIn("typical cadence: 1 minute(s)", summary)
        self.assertIn("gaps above cadence: 1", summary)
        self.assertIn("records: 3", summary)


if __name__ == "__main__":
    unittest.main()

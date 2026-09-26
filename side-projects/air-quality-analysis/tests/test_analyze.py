import csv
import importlib.util
import math
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "analyze.py"
SPEC = importlib.util.spec_from_file_location("analyze", MODULE_PATH)
analyze = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(analyze)


class AnalyzeTests(unittest.TestCase):
    def test_tempest_aggregation_means_weather_and_sums_rain_without_wind(self):
        fields = [
            "timestamp_utc",
            "temperature_f",
            "relative_humidity_pct",
            "dew_point_f",
            "station_pressure_mb",
            "solar_radiation_w_m2",
            "precipitation_in",
            "wind_speed",
        ]
        rows = [
            {
                "timestamp_utc": "2026-09-24T15:01:00Z",
                "temperature_f": "60",
                "relative_humidity_pct": "40",
                "dew_point_f": "36",
                "station_pressure_mb": "840",
                "solar_radiation_w_m2": "300",
                "precipitation_in": "0.01",
                "wind_speed": "99",
            },
            {
                "timestamp_utc": "2026-09-24T15:14:00Z",
                "temperature_f": "64",
                "relative_humidity_pct": "44",
                "dew_point_f": "38",
                "station_pressure_mb": "842",
                "solar_radiation_w_m2": "500",
                "precipitation_in": "0.02",
                "wind_speed": "99",
            },
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "2026-09-24.csv"
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=fields)
                writer.writeheader()
                writer.writerows(rows)
            result = analyze.aggregate_tempest([path], "America/Denver")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["outdoor_temperature_f"], 62)
        self.assertEqual(result[0]["outdoor_precipitation_in"], 0.03)
        self.assertFalse(any("wind" in key for key in result[0]))

    def test_join_preserves_pollutants_and_applies_filter_boundary(self):
        dyson = [
            {
                "timestamp_utc": "2026-09-24T15:00:00Z",
                "timestamp_local": "2026-09-24T09:00:00-06:00",
                "combined_aqi": "20",
                "voc_index": "20",
                "pm25_ug_m3": "0.1",
                "pm10_ug_m3": "0.2",
                "no2_index": "1",
                "temperature_f": "70",
                "relative_humidity_pct": "35",
                "fan_speed": "5",
                "usage_seconds": "900",
            }
        ]
        tempest = [
            {
                "timestamp_utc": "2026-09-24T15:00:00Z",
                "outdoor_temperature_f": 60,
                "tempest_sample_count": 15,
            }
        ]
        boundary = datetime.fromisoformat("2026-09-24T09:00:00-06:00")
        result = analyze.join_data(dyson, tempest, boundary)
        self.assertEqual(result[0]["filter_phase"], "post-filter")
        self.assertEqual(result[0]["dyson_pm25_ug_m3"], "0.1")
        self.assertEqual(result[0]["dyson_pm10_ug_m3"], "0.2")
        self.assertEqual(result[0]["dyson_no2_index"], "1")

    def test_positive_lag_means_weather_leads_voc(self):
        start = datetime(2026, 9, 20, tzinfo=timezone.utc)
        weather = [(index * 17) % 31 + math.sin(index) for index in range(40)]
        rows = []
        for index, value in enumerate(weather):
            rows.append(
                {
                    "timestamp_utc": (start + timedelta(minutes=15 * index))
                    .isoformat()
                    .replace("+00:00", "Z"),
                    "dyson_voc_index": "" if index < 4 else weather[index - 4],
                    "outdoor_temperature_f": value,
                }
            )
        results = [
            row
            for row in analyze.lag_correlations(rows)
            if row["weather_field"] == "outdoor_temperature_f"
            and row["pearson_r"] != ""
        ]
        best = max(results, key=lambda row: abs(float(row["pearson_r"])))
        self.assertEqual(best["lag_minutes"], 60)
        self.assertAlmostEqual(float(best["pearson_r"]), 1.0)


if __name__ == "__main__":
    unittest.main()

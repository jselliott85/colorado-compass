#!/usr/bin/env python3
"""Create a temporary 15-minute Dyson/Tempest/regional-AQ exploratory join."""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo


PROJECT_DIR = Path(__file__).resolve().parent
REPO_DIR = PROJECT_DIR.parents[1]
DEFAULT_DYSON_CSV = (
    REPO_DIR
    / "side-projects"
    / "dyson-air-quality"
    / "data"
    / "dyson"
    / "cloud-history-15min.csv"
)
DEFAULT_TEMPEST_DIR = (
    REPO_DIR / "side-projects" / "tempest-air-quality" / "data" / "tempest"
)
DEFAULT_OUTPUT_DIR = PROJECT_DIR / "tmp"
DEFAULT_OUTDOOR_AQ_CSV = DEFAULT_OUTPUT_DIR / "cdphe-outdoor-air-quality-15min.csv"
DEFAULT_TIMEZONE = "America/Denver"
DEFAULT_FILTER_BOUNDARY = "2026-09-24T09:00:00-06:00"
BIN_SECONDS = 15 * 60

TEMPEST_MEAN_FIELDS = {
    "temperature_f": "outdoor_temperature_f",
    "relative_humidity_pct": "outdoor_relative_humidity_pct",
    "dew_point_f": "outdoor_dew_point_f",
    "station_pressure_mb": "outdoor_station_pressure_mb",
    "solar_radiation_w_m2": "outdoor_solar_radiation_w_m2",
}

JOIN_COLUMNS = [
    "timestamp_utc",
    "timestamp_local",
    "local_date",
    "local_hour",
    "day_of_week",
    "day_type",
    "filter_phase",
    "dyson_combined_aqi",
    "dyson_voc_index",
    "dyson_pm25_ug_m3",
    "dyson_pm10_ug_m3",
    "dyson_no2_index",
    "indoor_temperature_f",
    "indoor_relative_humidity_pct",
    "dyson_fan_speed",
    "dyson_usage_seconds",
    "outdoor_temperature_f",
    "outdoor_relative_humidity_pct",
    "outdoor_dew_point_f",
    "outdoor_station_pressure_mb",
    "outdoor_solar_radiation_w_m2",
    "outdoor_precipitation_in",
    "tempest_sample_count",
]

WEATHER_FIELDS = [
    "outdoor_temperature_f",
    "outdoor_relative_humidity_pct",
    "outdoor_dew_point_f",
    "outdoor_station_pressure_mb",
    "outdoor_solar_radiation_w_m2",
    "outdoor_precipitation_in",
]

WEATHER_LABELS = {
    "outdoor_temperature_f": "outdoor temperature",
    "outdoor_relative_humidity_pct": "outdoor RH",
    "outdoor_dew_point_f": "outdoor dew point",
    "outdoor_station_pressure_mb": "station pressure",
    "outdoor_solar_radiation_w_m2": "solar radiation",
    "outdoor_precipitation_in": "precipitation",
}

OUTDOOR_AQ_FIELDS = [
    "source_hour_ending_mst",
    "source_resolution_minutes",
    "outdoor_pm25_1h_ug_m3",
    "outdoor_pm25_24h_ug_m3",
    "outdoor_pm25_aqi",
    "outdoor_pm10_1h_ug_m3",
    "outdoor_pm10_24h_ug_m3",
    "outdoor_pm10_aqi",
    "outdoor_ozone_1h_ppb",
    "outdoor_ozone_8h_ppb",
    "outdoor_ozone_aqi",
    "outdoor_combined_aqi",
    "outdoor_combined_aqi_pollutant",
    "pm_station",
    "pm_station_aqs_id",
    "ozone_station",
    "ozone_station_aqs_id",
]

OUTDOOR_AQ_ANALYSIS_FIELDS = [
    "outdoor_pm25_1h_ug_m3",
    "outdoor_pm10_1h_ug_m3",
    "outdoor_ozone_1h_ppb",
    "outdoor_combined_aqi",
]

OUTDOOR_AQ_HOURLY_FIELDS = [
    *OUTDOOR_AQ_ANALYSIS_FIELDS,
    "outdoor_pm25_24h_ug_m3",
    "outdoor_pm25_aqi",
    "outdoor_pm10_24h_ug_m3",
    "outdoor_pm10_aqi",
    "outdoor_ozone_8h_ppb",
    "outdoor_ozone_aqi",
]

OUTDOOR_AQ_LABELS = {
    "outdoor_pm25_1h_ug_m3": "outdoor PM2.5 (1-hour)",
    "outdoor_pm10_1h_ug_m3": "outdoor PM10 (1-hour)",
    "outdoor_ozone_1h_ppb": "outdoor ozone (1-hour)",
    "outdoor_combined_aqi": "regional combined AQI",
}

JOIN_COLUMNS.extend(OUTDOOR_AQ_FIELDS)


class AnalysisError(RuntimeError):
    pass


def as_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: Iterable[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def aggregate_tempest(paths: list[Path], timezone_name: str) -> list[dict[str, Any]]:
    buckets: dict[int, list[dict[str, str]]] = defaultdict(list)
    for path in paths:
        for row in read_csv_rows(path):
            timestamp = parse_utc(row["timestamp_utc"])
            epoch = int(timestamp.timestamp())
            buckets[epoch - epoch % BIN_SECONDS].append(row)

    zone = ZoneInfo(timezone_name)
    aggregated: list[dict[str, Any]] = []
    for epoch, rows in sorted(buckets.items()):
        instant = datetime.fromtimestamp(epoch, tz=timezone.utc)
        result: dict[str, Any] = {
            "timestamp_utc": instant.isoformat().replace("+00:00", "Z"),
            "timestamp_local": instant.astimezone(zone).isoformat(),
            "tempest_sample_count": len(rows),
        }
        for source, target in TEMPEST_MEAN_FIELDS.items():
            values = [value for row in rows if (value := as_float(row.get(source))) is not None]
            result[target] = round(statistics.fmean(values), 5) if values else ""
        precipitation = [
            value
            for row in rows
            if (value := as_float(row.get("precipitation_in"))) is not None
        ]
        result["outdoor_precipitation_in"] = (
            round(sum(precipitation), 7) if precipitation else ""
        )
        aggregated.append(result)
    return aggregated


def normalize_dyson(row: dict[str, str]) -> dict[str, Any]:
    return {
        "timestamp_utc": row["timestamp_utc"],
        "timestamp_local": row["timestamp_local"],
        "dyson_combined_aqi": row.get("combined_aqi", ""),
        "dyson_voc_index": row.get("voc_index", ""),
        "dyson_pm25_ug_m3": row.get("pm25_ug_m3", ""),
        "dyson_pm10_ug_m3": row.get("pm10_ug_m3", ""),
        "dyson_no2_index": row.get("no2_index", ""),
        "indoor_temperature_f": row.get("temperature_f", ""),
        "indoor_relative_humidity_pct": row.get("relative_humidity_pct", ""),
        "dyson_fan_speed": row.get("fan_speed", ""),
        "dyson_usage_seconds": row.get("usage_seconds", ""),
    }


def join_data(
    dyson_rows: list[dict[str, str]],
    tempest_rows: list[dict[str, Any]],
    filter_boundary: datetime,
    outdoor_aq_rows: list[dict[str, str]] | None = None,
) -> list[dict[str, Any]]:
    weather = {row["timestamp_utc"]: row for row in tempest_rows}
    outdoor_aq = {
        row["timestamp_utc"]: row for row in (outdoor_aq_rows or [])
    }
    joined: list[dict[str, Any]] = []
    for raw in dyson_rows:
        if as_float(raw.get("voc_index")) is None:
            continue
        row = normalize_dyson(raw)
        local = datetime.fromisoformat(row["timestamp_local"])
        row.update(
            {
                "local_date": local.date().isoformat(),
                "local_hour": round(local.hour + local.minute / 60, 2),
                "day_of_week": local.strftime("%A"),
                "day_type": "weekend" if local.weekday() >= 5 else "weekday",
                "filter_phase": "post-filter" if local >= filter_boundary else "pre-filter",
            }
        )
        matched = weather.get(row["timestamp_utc"], {})
        for field in WEATHER_FIELDS + ["tempest_sample_count"]:
            row[field] = matched.get(field, "")
        aq_matched = outdoor_aq.get(row["timestamp_utc"], {})
        for field in OUTDOOR_AQ_FIELDS:
            row[field] = aq_matched.get(field, "")
        joined.append(row)
    return joined


def pearson_pairs(rows: Iterable[dict[str, Any]], left: str, right: str) -> tuple[float | None, int]:
    pairs = []
    for row in rows:
        x = as_float(row.get(left))
        y = as_float(row.get(right))
        if x is not None and y is not None:
            pairs.append((x, y))
    if len(pairs) < 3:
        return None, len(pairs)
    xs, ys = zip(*pairs)
    mean_x = statistics.fmean(xs)
    mean_y = statistics.fmean(ys)
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in pairs)
    denominator = math.sqrt(
        sum((x - mean_x) ** 2 for x in xs) * sum((y - mean_y) ** 2 for y in ys)
    )
    return (numerator / denominator if denominator else None), len(pairs)


def lag_correlations(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    indexed = {int(parse_utc(row["timestamp_utc"]).timestamp()): row for row in rows}
    results = []
    for field in WEATHER_FIELDS:
        for lag_minutes in range(-180, 181, 15):
            pairs = []
            for epoch, voc_row in indexed.items():
                # Positive lag means weather leads and VOC follows by this interval.
                weather_row = indexed.get(epoch - lag_minutes * 60)
                if not weather_row:
                    continue
                voc = as_float(voc_row.get("dyson_voc_index"))
                weather_value = as_float(weather_row.get(field))
                if voc is not None and weather_value is not None:
                    pairs.append(
                        {"dyson_voc_index": voc, "weather_value": weather_value}
                    )
            correlation, count = pearson_pairs(
                pairs, "dyson_voc_index", "weather_value"
            )
            results.append(
                {
                    "weather_field": field,
                    "lag_minutes": lag_minutes,
                    "pearson_r": "" if correlation is None else round(correlation, 6),
                    "n": count,
                }
            )
    return results


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        raise AnalysisError("Cannot calculate a percentile of an empty series.")
    position = fraction * (len(ordered) - 1)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def mean_for(rows: Iterable[dict[str, Any]], field: str) -> float | None:
    values = [value for row in rows if (value := as_float(row.get(field))) is not None]
    return statistics.fmean(values) if values else None


def median_for(rows: Iterable[dict[str, Any]], field: str) -> float | None:
    values = [value for row in rows if (value := as_float(row.get(field))) is not None]
    return statistics.median(values) if values else None


def harmonic_time_of_day(rows: list[dict[str, Any]]) -> dict[str, Any]:
    pairs = [
        (as_float(row.get("local_hour")), as_float(row.get("dyson_voc_index")))
        for row in rows
    ]
    pairs = [(hour, voc) for hour, voc in pairs if hour is not None and voc is not None]
    if len(pairs) < 3:
        return {"n": len(pairs), "r_squared": None, "peak_hour": None}
    ys = [voc for _, voc in pairs]
    sin_values = [math.sin(2 * math.pi * hour / 24) for hour, _ in pairs]
    cos_values = [math.cos(2 * math.pi * hour / 24) for hour, _ in pairs]
    mean_y = statistics.fmean(ys)
    # Centering sin/cos makes their two-predictor normal equations compact.
    mean_s = statistics.fmean(sin_values)
    mean_c = statistics.fmean(cos_values)
    centered_s = [value - mean_s for value in sin_values]
    centered_c = [value - mean_c for value in cos_values]
    centered_y = [value - mean_y for value in ys]
    ss = sum(value * value for value in centered_s)
    cc = sum(value * value for value in centered_c)
    sc = sum(s * c for s, c in zip(centered_s, centered_c))
    sy = sum(s * y for s, y in zip(centered_s, centered_y))
    cy = sum(c * y for c, y in zip(centered_c, centered_y))
    determinant = ss * cc - sc * sc
    if determinant == 0:
        return {"n": len(pairs), "r_squared": None, "peak_hour": None}
    coefficient_s = (sy * cc - cy * sc) / determinant
    coefficient_c = (cy * ss - sy * sc) / determinant
    intercept = mean_y - coefficient_s * mean_s - coefficient_c * mean_c
    predicted = [
        intercept + coefficient_s * s + coefficient_c * c
        for s, c in zip(sin_values, cos_values)
    ]
    residual_ss = sum((actual - fitted) ** 2 for actual, fitted in zip(ys, predicted))
    total_ss = sum((actual - mean_y) ** 2 for actual in ys)
    peak_angle = math.atan2(coefficient_s, coefficient_c) % (2 * math.pi)
    return {
        "n": len(pairs),
        "r_squared": None if not total_ss else 1 - residual_ss / total_ss,
        "peak_hour": peak_angle * 24 / (2 * math.pi),
        "amplitude": math.hypot(coefficient_s, coefficient_c),
    }


def hour_profile(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        local = datetime.fromisoformat(row["timestamp_local"])
        grouped[local.hour].append(row)
    return [
        {
            "hour": hour,
            "mean_voc": mean_for(grouped[hour], "dyson_voc_index"),
            "median_voc": median_for(grouped[hour], "dyson_voc_index"),
            "n": len(grouped[hour]),
        }
        for hour in sorted(grouped)
    ]


def matched_hour_means(rows: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        hour = datetime.fromisoformat(row["timestamp_local"]).hour
        grouped[(row["day_type"], hour)].append(row)
    shared_hours = [
        hour
        for hour in range(24)
        if grouped.get(("weekday", hour)) and grouped.get(("weekend", hour))
    ]
    result: dict[str, Any] = {"shared_hours": shared_hours}
    for day_type in ("weekday", "weekend"):
        hourly_means = [
            mean_for(grouped[(day_type, hour)], "dyson_voc_index")
            for hour in shared_hours
        ]
        values = [value for value in hourly_means if value is not None]
        result[f"{day_type}_hour_balanced_mean"] = (
            statistics.fmean(values) if values else None
        )
    return result


def clock_quarter_adjusted_correlations(rows: list[dict[str, Any]]) -> dict[str, Any]:
    fields = ["dyson_voc_index", *WEATHER_FIELDS]
    grouped: dict[str, dict[int, list[float]]] = {
        field: defaultdict(list) for field in fields
    }
    for row in rows:
        local = datetime.fromisoformat(row["timestamp_local"])
        slot = local.hour * 4 + local.minute // 15
        for field in fields:
            value = as_float(row.get(field))
            if value is not None:
                grouped[field][slot].append(value)
    means = {
        field: {slot: statistics.fmean(values) for slot, values in slots.items()}
        for field, slots in grouped.items()
    }
    residual_rows = []
    for row in rows:
        local = datetime.fromisoformat(row["timestamp_local"])
        slot = local.hour * 4 + local.minute // 15
        residual: dict[str, Any] = {}
        for field in fields:
            value = as_float(row.get(field))
            residual[field] = (
                "" if value is None else value - means[field][slot]
            )
        residual_rows.append(residual)
    return {
        field: {
            "r": pearson_pairs(residual_rows, "dyson_voc_index", field)[0],
            "n": pearson_pairs(residual_rows, "dyson_voc_index", field)[1],
        }
        for field in WEATHER_FIELDS
    }


def boundary_window_comparison(
    rows: list[dict[str, Any]], boundary: datetime, hours: int
) -> dict[str, Any]:
    before = [
        row
        for row in rows
        if boundary - timedelta(hours=hours)
        <= datetime.fromisoformat(row["timestamp_local"])
        < boundary
    ]
    after = [
        row
        for row in rows
        if boundary
        <= datetime.fromisoformat(row["timestamp_local"])
        < boundary + timedelta(hours=hours)
    ]
    return {
        "hours": hours,
        "before_n": len(before),
        "before_mean_voc": mean_for(before, "dyson_voc_index"),
        "after_n": len(after),
        "after_mean_voc": mean_for(after, "dyson_voc_index"),
    }


def daily_voc_summary(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row["local_date"]].append(row)
    summaries = []
    for local_date, day_rows in sorted(grouped.items()):
        midday = [
            row
            for row in day_rows
            if 12 <= datetime.fromisoformat(row["timestamp_local"]).hour < 17
        ]
        evening = [
            row
            for row in day_rows
            if 17 <= datetime.fromisoformat(row["timestamp_local"]).hour < 24
        ]
        summaries.append(
            {
                "date": local_date,
                "n": len(day_rows),
                "mean_voc": mean_for(day_rows, "dyson_voc_index"),
                "midday_mean_voc": mean_for(midday, "dyson_voc_index"),
                "evening_mean_voc": mean_for(evening, "dyson_voc_index"),
            }
        )
    return summaries


def outdoor_hourly_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        source_hour = row.get("source_hour_ending_mst")
        if source_hour:
            grouped[str(source_hour)].append(row)
    hourly = []
    for source_hour, source_rows in sorted(grouped.items()):
        result: dict[str, Any] = {
            "source_hour_ending_mst": source_hour,
            "dyson_voc_index": mean_for(source_rows, "dyson_voc_index"),
        }
        for field in OUTDOOR_AQ_HOURLY_FIELDS:
            result[field] = mean_for(source_rows, field)
        pollutants = [
            str(row.get("outdoor_combined_aqi_pollutant"))
            for row in source_rows
            if row.get("outdoor_combined_aqi_pollutant")
        ]
        result["outdoor_combined_aqi_pollutant"] = (
            pollutants[0] if pollutants else ""
        )
        hourly.append(result)
    return hourly


def fmt(value: float | None, digits: int = 3) -> str:
    return "n/a" if value is None else f"{value:.{digits}f}"


def build_report(
    rows: list[dict[str, Any]],
    lag_rows: list[dict[str, Any]],
    filter_boundary: datetime,
) -> tuple[str, dict[str, Any]]:
    complete = [row for row in rows if as_float(row.get("outdoor_temperature_f")) is not None]
    if not complete:
        raise AnalysisError("No timestamp-matched Dyson/Tempest rows were available.")

    zero_lag = {}
    best_lags = {}
    for field in WEATHER_FIELDS:
        correlation, count = pearson_pairs(complete, "dyson_voc_index", field)
        zero_lag[field] = {"r": correlation, "n": count}
        candidates = [
            row
            for row in lag_rows
            if row["weather_field"] == field and row["pearson_r"] != ""
        ]
        best_lags[field] = (
            max(candidates, key=lambda row: abs(float(row["pearson_r"])))
            if candidates
            else None
        )

    clock_adjusted = clock_quarter_adjusted_correlations(complete)

    phases = {}
    for phase in ("pre-filter", "post-filter"):
        phase_rows = [row for row in complete if row["filter_phase"] == phase]
        phases[phase] = {
            "n": len(phase_rows),
            "voc_mean": mean_for(phase_rows, "dyson_voc_index"),
            "voc_median": median_for(phase_rows, "dyson_voc_index"),
            "correlations": {
                field: pearson_pairs(phase_rows, "dyson_voc_index", field)[0]
                for field in WEATHER_FIELDS
            },
        }

    day_types = {}
    for day_type in ("weekday", "weekend"):
        selected = [row for row in complete if row["day_type"] == day_type]
        day_types[day_type] = {
            "n": len(selected),
            "dates": sorted({row["local_date"] for row in selected}),
            "voc_mean": mean_for(selected, "dyson_voc_index"),
            "voc_median": median_for(selected, "dyson_voc_index"),
        }
    matched_hours = matched_hour_means(complete)

    profile = hour_profile(complete)
    profile_with_values = [row for row in profile if row["mean_voc"] is not None]
    highest_hours = sorted(profile_with_values, key=lambda row: row["mean_voc"], reverse=True)[:3]
    lowest_hours = sorted(profile_with_values, key=lambda row: row["mean_voc"])[:3]
    harmonic = harmonic_time_of_day(complete)
    daily = daily_voc_summary(complete)
    complete_days = [row for row in daily if row["n"] == 96]
    evening_above_midday_days = sum(
        row["evening_mean_voc"] is not None
        and row["midday_mean_voc"] is not None
        and row["evening_mean_voc"] > row["midday_mean_voc"]
        for row in complete_days
    )
    boundary_windows = [
        boundary_window_comparison(complete, filter_boundary, hours)
        for hours in (6, 24)
    ]

    voc_values = [
        value for row in complete if (value := as_float(row.get("dyson_voc_index"))) is not None
    ]
    voc_threshold = percentile(voc_values, 0.9)
    high_voc = [row for row in complete if float(row["dyson_voc_index"]) >= voc_threshold]
    pollutant_relationships = {}
    for field in ("dyson_pm25_ug_m3", "dyson_pm10_ug_m3", "dyson_no2_index"):
        values = [value for row in complete if (value := as_float(row.get(field))) is not None]
        threshold = percentile(values, 0.9)
        overlap = [row for row in high_voc if as_float(row.get(field)) is not None and float(row[field]) >= threshold]
        correlation, count = pearson_pairs(complete, "dyson_voc_index", field)
        pollutant_relationships[field] = {
            "r": correlation,
            "n": count,
            "top_decile_threshold": threshold,
            "high_voc_overlap_fraction": len(overlap) / len(high_voc) if high_voc else None,
        }

    coverage = {
        "joined_rows": len(rows),
        "complete_weather_rows": len(complete),
        "first_timestamp": complete[0]["timestamp_local"],
        "last_timestamp": complete[-1]["timestamp_local"],
        "local_dates": sorted({row["local_date"] for row in complete}),
        "tempest_samples_per_bin_min": min(
            int(float(row["tempest_sample_count"])) for row in complete
        ),
        "tempest_samples_per_bin_median": statistics.median(
            int(float(row["tempest_sample_count"])) for row in complete
        ),
        "tempest_samples_per_bin_max": max(
            int(float(row["tempest_sample_count"])) for row in complete
        ),
        "rainy_bins": sum(
            (as_float(row.get("outdoor_precipitation_in")) or 0) > 0
            for row in complete
        ),
    }
    combined_equals_voc = sum(
        as_float(row.get("dyson_combined_aqi"))
        == as_float(row.get("dyson_voc_index"))
        for row in complete
    )
    outdoor_hourly = outdoor_hourly_rows(complete)
    outdoor_aq = {
        field: {
            "r": pearson_pairs(outdoor_hourly, "dyson_voc_index", field)[0],
            "n_source_hours": pearson_pairs(
                outdoor_hourly, "dyson_voc_index", field
            )[1],
            "minimum": min(
                (
                    value
                    for row in outdoor_hourly
                    if (value := as_float(row.get(field))) is not None
                ),
                default=None,
            ),
            "maximum": max(
                (
                    value
                    for row in outdoor_hourly
                    if (value := as_float(row.get(field))) is not None
                ),
                default=None,
            ),
        }
        for field in OUTDOOR_AQ_ANALYSIS_FIELDS
    }
    outdoor_source_hours = len(
        {
            row.get("source_hour_ending_mst")
            for row in complete
            if row.get("source_hour_ending_mst")
        }
    )
    outdoor_aq_populated = sum(
        as_float(row.get("outdoor_combined_aqi")) is not None for row in complete
    )
    peak_pm10 = max(
        (
            row
            for row in outdoor_hourly
            if as_float(row.get("outdoor_pm10_1h_ug_m3")) is not None
        ),
        key=lambda row: float(row["outdoor_pm10_1h_ug_m3"]),
        default=None,
    )
    peak_pm10_local = (
        datetime.fromisoformat(peak_pm10["source_hour_ending_mst"])
        .astimezone(ZoneInfo(DEFAULT_TIMEZONE))
        .isoformat()
        if peak_pm10
        else None
    )
    summary = {
        "coverage": coverage,
        "zero_lag_correlations": zero_lag,
        "clock_quarter_adjusted_correlations": clock_adjusted,
        "best_lags": best_lags,
        "filter_boundary": filter_boundary.isoformat(),
        "filter_phases": phases,
        "day_types": day_types,
        "hour_matched_day_types": matched_hours,
        "time_of_day_harmonic": harmonic,
        "hour_profile": profile,
        "daily_voc": daily,
        "complete_days_evening_above_midday": {
            "count": evening_above_midday_days,
            "complete_days": len(complete_days),
        },
        "filter_boundary_windows": boundary_windows,
        "voc_top_decile_threshold": voc_threshold,
        "pollutant_relationships": pollutant_relationships,
        "combined_aqi_equals_voc": {
            "rows": combined_equals_voc,
            "total": len(complete),
            "fraction": combined_equals_voc / len(complete),
        },
        "outdoor_air_quality": {
            "populated_15min_slots": outdoor_aq_populated,
            "unique_source_hours": outdoor_source_hours,
            "voc_correlations": outdoor_aq,
            "pm_source": "Boulder-CU/Athens (BOU, AQS 080131001)",
            "ozone_source": "Boulder Reservoir (BOUR, AQS 080130014)",
            "peak_pm10": None
            if peak_pm10 is None
            else {
                "source_hour_ending_local": peak_pm10_local,
                "one_hour_ug_m3": peak_pm10["outdoor_pm10_1h_ug_m3"],
                "rolling_24h_ug_m3": peak_pm10["outdoor_pm10_24h_ug_m3"],
                "pm10_aqi": peak_pm10["outdoor_pm10_aqi"],
                "mean_dyson_voc": peak_pm10["dyson_voc_index"],
            },
        },
    }

    lines = [
        "# Temporary Dyson–Tempest–regional AQ exploratory analysis",
        "",
        "This report is descriptive and does not establish causation. Pearson correlations are",
        "sensitive to shared diurnal structure, autocorrelation, filter age, and the short seven-day",
        "window. Lag scans test 25 offsets and are exploratory rather than significance-adjusted.",
        "",
        "## Coverage",
        "",
        f"- Matched rows: {coverage['complete_weather_rows']} of {coverage['joined_rows']} Dyson slots.",
        f"- Interval: {coverage['first_timestamp']} through {coverage['last_timestamp']}.",
        f"- Dates: {', '.join(coverage['local_dates'])}.",
        f"- Tempest samples per bin: min {coverage['tempest_samples_per_bin_min']}, median "
        f"{coverage['tempest_samples_per_bin_median']}, max {coverage['tempest_samples_per_bin_max']}.",
        f"- Rain occurred in only {coverage['rainy_bins']} of {coverage['complete_weather_rows']} bins.",
        "- Tempest weather is averaged within each 15-minute bin; interval precipitation is summed.",
        "- Wind speed and direction are absent from both the aggregate and joined files.",
        "",
        "## Contemporaneous correlations with Dyson VOC",
        "",
        "| Outdoor variable | Pearson r | n |",
        "|---|---:|---:|",
    ]
    for field in WEATHER_FIELDS:
        item = zero_lag[field]
        lines.append(f"| {WEATHER_LABELS[field]} | {fmt(item['r'])} | {item['n']} |")

    lines.extend(
        [
            "",
            "After subtracting each variable's mean for the same 15-minute clock position across",
            "days, the correlations are:",
            "",
            "| Outdoor variable | Clock-adjusted Pearson r | n |",
            "|---|---:|---:|",
        ]
    )
    for field in WEATHER_FIELDS:
        item = clock_adjusted[field]
        lines.append(f"| {WEATHER_LABELS[field]} | {fmt(item['r'])} | {item['n']} |")

    lines.extend(
        [
            "",
            "## Strongest exploratory lag within ±3 hours",
            "",
            "Positive lag means the outdoor measurement occurred first and VOC followed; negative",
            "lag means the outdoor measurement followed VOC.",
            "",
            "| Outdoor variable | Best lag | Pearson r | n |",
            "|---|---:|---:|---:|",
        ]
    )
    for field in WEATHER_FIELDS:
        item = best_lags[field]
        if item is None:
            lines.append(f"| {WEATHER_LABELS[field]} | n/a | n/a | 0 |")
        else:
            lines.append(
                f"| {WEATHER_LABELS[field]} | {item['lag_minutes']:+d} min | "
                f"{float(item['pearson_r']):.3f} | {item['n']} |"
            )

    lines.extend(
        [
            "",
            "## Fresh carbon filter boundary",
            "",
            f"Boundary assumption: `{filter_boundary.isoformat()}`. Adjust and rerun if the installation",
            "time is known more precisely.",
            "",
            "| Phase | n | Mean VOC | Median VOC |",
            "|---|---:|---:|---:|",
        ]
    )
    for phase in ("pre-filter", "post-filter"):
        item = phases[phase]
        lines.append(
            f"| {phase} | {item['n']} | {fmt(item['voc_mean'], 2)} | "
            f"{fmt(item['voc_median'], 2)} |"
        )
    lines.extend(["", "Immediate boundary windows:", ""])
    for item in boundary_windows:
        lines.append(
            f"- {item['hours']} hours before: mean {fmt(item['before_mean_voc'], 2)} "
            f"(n={item['before_n']}); {item['hours']} hours after: mean "
            f"{fmt(item['after_mean_voc'], 2)} (n={item['after_n']})."
        )

    lines.extend(
        [
            "",
            "## Time of day",
            "",
            f"A 24-hour first-harmonic fit has R²={fmt(harmonic['r_squared'])}, an estimated peak at "
            f"{fmt(harmonic['peak_hour'], 1)} local hour, and amplitude {fmt(harmonic.get('amplitude'), 2)}.",
            "",
            "Highest mean-VOC clock hours: "
            + ", ".join(f"{row['hour']:02d}:00 ({row['mean_voc']:.2f})" for row in highest_hours)
            + ".",
            "",
            "Lowest mean-VOC clock hours: "
            + ", ".join(f"{row['hour']:02d}:00 ({row['mean_voc']:.2f})" for row in lowest_hours)
            + ".",
            "",
            f"Evening mean VOC exceeded midday mean VOC on {evening_above_midday_days} of "
            f"{len(complete_days)} complete days.",
            "",
            "Daily means:",
            "",
            "| Date | n | Daily mean | Midday mean | Evening mean |",
            "|---|---:|---:|---:|---:|",
            "",
        ]
    )
    for item in daily:
        lines.append(
            f"| {item['date']} | {item['n']} | {fmt(item['mean_voc'], 2)} | "
            f"{fmt(item['midday_mean_voc'], 2)} | {fmt(item['evening_mean_voc'], 2)} |"
        )
    lines.extend(
        [
            "",
            "## Weekday versus weekend",
            "",
            "| Group | Dates | n | Mean VOC | Median VOC |",
            "|---|---|---:|---:|---:|",
        ]
    )
    for day_type in ("weekday", "weekend"):
        item = day_types[day_type]
        lines.append(
            f"| {day_type} | {', '.join(item['dates'])} | {item['n']} | "
            f"{fmt(item['voc_mean'], 2)} | {fmt(item['voc_median'], 2)} |"
        )
    lines.extend(
        [
            "",
            f"Across the {len(matched_hours['shared_hours'])} clock hours represented in both groups, "
            f"the hour-balanced means are weekday={fmt(matched_hours['weekday_hour_balanced_mean'], 2)} "
            f"and weekend={fmt(matched_hours['weekend_hour_balanced_mean'], 2)}. The weekend sample is "
            "only one complete Sunday plus a partial Saturday, so this comparison is provisional.",
            "",
            "## Other Dyson pollutants during VOC excursions",
            "",
            f"A VOC excursion is defined here as the top decile (VOC ≥ {voc_threshold:.2f}).",
            f"Combined AQI exactly equals the VOC index in {combined_equals_voc} of "
            f"{len(complete)} rows ({combined_equals_voc / len(complete) * 100:.1f}%).",
            "",
            "| Pollutant | Correlation with VOC | Top-decile overlap during high VOC |",
            "|---|---:|---:|",
        ]
    )
    pollutant_labels = {
        "dyson_pm25_ug_m3": "PM2.5",
        "dyson_pm10_ug_m3": "PM10",
        "dyson_no2_index": "NO2 index",
    }
    for field, label in pollutant_labels.items():
        item = pollutant_relationships[field]
        overlap = item["high_voc_overlap_fraction"]
        lines.append(
            f"| {label} | {fmt(item['r'])} | "
            f"{'n/a' if overlap is None else f'{overlap * 100:.1f}%'} |"
        )
    lines.extend(
        [
            "",
            "Individual Dyson pollutant columns remain in the joined dataset so apparent VOC-only",
            "events can be inspected directly rather than inferred from the combined AQI.",
            "",
            "## Regional outdoor air quality comparators",
            "",
            "CDPHE hourly observations are repeated across the four 15-minute bins summarized by",
            "each source hour. PM2.5 and PM10 come from Boulder-CU/Athens (BOU, AQS 080131001);",
            "ozone comes from Boulder Reservoir (BOUR, AQS 080130014). The combined outdoor AQI is",
            "the maximum available pollutant-specific AQI across those two regional sites, so it is a",
            "regional indicator rather than a single colocated instrument. BOU is about 5,322 ft",
            "and BOUR about 5,203 ft, versus roughly 7,200 ft at the Tempest/home site. The nearly",
            "2,000-ft elevation difference and foothills terrain can materially limit representativeness.",
            "",
            f"Populated coverage: {outdoor_aq_populated} 15-minute slots representing "
            f"{outdoor_source_hours} unique source hours.",
            "",
            "Correlations below first average Dyson VOC within each source hour so repeated CDPHE",
            "values are not treated as independent 15-minute measurements.",
            "",
            "| Outdoor air-quality variable | Range | Pearson r with Dyson VOC | Source hours |",
            "|---|---:|---:|---:|",
        ]
    )
    for field in OUTDOOR_AQ_ANALYSIS_FIELDS:
        item = outdoor_aq[field]
        lines.append(
            f"| {OUTDOOR_AQ_LABELS[field]} | {fmt(item['minimum'], 1)}–"
            f"{fmt(item['maximum'], 1)} | {fmt(item['r'])} | "
            f"{item['n_source_hours']} |"
        )
    if peak_pm10 is not None:
        lines.extend(
            [
                "",
                f"The largest regional one-hour PM10 value was "
                f"{fmt(peak_pm10['outdoor_pm10_1h_ug_m3'], 0)} µg/m³ for the hour ending "
                f"{peak_pm10_local}; its rolling 24-hour PM10 concentration was "
                f"{fmt(peak_pm10['outdoor_pm10_24h_ug_m3'], 0)} µg/m³ (AQI "
                f"{fmt(peak_pm10['outdoor_pm10_aqi'], 0)}). This short preliminary spike should "
                "be treated as a regional event flag, not evidence of conditions at the foothills home.",
            ]
        )
    lines.extend(
        [
            "",
            "These correlations are descriptive only, and neither regulatory site is colocated with",
            "the home.",
            "CDPHE marks the real-time values as preliminary, uncorrected, and unvalidated.",
            "",
        ]
    )
    return "\n".join(lines), summary


def run(args: argparse.Namespace) -> None:
    if not args.dyson_csv.exists():
        raise AnalysisError(f"Dyson input not found: {args.dyson_csv}")
    tempest_paths = sorted(args.tempest_dir.glob("2026-09-*.csv"))
    tempest_paths = [
        path for path in tempest_paths if "2026-09-20" <= path.stem <= "2026-09-26"
    ]
    if not tempest_paths:
        raise AnalysisError(f"No Tempest daily CSVs found in {args.tempest_dir}")
    boundary = datetime.fromisoformat(args.filter_boundary)
    if boundary.tzinfo is None:
        raise AnalysisError("--filter-boundary must include its UTC offset.")

    tempest = aggregate_tempest(tempest_paths, args.timezone)
    dyson = read_csv_rows(args.dyson_csv)
    outdoor_aq = (
        read_csv_rows(args.outdoor_aq_csv) if args.outdoor_aq_csv.exists() else []
    )
    joined = join_data(dyson, tempest, boundary, outdoor_aq)
    lag_rows = lag_correlations(joined)
    report, summary = build_report(joined, lag_rows, boundary)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    tempest_fields = [
        "timestamp_utc",
        "timestamp_local",
        *WEATHER_FIELDS,
        "tempest_sample_count",
    ]
    write_csv(args.output_dir / "tempest-15min.csv", tempest, tempest_fields)
    write_csv(args.output_dir / "dyson-tempest-joined.csv", joined, JOIN_COLUMNS)
    write_csv(
        args.output_dir / "lag-correlations.csv",
        lag_rows,
        ["weather_field", "lag_minutes", "pearson_r", "n"],
    )
    (args.output_dir / "analysis-report.md").write_text(report, encoding="utf-8")
    (args.output_dir / "analysis-summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    print(report)
    print(f"\nTemporary outputs: {args.output_dir}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dyson-csv", type=Path, default=DEFAULT_DYSON_CSV)
    parser.add_argument("--tempest-dir", type=Path, default=DEFAULT_TEMPEST_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument(
        "--outdoor-aq-csv", type=Path, default=DEFAULT_OUTDOOR_AQ_CSV
    )
    parser.add_argument("--timezone", default=DEFAULT_TIMEZONE)
    parser.add_argument("--filter-boundary", default=DEFAULT_FILTER_BOUNDARY)
    return parser


def main(argv: list[str] | None = None) -> int:
    try:
        run(build_parser().parse_args(argv))
    except (AnalysisError, OSError, ValueError) as error:
        print(f"error: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

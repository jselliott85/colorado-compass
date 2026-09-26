#!/usr/bin/env python3
"""Fetch and normalize personal Tempest weather-station observations."""

from __future__ import annotations

import argparse
import csv
import getpass
import json
import math
import os
import statistics
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


API_BASE = "https://swd.weatherflow.com/swd/rest"
DEFAULT_TIMEZONE = "America/Denver"
KEYCHAIN_SERVICE = "co-compass-tempest"
PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT_DIR = PROJECT_DIR / "data" / "tempest"
DEFAULT_RAW_DIR = PROJECT_DIR / "raw"

CSV_COLUMNS = [
    "timestamp_local",
    "timestamp_utc",
    "temperature_f",
    "relative_humidity_pct",
    "dew_point_f",
    "station_pressure_mb",
    "solar_radiation_w_m2",
    "illuminance_lux",
    "uv_index",
    "precipitation_in",
    "precipitation_type",
    "lightning_strike_count",
    "lightning_avg_distance_mi",
    "battery_volts",
    "report_interval_minutes",
]


class TempestError(RuntimeError):
    """A safe-to-display Tempest integration error."""


def load_local_env(path: Path) -> None:
    """Load TEMPEST_TOKEN from a local .env without overriding the shell."""
    if not path.exists() or os.environ.get("TEMPEST_TOKEN"):
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == "TEMPEST_TOKEN":
            value = value.strip().strip("\"").strip("'")
            if value:
                os.environ["TEMPEST_TOKEN"] = value
            return


def require_token() -> str:
    token = os.environ.get("TEMPEST_TOKEN", "").strip()
    if not token:
        token = keychain_token()
    if not token:
        raise TempestError(
            "No Tempest token was found. Add it to macOS Keychain, export TEMPEST_TOKEN "
            "in your shell, or add it to the ignored side-project .env file."
        )
    return token


def keychain_token() -> str:
    """Read the token from macOS Keychain without exposing it in process arguments."""
    if sys.platform != "darwin":
        return ""
    try:
        result = subprocess.run(
            [
                "security",
                "find-generic-password",
                "-a",
                getpass.getuser(),
                "-s",
                KEYCHAIN_SERVICE,
                "-w",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


def api_get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    """Call Tempest without ever including the credential in an error message."""
    query = urllib.parse.urlencode({**params, "token": require_token()})
    request = urllib.request.Request(
        f"{API_BASE}/{path.lstrip('/')}?{query}",
        headers={"Accept": "application/json", "User-Agent": "tempest-air-quality/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        raise TempestError(f"Tempest API request failed with HTTP {error.code}.") from None
    except urllib.error.URLError as error:
        reason = getattr(error, "reason", "network error")
        raise TempestError(f"Could not reach the Tempest API: {reason}") from None
    except json.JSONDecodeError:
        raise TempestError("Tempest API returned an invalid JSON response.") from None

    status = payload.get("status", {})
    if status.get("status_code") not in (None, 0):
        message = status.get("status_message", "unknown API error")
        raise TempestError(f"Tempest API error: {message}")
    return payload


def sanitized_station(station: dict[str, Any]) -> dict[str, Any]:
    """Keep useful IDs/metadata while omitting network and precise-location data."""
    devices = []
    for device in station.get("devices", []):
        meta = device.get("device_meta") or {}
        devices.append(
            {
                "device_id": device.get("device_id"),
                "device_type": device.get("device_type"),
                "name": meta.get("name"),
                "environment": meta.get("environment"),
                "hardware_revision": device.get("hardware_revision"),
                "firmware_revision": device.get("firmware_revision"),
            }
        )
    return {
        "station_id": station.get("station_id"),
        "name": station.get("name"),
        "public_name": station.get("public_name"),
        "elevation_m": (station.get("station_meta") or {}).get("elevation"),
        "devices": devices,
    }


def get_stations() -> list[dict[str, Any]]:
    payload = api_get("stations", {})
    stations = payload.get("stations") or payload.get("locations") or []
    if not stations:
        raise TempestError("Authentication succeeded, but the account returned no stations.")
    return stations


def discover(output_dir: Path) -> None:
    stations = get_stations()
    safe_metadata = [sanitized_station(station) for station in stations]
    output_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = output_dir / "station-metadata.json"
    metadata_path.write_text(json.dumps(safe_metadata, indent=2) + "\n", encoding="utf-8")

    print(f"Authentication succeeded; found {len(stations)} station(s).")
    for station in safe_metadata:
        print(
            f"station {station['station_id']}: "
            f"{station.get('name') or station.get('public_name') or '(unnamed)'}"
        )
        for device in station["devices"]:
            print(
                f"  device {device['device_id']}: "
                f"type={device.get('device_type') or 'unknown'}, "
                f"environment={device.get('environment') or 'unknown'}, "
                f"name={device.get('name') or '(unnamed)'}"
            )
    print(f"Saved non-sensitive metadata to {metadata_path}")


def find_device(
    stations: list[dict[str, Any]],
    station_id: int | None,
    device_id: int | None,
) -> tuple[int, int]:
    if station_id is not None:
        matches = [station for station in stations if station.get("station_id") == station_id]
        if not matches:
            raise TempestError(f"Station {station_id} is not associated with this account.")
    elif len(stations) == 1:
        matches = stations
    else:
        ids = ", ".join(str(station.get("station_id")) for station in stations)
        raise TempestError(f"Multiple stations found ({ids}); pass --station-id.")

    station = matches[0]
    devices = station.get("devices") or []
    if device_id is not None:
        device_matches = [device for device in devices if device.get("device_id") == device_id]
        if not device_matches:
            raise TempestError(f"Device {device_id} does not belong to station {station['station_id']}.")
        return station["station_id"], device_id

    candidates = []
    for device in devices:
        meta = device.get("device_meta") or {}
        device_type = str(device.get("device_type") or "").upper()
        serial = str(device.get("serial_number") or "").upper()
        is_tempest = device_type in {"ST", "TEMPEST"} or serial.startswith("ST-")
        is_outdoor = meta.get("environment") in (None, "outdoor")
        if device.get("device_id") is not None and is_tempest and is_outdoor:
            candidates.append(device)

    if len(candidates) != 1:
        ids = ", ".join(str(device.get("device_id")) for device in devices)
        raise TempestError(
            "Could not uniquely select the outdoor Tempest device. "
            f"Available device IDs: {ids or 'none'}; pass --device-id."
        )
    return station["station_id"], candidates[0]["device_id"]


def parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise argparse.ArgumentTypeError("dates must use YYYY-MM-DD") from None


def requested_dates(single: date | None, start: date | None, end: date | None) -> list[date]:
    if single:
        if start or end:
            raise TempestError("Use either --date or --start/--end, not both.")
        return [single]
    if start is None or end is None:
        raise TempestError("Pass --date, or pass both --start and --end.")
    if end < start:
        raise TempestError("--end must be on or after --start.")
    count = (end - start).days + 1
    return [start + timedelta(days=offset) for offset in range(count)]


def local_day_bounds(day: date, timezone_name: str) -> tuple[int, int]:
    zone = ZoneInfo(timezone_name)
    start = datetime.combine(day, datetime.min.time(), tzinfo=zone)
    end = datetime.combine(day + timedelta(days=1), datetime.min.time(), tzinfo=zone)
    return int(start.timestamp()), int(end.timestamp())


def c_to_f(value: float | None) -> float | None:
    return None if value is None else (value * 9 / 5) + 32


def mm_to_in(value: float | None) -> float | None:
    return None if value is None else value / 25.4


def km_to_mi(value: float | None) -> float | None:
    return None if value is None else value * 0.621371


def dew_point_c(temp_c: float | None, rh_pct: float | None) -> float | None:
    if temp_c is None or rh_pct is None or rh_pct <= 0:
        return None
    # Magnus formula; suitable for ordinary near-surface weather observations.
    alpha = math.log(rh_pct / 100.0) + (17.625 * temp_c) / (243.04 + temp_c)
    return (243.04 * alpha) / (17.625 - alpha)


def at(values: list[Any], index: int) -> Any:
    return values[index] if index < len(values) else None


def rounded(value: float | None, digits: int = 3) -> float | str:
    return "" if value is None else round(value, digits)


def normalize_tempest_observation(values: list[Any], zone: ZoneInfo) -> dict[str, Any]:
    epoch = int(at(values, 0))
    instant = datetime.fromtimestamp(epoch, tz=timezone.utc)
    temp_c = at(values, 7)
    rh = at(values, 8)
    corrected_rain_mm = at(values, 19)
    rain_mm = corrected_rain_mm if corrected_rain_mm is not None else at(values, 12)
    return {
        "timestamp_local": instant.astimezone(zone).isoformat(),
        "timestamp_utc": instant.isoformat().replace("+00:00", "Z"),
        "temperature_f": rounded(c_to_f(temp_c), 2),
        "relative_humidity_pct": rounded(rh, 2),
        "dew_point_f": rounded(c_to_f(dew_point_c(temp_c, rh)), 2),
        "station_pressure_mb": rounded(at(values, 6), 2),
        "solar_radiation_w_m2": rounded(at(values, 11), 2),
        "illuminance_lux": rounded(at(values, 9), 2),
        "uv_index": rounded(at(values, 10), 2),
        "precipitation_in": rounded(mm_to_in(rain_mm), 5),
        "precipitation_type": at(values, 13) if at(values, 13) is not None else "",
        "lightning_strike_count": at(values, 15) if at(values, 15) is not None else "",
        "lightning_avg_distance_mi": rounded(km_to_mi(at(values, 14)), 2),
        "battery_volts": rounded(at(values, 16), 3),
        "report_interval_minutes": at(values, 17) if at(values, 17) is not None else "",
    }


def normalize_observations(
    payload: dict[str, Any], start_epoch: int, end_epoch: int, timezone_name: str
) -> list[dict[str, Any]]:
    observation_type = payload.get("type")
    if observation_type != "obs_st":
        raise TempestError(
            f"Expected a Tempest obs_st response, received {observation_type or 'unknown type'}."
        )
    zone = ZoneInfo(timezone_name)
    observations = payload.get("obs") or []
    unique: dict[int, list[Any]] = {}
    for values in observations:
        if values and start_epoch <= int(values[0]) < end_epoch:
            unique[int(values[0])] = values
    return [normalize_tempest_observation(unique[key], zone) for key in sorted(unique)]


def write_csv(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def numeric_values(rows: list[dict[str, Any]], field: str) -> list[float]:
    return [float(row[field]) for row in rows if row[field] != ""]


def format_range(values: list[float], suffix: str) -> str:
    return "missing" if not values else f"{min(values):.1f}{suffix} to {max(values):.1f}{suffix}"


def summarize(day: date, rows: list[dict[str, Any]]) -> str:
    lines = [day.isoformat(), f"records: {len(rows)}"]
    if not rows:
        lines.append("no observations returned")
        return "\n".join(lines)

    temps = numeric_values(rows, "temperature_f")
    humidity = numeric_values(rows, "relative_humidity_pct")
    solar = numeric_values(rows, "solar_radiation_w_m2")
    rain = numeric_values(rows, "precipitation_in")
    epochs = [datetime.fromisoformat(row["timestamp_utc"].replace("Z", "+00:00")).timestamp() for row in rows]
    intervals = [round((right - left) / 60) for left, right in zip(epochs, epochs[1:]) if right > left]
    cadence = Counter(intervals).most_common(1)[0][0] if intervals else None
    gaps = sum(1 for interval in intervals if cadence and interval > cadence * 1.5)

    lines.extend(
        [
            f"temperature range: {format_range(temps, ' F')}",
            f"RH range: {format_range(humidity, '%')}",
            f"max solar radiation: {max(solar):.1f} W/m2" if solar else "max solar radiation: missing",
            f"precipitation total: {sum(rain):.3f} in" if rain else "precipitation total: missing",
            f"typical cadence: {cadence} minute(s)" if cadence else "typical cadence: unavailable",
            f"gaps above cadence: {gaps}",
        ]
    )
    missing = [
        f"{field}={sum(1 for row in rows if row[field] == '')}"
        for field in CSV_COLUMNS[2:]
        if any(row[field] == "" for row in rows)
    ]
    lines.append("missing values: " + (", ".join(missing) if missing else "none"))
    plausibility = []
    if temps and (min(temps) < -80 or max(temps) > 140):
        plausibility.append("temperature outside broad physical bounds")
    if humidity and (min(humidity) < 0 or max(humidity) > 100):
        plausibility.append("RH outside 0-100%")
    if rain and any(value < 0 for value in rain):
        plausibility.append("negative precipitation")
    lines.append("plausibility checks: " + ("; ".join(plausibility) if plausibility else "passed"))
    return "\n".join(lines)


def fetch(args: argparse.Namespace) -> None:
    days = requested_dates(args.date, args.start, args.end)
    stations = get_stations()
    station_id, device_id = find_device(stations, args.station_id, args.device_id)
    print(f"Using station {station_id}, device {device_id}; timezone {args.timezone}.")
    print("Wind fields are bundled by the API but intentionally excluded as unreliable.")

    summaries = []
    for day in days:
        start_epoch, end_epoch = local_day_bounds(day, args.timezone)
        payload = api_get(
            f"observations/device/{device_id}",
            {"time_start": start_epoch, "time_end": end_epoch},
        )
        args.raw_dir.mkdir(parents=True, exist_ok=True)
        raw_path = args.raw_dir / f"{day.isoformat()}.json"
        raw_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

        rows = normalize_observations(payload, start_epoch, end_epoch, args.timezone)
        csv_path = args.output_dir / f"{day.isoformat()}.csv"
        write_csv(csv_path, rows)
        summary = summarize(day, rows)
        summaries.append(summary)
        print(f"\n{summary}\nCSV: {csv_path}")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    summary_path = args.output_dir / "validation-summary.txt"
    summary_path.write_text("\n\n".join(summaries) + "\n", encoding="utf-8")
    print(f"\nValidation summary: {summary_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--env-file",
        type=Path,
        default=PROJECT_DIR / ".env",
        help="local ignored env file (default: %(default)s)",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    discover_parser = subparsers.add_parser("discover", help="verify auth and list station/device IDs")
    discover_parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)

    fetch_parser = subparsers.add_parser("fetch", help="fetch and normalize historical observations")
    date_group = fetch_parser.add_mutually_exclusive_group(required=True)
    date_group.add_argument("--date", type=parse_date, help="one local date (YYYY-MM-DD)")
    date_group.add_argument("--start", type=parse_date, help="first local date (requires --end)")
    fetch_parser.add_argument("--end", type=parse_date, help="last local date, inclusive")
    fetch_parser.add_argument("--station-id", type=int)
    fetch_parser.add_argument("--device-id", type=int)
    fetch_parser.add_argument("--timezone", default=DEFAULT_TIMEZONE)
    fetch_parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    fetch_parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    load_local_env(args.env_file)
    try:
        if args.command == "discover":
            discover(args.output_dir)
        else:
            fetch(args)
    except (TempestError, OSError, ZoneInfoNotFoundError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

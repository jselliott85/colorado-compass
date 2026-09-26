#!/usr/bin/env python3
"""Fetch regional CDPHE regulatory air-quality history into 15-minute analysis bins."""

from __future__ import annotations

import argparse
import csv
import html
import math
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT = PROJECT_DIR / "tmp" / "cdphe-outdoor-air-quality-15min.csv"
DEFAULT_RAW_DIR = PROJECT_DIR / "tmp" / "cdphe-raw"
DEFAULT_TIMEZONE = "America/Denver"
CDPHE_BASE_URL = "https://www.colorado.gov/airquality/param_summary.aspx"
MST = timezone(timedelta(hours=-7), name="MST")


@dataclass(frozen=True)
class Parameter:
    slug: str
    code: str
    site: str
    site_name: str
    aqs_id: str
    value_fields: tuple[str, str, str]


PARAMETERS = (
    Parameter(
        slug="pm25",
        code="88101",
        site="BOU",
        site_name="Boulder-CU/Athens",
        aqs_id="080131001",
        value_fields=(
            "outdoor_pm25_1h_ug_m3",
            "outdoor_pm25_24h_ug_m3",
            "outdoor_pm25_aqi",
        ),
    ),
    Parameter(
        slug="pm10",
        code="81102",
        site="BOU",
        site_name="Boulder-CU/Athens",
        aqs_id="080131001",
        value_fields=(
            "outdoor_pm10_1h_ug_m3",
            "outdoor_pm10_24h_ug_m3",
            "outdoor_pm10_aqi",
        ),
    ),
    Parameter(
        slug="ozone",
        code="44201",
        site="BOUR",
        site_name="Boulder Reservoir",
        aqs_id="080130014",
        value_fields=(
            "outdoor_ozone_1h_ppb",
            "outdoor_ozone_8h_ppb",
            "outdoor_ozone_aqi",
        ),
    ),
)

OUTPUT_FIELDS = [
    "timestamp_utc",
    "timestamp_local",
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


class OutdoorAQError(RuntimeError):
    pass


def numeric_text(value: str) -> str:
    cleaned = value.strip().replace("\xa0", "")
    if not cleaned or cleaned == "-":
        return ""
    try:
        number = float(cleaned)
    except ValueError:
        return ""
    if not math.isfinite(number):
        return ""
    return str(int(number)) if number.is_integer() else str(number)


def parse_parameter_page(
    page: str, parameter: Parameter
) -> tuple[date, list[dict[str, Any]]]:
    date_match = re.search(
        r"Hourly averages.*?for\s+(\d{2}/\d{2}/\d{4})", page, re.DOTALL
    )
    if not date_match:
        raise OutdoorAQError(f"Could not find the source date for {parameter.slug}.")
    source_date = datetime.strptime(date_match.group(1), "%m/%d/%Y").date()

    site_pattern = re.compile(
        r"onclick=\"table_highlight\('cell', 'col',\s*(\d+)\);\"[^>]*>"
        + r"(?:\*\*)?"
        + re.escape(parameter.site)
        + r"</td>"
    )
    site_match = site_pattern.search(page)
    if not site_match:
        raise OutdoorAQError(
            f"Site {parameter.site} is absent from the {parameter.slug} page for {source_date}."
        )
    column = site_match.group(1)

    cell_pattern = re.compile(
        rf'id="cell(\d+)-{re.escape(column)}"[^>]*>(.*?)</td>', re.DOTALL
    )
    parsed: list[dict[str, Any]] = []
    for match in cell_pattern.finditer(page):
        hour_row = int(match.group(1))
        if not 1 <= hour_row <= 24:
            continue
        content = re.sub(r"<br\s*/?>", "|", match.group(2), flags=re.IGNORECASE)
        content = html.unescape(re.sub(r"<[^>]+>", "", content))
        values = content.split("|")
        values = (values + ["", "", ""])[:3]
        hour_ending = datetime.combine(source_date, time.min, tzinfo=MST) + timedelta(
            hours=hour_row
        )
        row: dict[str, Any] = {
            "hour_ending": hour_ending,
            "source_hour_ending_mst": hour_ending.isoformat(),
        }
        row.update(
            {
                field: numeric_text(value)
                for field, value in zip(parameter.value_fields, values)
            }
        )
        parsed.append(row)
    if len(parsed) != 24:
        raise OutdoorAQError(
            f"Expected 24 hourly rows for {parameter.slug} on {source_date}; found {len(parsed)}."
        )
    return source_date, parsed


def page_url(parameter: Parameter, source_date: date) -> str:
    query = urllib.parse.urlencode(
        {
            "parametercode": parameter.code,
            "seeddate": source_date.strftime("%m/%d/%Y"),
            "export": "False",
        }
    )
    return f"{CDPHE_BASE_URL}?{query}"


def fetch_page(parameter: Parameter, source_date: date, raw_dir: Path) -> str:
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / f"{source_date.isoformat()}-{parameter.slug}.html"
    request = urllib.request.Request(
        page_url(parameter, source_date),
        headers={"User-Agent": "co-compass-air-quality/0.1 (read-only analysis)"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            page = response.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as error:
        raise OutdoorAQError(
            f"CDPHE request failed for {parameter.slug} on {source_date}: {error}"
        ) from error
    path.write_text(page, encoding="utf-8")
    return page


def combine_hourly(
    records: dict[tuple[datetime, str], dict[str, Any]],
    start: date,
    end: date,
    timezone_name: str,
) -> list[dict[str, Any]]:
    zone = ZoneInfo(timezone_name)
    hours = sorted({hour for hour, _ in records})
    rows: list[dict[str, Any]] = []
    for hour_ending in hours:
        combined: dict[str, Any] = {
            "source_hour_ending_mst": hour_ending.isoformat(),
            "source_resolution_minutes": 60,
            "pm_station": "Boulder-CU/Athens",
            "pm_station_aqs_id": "080131001",
            "ozone_station": "Boulder Reservoir",
            "ozone_station_aqs_id": "080130014",
        }
        for parameter in PARAMETERS:
            combined.update(records.get((hour_ending, parameter.slug), {}))

        aqi_candidates = []
        for pollutant, field in (
            ("PM2.5", "outdoor_pm25_aqi"),
            ("PM10", "outdoor_pm10_aqi"),
            ("ozone", "outdoor_ozone_aqi"),
        ):
            value = numeric_text(str(combined.get(field, "")))
            if value:
                aqi_candidates.append((float(value), pollutant))
        if aqi_candidates:
            value, pollutant = max(aqi_candidates)
            combined["outdoor_combined_aqi"] = (
                str(int(value)) if value.is_integer() else str(value)
            )
            combined["outdoor_combined_aqi_pollutant"] = pollutant
        else:
            combined["outdoor_combined_aqi"] = ""
            combined["outdoor_combined_aqi_pollutant"] = ""

        # CDPHE labels an hourly average by its hour ending. Repeat that one-hour
        # observation over the four 15-minute bins it summarizes.
        for offset in (60, 45, 30, 15):
            instant = hour_ending - timedelta(minutes=offset)
            local = instant.astimezone(zone)
            if not start <= local.date() <= end:
                continue
            row = dict(combined)
            row["timestamp_utc"] = instant.astimezone(timezone.utc).isoformat().replace(
                "+00:00", "Z"
            )
            row["timestamp_local"] = local.isoformat()
            rows.append(row)
    rows.sort(key=lambda row: row["timestamp_utc"])
    return rows


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def iter_dates(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def run(args: argparse.Namespace) -> None:
    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)
    if end < start:
        raise OutdoorAQError("--end must be on or after --start.")

    records: dict[tuple[datetime, str], dict[str, Any]] = {}
    # The public tables are fixed MST. During daylight time, the prior MST date
    # contains the first local-hour data needed for the requested local date.
    for source_date in iter_dates(start - timedelta(days=1), end):
        for parameter in PARAMETERS:
            page = fetch_page(parameter, source_date, args.raw_dir)
            _, hourly = parse_parameter_page(page, parameter)
            for row in hourly:
                hour_ending = row.pop("hour_ending")
                records[(hour_ending, parameter.slug)] = row

    rows = combine_hourly(records, start, end, args.timezone)
    write_csv(args.output, rows)
    populated = sum(bool(row.get("outdoor_combined_aqi")) for row in rows)
    print(f"Wrote {len(rows)} 15-minute rows to {args.output}")
    print(f"Rows with at least one reported pollutant AQI: {populated}")
    print("PM source: Boulder-CU/Athens (BOU, AQS 080131001)")
    print("Ozone source: Boulder Reservoir (BOUR, AQS 080130014)")
    print("CDPHE values are preliminary real-time data and are not corrected or validated.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", required=True, help="First local date (YYYY-MM-DD)")
    parser.add_argument("--end", required=True, help="Last local date (YYYY-MM-DD)")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    parser.add_argument("--timezone", default=DEFAULT_TIMEZONE)
    return parser


def main(argv: list[str] | None = None) -> int:
    try:
        run(build_parser().parse_args(argv))
    except (OutdoorAQError, OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

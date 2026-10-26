#!/usr/bin/env python3
"""One-time Garmin weight capture. No Sheets writes, schedules or activity calls."""
from __future__ import annotations

import argparse
import json
import math
import os
import re
from pathlib import Path
import subprocess
import ssl
import sys
from datetime import date, datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import uuid4
from zoneinfo import ZoneInfo

BASE = "https://personal.connectapi.garmin.com"
TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token"
SERVICE = "nutrition-os.garmin.personal-api"
ACCOUNT = "nutrition-os"
BODY_METRIC_PROFILE_VERSION = "garmin-index-s2/1.0"
PRIVATE_DIR = Path(__file__).resolve().parent / "local" / "garmin"


class ValidationError(Exception):
    """Safe-to-display error without credentials or provider response bodies."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValidationError("Provider redirect refused; verify the official API endpoint.")


def keychain_key():
    result = subprocess.run(
        ["/usr/bin/security", "find-generic-password", "-a", ACCOUNT, "-s", SERVICE, "-w"],
        capture_output=True, check=False,
    )
    if result.returncode or not result.stdout.strip():
        raise ValidationError("Keychain item unavailable. Store the key locally using GARMIN_SETUP.md.")
    return result.stdout.decode().strip()


def request_json(path, authorization, *, method="GET", expect_json=True):
    # Fixed provider host, no redirect, no credentials in URL/process arguments/logs.
    req = Request(BASE + path, headers={"Authorization": authorization, "Accept": "application/json" if expect_json else "*/*"}, method=method)
    try:
        with build_opener(NoRedirect()).open(req, timeout=30) as response:
            raw = response.read(5_000_001)
    except HTTPError as exc:
        stage = "token exchange" if path == TOKEN_PATH else "weight read"
        raise ValidationError(f"Garmin {stage} failed (HTTP {exc.code}); response body suppressed.") from None
    except (URLError, TimeoutError, OSError):
        raise ValidationError("Garmin connection failed; no response or credential details displayed.") from None
    if len(raw) > 5_000_000:
        raise ValidationError("Response too large for a small validation window.")
    try:
        return json.loads(raw) if expect_json else raw.decode().strip()
    except (ValueError, UnicodeError):
        raise ValidationError("Provider response was not valid JSON; body suppressed.") from None


def bearer_text(value):
    # Garmin's official client reads token response.text, not JSON access_token.
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", value):
        raise ValidationError("Token response differed from the documented bearer format; values suppressed.")
    return value


def parse_instant(value, *, encoding=None):
    if encoding == "unix_ms":
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValidationError("Explicit Unix-millisecond timestamp must be an integer.")
        try:
            return datetime.fromtimestamp(value / 1000, timezone.utc)
        except (ValueError, OverflowError, OSError):
            raise ValidationError("Unix-millisecond timestamp is outside the supported range.") from None
    if not isinstance(value, str):
        raise ValidationError("Measurement timestamp differs from documented date-time string; inspect privately.")
    try:
        instant = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValidationError("Measurement timestamp format needs private validation.") from None
    if instant.tzinfo is None or instant.utcoffset() is None:
        raise ValidationError("Measurement timestamp lacks an offset; do not invent an instant.")
    return instant.astimezone(timezone.utc)


def weight_to_kg(value, verified_unit):
    """Use only after the actual provider unit is verified against Connect."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        raise ValidationError("Weight must be a finite positive number.")
    factors = {"kg": 1, "g": 0.001, "lb": 0.45359237}
    if verified_unit not in factors:
        raise ValidationError("Weight unit is unverified; conversion refused.")
    return value * factors[verified_unit]


def inspect_records(records):
    if not isinstance(records, list) or any(not isinstance(r, dict) for r in records):
        raise ValidationError("All-measurements response shape differs from documented array; inspect privately.")
    timestamps = []
    valid_weights = 0
    timestamp_failures = 0
    for record in records:
        w = record.get("weight")
        if isinstance(w, (int, float)) and not isinstance(w, bool) and math.isfinite(w) and w > 0:
            valid_weights += 1
        try:
            timestamps.append(parse_instant(record.get("timestampGMT")).isoformat())
        except ValidationError:
            timestamp_failures += 1
    return {
        "validation_state": "observations_available_for_review" if records else "no_in_window_measurements",
        "record_count": len(records),
        "positive_numeric_weights": valid_weights,
        "timestamp_parse_failures": timestamp_failures,
        "duplicate_exact_instants": len(timestamps) - len(set(timestamps)),
        "field_names": sorted({key for record in records for key in record}),
        "nonnull_body_fields": {key: sum(r.get(key) is not None for r in records)
                                for key in ("bodyFat", "bodyWater", "muscleMass", "boneMass")},
        "units_verified_against_connect": False,
        "stable_identity_verified": False,
        "body_composition_import_enabled": False,
        "sheet_writes": False,
    }


def normalize_index_s2(record, *, observed_at_utc):
    """Account profile confirmed against Connect. Stages data; never writes Sheets.

    Profile garmin-index-s2/1.0: grams; percentages in 0..100; UTC Unix ms.
    Do not apply this profile to a different account/provider without validation.
    """
    source_id = record.get("samplePk")
    if isinstance(source_id, bool) or not isinstance(source_id, (str, int)) or not str(source_id).isdigit():
        raise ValidationError("Exact provider samplePk is required; do not invent a measurement ID.")
    if record.get("sourceType") != "INDEX_SCALE":
        raise ValidationError("Unverified non-Index record excluded from the Index S2 profile.")
    instant = parse_instant(record.get("timestampGMT"), encoding="unix_ms")
    def optional_number(key, *, percentage=False, mass=False):
        value = record.get(key)
        if value is None:
            return None
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValidationError("Invalid body metric; do not replace it with zero.")
        if percentage and value > 100:
            raise ValidationError("Percentage outside validated 0..100 units.")
        return value / 1000 if mass else value
    return {
        "measurement_id": "garmin:" + str(source_id),  # Local namespace, not a fabricated Garmin ID.
        "local_date": instant.astimezone(ZoneInfo("America/Denver")).date().isoformat(),
        "weight_kg": weight_to_kg(record.get("weight"), "g"),
        "body_fat_pct": optional_number("bodyFat", percentage=True),
        "body_water_pct": optional_number("bodyWater", percentage=True),
        "muscle_mass_kg": optional_number("muscleMass", mass=True),
        "bone_mass_kg": optional_number("boneMass", mass=True),
        "measured_at_utc": instant.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "time_precision": "exact",
        "measurement_method": "scale_weight;bioimpedance_estimates",
        "device": "Garmin Index S2 (user-confirmed)",
        "source": "garmin_personal_api",
        "source_id": str(source_id),
        "recorded_at_utc": observed_at_utc,
        "updated_at_utc": observed_at_utc,
        "revision": 1,
        "status": "active",
        "correction_reason": None,
        "bmi": optional_number("bmi"),
        "source_record_json": json.dumps(record, sort_keys=True, separators=(",", ":")),
    }


def reconcile_measurement(existing, candidate):
    """Plan an upsert by real source ID. No I/O, deletion or blanket overwrites."""
    matches = [r for r in existing if r.get("source") == candidate["source"] and r.get("source_id") == candidate["source_id"]]
    if len(matches) > 1:
        raise ValidationError("Duplicate source IDs already exist; stop for review.")
    if not matches:
        if any(r.get("measurement_id") == candidate["measurement_id"] for r in existing):
            raise ValidationError("Local measurement ID collides with another source.")
        return "insert", candidate
    old = matches[0]
    ignored = {"recorded_at_utc", "updated_at_utc", "revision", "correction_reason", "measurement_id"}
    if all(old.get(k) == v for k, v in candidate.items() if k not in ignored):
        return "noop", old
    raise ValidationError("Source changed for an existing ID; coordinate correction rather than overwrite data.")


def measurement_records(payload):
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict) or not isinstance(payload.get("dailyWeightSummaries"), list):
        raise ValidationError("Weight range response shape differs from documentation; inspect privately.")
    records = []
    for day in payload["dailyWeightSummaries"]:
        if not isinstance(day, dict) or not isinstance(day.get("allWeightMetrics"), list):
            raise ValidationError("Range did not supply allWeightMetrics; do not substitute daily averages/latest values.")
        records.extend(day["allWeightMetrics"])
    return records


def capture(start, end):
    if end < start or (end - start).days > 6:
        raise ValidationError("Choose an inclusive date window of one to seven days.")
    if not ssl.HAS_TLSv1_3:
        raise ValidationError("This Python runtime lacks TLS 1.3; use the bundled Python command in GARMIN_SETUP.md.")
    key = keychain_key()
    token_response = request_json(TOKEN_PATH, "ApiKey " + key, method="POST", expect_json=False)
    del key
    token = bearer_text(token_response)
    payload = request_json(f"/weight-service/weight/range/{start.isoformat()}/{end.isoformat()}?includeAll=true", "Bearer " + token)
    del token, token_response
    # Save only measurement response, never token/key, to an ignored owner-only file.
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(PRIVATE_DIR, 0o700)
    target = PRIVATE_DIR / ("validation-" + uuid4().hex + ".json")
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        json.dump(payload, output)
    report = inspect_records(measurement_records(payload))
    print("Read-only measurement response saved in nutrition-os/local/garmin (private, ignored).")
    print(json.dumps(report, indent=2))
    print("No unit, Index provenance or deduplication claim is accepted until compared privately with Connect.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-date", required=True, type=date.fromisoformat)
    parser.add_argument("--end-date", required=True, type=date.fromisoformat)
    args = parser.parse_args()
    try:
        capture(args.start_date, args.end_date)
    except ValidationError as exc:
        print(f"Validation stopped safely: {exc} No Sheets writes occurred.", file=sys.stderr)
        return 1
    except OSError:
        # Do not expose raw OS exceptions or provider response bodies.
        print("Validation stopped safely: local credential or file access failed. No Sheets writes occurred.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

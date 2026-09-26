#!/usr/bin/env python3
"""Read-only MyDyson device discovery and air-quality history collector."""

from __future__ import annotations

import argparse
import csv
import ctypes
import getpass
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo


API_BASE = "https://appapi.cp.dyson.com"
PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = PROJECT_DIR / "data" / "dyson"
DEFAULT_RAW_DIR = PROJECT_DIR / "raw"
TOKEN_SERVICE = "co-compass-dyson-token"
DEVICE_SERVICE = "co-compass-dyson-device"
DEFAULT_COUNTRY = "US"
DEFAULT_CULTURE = "en-US"
DEFAULT_TIMEZONE = "America/Denver"
USER_AGENT = "android client"
SECURITY_FRAMEWORK = "/System/Library/Frameworks/Security.framework/Security"
CORE_FOUNDATION_FRAMEWORK = (
    "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
)
ERR_SEC_SUCCESS = 0
ERR_SEC_ITEM_NOT_FOUND = -25300


class DysonError(RuntimeError):
    """A safe-to-display error that never contains credentials."""


def _keychain_libraries() -> tuple[Any, Any]:
    try:
        security = ctypes.CDLL(SECURITY_FRAMEWORK)
        core_foundation = ctypes.CDLL(CORE_FOUNDATION_FRAMEWORK)
    except OSError as error:
        raise DysonError("Could not load the macOS Keychain framework.") from error

    security.SecKeychainFindGenericPassword.argtypes = [
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.c_char_p,
        ctypes.c_uint32,
        ctypes.c_char_p,
        ctypes.POINTER(ctypes.c_uint32),
        ctypes.POINTER(ctypes.c_void_p),
        ctypes.POINTER(ctypes.c_void_p),
    ]
    security.SecKeychainFindGenericPassword.restype = ctypes.c_int32
    security.SecKeychainCopyDefault.argtypes = [ctypes.POINTER(ctypes.c_void_p)]
    security.SecKeychainCopyDefault.restype = ctypes.c_int32
    security.SecKeychainAddGenericPassword.argtypes = [
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.c_char_p,
        ctypes.c_uint32,
        ctypes.c_char_p,
        ctypes.c_uint32,
        ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_void_p),
    ]
    security.SecKeychainAddGenericPassword.restype = ctypes.c_int32
    security.SecKeychainItemModifyAttributesAndData.argtypes = [
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.c_void_p,
    ]
    security.SecKeychainItemModifyAttributesAndData.restype = ctypes.c_int32
    security.SecKeychainItemFreeContent.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    security.SecKeychainItemFreeContent.restype = ctypes.c_int32
    core_foundation.CFRelease.argtypes = [ctypes.c_void_p]
    core_foundation.CFRelease.restype = None
    return security, core_foundation


def _default_keychain(security: Any) -> ctypes.c_void_p:
    keychain = ctypes.c_void_p()
    status = security.SecKeychainCopyDefault(ctypes.byref(keychain))
    if status != ERR_SEC_SUCCESS:
        raise DysonError("Could not open the default macOS Keychain.")
    return keychain


def _keychain_native_get(account: str, service: str) -> str:
    security, core_foundation = _keychain_libraries()
    keychain = _default_keychain(security)
    account_bytes = account.encode("utf-8")
    service_bytes = service.encode("utf-8")
    password_length = ctypes.c_uint32()
    password_data = ctypes.c_void_p()
    try:
        status = security.SecKeychainFindGenericPassword(
            keychain,
            len(service_bytes),
            service_bytes,
            len(account_bytes),
            account_bytes,
            ctypes.byref(password_length),
            ctypes.byref(password_data),
            None,
        )
        if status == ERR_SEC_ITEM_NOT_FOUND:
            return ""
        if status != ERR_SEC_SUCCESS:
            raise DysonError("Could not read the MyDyson Keychain item.")
        try:
            return ctypes.string_at(password_data, password_length.value).decode("utf-8")
        finally:
            security.SecKeychainItemFreeContent(None, password_data)
    finally:
        core_foundation.CFRelease(keychain)


def _keychain_native_set(account: str, service: str, secret: str) -> None:
    security, core_foundation = _keychain_libraries()
    keychain = _default_keychain(security)
    account_bytes = account.encode("utf-8")
    service_bytes = service.encode("utf-8")
    secret_bytes = secret.encode("utf-8")
    secret_buffer = ctypes.create_string_buffer(secret_bytes)
    secret_pointer = ctypes.cast(secret_buffer, ctypes.c_void_p)
    item_ref = ctypes.c_void_p()
    try:
        status = security.SecKeychainFindGenericPassword(
            keychain,
            len(service_bytes),
            service_bytes,
            len(account_bytes),
            account_bytes,
            None,
            None,
            ctypes.byref(item_ref),
        )
        if status == ERR_SEC_SUCCESS:
            try:
                status = security.SecKeychainItemModifyAttributesAndData(
                    item_ref, None, len(secret_bytes), secret_pointer
                )
            finally:
                core_foundation.CFRelease(item_ref)
        elif status == ERR_SEC_ITEM_NOT_FOUND:
            status = security.SecKeychainAddGenericPassword(
                keychain,
                len(service_bytes),
                service_bytes,
                len(account_bytes),
                account_bytes,
                len(secret_bytes),
                secret_pointer,
                None,
            )
        if status != ERR_SEC_SUCCESS:
            raise DysonError(f"Could not store the {service} Keychain item.")
    finally:
        core_foundation.CFRelease(keychain)


def keychain_get(service: str) -> str:
    if sys.platform != "darwin":
        return ""
    return _keychain_native_get(getpass.getuser(), service)


def keychain_set(service: str, secret: str) -> None:
    """Store a secret via the native API so it is absent from argv and shell history."""
    if sys.platform != "darwin":
        raise DysonError("Automatic credential storage currently requires macOS Keychain.")
    _keychain_native_set(getpass.getuser(), service, secret)


def require_token() -> str:
    token = os.environ.get("DYSON_TOKEN", "").strip() or keychain_get(TOKEN_SERVICE)
    if not token:
        raise DysonError("No MyDyson token found. Run: python3 dyson.py login")
    return token


def require_device_serial() -> str:
    serial = os.environ.get("DYSON_DEVICE_SERIAL", "").strip() or keychain_get(
        DEVICE_SERVICE
    )
    if not serial:
        raise DysonError("No Dyson device selected. Run: python3 dyson.py login")
    return serial


def api_request(
    method: str,
    path: str,
    *,
    params: dict[str, str] | None = None,
    payload: dict[str, Any] | None = None,
    token: str | None = None,
) -> Any:
    query = urllib.parse.urlencode(params or {})
    url = f"{API_BASE}{path}" + (f"?{query}" if query else "")
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
    except urllib.error.HTTPError as error:
        if error.code == 401:
            raise DysonError("MyDyson authentication was rejected or has expired.") from None
        if error.code == 429:
            raise DysonError("MyDyson rate-limited the request; wait before retrying.") from None
        raise DysonError(f"MyDyson request failed with HTTP {error.code}.") from None
    except urllib.error.URLError:
        raise DysonError("Could not reach the MyDyson API.") from None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise DysonError("MyDyson returned an invalid JSON response.") from None


def provision() -> None:
    api_request("GET", "/v1/provisioningservice/application/Android/version")


def safe_device(device: dict[str, Any]) -> dict[str, Any]:
    connected = device.get("connectedConfiguration") or {}
    firmware = connected.get("firmware") or {}
    return {
        "category": device.get("category"),
        "connection_category": device.get("connectionCategory"),
        "model": device.get("model"),
        "product_type": device.get("type"),
        "variant": device.get("variant"),
        "firmware_version": firmware.get("version"),
        "capabilities": firmware.get("capabilities") or [],
        "has_local_mqtt_credentials": bool(
            (connected.get("mqtt") or {}).get("localBrokerCredentials")
        ),
    }


def masked_serial(serial: str) -> str:
    return f"…{serial[-4:]}" if len(serial) > 4 else "(redacted)"


def select_environment_device(devices: list[dict[str, Any]]) -> dict[str, Any]:
    candidates = [device for device in devices if device.get("category") == "ec"]
    if not candidates:
        raise DysonError("The MyDyson account returned no environment-cleaner device.")
    if len(candidates) == 1:
        return candidates[0]

    print("Multiple environment-cleaner devices were found:")
    for index, device in enumerate(candidates, start=1):
        print(
            f"  {index}. model={device.get('model') or 'unknown'}, "
            f"product_type={device.get('type') or 'unknown'}, "
            f"serial={masked_serial(str(device.get('serialNumber') or ''))}"
        )
    try:
        choice = int(input("Select device number: ").strip())
        return candidates[choice - 1]
    except (ValueError, IndexError):
        raise DysonError("Invalid device selection.") from None


def login(args: argparse.Namespace) -> None:
    print("Credentials are read only by this local process and are not written to files.")
    email = input("MyDyson email: ").strip()
    password = getpass.getpass("MyDyson password: ")
    if not email or not password:
        raise DysonError("Email and password are required.")

    provision()
    status = api_request(
        "POST",
        "/v3/userregistration/email/userstatus",
        params={"country": args.country},
        payload={"email": email},
    )
    if status.get("accountStatus") != "ACTIVE":
        raise DysonError("The MyDyson account is not active.")
    challenge = api_request(
        "POST",
        "/v3/userregistration/email/auth",
        params={"country": args.country, "culture": args.culture},
        payload={"email": email},
    )
    challenge_id = challenge.get("challengeId")
    if not challenge_id:
        raise DysonError("MyDyson did not return an authentication challenge.")

    otp = getpass.getpass("One-time code sent by MyDyson: ")
    auth = api_request(
        "POST",
        "/v3/userregistration/email/verify",
        params={"country": args.country, "culture": args.culture},
        payload={
            "challengeId": challenge_id,
            "email": email,
            "otpCode": otp,
            "password": password,
        },
    )
    token = str(auth.get("token") or "")
    if not token:
        raise DysonError("MyDyson login succeeded without returning a token.")

    provision()
    devices = api_request("GET", "/v3/manifest", token=token)
    if not isinstance(devices, list):
        raise DysonError("MyDyson returned an unexpected device manifest.")
    selected = select_environment_device(devices)
    serial = str(selected.get("serialNumber") or "")
    if not serial:
        raise DysonError("The selected device has no serial number.")

    keychain_set(TOKEN_SERVICE, token)
    keychain_set(DEVICE_SERVICE, serial)
    metadata = safe_device(selected)
    args.data_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = args.data_dir / "device-metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    print("Authentication succeeded. Password and OTP were not stored.")
    print(f"Selected serial: {masked_serial(serial)}")
    print(f"Model: {metadata['model'] or 'unknown'}")
    print(f"Product type: {metadata['product_type'] or 'unknown'}")
    print(f"Variant: {metadata['variant'] or 'none'}")
    print(f"Capabilities: {', '.join(metadata['capabilities']) or 'none reported'}")
    print(f"Saved non-sensitive metadata: {metadata_path}")


def authenticated_get(path: str) -> Any:
    provision()
    return api_request("GET", path, token=require_token())


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def normalized_name(value: str) -> str:
    # Preserve all-caps sensor acronyms (VOC, NO2, PM25) while still splitting
    # ordinary camelCase/PascalCase names such as FineParticles.
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value).lower()
    return re.sub(r"[^a-z0-9]+", "_", value).strip("_")


def series_values(value: Any) -> dict[str, Any] | None:
    if isinstance(value, list):
        return {str(index): item for index, item in enumerate(value)}
    if isinstance(value, dict):
        return {str(key): item for key, item in value.items()}
    return None


def history_records(payload: Any) -> list[dict[str, Any]]:
    """Accept both observed list responses and community-library dict wrappers."""
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("days", "Days", "history", "History"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    if any(key in payload for key in ("Date", "date")):
        return [payload]
    return []


def flatten_history(payload: Any) -> tuple[list[dict[str, Any]], list[str]]:
    rows: list[dict[str, Any]] = []
    all_series_names: set[str] = set()
    for record in history_records(payload):
        date_value = record.get("Date") or record.get("date")
        series = {
            normalized_name(key): mapped
            for key, value in record.items()
            if key.lower() != "date" and (mapped := series_values(value)) is not None
        }
        all_series_names.update(series)
        slots = sorted(
            {slot for values in series.values() for slot in values},
            key=lambda value: (0, int(value)) if value.isdigit() else (1, value),
        )
        for slot in slots:
            row: dict[str, Any] = {"date": date_value or "", "slot": slot}
            for name, values in series.items():
                row[name] = values.get(slot, "")
            rows.append(row)
    fields = ["date", "slot", *sorted(all_series_names)]
    return rows, fields


def write_csv(path: Path, rows: Iterable[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def parse_resolution_minutes(value: Any) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        match = re.fullmatch(r"PT(\d+)M", value)
        if match:
            return int(match.group(1))
    return 15


def converted_temperature(raw_value: Any) -> tuple[Any, Any]:
    if not isinstance(raw_value, (int, float)):
        return "", ""
    celsius = raw_value / 10 - 273.15
    return round(celsius, 2), round(celsius * 9 / 5 + 32, 2)


def export_daily(payload: Any, path: Path, timezone_name: str = DEFAULT_TIMEZONE) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise DysonError("The daily-history response was not an object.")
    raw_series_names = (
        "aqlm",
        "volm",
        "p25m",
        "p10m",
        "no2m",
        "tmpm",
        "humm",
        "fnsp",
        "usage",
    )
    series = {
        name: payload.get(name)
        for name in raw_series_names
        if isinstance(payload.get(name), list)
    }
    if not series:
        raise DysonError("The 15-minute history response contained no sensor arrays.")
    resolution = parse_resolution_minutes(payload.get("resolution"))
    start_raw = payload.get("start_time")
    start = None
    if isinstance(start_raw, str):
        try:
            start = datetime.fromisoformat(start_raw.replace("Z", "+00:00"))
        except ValueError:
            start = None
    local_zone = ZoneInfo(timezone_name)
    slot_count = max(len(values) for values in series.values())
    rows = []
    populated_timestamps: list[datetime] = []
    for index in range(slot_count):
        timestamp = start + timedelta(minutes=index * resolution) if start else None
        values = {
            name: items[index] if index < len(items) else None
            for name, items in series.items()
        }
        if timestamp and any(value is not None for value in values.values()):
            populated_timestamps.append(timestamp)
        temperature_c, temperature_f = converted_temperature(values.get("tmpm"))
        rows.append(
            {
                "timestamp_utc": timestamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
                if timestamp
                else "",
                "timestamp_local": timestamp.astimezone(local_zone).isoformat()
                if timestamp
                else "",
                "slot": index,
                "combined_aqi": "" if values.get("aqlm") is None else values["aqlm"],
                "voc_index": "" if values.get("volm") is None else values["volm"],
                "pm25_ug_m3": "" if values.get("p25m") is None else values["p25m"],
                "pm10_ug_m3": "" if values.get("p10m") is None else values["p10m"],
                "no2_index": "" if values.get("no2m") is None else values["no2m"],
                "temperature_c": temperature_c,
                "temperature_f": temperature_f,
                "relative_humidity_pct": ""
                if values.get("humm") is None
                else values["humm"],
                "fan_speed": "" if values.get("fnsp") is None else values["fnsp"],
                "usage_seconds": ""
                if values.get("usage") is None
                else values["usage"],
            }
        )
    output_fields = [
        "timestamp_utc",
        "timestamp_local",
        "slot",
        "combined_aqi",
        "voc_index",
        "pm25_ug_m3",
        "pm10_ug_m3",
        "no2_index",
        "temperature_c",
        "temperature_f",
        "relative_humidity_pct",
        "fan_speed",
        "usage_seconds",
    ]
    write_csv(path, rows, output_fields)
    return {
        "start_time": start_raw,
        "resolution_minutes": resolution,
        "slots": slot_count,
        "coverage_days": slot_count * resolution / (24 * 60),
        "first_populated_time": populated_timestamps[0].astimezone(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
        if populated_timestamps
        else None,
        "last_populated_time": populated_timestamps[-1].astimezone(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
        if populated_timestamps
        else None,
        "series_non_null_samples": {
            name: sum(value is not None for value in values)
            for name, values in series.items()
        },
        "series_fields": sorted(series),
        "fields": sorted(payload.keys()),
    }


def summarize_multiday(payload: Any, rows: list[dict[str, Any]], fields: list[str]) -> dict[str, Any]:
    records = history_records(payload)
    dates = sorted(
        str(record.get("Date") or record.get("date"))
        for record in records
        if record.get("Date") or record.get("date")
    )
    per_day_slots: dict[str, int] = {}
    for row in rows:
        day = str(row.get("date") or "")
        per_day_slots[day] = per_day_slots.get(day, 0) + 1
    max_slots = max(per_day_slots.values(), default=0)
    inferred_resolution = 60 if max_slots <= 24 else 15 if max_slots <= 96 else None
    return {
        "response_type": type(payload).__name__,
        "days": len(records),
        "earliest_date": dates[0] if dates else None,
        "latest_date": dates[-1] if dates else None,
        "rows": len(rows),
        "maximum_slots_per_day": max_slots,
        "inferred_resolution_minutes": inferred_resolution,
        "series_fields": fields[2:],
        "series_non_null_samples": {
            field: sum(row.get(field) not in (None, "") for row in rows)
            for field in fields[2:]
        },
    }


def build_history_report(
    daily_summary: dict[str, Any],
    multiday_summary: dict[str, Any],
    multiday_fields: list[str],
) -> dict[str, Any]:
    pollutant_fields = {
        "pm25",
        "pm2_5",
        "p25m",
        "pm10",
        "p10m",
        "voc",
        "va10",
        "volm",
        "no2",
        "noxl",
        "no2m",
        "formaldehyde",
        "hcho",
    }
    found_fields = sorted(
        pollutant_fields.intersection(
            set(daily_summary["series_fields"]) | set(multiday_fields)
        )
    )
    return {
        "device_serial": "redacted",
        "daily_endpoint": daily_summary,
        "multiday_endpoint": multiday_summary,
        "interpretation": {
            "daily_endpoint_is_combined_aqi_only": set(daily_summary["fields"])
            <= {"start_time", "resolution", "aqlm"},
            "separate_pollutant_fields_found": found_fields,
            "multiday_endpoint_has_populated_samples": any(
                multiday_summary["series_non_null_samples"].values()
            ),
        },
    }


def inspect_history(args: argparse.Namespace) -> None:
    serial = require_device_serial()
    daily = authenticated_get(
        f"/v1/messageprocessor/devices/{urllib.parse.quote(serial)}/environmentdata/daily"
    )
    multiday = authenticated_get(
        f"/v1/messageprocessor/devices/{urllib.parse.quote(serial)}/environmentdailyhistory"
    )

    write_json(args.raw_dir / "daily.json", daily)
    write_json(args.raw_dir / "multiday.json", multiday)
    daily_summary = export_daily(daily, args.data_dir / "cloud-history-15min.csv")
    rows, fields = flatten_history(multiday)
    write_csv(args.data_dir / "multiday-history.csv", rows, fields)
    multiday_summary = summarize_multiday(multiday, rows, fields)
    report = build_history_report(daily_summary, multiday_summary, fields)
    write_json(args.data_dir / "history-inspection.json", report)
    print(json.dumps(report, indent=2))
    print(f"\nRaw responses (Git-ignored): {args.raw_dir}")
    print(f"Normalized outputs: {args.data_dir}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    login_parser = subparsers.add_parser("login", help="authenticate and identify the purifier")
    login_parser.add_argument("--country", default=DEFAULT_COUNTRY)
    login_parser.add_argument("--culture", default=DEFAULT_CULTURE)
    login_parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)

    inspect_parser = subparsers.add_parser(
        "inspect-history", help="read and inspect both cloud history endpoints"
    )
    inspect_parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    inspect_parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "login":
            login(args)
        else:
            inspect_history(args)
    except (DysonError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

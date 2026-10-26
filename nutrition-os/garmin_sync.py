#!/usr/bin/env python3
"""Serialized Garmin body-metric sync. Quiet on success, sanitized failures only.

No authorization is created here. Requires separately approved hosted credentials.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from zoneinfo import ZoneInfo

import garmin_validate as garmin

DENVER = ZoneInfo("America/Denver")
SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"
SCHEMA = json.loads((Path(__file__).parent / "schema.json").read_text())
HEADERS = SCHEMA["tabs"]["Body metrics"]
LAST_ROW = SCHEMA["input_last_row"]
SOURCE = "garmin_personal_api"


class SyncError(Exception):
    pass


def lookback_window(now):
    today = now.astimezone(DENVER).date()
    return today - timedelta(days=6), today


def canonical_row(values):
    row = dict(zip(HEADERS, (values + [None] * len(HEADERS))[:len(HEADERS)]))
    row = {k: None if v == "" else v for k, v in row.items()}
    value = row["local_date"]
    if isinstance(value, (int, float)) and not isinstance(value, bool) and int(value) == value:
        row["local_date"] = (date(1899, 12, 30) + timedelta(days=int(value))).isoformat()
    if row.get("source") == SOURCE and row.get("source_id") is not None and not isinstance(row["source_id"], str):
        raise SyncError("source_id_not_text: preserve the exact Garmin ID before retrying")
    return row


def cell_values(row):
    result = []
    for h in HEADERS:
        v = row.get(h)
        if h == "local_date" and v is not None:
            v = (date.fromisoformat(v) - date(1899, 12, 30)).days
        if v is None:
            result.append({})
        else:
            result.append({"userEnteredValue": {"numberValue": v} if isinstance(v, (int, float)) else {"stringValue": v}})
    return result


class GoogleSheet:
    def __init__(self, spreadsheet_id, credential_json):
        if not re.fullmatch(r"[A-Za-z0-9_-]{20,}", spreadsheet_id or ""):
            raise SyncError("sheet_id_invalid: configure the existing Nutrition OS workbook ID")
        try:
            from google.oauth2 import service_account
            from google.auth.transport.requests import AuthorizedSession
            info = json.loads(credential_json)
            if info.get("type") != "service_account" or info.get("token_uri") != "https://oauth2.googleapis.com/token":
                raise ValueError()
            credentials = service_account.Credentials.from_service_account_info(info, scopes=[SHEETS_SCOPE])
            self.session = AuthorizedSession(credentials)
        except Exception:
            raise SyncError("google_credentials_invalid: repair the approved Google secret; never paste it into logs") from None
        self.base = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
        meta = self.call("GET", "", params={"fields": "sheets.properties"})
        matches = [s["properties"] for s in meta.get("sheets", []) if s["properties"]["title"] == "Body metrics"]
        if len(matches) != 1 or matches[0]["gridProperties"]["rowCount"] < LAST_ROW:
            raise SyncError("body_schema_missing: restore the expected Body metrics tab/capacity")
        self.sheet_id = matches[0]["sheetId"]

    def call(self, method, suffix, **kwargs):
        # No request bodies, private keys, tokens, IDs or measurement values in errors.
        attempts = 3 if method == "GET" else 1
        for attempt in range(attempts):
            try:
                response = self.session.request(method, self.base + suffix, timeout=30, allow_redirects=False, **kwargs)
                status = response.status_code
                if method == "GET" and (status == 429 or status >= 500) and attempt < attempts - 1:
                    time.sleep(2 ** attempt)
                    continue
                if status in (401, 403):
                    raise SyncError("google_access_denied: check the approved credential and workbook Editor grant")
                if status < 200 or status >= 300:
                    raise SyncError(f"google_http_{status}: retry safely; inspect permissions or provider availability")
                return response.json()
            except SyncError:
                raise
            except Exception:
                if method == "GET" and attempt < attempts - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise SyncError("google_transport_failed: retry the job; the next attempt reconciles existing IDs") from None

    def read(self):
        from urllib.parse import quote
        data = self.call("GET", "/values/" + quote(f"'Body metrics'!A1:T{LAST_ROW}", safe=""),
                         params={"valueRenderOption": "UNFORMATTED_VALUE", "dateTimeRenderOption": "SERIAL_NUMBER"})
        rows = data.get("values", [])
        if not rows or rows[0] != HEADERS:
            raise SyncError("body_schema_changed: coordinate header changes before retrying")
        entries = []
        occupied = set()
        for index, values in enumerate(rows[1:], start=2):
            if any(v not in (None, "") for v in values):
                occupied.add(index)
                entries.append((index, canonical_row(values)))
        return entries, occupied

    def write(self, row_number, row):
        if not 2 <= row_number <= LAST_ROW:
            raise SyncError("body_capacity_exhausted: extend validated ranges before retrying")
        self.call("POST", ":batchUpdate", json={"requests": [{"updateCells": {
            "range": {"sheetId": self.sheet_id, "startRowIndex": row_number - 1, "endRowIndex": row_number,
                      "startColumnIndex": 0, "endColumnIndex": len(HEADERS)},
            "rows": [{"values": cell_values(row)}], "fields": "userEnteredValue"}}]})


def reconcile(entries, candidate):
    try:
        return garmin.reconcile_measurement([r for _, r in entries], candidate)
    except garmin.ValidationError:
        raise SyncError("source_conflict: duplicate/changed/missing identity requires review; no row was overwritten") from None


def readback(sheet, candidate):
    entries, _ = sheet.read()
    matches = [r for _, r in entries if r.get("source") == candidate["source"] and r.get("source_id") == candidate["source_id"]]
    if len(matches) != 1:
        raise SyncError("write_unconfirmed: rerun to reconcile the same source ID; do not manually append")
    persisted = matches[0]
    if any(persisted.get(h) != candidate.get(h) for h in HEADERS):
        raise SyncError("readback_mismatch: persisted fields/revision differ; stop for review")
    return entries, persisted


def synchronize(sheet, records, start, end, now, *, verify_existing_write=False):
    observed = now.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    initial, _ = sheet.read()  # Validate schema/access even for an empty provider window.
    identities = [(r.get("source"), r.get("source_id")) for _, r in initial if r.get("source") == SOURCE]
    if len(identities) != len(set(identities)):
        raise SyncError("source_conflict: duplicate existing Garmin IDs require review")
    candidates = {}
    for raw in records:
        try:
            row = garmin.normalize_index_s2(raw, observed_at_utc=observed)
        except garmin.ValidationError:
            raise SyncError("garmin_payload_invalid: missing ID/provenance or invalid metric; review the validated profile") from None
        if not start <= date.fromisoformat(row["local_date"]) <= end:
            continue
        # Full responses can repeat the same source entry; conflict is not a new reading.
        source_id = row["source_id"]
        if source_id in candidates and candidates[source_id] != row:
            raise SyncError("garmin_source_conflict: repeated source ID has different payloads; review")
        candidates[source_id] = row
    inserted = noops = verified_writes = 0
    for candidate in candidates.values():
        # Fresh full bounded read before every mutation. No append-after-timeout.
        entries, occupied = sheet.read()
        action, persisted = reconcile(entries, candidate)
        if action == "noop":
            noops += 1
            if verify_existing_write:
                # Explicit manual validation only: write identical persisted fields,
                # retaining revision and original timestamps, then read back.
                row_number = next(n for n, row in entries if row["source"] == SOURCE and row["source_id"] == candidate["source_id"])
                try:
                    sheet.write(row_number, persisted)
                except SyncError:
                    # Unknown result is reconciled, never blindly replayed.
                    readback(sheet, persisted)
                    raise SyncError("validation_write_uncertain: record reconciled; repeat manual validation before enabling schedule") from None
                readback(sheet, persisted)
                verified_writes += 1
            else:
                readback(sheet, persisted)
            continue
        free = next((n for n in range(2, LAST_ROW + 1) if n not in occupied), None)
        if free is None:
            raise SyncError("body_capacity_exhausted: extend validated ranges before retrying")
        try:
            sheet.write(free, candidate)
        except SyncError:
            # A transport/server failure may occur after persistence. Read IDs first.
            readback(sheet, candidate)
        else:
            readback(sheet, candidate)
        inserted += 1
    return {"inserted": inserted, "noop": noops, "verified_writes": verified_writes}


def fetch_records(key, start, end):
    try:
        token = garmin.bearer_text(garmin.request_json(garmin.TOKEN_PATH, "ApiKey " + key, method="POST", expect_json=False))
        for attempt in range(3):
            try:
                payload = garmin.request_json(f"/weight-service/weight/range/{start}/{end}?includeAll=true", "Bearer " + token)
                return garmin.measurement_records(payload)
            except garmin.ValidationError as exc:
                if not re.search(r"HTTP (429|50[0-9])", str(exc)) or attempt == 2:
                    raise
                time.sleep(2 ** attempt)
    except garmin.ValidationError as exc:
        if re.search(r"HTTP (401|403)", str(exc)):
            raise SyncError("garmin_access_denied: check key expiry/revocation and renew the approved stored key") from None
        raise SyncError("garmin_read_failed: retry; review provider availability or the validated response profile if persistent") from None


@contextmanager
def local_lock():
    # Supplement the shared Actions concurrency group; no locking service/database.
    path = Path(tempfile.gettempdir()) / "nutrition-os-garmin-sync.lock"
    with path.open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SyncError("sync_busy: another local Garmin sync is active") from None
        yield


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validation-date", type=date.fromisoformat)
    parser.add_argument("--verify-existing-write", action="store_true")
    args = parser.parse_args()
    if args.verify_existing_write and not args.validation_date:
        parser.error("--verify-existing-write requires an explicit --validation-date")
    try:
        key = os.environ.get("GARMIN_PERSONAL_API_KEY", "").strip()
        google = os.environ.get("NUTRITION_GOOGLE_SERVICE_ACCOUNT_JSON", "")
        spreadsheet = os.environ.get("NUTRITION_SPREADSHEET_ID", "")
        if not key or not google or not spreadsheet:
            raise SyncError("credentials_missing: finish the explicitly approved secret/workbook authorization setup")
        now = datetime.now(timezone.utc)
        start, end = (args.validation_date, args.validation_date) if args.validation_date else lookback_window(now)
        with local_lock():
            sheet = GoogleSheet(spreadsheet, google)
            records = fetch_records(key, start, end)
            synchronize(sheet, records, start, end, now, verify_existing_write=args.verify_existing_write)
        return 0  # Routine success, including an empty window, is intentionally quiet.
    except SyncError as exc:
        print("Nutrition OS Garmin sync: " + str(exc), file=sys.stderr)
        return 1
    except Exception:
        print("Nutrition OS Garmin sync: unexpected_failure; review sanitized tests/configuration, never publish raw provider responses", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Send read-only Dyson observations to the private Apps Script intake."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from dyson import DysonError, authenticated_get, normalize_daily, require_device_serial


FIELDS = (
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
)


class RelayError(RuntimeError):
    """Safe-to-display relay error without URLs, credentials, or sensor readings."""


def require_relay_config() -> tuple[str, str]:
    url = os.environ.get("DYSON_INGEST_URL", "").strip()
    secret = os.environ.get("DYSON_INGEST_SECRET", "").strip()
    if not url.startswith("https://script.google.com/macros/s/") or not url.endswith("/exec"):
        raise RelayError("DYSON_INGEST_URL must be a deployed Apps Script /exec URL.")
    if len(secret) < 32:
        raise RelayError("DYSON_INGEST_SECRET is missing or too short.")
    return url, secret


def normalized_observations(payload: object) -> list[dict[str, object]]:
    if not isinstance(payload, dict) or payload.get("resolution") != "PT15M":
        raise RelayError("Dyson did not return a 15-minute daily history object.")
    rows, _, _ = normalize_daily(payload)
    observations = []
    for row in rows:
        if not row["timestamp_utc"]:
            continue
        values = {name: None if row[name] == "" else row[name] for name in FIELDS}
        if any(value is not None for value in values.values()):
            observations.append({"timestamp_utc": row["timestamp_utc"], **values})
    if not observations:
        raise RelayError("Dyson returned no populated 15-minute observations.")
    return observations


def signed_envelope(observations: list[dict[str, object]], secret: str) -> bytes:
    payload = json.dumps(
        {
            "version": 1,
            "sent_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "rows": observations,
        },
        separators=(",", ":"),
        allow_nan=False,
    )
    signature = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return json.dumps({"payload": payload, "signature": signature}, separators=(",", ":")).encode("utf-8")


def post_envelope(url: str, body: bytes) -> dict[str, object]:
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                result = json.loads(response.read(65536))
            if not isinstance(result, dict) or result.get("ok") is not True:
                code = result.get("error") if isinstance(result, dict) else None
                if code == "busy" and attempt < 2:
                    time.sleep(30 * (attempt + 1))
                    continue
                if code in ("authentication_failed", "invalid_payload", "processing_failed", "busy"):
                    raise RelayError(f"Apps Script intake rejected the request: {code}.")
                raise RelayError("Apps Script intake did not acknowledge the observations.")
            return result
        except urllib.error.HTTPError as error:
            # Apps Script can finish the Sheet write but fail to serve its
            # one-time ContentService response. Retry the original signed POST;
            # timestamp upserts make a repeated write safe.
            if error.code not in (404, 429, 500, 502, 503, 504) or attempt == 2:
                raise RelayError(f"Apps Script intake returned HTTP {error.code}.") from None
            print(f"Apps Script acknowledgement returned HTTP {error.code}; retrying.", file=sys.stderr)
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise RelayError("Could not reach the Apps Script intake.") from None
        except (ValueError, UnicodeDecodeError):
            if attempt == 2:
                raise RelayError("Apps Script intake returned an invalid response.") from None
            print("Apps Script acknowledgement was unreadable; retrying.", file=sys.stderr)
        time.sleep(2 ** attempt)
    raise RelayError("Apps Script intake did not complete.")


def main() -> int:
    try:
        url, secret = require_relay_config()
        serial = require_device_serial()
        path = (
            "/v1/messageprocessor/devices/"
            f"{urllib.parse.quote(serial, safe='')}/environmentdata/daily"
        )
        observations = normalized_observations(authenticated_get(path))
        result = post_envelope(url, signed_envelope(observations, secret))
        if result.get("rows_received") != len(observations):
            raise RelayError("Apps Script intake acknowledged an unexpected row count.")
        print(f"Dyson intake acknowledged {len(observations)} observations.")
        return 0
    except (DysonError, RelayError) as error:
        print(f"Dyson relay failed: {error}", file=sys.stderr)
        return 1
    except Exception:
        # Unexpected exceptions can contain request URLs or response bodies.
        print("Dyson relay failed with an unexpected error.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Verify read-only Dyson history access from a GitHub Actions runner."""

from __future__ import annotations

import sys
import urllib.parse

from dyson import DysonError, authenticated_get, require_device_serial


def main() -> int:
    try:
        serial = require_device_serial()
        path = (
            "/v1/messageprocessor/devices/"
            f"{urllib.parse.quote(serial, safe='')}/environmentdata/daily"
        )
        payload = authenticated_get(path)
        if not isinstance(payload, dict):
            raise DysonError("The daily-history response was not an object.")
        if payload.get("resolution") not in ("PT15M", 15):
            raise DysonError("The daily-history response was not at 15-minute resolution.")

        channels = ("volm", "p25m", "p10m", "no2m")
        if any(not isinstance(payload.get(name), list) for name in channels):
            raise DysonError("The daily-history response omitted expected pollutant arrays.")
        populated = sum(any(value is not None for value in payload[name]) for name in channels)
        if populated == 0:
            raise DysonError("The daily-history response had no populated pollutant samples.")

        print("Dyson daily history: HTTP access and 15-minute payload verified.")
        print(f"Populated pollutant channels: {populated}/{len(channels)}.")
        return 0
    except DysonError as error:
        print(f"Dyson smoke test failed: {error}", file=sys.stderr)
        return 1
    except Exception:
        # Never print unexpected exception details: request URLs contain the device serial.
        print("Dyson smoke test failed with an unexpected error.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

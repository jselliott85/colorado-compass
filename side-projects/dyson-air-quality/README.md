# Read-only Dyson air-quality collector

This side project investigates MyDyson cloud history and, later, optional local MQTT sensor data.
It is separate from the Colorado Compass site and from the Tempest collector.

The current CLI contains only authentication, device discovery, and read-only history requests.
It has no purifier-control endpoints and cannot change fan, monitoring, schedule, or filter settings.

## Secure login and model discovery

Run this locally from a Mac Terminal:

```sh
cd side-projects/dyson-air-quality
python3 dyson.py login
```

The script prompts locally for the MyDyson email, password, and emailed one-time code. Password and
OTP are held only in process memory and discarded. The returned bearer token and selected device
serial are stored in macOS Keychain; neither is written to the repository. A sanitized metadata
file records model, product type, variant, firmware, capabilities, and whether local MQTT is
available. It omits the serial, user-assigned device name, and MQTT credential.

## Inspect cloud history

```sh
python3 dyson.py inspect-history
```

This performs GET requests against both community-documented history endpoints:

- `environmentdata/daily`: on the verified HP07 account, seven local calendar days at 15-minute
  resolution, including separate VOC, PM2.5, PM10, and NO2 series.
- `environmentdailyhistory`: seven days of hourly slots, but every value was null for this account.

Raw JSON is retained under the Git-ignored `raw/` directory. Normalized CSVs and a redacted
`history-inspection.json` report are written under the also-Git-ignored `data/dyson/` directory,
keeping household sensor/usage history local. Missing samples are preserved; nothing is
interpolated.

The primary normalized export is `data/dyson/cloud-history-15min.csv`. It contains UTC and Mountain
timestamps, combined AQI, VOC index, PM2.5 and PM10 concentrations, NO2 index, temperature, humidity,
fan speed, and usage seconds. VOC and NO2 are Dyson index values rather than physical concentration
units.

## GitHub-hosted access check

The manual `Dyson cloud smoke test` GitHub Actions workflow checks whether a GitHub-hosted
runner can read the same 15-minute Dyson endpoint. It does not write sensor data or create
artifacts. Its log reports only whether the response contained the expected pollutant
channels, never their values or the device serial.

In the repository's **Settings → Secrets and variables → Actions**, create two repository
secrets named `DYSON_TOKEN` and `DYSON_DEVICE_SERIAL` using the values already stored in
macOS Keychain. Enter them directly in GitHub's secret form; do not paste them into a chat,
terminal command, workflow file, or issue. Then use **Actions → Dyson cloud smoke test → Run
workflow** on `main`. A passing run proves this runner can reach the endpoint. The workflow
is manual only; no scheduled Dyson collection or Sheet ingest is enabled by this check.

## Hosted relay

After the smoke test passed, `relay.py` was added for the hosted path. It reads the same
rolling daily history, keeps all validated pollutant and environmental channels, and sends
only normalized observations to a signed Apps Script intake. It never calls a purifier
control endpoint. GitHub Actions secrets hold the Dyson bearer, serial, intake URL, and
shared signing secret; the code and public workflow contain none of those values.

The `Dyson history collection` workflow is initially manual. The matching Apps Script
web app and the two intake secrets must be configured before its first run. Once the
manual run succeeds and the private Sheet is verified, enable its six-hour schedule.
The full cutover and health instructions are in the sibling
`side-projects/air-quality-google-apps-script/README.md`.

## Security notes

- Do not paste MyDyson credentials, OTPs, bearer tokens, serial numbers, or local MQTT credentials
  into chat, source files, Markdown, or Git.
- Do not enable debug HTTP logging: community libraries may log request/response bodies.
- Re-run `login` when Dyson expires the bearer token.
- Remove saved access later with:

```sh
security delete-generic-password -a "$USER" -s "co-compass-dyson-token"
security delete-generic-password -a "$USER" -s "co-compass-dyson-device"
```

## Local MQTT status

Local MQTT remains intentionally deferred. The manifest identifies an HP07 (`527K`) and confirms
that local MQTT credentials are available. This model can expose separate live PM2.5, PM10,
VOC-index, NO2-index, temperature, and humidity fields. MQTT is live-only: it cannot recover samples
from periods when no collector was connected, so it is an optional enhancement rather than the
backfill architecture.

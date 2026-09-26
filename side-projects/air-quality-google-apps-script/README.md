# Private Home Air Quality — Google Apps Script

This side project turns the validated MyDyson, Tempest, and CDPHE collectors into a private, unattended longitudinal dataset in Google Sheets and Drive. It is intentionally separate from the main Colorado Compass application.

## End state

- A container-bound Google Apps Script collects Tempest and CDPHE every six hours. A GitHub Actions job reads Dyson history and sends signed observations to an Apps Script web app. The Mac can be asleep or offline.
- MyDyson's complete rolling history is re-read and timestamp-upserted every Dyson run, leaving many recovery opportunities before its seven-calendar-date history expires.
- Tempest native observations are fetched with overlapping dates and aggregated into UTC-aligned 15-minute bins. Wind is excluded.
- CDPHE PM2.5/PM10 and ozone are stored as explicitly labeled regional comparators, not home measurements.
- `Master_15min` is the canonical ChatGPT-facing table. `Events` stays separate from observations.
- Tempest and CDPHE source responses are retained as private gzip files in Drive when `KEEP_RAW=true`. Dyson's normalized source observations are retained in `Dyson_15min`.
- No address or home coordinates are stored. No collector can change purifier settings.

The current private Google Sheet is named **Private Home Air Quality — Longitudinal Dataset** in the Drive `ChatGPT` folder. Its ID is intentionally not committed to Git; `.clasp.json` is ignored.

## Tables

- `README`: dataset purpose, privacy boundaries, sources, and ChatGPT retrieval guidance.
- `Master_15min`: one row per UTC quarter-hour, local timestamps, source-presence flags, Tempest coverage, every validated Dyson channel, weather, and regional AQ.
- `Dyson_15min`, `Tempest_15min`, `Regional_AQ_15min`: normalized source tables used to rebuild the master.
- `Events`: factual manual interventions only. The first row records the approximate 2026-09-24 filter replacement.
- `Source_Status`: current source health and Dyson retention risk.
- `Health_Log`: bounded execution history with sanitized errors.
- `Schema`: field-level data dictionary designed to be read by ChatGPT before analysis.
- `Archive_Index`: reserved for future yearly archive workbooks.

Blank numeric cells mean **missing**, never zero. The master also records source presence, Tempest counts/coverage, and `missing_sources`; the pipeline does not interpolate.

## Private Script Properties

Add these in Apps Script **Project Settings → Script properties**. Never put values in source, a Sheet, shell history, or logs.

| Property | Required | Purpose |
| --- | --- | --- |
| `DYSON_INGEST_SECRET` | yes for Dyson relay | random shared HMAC secret, at least 32 characters; same value in GitHub Actions secrets |
| `TEMPEST_TOKEN` | yes | WeatherFlow personal access token |
| `TEMPEST_STATION_ID` | yes | station identifier (kept out of the dataset) |
| `TEMPEST_DEVICE_ID` | yes | outdoor Tempest device identifier |
| `ALERT_EMAIL` | recommended | receives Dyson retention-risk warnings when explicitly configured |
| `INITIAL_BACKFILL_DATE` | no | defaults to `2026-09-20` |
| `TIME_ZONE` | no | defaults to `America/Denver` |
| `KEEP_RAW` | no | defaults to `true` |

The Dyson bearer and device serial now live in GitHub Actions secrets. After the relay succeeds, remove the obsolete `DYSON_TOKEN` and `DYSON_DEVICE_SERIAL` Script Properties. Neither belongs in Sheet cells, source, logs, or chat.

## Google authorization and deployment

The user must perform the interactive Google authorization steps:

1. Enable the Google Apps Script API at <https://script.google.com/home/usersettings>.
2. From this directory, run `npx clasp login` and authorize the same Google account that owns the Sheet.
3. After login, create the bound project:

   ```bash
   npx clasp create "Private Home Air Quality Collector" \
     --type sheets \
     --parentId YOUR_SPREADSHEET_ID \
     --rootDir ./src
   npx clasp push
   ```

4. Open the Sheet, choose **Extensions → Apps Script**, add the private Script Properties above, then run `initializeAirQualitySystem` once. Google will ask for runtime scopes because the script reads/writes the private Sheet/Drive archive, makes outbound read-only HTTP requests, manages its time trigger, and may send a health alert.
5. Run `runHistoricalBackfill` until both cursors pass the current date, then run `installAirQualityTrigger` once.

`runHistoricalBackfill` intentionally processes at most seven historical dates per invocation to remain under Apps Script's six-minute execution limit. Scheduled runs process smaller chunks while always refreshing the most recent overlap.

## Dyson GitHub relay cutover

The GitHub-hosted read-only smoke test must pass first. Then:

1. Run `npx clasp push` from this directory to update the existing bound Apps Script project.
2. Generate a random shared secret locally, keeping it off the terminal screen:

   ```sh
   python3 -c 'import secrets; print(secrets.token_urlsafe(48), end="")' | pbcopy
   ```

   Paste the same clipboard value into Apps Script **Project Settings → Script properties → `DYSON_INGEST_SECRET`** and GitHub **Settings → Secrets and variables → Actions → `DYSON_INGEST_SECRET`**. Clear the clipboard afterward.
3. In Apps Script, select **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Copy the resulting `/exec` URL directly into a GitHub Actions repository secret named `DYSON_INGEST_URL`. This deployment exposes a signed write-only intake; it does not expose Sheet data.
4. Manually run **Actions → Dyson history collection → Run workflow** on `main`. Confirm the run passes and `Source_Status` shows a recent Dyson success. Check `Dyson_15min` and `Master_15min` for matching UTC timestamps with individual VOC, PM2.5, PM10, and NO2 values.
5. Only after the manual run succeeds, enable the six-hour `:17` GitHub schedule and remove the old Dyson token and serial from Apps Script Script Properties.

The six-hour schedule is enabled after the successful manual intake test. This repository is public: GitHub automatically disables scheduled workflows after 60 days without repository activity, even if the workflow itself has run. That makes this schedule an interim collector, not a reliable years-long unattended scheduler. A private side repository or an external authenticated dispatcher is required before treating the Dyson relay as permanently unattended. The Apps Script health check and `ALERT_EMAIL` can warn about staleness, but an alert is not a substitute for durable scheduling.

The relay sends normalized 15-minute readings signed with HMAC-SHA256. The intake verifies the signature, a 15-minute send-time window, 15-minute timestamp alignment, an eight-day observation window, and all expected numeric fields. Repeated requests update rows by UTC timestamp. Invalid requests cannot write to Sheets. Apps Script web apps return a JSON acknowledgement rather than a custom HTTP status, so the GitHub job checks `ok: true` and the acknowledged row count.

## Health and recovery

The trigger runs every six hours. Each source is isolated: one source failing does not roll back successful sources. Repeated writes use `timestamp_utc` as the key, so retries update rather than duplicate rows.

Dyson health is updated by successful signed intake. A failed GitHub run leaves the last-success timestamp stale; the scheduled Apps Script check escalates after 36 hours. At 120 hours, `Source_Status` reports a critical under-48-hours-before-history-loss state. When `ALERT_EMAIL` is configured, alerts are rate-limited to one per 24 hours.

## Next step — deferred

Move the Dyson scheduled workflow into a small **private companion GitHub repository**, while keeping this Colorado Compass repository public for its GitHub Pages site. Copy only the read-only relay code and required workflow, configure the four Dyson GitHub Actions secrets in the private repository, manually verify a signed intake into the existing private Sheet, and then disable the public repository's Dyson schedule. Do not change the Colorado Compass repository's visibility. The current public-repository six-hour schedule remains active until the private replacement is verified; GitHub may disable it after 60 days without repository activity. This step has been intentionally deferred by the owner.

## Long-term storage

Google currently documents a 20-million-cell Sheets limit. The working workbook warns conceptually at 15 million allocated cells so completed years can be copied to same-schema private archive workbooks and listed in `Archive_Index` before the limit is approached. Raw one-minute Tempest payloads live as compressed Drive files instead of Sheet rows, which greatly extends the useful lifetime of the analytical workbook.

## ChatGPT acceptance test

In an ordinary ChatGPT Chat on web or mobile, select the connected Google Drive app and ask:

> Find my Google Sheet named “Private Home Air Quality — Longitudinal Dataset.” Read its README and Schema tabs. Then tell me the earliest and latest `timestamp_utc` in `Master_15min`, the number of populated observations, and the manually recorded event in `Events`. Do not calculate correlations yet.

Passing means ChatGPT finds the private Sheet through the connected account and reports the bounds/count/event from the file—not from this repository or an earlier conversation.

## Local verification

```bash
npm test
npm run lint
```

The tests exercise DST-aware timestamps, Dyson pollutant preservation, Tempest aggregation and coverage, CDPHE regional metadata, token redaction, and the actual locally validated source fixtures.

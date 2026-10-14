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

Dyson health is updated by successful signed intake. The relay retries transient HTTP 404 or unreadable Apps Script acknowledgements using the same signed POST; timestamp upserts prevent duplicate observations. It still fails if no valid acknowledgement arrives after three attempts or if authentication is rejected. A failed GitHub run can still have written observations; check `Source_Status` before assuming data was missed. The scheduled Apps Script check escalates after 36 hours without a successful intake. At 120 hours, `Source_Status` reports a critical under-48-hours-before-history-loss state. When `ALERT_EMAIL` is configured, alerts are rate-limited to one per 24 hours.

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

## Carriage Hills pilot — paused, NOT activated

KCOBOULD877 (BMFPD Station 3 / Carriage Hills, 7,300 ft) has an optional JSON-history collector.
Integration work is paused at the owner's request. The local prototype is retained for reference;
it has not been pushed to Apps Script or enabled. No live pilot has started. The owner currently has neither a WU account nor a contributing WU
station. Do not assume that creating an account grants a contributor key or third-party history
rights. First establish a permitted access route; no website-embedded client key is allowed.

Before deployment/activation, an account-issued key must successfully retrieve nonempty observations
for **KCOBOULD877** from `/v2/pws/history/all` (not just current weather or the owner's station).
Verify the returned station ID, epoch/UTC agreement, local date and quarter-hour cadence, and confirm
that the account's terms permit this third-party station use. Only then privately configure
`WU_API_KEY`, `WU_CARRIAGE_ACCESS_CONFIRMED=true` and `CARRIAGE_HILLS_ENABLED=true` in Script Properties.
The access-confirmation property records a manual prerequisite; it is not an automated entitlement
check. Reverify when changing credentials. A failed/empty credential test must not activate collection.
Do not create an account or register a fictitious station just to obtain credentials.

The prototype appends master columns without shifting existing data and creates
`Carriage_Hills_15min`. It fetches today and the previous two **America/Denver** dates on the existing
six-hour collector, with exact UTC/epoch timestamp upserts. Missing fields remain blank, absent
quarters remain absent, and unexpected timestamp/cadence changes fail instead of moving readings.
Raw JSON uses the existing private gzip archive when `KEEP_RAW=true`.

Master fields are prefixed `carriage_`; Tempest is never overwritten. Speed/gust are provisional.
Direction is retained verbatim, including 360, but is untrusted. Pressure is the midpoint of the
reported bounds (or the available bound), likely sea-level pressure; raw bounds remain in the archive.
Cumulative precipitation is retained without summation or differencing across gaps/resets.
`carriage_present` indicates a source record, not that every field is populated or trustworthy.

`Source_Status`/`Health_Log` report disabled, error, stale or success. The health message includes
`stale=true/false` and observation age; missing observations or age over 12 hours are stale.
This is evaluated at collector runs; inspect last-attempt timestamps to detect a stopped scheduler.
Pilot failures do not fail the other collectors. First nonempty ingestion records
`CARRIAGE_PILOT_STARTED_UTC`; review is no earlier than 14 days later and promotion is always manual.

Review API reliability, field completeness, 360-degree frequency, precipitation resets and winter
coverage. After an actual Tempest relocation, manually record the relocation in Events and validate
its wind before enabling a separate Tempest wind collector change: the existing Tempest collector
still excludes wind. Then compare matched-time speed/gust and inspect evening VOC associations
without interpreting association as causation. This prototype alone cannot perform that wind comparison.


## US-NR1 research comparator — awaiting administrator response

**2026-10-14:** The owner contacted Sean Burns, the US-NR1 station administrator, to ask about
access to current station data. A response is pending. No reply, access permission, credentials,
or current feed has been received or verified, and no NR1 integration has been implemented or deployed.

US-NR1 is Niwot Ridge Forest (LTER NWT1), at approximately 40.0329, -105.5470 and 3,050 m
(about 10,000 ft). It is farther west and roughly 2,700 ft higher than the home, in a different
subalpine ecosystem. Its intended role is a regional research comparator for forest-atmosphere
processes, never a local weather proxy or substitute for Tempest. Wind provides broad mountain
context, not the flow direction at the house. Associations with Dyson VOC would not establish
causation, forest BVOC exposure, or identical conditions at the two locations.

Read-only verification on 2026-10-14 established:

- Official public CU source: <https://urquell.colorado.edu/data_ameriflux/>.
- Versioned ASCII climate/flux files and quality flags download without credentials or browser
  automation from <https://urquell.colorado.edu/data_ameriflux/data_30min/>. A repeated flux-file
  download returned identical content.
- The latest published climate and flux files cover 2025, version `2026.04.24`; each has 17,520
  half-hour rows. There is no verified overlap with the home dataset starting in September 2026.
- Although the overview describes daily updates to five-minute data, the public `data_5min/`
  listing exposes only five files from 2010–2014. The downloaded `nwt.140601.nc` internally
  identifies June 2014. A current public feed remains unverified.
- The AmeriFlux site record also lists the FLUXNET release through 2025:
  <https://ameriflux.lbl.gov/sites/siteinfo/US-NR1>.

Prioritize `ustar_21m` (m/s), `z_L_21m` (dimensionless stability parameter), `Qh_21m` and
`Qe_21m` (sensible/latent heat flux, W/m²), and `Rnet_25m_REBS` / `Rsw_in_25m_KZ` (net/incoming
shortwave radiation, W/m²). Climate files also define temperature, RH, dew point, wind, pressure
(kPa, convert to hPa by multiplying by 10), soil temperature and moisture. Measurement heights
must remain explicit. The precipitation series uses nearby USCRN measurements after 2011.

Timestamps are **fixed MST (UTC−7), centered on the 30-minute averaging interval**, not Denver
civil time. Missing values include `NaN`. Separate flags identify measured, modeled, interpolated,
C1-station, alternate-sensor, and diurnal-average values; do not treat every numeric cell as an
independent measured observation or strip its provenance. A future 15-minute master join must
retain the native 30-minute interval and quality flags, must not manufacture quarter-hour
measurements, and must not duplicate precipitation amounts.

Before resuming implementation, verify any feed Sean supplies for current coverage, repeatable
access, latency, timestamp/interval conventions, missing values, units, sensor heights and quality
flags. Stop and report if it requires credentials/payment or lacks adequate documentation. No
six-hour NR1 polling, backfill, source table, or master fields have been activated.

Source roles remain: Dyson = indoor AQ; Tempest = primary hyperlocal weather; CDPHE = regional
outdoor AQ; Carriage Hills = paused/manual or provisional nearby comparator; US-NR1 = proposed
regional forest-atmosphere research comparator awaiting current-data access.


## NCAR Foothills — source verification (2026-10-14)

Investigation on **2026-10-14**, following the NCAR link supplied by the owner from Sean Burns:

- Official information: <https://www.eol.ucar.edu/content/ncar-foothills-lab-weather-station-information>.
- Official public archive guide: <https://archive.eol.ucar.edu/weather/data/>.
- Preferred ingestion path: daily binary NetCDF files at
  `https://archive.eol.ucar.edu/weather/data/foothills/flab.YYYYMMDD.nc`.
  No account, key, payment, browser automation, or observation HTML parsing is needed.
- The live CGI page reported Operational with observations dated October 14. It advertises
  five-minute plot updates; this is not a guarantee of archive publication latency.
- All 25 daily files tested, September 19 through October 13, downloaded with HTTP 200. September
  19 supplies preceding-day context for the September 20 start. The October 14 file returned 404
  during the investigation. Recent completed files had Last-Modified timestamps about 00:15 UTC
  on the following day. Prefer the published daily archive over scraping today's CGI summary;
  budget for day-scale latency and do not treat a not-yet-published current-day file as an outage.
- Downloaded files and machine-readable validation are retained locally under ignored
  `tmp/ncar-foothills-verification/`. They have not been uploaded to the private Drive archive.

Station identity in the files: NSF NCAR Foothills Lab; 40.035 N, -105.243 E; altitude 1,625 m
(about 5,331 ft). This is approximately 2,000 ft lower than the home. It is a **regional comparator**,
never a local measurement or substitute for Tempest. Wind represents NCAR's rooftop conditions,
not local flow at the house. NCAR warns of temperature bias from rooftop heating and reduced
wind readings due to nearby buildings, particularly during strong westerly events. The archive
explicitly says these data are not research quality and are not quality controlled. The RAINCAP
precipitation sensor does not reliably measure snow, fog or dew. Retain these caveats in any future
sheet README, Schema and source metadata; do not encode atmospheric/VOC conclusions in the collector.

Verified native variables and units:

| NetCDF field | Meaning | Units |
| --- | --- | --- |
| `tdry` | Air temperature | degC |
| `dewpoint` | Derived dew point | degC |
| `rh` | Relative humidity | % |
| `pres` | Station air pressure | hPa |
| `cpres0` | Corrected sea-level pressure; separate from `pres` | hPa |
| `wspd` | Wind speed average | m/s |
| `wdir` | Wind direction average | degrees |
| `wspd_max` | Wind speed maximum | m/s |
| `rain_accum` | Cumulative rain counter | mm |
| `raina_daily` | Rain accumulation resetting at local midnight | mm |
| `raina_event` | Rain accumulation resetting after one dry hour | mm |

Files use CF-1.7, `calendar=standard`, and `seconds since YYYY-MM-DD 00:00:00 +0000`.
These are UTC observation-axis timestamps, distinct from the file's publication/Last-Modified time.
Typical files have 289 timestamps at 300-second spacing, including both midnight endpoints;
neighboring files overlap at midnight and must deduplicate by exact UTC time. September 24 has
283 records with a 35-minute gap; September 26 has 287 records with a 15-minute gap. Do not fill
those periods. The webpage identifies -99.9 as invalid/missing; also honor NetCDF masks,
fill/missing attributes and nonfinite values. Invalid derived values need validation, not zero fill.

Across the tested window, temperature ranged 8.1–31.69 degC, RH 10.85–98.62%, station pressure
826.31–848.42 hPa, speed 0.010–6.402 m/s and maximum speed 0.3–16.4 m/s. A basic daily-mean
comparison against local Tempest exports for September 20–25 showed plausible broad temperature/RH
changes with site differences. This is a preliminary validation, not a scientific association test.

**Limitations identified during source verification:** NetCDF variables have no `time_bounds` or `cell_methods`
defining whether the average is start-, center-, or end-labeled. The linked gust description refers
to older Coastal hardware while the station page names Vaisala WXT510; the current gust averaging
and peak reset interval are not confidently verified. `rain_accum` dropped from about 73.2 mm to zero
across the September 24 gap. Never sum these cumulative values or invent rain across a reset/gap.
The U/V component descriptions also appear inconsistent with their numeric relationship to `wdir`;
a future direction aggregator should derive vectors from valid `wspd`/`wdir` pairs instead of
trusting component labels. Calm direction and near-zero resultant vectors must remain missing.

Initial recommendation was to establish the averaging timestamp convention, current gust
duration/reset window and counter behavior before deployment. These are retained as limitations
for the provisional implementation below: published observation labels remain unshifted, gusts
are explicitly provisional, and interval precipitation is withheld. The recommended architecture
was a NetCDF-capable collector (Python is more appropriate than adding an
HDF5 decoder to Apps Script), UTC upserts, native raw retention, the requested
`NCAR_Foothills_15min` and prefixed master fields, vector averaging, field-level missingness,
coverage, and publication-aware health monitoring. Keep the existing six-hour cadence and refresh
recent published UTC days. Only compute interval precipitation for adjacent valid counter samples
with a verified convention; leave resets/gaps blank. Validate DST and interval edges before marking
production-ready. At that verification stage, no NCAR sheet or collector had been created; the rollout below supersedes that status.


### NCAR provisional implementation

The owner authorized proceeding with next steps. Sean's anticipated follow-up is specifically for
**US-NR1 five-minute data**, not NCAR Foothills definitions; those remain separate workstreams.
The unresolved interval alignment and gust duration limit timing/cross-instrument interpretation;
they do not block retention of the published observations as a provisional regional comparator.
Rain-counter semantics block only interval precipitation, which remains missing.

Implemented source tables: `NCAR_Foothills_Native` and `NCAR_Foothills_15min`; master columns use
`ncar_foothills_` prefixes. Neither source writes Tempest values. The schema migration appends
columns while refusing mismatched populated schemas. Raw NetCDF revisions use immutable SHA-256
filenames in the existing private archive, so retries reuse a file and revisions preserve old bytes.

The Python reader validates station identity, location, UTC axis, units and shape, preserving native
UTC labels and gaps. NetCDF masks, nonfinite values, -99.9 and broad physically invalid readings become
missing; original bytes remain available. Quarter-hour means use valid reported readings in
`[bin_start, bin_start + 15 minutes)`, with no source time shift. Counts/coverage describe native
record availability (3 expected); individual fields can have fewer valid values. Direction uses
speed-weighted vectors from at least two valid positive-speed pairs, with near-zero resultants blank.
Peak gust is the maximum reported `wspd_max`, with duration unconfirmed. Native cumulative rain
counters are retained, but **all interval precipitation is blank**. A missing/revised-invalid source
record must not silently become a zero weather reading.

The reader sends daily files and native observations through HMAC-signed POSTs to the existing
Apps Script intake, using the existing private relay URL and signing secret. NCAR requests have
an authenticated source discriminator, bounded file/row sizes, timestamp/field validation and
idempotent UTC upserts; the existing Dyson request format is retained. No new public read endpoint
is introduced. `Source_Status` distinguishes disabled, stale/error and success, with explicit
provisional caveats. Observation age over 36 hours is stale, allowing for daily archive publication.
A failed external fetch is visible in Actions; scheduled Apps Script health refresh detects
staleness even if the relay cannot reach the intake. Always inspect last-attempt timestamps too.

Local validation used the actual September 20–October 13 files: **6,833 unique native observations**
from September 20 06:00 UTC through October 14 00:00 UTC, producing **2,280 populated quarter-hour
rows**. One fully absent quarter-hour remains absent; five bins have partial coverage, including
the final midnight endpoint. Every interval precipitation value remains missing. Original missing
periods were retained, and the first date is bounded at September 20 local midnight (MDT).

Read-only local collection (default: the three most recent completed UTC dates):

```bash
python3 -m venv /tmp/ncar-venv
/tmp/ncar-venv/bin/pip install -r scripts/ncar-requirements.txt
/tmp/ncar-venv/bin/python scripts/ncar_collect.py
/tmp/ncar-venv/bin/python scripts/ncar_collect.py --start 2026-09-20 --end 2026-10-13
/tmp/ncar-venv/bin/python -m unittest discover -s tests -p 'test_ncar.py' -v
```

All local outputs default to ignored `tmp/ncar-foothills/`. For a cached verification run, supply
`--offline --cache-dir tmp/ncar-foothills-verification`. Nothing is published without `--publish`.

Deployment and operation:

1. Push the reviewed source to the **existing** bound Apps Script project and update its existing
   web-app deployment, preserving the current intake URL and Dyson settings.
2. Deployment enables the authorized provisional NCAR source by default; private Script Property
   `NCAR_FOOTHILLS_ENABLED=false` pauses intake. Retain `KEEP_RAW=true`.
   NCAR uses `DYSON_INGEST_SECRET`; no weather-source API key is required.
3. Commit/push the new workflow and set repository variable `NCAR_FOOTHILLS_ENABLED=true`.
   Manually run **NCAR Foothills comparator** with September 20 through the most recent completed
   UTC date. Existing `DYSON_INGEST_URL` and `DYSON_INGEST_SECRET` repository secrets are reused.
4. Verify acknowledgement counts, new source/native/master rows, Schema/README caveats, UTC/DST,
   raw archive and Source_Status in the same private workbook. Verify the existing Dyson intake.
5. The six-hour `37 */6 * * *` cron is enabled after the successful live check. Each scheduled run refreshes
   the three most recent completed UTC dates; do not request an unpublished current-day file.

The workflow is gated by repository variable `NCAR_FOOTHILLS_ENABLED=true`. The public-repository
Actions inactivity limitation documented above applies to its schedule. This source is provisional,
not a research-quality reference, and no analytical conclusions are encoded in collection.


### Live rollout — 2026-10-14

The existing Apps Script web-app deployment was updated in place (version 5), preserving the same
intake URL and existing source credentials. NCAR is enabled as a provisional regional comparator;
set private Script Property `NCAR_FOOTHILLS_ENABLED=false` to pause intake and repository variable
of the same name to `false` to skip its GitHub job. Carriage Hills remains disabled; NR1 remains
awaiting separate five-minute-data guidance from Sean.

The manual NCAR backfill uses the existing private GitHub secrets, with no station account/key.
A fresh Dyson collection against the updated intake succeeded. The live source/master readbacks
confirmed numeric readings, source attribution/caveats, local MDT timestamps and explicit partial
coverage/missing flags, including the September 24 gap. Raw revisions are stored in private Drive.
The successful 24-file backfill (September 20–October 13 UTC archives) populated 6,833 unique
native observations and 2,280 unique quarter-hour records, beginning September 20 at midnight MDT.
All 24 raw files are privately archived. Missing intervals remain absent from the source table and
explicitly marked missing in Master; current unpublished intervals have zero coverage and blank
weather values. Interval rainfall remains blank, with native cumulative counters retained.

The six-hour schedule (`37 */6 * * *`, UTC) is enabled, refreshing the last three completed UTC
dates. The first full backfill and fresh Dyson compatibility run both succeeded; scheduled runs
will provide ongoing operational validation. NCAR remains provisional, with source-health and
36-hour staleness monitoring enabled.

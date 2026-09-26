# Dyson air-quality access findings

Historical research record. The live hosted collector and private Sheet are documented in
`../air-quality-google-apps-script/README.md`.

Status: verified against the owner's account on September 26, 2026. The MyDyson APIs are
unofficial/community-documented and may change.

## Cloud history findings

The account manifest identifies the machine as an HP07, product type `527K`, variant `K`, with
`EnvironmentalData` and `ExtendedAQ` capabilities. It also confirms that local MQTT credentials are
available; no credential value is stored in the project.

Two cloud endpoints were tested:

1. `GET /v1/messageprocessor/devices/{serial}/environmentdata/daily`
   - Despite its name and the incomplete community model, the HP07 response contains seven local
     calendar days: 672 slots at 15-minute resolution.
   - The observed window began `2026-09-20T00:00:00-06:00`. September 20–25 each contained all 96
     samples; September 26 contained 37 samples when inspected.
   - All populated sensor arrays were aligned and had 613 samples, with no holes inside the
     populated interval.
   - Individual fields are available: `volm` (VOC index), `p25m` (PM2.5), `p10m` (PM10), `no2m`
     (NO2 index), `tmpm` (temperature), and `humm` (humidity), plus combined `aqlm`, fan speed, and
     usage. PM values are normalized as µg/m³; VOC and NO2 remain proprietary Dyson indexes.
2. `GET /v1/messageprocessor/devices/{serial}/environmentdailyhistory`
   - Returned seven daily records and 24 hourly slots per record for AQI, temperature, humidity, and
     usage.
   - All 168 values in every series were null, making this endpoint unusable for this HP07/account.

The first endpoint accepts no date or range parameter. Its verified seven-calendar-day response is
therefore the retrospective backfill limit. A Mac can sleep for several days and recover the missed
15-minute readings when it returns, but data that has aged out of that window cannot be requested
later. Polling at least once within each six-day interval would avoid crossing the observed boundary;
daily collection would provide a safer margin if a hosted collector is eventually selected.

## Local MQTT findings

Supported Wi-Fi Dyson purifiers expose an MQTT broker on the LAN and advertise
`_dyson_mqtt._tcp.local.` by mDNS. The account manifest supplies encrypted local-broker credentials.
Common environmental message fields include:

- `p25r` or `pm25`: PM2.5 concentration in µg/m³.
- `p10r` or `pm10`: PM10 concentration in µg/m³.
- `va10`: VOC index (community implementations divide by 10 for display).
- `noxl`: NO2 index (community implementations divide by 10 for display).
- `tact`: temperature, typically Kelvin × 10.
- `hact`: relative humidity percent.
- `hchr`/`hcho`: formaldehyde on models that include that sensor.

VOC and NO2 are proprietary index values, not raw µg/m³ concentrations. Older integrations labeled
them incorrectly; maintained community code explicitly treats them as indexes.

MQTT messages update roughly every 30–60 seconds in maintained integration documentation, and a
collector may explicitly publish a read request for current environmental data. It is not a history
store. If a laptop is off, local MQTT cannot recover the missing interval later.

A read-only 10-second mDNS browse from this Mac did not see a `_dyson_mqtt._tcp.local.` instance.
That result is inconclusive: multicast visibility can depend on the Wi-Fi segment, router settings,
model/firmware, and whether the device advertises continuously. No ports were scanned and no
connection was attempted.

## Architecture conclusion at the time of the initial research

Cloud retention is now confirmed at seven local calendar days for this account. A laptop collector
can backfill after ordinary sleep/offline periods shorter than that window. Longer outages will lose
older Dyson detail unless an always-on hosted collector polls before expiry. Local MQTT can
supplement cloud data with separate, higher-frequency channels while a LAN collector is awake, but
cannot replace cloud backfill.

Keeping the purifier powered and online materially improves the cloud-backfill case because the
machine—not the Mac—is the data source. Dyson says continuous monitoring collects environmental
information even when the fan is off; this project will not change that setting, so its current
MyDyson configuration remains authoritative.

The later hosted design uses a GitHub Actions relay for Dyson and a private Google Sheet for
15-minute observations. These findings remain the validation basis: HP07/527K, individual
pollutants, 15-minute cadence, and a seven-calendar-day cloud window.

# Temporary Dyson–Tempest–outdoor AQ analysis

Historical local prototype. The live hosted collector and canonical private Sheet are documented in
`../air-quality-google-apps-script/README.md`; this tool remains useful for independent local checks.

This side project creates an ephemeral 15-minute join between the local Dyson cloud-history export
and Tempest observations, with an optional regional outdoor-air-quality layer. It does not yet
implement persistence, hosting, or mobile access. Generated files are written under Git-ignored
`tmp/`.

## Outdoor air quality sources

The read-only collector uses public CDPHE hourly history pages and needs no account or API key:

- Boulder-CU/Athens (`BOU`, AQS `080131001`) for PM2.5 and PM10.
- Boulder Reservoir (`BOUR`, AQS `080130014`) for ozone.

For the supplied address, straight-line distances are approximately 5.8 miles to BOU and 6.2 miles
to BOUR. Neither is a truly local foothills monitor: BOU is about 5,322 ft and BOUR about 5,203 ft,
while the Tempest/home site is roughly 7,200 ft. The roughly 1,900–2,000 ft vertical separation,
plus terrain and drainage effects, can make the regulatory observations poorly representative of
conditions at the home even when horizontal distance is modest. They are retained as regional
comparators, not labeled as local ground truth. The address and its geocoded coordinates are not
stored in this repository or any output.
CDPHE publishes its tables in fixed Mountain Standard Time; during daylight time their clock labels
are one hour behind local MDT. The collector converts them to UTC and `America/Denver` correctly.
Each CDPHE hourly average is repeated across the four 15-minute bins that it summarizes and retains
the original source-hour-ending timestamp. The combined outdoor AQI is the maximum available AQI
among PM2.5, PM10, and ozone; because these pollutants come from two sites, it is a regional
indicator rather than a reading from one colocated instrument.

Fetch the requested historical window:

```sh
python3 fetch_outdoor_aqi.py --start 2026-09-20 --end 2026-09-26
```

The CDPHE pages support retrospective retrieval, so this source can backfill after a laptop or
hosted job has been offline. CDPHE labels the real-time data as preliminary, uncorrected, and
unvalidated.

Open browser graphs (change the date control as needed):

- [CDPHE PM2.5 hourly history](https://www.colorado.gov/airquality/param_summary.aspx?parametercode=88101)
- [CDPHE PM10 hourly history](https://www.colorado.gov/airquality/param_summary.aspx?parametercode=81102)
- [CDPHE ozone hourly history](https://www.colorado.gov/airquality/param_summary.aspx?parametercode=44201)
- [AirNow Fire and Smoke map](https://fire.airnow.gov/) for corrected public outdoor PM2.5 sensors

OpenSnow station `CW8656 Boulder` is a CWOP personal weather station distributed through NOAA MADIS,
not an air-pollution monitor. It is therefore not an AQI source and is redundant with the on-site
Tempest for this analysis. OpenSnow's separate Air Quality Real-Time layer uses PurpleAir PM2.5
sensors with 10-minute display averages. A PurpleAir source can be added later as a hyperlocal
particle enhancement once its sensor name/index is identified; historical API access requires a
PurpleAir read key and consumes account points.

After the Dyson, Tempest, and optional outdoor AQ collectors have run:

```sh
python3 analyze.py
```

The default fresh-carbon-filter boundary is September 24, 2026 at 9:00 AM Mountain Time. Override
it if the installation time is known more precisely:

```sh
python3 analyze.py --filter-boundary '2026-09-24T08:30:00-06:00'
```

Outputs:

- `tmp/tempest-15min.csv`: weather means and summed precipitation in aligned 15-minute bins.
- `tmp/cdphe-outdoor-air-quality-15min.csv`: regional regulatory PM/ozone concentrations and AQIs.
- `tmp/dyson-tempest-joined.csv`: joined analytical rows retaining every individual Dyson pollutant
  plus available outdoor pollutant and AQI fields.
- `tmp/lag-correlations.csv`: Pearson correlations for every 15-minute lag from -3 to +3 hours.
- `tmp/analysis-report.md`: concise descriptive report.
- `tmp/analysis-summary.json`: machine-readable statistics.

Wind speed and direction are excluded. Results are exploratory and must not be read as causal.

The hosted pipeline now includes CDPHE regional AQ as a first-class input. This local prototype
does not write to the hosted dataset.

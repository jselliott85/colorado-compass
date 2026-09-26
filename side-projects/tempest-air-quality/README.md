# Tempest air-quality side project

This is the original local collector. The unattended hosted pipeline and private Sheet are
documented in `../air-quality-google-apps-script/README.md`.

This isolated, dependency-free Python tool downloads historical observations from a Tempest
weather station and writes one normalized CSV per local date. It is separate from the Colorado
Compass static site and does not affect the site or its deployment.

## Security setup (recommended: macOS Keychain)

The tool never accepts a token as a command argument and never prints it. On macOS, it first uses
`TEMPEST_TOKEN` when already present, then falls back to the login Keychain. The local `.env` file
and raw API responses are ignored by Git.

Store the token from your own Mac Terminal with this command. Keep `-w` last: macOS then prompts
for the value without putting it in the command or shell history.

```sh
security add-generic-password -a "$USER" -s "co-compass-tempest" -U -w
```

The tool retrieves that entry through macOS's `security` utility only while making a request. The
secret is held in process memory and is not written to disk. This also supports tasks launched
from ChatGPT mobile's Remote view because the work still runs on the connected Mac.

To remove the credential later:

```sh
security delete-generic-password -a "$USER" -s "co-compass-tempest"
```

### Alternative: environment variable or ignored file

Export the token in the current shell:

```sh
export TEMPEST_TOKEN='your replacement token'
```

Or create a private local file from the safe template, then edit it locally (do not paste the
token into chat or any tracked file):

```sh
cd side-projects/tempest-air-quality
cp .env.example .env
chmod 600 .env
```

## Verify access and identify IDs

From this directory, run:

```sh
python3 tempest.py discover
```

Successful authentication prints the station and device IDs and saves a deliberately limited
copy to `data/tempest/station-metadata.json`. Wi-Fi names, serial numbers, coordinates, and the
credential are not written.

## Retrieve observations

Fetch the two initial validation dates with one command:

```sh
python3 tempest.py fetch --start 2026-09-24 --end 2026-09-25
```

Fetch another date:

```sh
python3 tempest.py fetch --date 2026-10-01
```

The tool normally selects the only outdoor Tempest device. If the account has multiple stations
or devices, use the IDs printed by `discover`:

```sh
python3 tempest.py fetch --date 2026-10-01 --station-id STATION_ID --device-id DEVICE_ID
```

## Outputs and interpretation

- `data/tempest/YYYY-MM-DD.csv` — analysis-ready observations in Mountain Time and UTC; the
  generated `data/` tree is ignored by Git.
- `data/tempest/validation-summary.txt` — records, ranges, cadence, missing values, and gaps.
- `raw/YYYY-MM-DD.json` — original API response for debugging; ignored by Git.

The normalized dataset includes temperature, relative humidity, calculated dew point, station
pressure, solar radiation, illuminance, UV, precipitation, precipitation type, lightning,
battery, and report interval. Tempest's historical device response does not provide sea-level
pressure, so it is not fabricated from station pressure.

Wind values arrive in the raw Tempest observation array, but this installation is obstructed.
The tool intentionally excludes all wind fields from the CSV and validation summary so they
cannot accidentally enter later correlations.

The API supplies precipitation accumulated during each report interval. When Rain Check's
corrected interval value is present, the tool uses it; otherwise it uses the device's original
interval accumulation. Daily precipitation in the summary is the sum of those interval values.

Missing observations remain missing: the tool neither fills nor interpolates them. The summary
reports missing fields and timestamp gaps. Its broad physical-bound checks are useful for catching
obvious data problems, but comparison with the Tempest web interface remains a visual validation
step.

## Test

```sh
python3 -m unittest discover -s tests -v
```

API reference: <https://weatherflow.github.io/Tempest/api/swagger/>

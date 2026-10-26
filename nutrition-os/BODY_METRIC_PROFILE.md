# Body-metric profile garmin-index-s2/1.0

This version is independent of Settings.schema_version=1.0 and Scout's food-logging contract v1.0. Neither shared configuration nor Food log headers were changed. Scout added and verified Body metrics S=bmi and T=source_record_json before the approved real-record test. A:R retain their original names, order and semantics.

## Source and normalization

The profile applies to the personally validated Garmin Index S2 account response, not every Garmin product or API version. Use actual samplePk as exact text source_id, source=garmin_personal_api, and a local garmin:<samplePk> namespace for measurement_id. Never fabricate a Garmin source ID. Missing IDs, non-Index provenance, conflicting existing source records or duplicate source IDs stop for review.

| Wire field | Stored field/unit | Interpretation |
| --- | --- | --- |
| weight, grams | weight_kg, /1000 | Scale-measured weight |
| bodyFat, 0–100 percent | body_fat_pct | Provider body-composition estimate |
| bodyWater, 0–100 percent | body_water_pct | Provider body-composition estimate |
| muscleMass, grams | muscle_mass_kg, /1000 | Garmin-estimated muscle mass; preserve Index S2 provider definition, not total lean mass |
| boneMass, grams | bone_mass_kg, /1000 | Provider-estimated bone mass |
| bmi | bmi, BMI index (kg/m²) | Provider-calculated BMI |
| timestampGMT, integer Unix ms | measured_at_utc, ISO UTC | Authoritative source instant; derive local_date in America/Denver including DST |
| samplePk, sourceType, all original fields | source_id, device/source metadata, source_record_json | Exact original identity, timestamps, local calendar context and nullable metrics preserved |

The provider JSON is stored literally as text, not executed as a formula. It contains the original individual measurement, never API keys, bearer-token responses or headers. Null optional fields remain blank in canonical cells and null in raw JSON. Explicit zeros remain zero. Masses are not guessed from magnitude. See GARMIN_VALIDATION_RESULTS.md for the differences between observed payloads and the published API schema, and the provider's muscle/impedance caveats.

## Approved one-real-record test: October 26, 2026

- Re-read production metadata, all Body metrics rows in the supported range, destination constraints and Settings. Verified the expected 20 headers, no existing measurement rows and an empty destination.
- Used the already validated real source record, preserving its actual samplePk. Wrote exactly one record to Body metrics row 2, A:T, using typed values. This is an actual historical measurement, not the user's self-reported starting-weight goal.
- Separately read the whole supported range and compared all 20 persisted fields exactly against the intended payload, including normalized quantities, original source JSON, UTC/local date, source ID, import timestamps, revision and status.
- Re-normalized the same source with a new attempt timestamp and reconciled against the persisted row. Result: noop. No second write was sent; canonical row count stayed one, revision stayed 1 and original recorded_at_utc was preserved.
- Re-read Settings with the same field mask as the pre-write snapshot: all Settings values were unchanged, including schema_version=1.0 and the self-reported starting baseline. No baseline measurement was fabricated. No other records, formulas or tabs were written.

Raw source data, the normalized staging record and readback evidence remain in ignored private local storage. This tracked report intentionally omits personal measurement values and source-ID values.

## Operational boundary

This was one explicitly approved import/reconciliation test through the existing authorized connector. It did not create Google authorization, activate a schedule, import history in bulk or call Garmin workout APIs. The separately approved hosted authorization is documented in DAILY_SYNC_SETUP.md; scheduling status and validation are recorded there. Provider-key expiry must still be confirmed in Connect. Daily retries must perform the same exact-ID reconciliation; a changed source record is a reviewable correction, not permission to overwrite arbitrary existing rows.

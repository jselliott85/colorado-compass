# Garmin Index S2 validation results

October 26, 2026. No credentials, measurement values, source IDs or raw health records are included in this tracked report. Actual captures remain owner-only in ignored local/garmin. The later approved one-real-record write/readback and no-op repeat are now complete after Scout added S:T; see [BODY_METRIC_PROFILE.md](BODY_METRIC_PROFILE.md). Recurring ingestion remains off. The sections below retain the original validation findings and proposed setup context.

## Executed and confirmed

- Read the user-saved Keychain item without exposing its value; exchanged it for Garmin's plain-text bearer token. No action is needed to finish authentication. The expiry date selected in Garmin was not returned/verified here; confirm it in Connect before scheduling.
- The system Python's old LibreSSL failed TLS negotiation. The bundled modern Python succeeded without weakening certificate checks. The documented all-measurements endpoint returned HTTP 400; the documented range endpoint with includeAll=true worked.
- A recent three-day query returned no in-window observations, plus a previousDateWeight reference. A focused query around that historical date returned a real Index measurement. Thus older data is accessible; the provider's maximum retention/lookback has not been established. The validator's seven-day window is a local safety limit only.
- The user confirmed Index S2 and the historical weight, body fat, muscle mass, water, BMI and bone values against Garmin Connect. Two independent same-date reads returned the same real samplePk and identical full measurement payload.
- The observed sourceType is INDEX_SCALE. The model is confirmed by the user, not inferred from sourceType. Generic muscle mass is not treated as whole-body lean mass.

## Actual account fields and units

| Metric | Actual API field | Wire unit/format | Canonical destination | Availability/evidence |
| --- | --- | --- | --- | --- |
| Weight | weight | grams | weight_kg, divide by 1,000 | Non-null; conversion confirmed against Connect |
| Body fat | bodyFat | percentage points, 0–100 | body_fat_pct, no fractional rescaling | Non-null; confirmed against Connect |
| Muscle mass | muscleMass | grams | muscle_mass_kg, divide by 1,000 | Non-null; confirmed against Connect; provider-estimated muscle measure |
| Body water | bodyWater | percentage points, 0–100 | body_water_pct | Non-null; confirmed against Connect |
| BMI | bmi | BMI index, kg/m² | proposed bmi column | Non-null; confirmed against Connect |
| Bone mass | boneMass | grams | bone_mass_kg, divide by 1,000 | Non-null; confirmed against Connect |
| Metabolic age | metabolicAge | not established for this account | no dedicated new column | Present but null; no usable measurement established |
| Physique rating | physiqueRating | not established for this account | no dedicated new column | Present but null; no usable measurement established |
| Visceral fat | visceralFat | not established for this account | no dedicated new column | Present but null; no usable measurement established |
| Weight difference | weightDelta | not independently validated | not imported as an observation | Provider contextual value; derive trends from canonical observations instead |
| Measurement instant | timestampGMT | integer Unix milliseconds | measured_at_utc, normalized UTC; original in proposed source_record_json | Actual format differs from published date-time-string definition |
| Original local context | date; calendarDate | local timestamp representation; YYYY-MM-DD | preserve raw in source_record_json | Never reinterpret date as the authoritative UTC instant |
| Exact source identity | samplePk | integer returned by provider, preserved as decimal text | source_id | Real provider ID, stable in two reads; not invented from timestamp or weight |
| Device provenance | sourceType | INDEX_SCALE | source/device/method fields plus raw record | Index source verified; S2 model user-confirmed |

These are execution findings for the sampled historical reading, not a guarantee that every future reading contains every metric. The published [Personal API reference](https://developer.garmin.com/gc-developer-program/personal/swagger-docs) describes different weight/timestamp units and omits the observed ID/source fields; the actual account response plus Connect comparison governs this validated profile. Fail closed if a future payload changes units, types or required identity.

## Garmin's muscle definition and limitations

The [Index S2 manual](https://www8.garmin.com/manuals/webhelp/GUID-0BADEBCF-960D-4961-856C-86B9204BC169/EN-US/GUID-CB348359-1E39-491B-86B5-79CB12FB6A8C.html) labels this measurement skeletal muscle mass and describes mass attributed to muscle. Garmin's [Index-series support explanation](https://support.garmin.com/id-ID/?faq=8snvbduvHyATw9F0svrAT9) defines the skeletal category as muscles responsible for moving the body, excluding smooth and cardiovascular muscle. Preserve the API name muscleMass and the user-facing label **Garmin estimated muscle mass**; retain the model-specific provider definition in documentation rather than pretending the API field alone established it.

This is a bioimpedance estimate, not an independent clinical measurement of muscle gain/loss or total lean mass. Garmin documents sensitivity to hydration, timing and recent activity. Trend views should span weeks, show gaps and keep individual fluctuations in context. Water and tissue metrics overlap; do not add them together or compute lean mass as a muscle-mass substitute. [Index S2 measurement guidance](https://www8.garmin.com/manuals/webhelp/GUID-0BADEBCF-960D-4961-856C-86B9204BC169/EN-US/GUID-CB348359-1E39-491B-86B5-79CB12FB6A8C.html).

## Identity, corrections and empty-window behavior

Use source=garmin_personal_api and the exact text samplePk as source_id. measurement_id may be a local namespace such as garmin:<samplePk>; it must not be represented as a second Garmin-generated identifier. Same source ID plus identical normalized/source payload is a no-op. Repeated-read reconciliation passed on real responses and synthetic tests. Duplicate IDs, a conflicting source payload or a local-ID collision stop for review; existing rows are not overwritten. Approved corrections would preserve recorded_at_utc and increment revision.

Preserve original timestamp representations in the proposed raw-record column and canonical UTC separately. Derive Denver dates with IANA rules. Missing numeric fields remain null/blank, explicit zeros remain zero. Exclude adjacent context, averages and daily summaries from ordinary imports. No rows in a successful window means no new measurements, not zero body weight or an API failure. Show last actual measurement date as freshness; never fabricate a fresh point for today.

The local normalizer/reconciler and 14 synthetic tests cover explicit unit conversion, source IDs, null/zero, timezones/DST, collisions, repeated payload no-ops and privacy boundaries. A real normalized row is staged locally, but first Sheet write/readback remains pending the schema coordination below.

## Small schema proposal, not applied

Append two columns after the existing A:R fields: S=bmi and T=source_record_json. Keep all current positions unchanged. The raw provider record preserves original timestamps, samplePk, sourceType and nullable fields without many speculative metric columns. It contains health data only, never authentication headers or token responses. Its unit interpretation is the versioned validated profile above. See [Scout handoff](SCOUT_GARMIN_HANDOFF.md). This remains a proposal until coordinated with Scout, as requested.

## Native Dashboard plan, now implemented independently

The later final handoff superseded the earlier instruction to wait for populated measurements. The three empty-safe native charts and weight/weekly progress view are now implemented in production; see [DASHBOARD.md](DASHBOARD.md). Body metrics remains unchanged pending schema coordination and first write/readback. The following describes the design intent, without authorizing ingestion.

Preserve the current daily food/target view and add narrow, vertically stacked native charts after data/schema validation:

1. Weight in kg: daily representative readings and seven-calendar-day rolling average. Use the latest valid reading per Denver day for the average to avoid weighting multiple-measurement days more heavily. Show actual observed days/counts; do not forward-fill missed weigh-ins or treat gaps as zero. One historical reading is not a seven-day trend.
2. Body fat in percent: observed-day points over multiple weeks, with gaps visible.
3. Garmin estimated muscle mass in kg: observed-day points over multiple weeks, explicitly labelled as an impedance-based estimate affected by hydration/timing.

Keep water, BMI and bone in Body metrics. Do not add metabolic-age/physique/visceral charts for null data. Any weekly comparison must use labelled, comparable windows and coverage counts; a long data gap is not weight-loss progress. No separate app, database or hosted Dashboard is needed.

## Recommended daily sync and remaining actions

After coordinated schema extension and first upsert/readback, use one serialized daily Garmin body-metric job with a rolling seven-day overlap and ID-based reconciliation. A fixed 17:00 UTC Actions schedule corresponds to 10:00 MST / 11:00 MDT; confirm it fits the user's usual measurement time. Scheduling delays are possible, so it is not a real-time feed. Initial history backfill should be separately bounded and approved. No Garmin activity endpoint is used.

Keep the expiring provider key in Keychain for local validation. If Actions is selected, securely configure a dedicated secret there later, acquire a fresh bearer token per run and discard it afterwards. Check the actual key expiry in Connect and record a renewal date; recommended pilot expiry remains 30 days, with 90 days considered only for the approved routine setup. A new key must be generated before expiry and the secure store updated; this is not refresh-token rotation. [Garmin authentication FAQ](https://developer.garmin.com/gc-developer-program/personal/personal-faq/).

Daily Actions also needs its own secure Google Sheets authorization; the interactive Codex connector cannot simply be assumed available in CI. Resolve that separately with minimal workbook access, no credentials in Sheets/git, sanitized logs and no health artifacts. Do not provision it or enable recurring ingestion before the first measurement is written/read back successfully. User action now: coordinate the concrete two-column proposal with Scout; later confirm key expiry and choose secure scheduled Google authorization. Authentication itself is working.

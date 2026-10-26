# Garmin Index integration feasibility

October 26, 2026. This document records the initial documentation-based assessment. It is superseded where noted by [actual validation results](GARMIN_VALIDATION_RESULTS.md): authentication and a historical reading are now verified; no Sheet writes, importer schedule or body rows have been enabled.

Update: the user stored the key in Keychain. Actual responses expose samplePk, INDEX_SCALE provenance, gram mass values and Unix-millisecond timestamps despite differences in the published DTO. Units were compared with Connect and source identity/payload stayed identical across repeated reads. The pending gates are Scout coordination of append-only schema additions, the first Sheet write/readback, and scheduled Google authentication. [GARMIN_SETUP.md](GARMIN_SETUP.md) supplies the current procedure.

## Supported route

Garmin's Personal API supports individuals using their own data. A self-generated expiring key is exchanged for a bearer token lasting up to 24 hours; there are no refresh tokens. This avoids the business Health API onboarding path. Generate/store credentials through the provider and a secure local credential store or Actions Secrets when setup is coordinated; never paste them into chat. [Official FAQ](https://developer.garmin.com/gc-developer-program/personal/personal-faq/), [token instructions](https://developer.garmin.com/gc-developer-program/personal/personal-api/).

The official OpenAPI specification is embedded in the JavaScript bundle loaded by the [Personal API reference](https://developer.garmin.com/gc-developer-program/personal/swagger-docs). Inspection resolved fields that were unavailable in the Phase 0 text rendering. It documents a flat all-measurements endpoint and a range endpoint whose includeAll option exposes multiple measurements per day. Garmin's [official Python client](https://github.com/garmin/connect-personal-api-python/blob/main/src/garmin_personal_api/client.py) wraps the range endpoint with includeAll enabled.

Use only weight reads. Prefer `/weight-service/weight/all/{startDate}/{endDate}` for individual entries, or flatten range.dailyWeightSummaries[].allWeightMetrics with includeAll=true. Do not import daily summaries, totalAverage, previousDateWeight or nextDateWeight as extra measurements; the latter two are contextual records outside the requested window. Endpoint bounds use the user's local calendar, so include an overlap and validate the Garmin account timezone against Denver. [Official reference](https://developer.garmin.com/gc-developer-program/personal/swagger-docs).

## Mapping to existing Body metrics

| Existing destination | Official specification evidence and remaining gate |
| --- | --- |
| weight_kg | DateWeightDTO.weight explicitly documents kilograms. Do not assume grams from unofficial Connect libraries. Validate one known Index weigh-in before automation. |
| measured_at_utc | timestampGMT is documented as a date-time string. Parse its offset and normalize to UTC; validate actual precision/format. Do not assume Unix milliseconds. |
| local_date; time_precision | Derive Denver date from the validated instant. The spec also supplies local calendarDate/date, which must not be relabelled Denver if the account zone differs. Preserve date-only precision if no trustworthy instant is available. |
| body_fat_pct; body_water_pct | bodyFat/bodyWater exist in DateWeightDTO. That individual-record definition does not establish their units; average definitions describe percentages but are not individual measurements. Confirm scale and account availability before mapping. |
| muscle_mass_kg; bone_mass_kg | muscleMass/boneMass exist, documented as integers without explicit units. Keep blank until units are verified; do not assume grams or kilograms. |
| source; device; measurement_method | Set source=garmin_personal_api. The inspected DateWeightDTO has no device/sourceType field. Do not label every Connect reading Index: manual entries may be mixed in. Record device as unknown unless verified; impedance body composition is estimated. |
| source_id; measurement_id | The inspected official DTO documents no stable sample ID. Exact source-ID deduplication is therefore **not established**. Do not import using daily date or weight as identity. |

These field claims come from the embedded official specification, not a live account response. BMI and other additional provider fields need no new columns for the initial weight-only scope. Weight in kg requires no conversion if the actual payload conforms; if a supported payload explicitly declares a different unit, use grams/1000 or pounds × 0.45359237 as appropriate, never magnitude-based guessing. Display conversion must not change stored units. [Official reference](https://developer.garmin.com/gc-developer-program/personal/swagger-docs).

## Deduplication is the key implementation gate

First inspect a small known range privately. If an actual supported stable measurement ID exists beyond the published DTO, preserve it verbatim as source_id and derive a stable namespaced measurement_id. If no ID exists, verify whether exact UTC instants are unique and immutable for this account before proposing a deterministic source-plus-timestamp key. Reject collisions; do not include weight/body values in the identity because corrections would become new records. A timestamp-only key cannot safely reconcile moved timestamps or two observations at the same instant. Those cases require explicit review rather than a false promise of exact deduplication. If only dates exist, do not enable routine import until identity handling is coordinated.

Read back each keyed upsert; unchanged payloads are no-ops, corrections retain identity/recorded time and increment revision. Keep multiple same-day readings. Missing records in a bounded response are not confirmed deletions. No second database or checkpoint store is needed; the existing source IDs and rows support reconciliation once identity is proven.

## Next implementation sequence

1. User securely configures an expiring Personal API key when setup begins; no credential request in chat. Privately read one small range containing a known Index result. Verify kg, UTC timestamp, account timezone, IDs, multiple same-day readings and optional body fields against Connect.
2. Implement a narrow normalizer and dry run using redacted/synthetic fixtures. Gate unknown units/identity, null versus zero and collisions. Do not save real responses in git, logs or CI artifacts.
3. Coordinate one initial Body metrics write/readback test and establish Codex's single routine Garmin writer. Preserve the exact existing headers, source fields and revision rules. Do not touch meals, targets or Completed activities.
4. Only after correctness, consider one small daily overlapping pull via GitHub Actions. Serialize Garmin runs, pin dependencies/actions, avoid shell tracing, and suppress HTTP bodies/authorization headers. Acquire a new bearer token each run and discard it afterwards. Expiry/revocation fails closed with a sanitized error; no silent password-login fallback.
5. Choose Google Sheets authentication separately. Codex's interactive connector is not automatically available in Actions. Options need secure delegated OAuth token handling or a dedicated service identity granted access only to this workbook. This is a remaining setup dependency, not a provisioned service. Keep provider key, Google credentials and any private IDs out of code. Pricing/quotas and key entitlement still require setup verification.

If identity/permissions remain unresolved, retain supported manual/CSV weight import with explicit provenance instead of adding an unofficial password-based client. No Garmin activity endpoint, workflow or completed-workout writer is enabled.

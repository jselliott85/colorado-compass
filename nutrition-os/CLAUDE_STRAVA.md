# Claude completed-activity contract

October 26, 2026. Existing schema v1.0; no new workbook or schema migration.

## Ownership and gate

Claude is the exclusive routine writer to **Completed activities** in the production Nutrition OS workbook. Use official Strava MCP as the completed-activity source for every sport. Never merge Garmin, Zwift or TrainingPeaks completed-workout feeds. Do not write Food log, targets, Body metrics, formulas or Dashboard cells. Source-state Settings changes require coordination with Codex; never overwrite an entire Settings block.

Before real ingestion, confirm the user's permission, applicable Strava/MCP conditions for persisting data in this Sheet, and permitted downstream reads/analysis by Scout. MCP activation alone does not resolve those questions. Until cleared, provide a field-availability report; do not import real activities. Codex may perform explicitly coordinated migrations or synthetic tests, not independent routine ingestion.

## Fields and units

Read metadata, A1:S1 headers and validation before writing. The current fields are:

| Fields | Meaning |
| --- | --- |
| activity_id; source_id | Exact original Strava activity ID as text in both; no numeric rounding or generated replacement |
| local_date; start_at_utc | Numeric Denver reporting date; unambiguous UTC ISO 8601 timestamp ending in Z |
| sport_type | Actual supplied sport classification; document any normalization |
| moving_s; elapsed_s | Separate durations in seconds; missing stays blank |
| distance_m | Meters, including explicit source zero where legitimate |
| estimated_kcal | Source calorie estimate in nutritional kilocalories; blank if absent |
| average_hr_bpm; average_power_w | Optional average heart rate in beats/minute and average power in watts |
| energy_kj; power_method | Optional mechanical energy in kilojoules; power method only if source establishes measured/estimated provenance |
| source | strava |
| recorded_at_utc; updated_at_utc | First import and last actual mutation timestamps, UTC |
| revision; status; correction_reason | Positive integer revision; active or void; concise reason for changes |

Required import minimum: exact activity ID, trustworthy timestamp/Denver date, sport, source and import metadata. No missing source measure is invented to satisfy a column. Never infer zero distance for an indoor activity or substitute elapsed duration for moving duration without a documented distinction. Never convert mechanical kJ into food calories or infer missing calories from power/heart rate. Estimated calories do not automatically increase nutrition targets.

Claude must report exact MCP field names/types, units, nullability, timezone/offset semantics, whether detail calls are needed, pagination/window completeness, ID precision and update/deletion visibility. **Mapping is pending this report.** Provider REST API fields are not proof of MCP output. Stop on a missing required field; coordinate before any schema change. Keep personal payloads out of repository notes.

## Deduplication, correction and readback

Use one serialized Claude activity writer. Read A2:A2001 and compare complete text IDs exactly, not substring hits or row position. Zero matches permits a new row after checking that its entire A:S destination is empty. One match means read/reconcile it. Multiple matches stop ingestion for review. Preserve the same ID across imports, corrections, voids and retries; do not use title, date or distance as identity. Never exceed the supported range without a coordinated extension.

On creation use revision 1. For a genuine source correction, preserve activity_id and original recorded_at_utc, update in place, increment revision once and record what changed. Reimporting an identical source record is a no-op, not a new revision. An authoritative source change to unknown may clear a prior metric; a partial/list response omitting a field is not evidence that its previous value was removed. Do not void a record merely because it disappeared from a page, rolling window or a permission-limited result. Confirm deletion/correction semantics first; use void rather than silent deletion when warranted.

Read the persisted full row separately, compare all intended values and revision, then recheck the ID range for exactly one canonical record. Only then report imported/corrected. On a lost response, retain the same activity ID and expected prior revision, locate it afresh and compare the intended payload. Identical result means success; absent means retry; different/newer state means conflict. Never overwrite a newer row or blindly increment on retry. Sheets validation does not provide a transaction or revision compare-and-swap.

Convert the source instant with an IANA America/Denver timezone rule, including DST. Do not append Z to a local clock time or apply fixed UTC-7. Retain UTC as the authoritative instant and derive the consumption-independent activity reporting date. If the MCP only supplies an ambiguous local/date-only start, stop and request clarification: this schema has no activity time_precision field, and must not be silently changed.

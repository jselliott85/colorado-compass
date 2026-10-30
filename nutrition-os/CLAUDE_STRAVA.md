# Claude completed-activity contract

October 26, 2026. Existing schema v1.0; no new workbook or schema migration.

## Current ownership: Strava MCP inactive

On October 29, 2026, the owner authorized and enabled Strava MCP; Claude validated the field mapping and corrected three existing screenshot rows with MCP values. The owner reversed that decision the same day: unattended automation would require a scheduled cloud agent, which the owner declined, and storage compliance remains unconfirmed under support ticket #19194. Strava MCP is not used for Nutrition OS; `Settings.strava_status` is disabled. The owner is handling connector disconnection in claude.ai; completion has not been verified here.

Scout is again the sole routine writer for **Completed activities**, using the owner’s screenshots, descriptions and manual entries. Claude must not import, reconcile, overwrite or void activity rows using MCP data. Codex maintains the schema and coordinated Settings changes; it does not perform the screenshot corrections. See [SCOUT_LOGGING.md](SCOUT_LOGGING.md) for the active activity contract and correction handoff. Do not create a Strava API client.

The field and mapping notes below are inactive historical reference, not authorization to resume ingestion.

## Historical fields and units (inactive)

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

The former MCP contract required Claude to report exact MCP field names/types, units, nullability, timezone/offset semantics, whether detail calls are needed, pagination/window completeness, ID precision and update/deletion visibility. Provider REST API fields are not proof of MCP output. Stop on a missing required field; coordinate before any schema change. Keep personal payloads out of repository notes.

## Verified MCP mapping (October 29, 2026; inactive historical reference)

Verified by Claude Code against live `list_activities` and `get_activity_performance` output, with SI units (`use_preferred_units` omitted).

| Column | MCP field | Notes |
| --- | --- | --- |
| activity_id, source_id | `id` | String; full precision |
| local_date | date part of `start_local` | Written as a numeric date |
| start_at_utc | `start_local` converted from America/Denver (IANA, DST-aware), `YYYY-MM-DDTHH:MM:SSZ` | The MCP returns no offset or UTC field; virtual rides report a game-world location. **Owner decision, Oct 29:** treat every start_local as Denver time. This is wrong only for activities recorded while traveling in another timezone. The owner accepts this as a known limitation, because what matters is the reporting day. local_date comes directly from the start_local date, so it is always the activity's own local day; only start_at_utc can be off while traveling. GPS-based timezone lookup was considered and declined. |
| sport_type | `sport_type` | Unchanged (e.g. Walk, VirtualRide) |
| moving_s, elapsed_s | `summary.moving_time`, `summary.elapsed_time` | Seconds |
| distance_m | `summary.distance` | Meters |
| estimated_kcal | `summary.total_calories` (= performance `calories`) | kcal; blank if absent |
| average_hr_bpm | performance `average_heartrate` | Only when `has_heartrate` is true; otherwise blank |
| average_power_w, power_method | performance `average_watts`; `has_device_watts` true → `measured`, false → `estimated` | The power value is written unrounded |
| energy_kj | none | Always blank; never derived from power × time |

The list call is cursor-paged (`has_next_page`/`end_cursor`), and its date range filters on local time. The list returns no HR or power, so each activity needs a performance call. The MCP shows no edit or deletion history, so an activity missing from a page is never treated as deleted.

## Current row ownership

- **Manual rows** have no Strava ID (`source` ≠ `strava`, such as a Scout-entered `user` walk with a UUID). Claude never edits, voids or deduplicates them against Strava. The owner expects more of them.
- **Scout screenshot rows** may carry a real Strava `activity_id`, retained as a stable identity/reference rather than evidence of MCP sourcing. Scout is again the routine writer for Completed activities, from screenshots and manual entries. Claude’s three October 29 MCP replacements are historical; Scout must correct those rows in place from the owner’s screenshots under the handoff in SCOUT_LOGGING.md. Claude must not reconcile them from MCP again.

## Former MCP deduplication, correction and readback (inactive)

Use one serialized Claude activity writer. Read A2:A2001 and compare complete text IDs exactly, not substring hits or row position. Zero matches permits a new row after checking that its entire A:S destination is empty. One match means read/reconcile it. Multiple matches stop ingestion for review. Preserve the same ID across imports, corrections, voids and retries; do not use title, date or distance as identity. Never exceed the supported range without a coordinated extension.

On creation use revision 1. For a genuine source correction, preserve activity_id and original recorded_at_utc, update in place, increment revision once and record what changed. Reimporting an identical source record is a no-op, not a new revision. An authoritative source change to unknown may clear a prior metric; a partial/list response omitting a field is not evidence that its previous value was removed. Do not void a record merely because it disappeared from a page, rolling window or a permission-limited result. Confirm deletion/correction semantics first; use void rather than silent deletion when warranted.

Read the persisted full row separately, compare all intended values and revision, then recheck the ID range for exactly one canonical record. Only then report imported/corrected. On a lost response, retain the same activity ID and expected prior revision, locate it afresh and compare the intended payload. Identical result means success; absent means retry; different/newer state means conflict. Never overwrite a newer row or blindly increment on retry. Sheets validation does not provide a transaction or revision compare-and-swap.

Convert the source instant with an IANA America/Denver timezone rule, including DST. Do not append Z to a local clock time or apply fixed UTC-7. Retain UTC as the authoritative instant and derive the consumption-independent activity reporting date. If the MCP only supplies an ambiguous local/date-only start, stop and request clarification: this schema has no activity time_precision field, and must not be silently changed.

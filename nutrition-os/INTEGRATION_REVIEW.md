# Integration ownership and workbook review

October 26, 2026. Branch: nutrition-os/phase-1-foundation. Read-only production workbook review; no records, schema, formulas, settings or permissions changed.

## Evidence

Latest production-plan update: read-only verification found seven populated planned-workout rows and seven corresponding target rows for October 26–November 1. Each day's four target values exactly matched Daily summary, and the Dashboard's current-day target cells matched that summary. No workbook writes were made. Weekly screenshot imports and conversational adjustments are Scout-owned. Preserve original prescribed context when moving sessions; optional sessions must not automatically activate long-ride targets. Do not add an optional/committed column without coordination. Native weight charts remain deferred until Garmin measurement identity/units are validated; Strava stays disabled pending the storage-permission gate.

- **User-reported production execution:** Scout created/read/corrected synthetic meals, incremented revisions, reconciled retries, verified daily recalculation, voided/excluded meals and cleaned fixtures. The user verified Food log empty. This supersedes the earlier unexecuted basic Scout acceptance items in the historical Phase 1 validation record.
- **Verified here through execution:** production metadata still has nine ordered tabs, Dashboard first and America/Denver timezone. Completed activities A1:S1 and Body metrics A1:R1 exactly match schema.json v1.0. Read header/validation metadata and Dashboard formulas. Scanned 4,786 formulas across Dashboard, Daily summary and Weekly summary: none reference Completed activities or Body metrics.
- **Verified in current official Garmin documentation:** Personal authentication, weight endpoints and embedded OpenAPI DTO properties. See GARMIN_INTEGRATION.md for evidence and unresolved units/identity.
- **Unverified:** Claude's actual Strava MCP field availability/permissions, real Garmin account payload, scheduled Google authorization and physical mobile-device behavior. No new real data was imported or ingested for this review.

## Completed activities compatibility

The existing tab provides 2,000 input rows, text activity IDs, date/number formats, header freeze, strict input validation and duplicate-ID highlighting. It has no activity operation_id or source-update timestamp column. Do not add either speculatively: exact Strava ID, persisted payload, local revision and updated_at_utc can support a serialized writer once source behavior is verified. Existing status options are active/void. source/source_id are separate provenance fields; use strava and the exact original ID, respectively.

| Existing columns | Mapping decision |
| --- | --- |
| activity_id, source_id | Require exact source activity ID with lossless text representation. Rounded numeric IDs are not recoverable. |
| start_at_utc, local_date | Require a trustworthy source instant and timezone semantics; derive Denver date with DST rules. |
| sport_type | Require MCP's actual classification; preserve source meaning. |
| moving_s, elapsed_s, distance_m | Schema supports separate quantities directly once source fields and units are known. |
| estimated_kcal | Optional source calorie estimate only; absence stays blank. |
| average_hr_bpm, average_power_w, energy_kj, power_method | Optional; field availability, units and power provenance require Claude's report. |
| source, recorded_at_utc, updated_at_utc, revision, status, correction_reason | Writer-generated metadata governed by CLAUDE_STRAVA.md, not presumed MCP fields. |

**Assessment:** the schema is structurally suitable for a normalized completed activity; direct MCP mapping is not yet verified. No payload-driven migration is justified yet. Ask Claude for field names/types, nulls, exact ID representation, start/timezone semantics, units, list-versus-detail differences, pagination/completeness and edit/delete visibility. A redacted field report is enough; no real activity payload belongs in git. Codex does not contact Claude or become a second activity writer as part of this assignment.

The live Settings strava_status remains disabled, consistent with the pending gate. Claude's MCP activation does not authorize Codex to flip that state. Coordinate a narrow state update only after policy/permission and mapping acceptance. Separately resolve whether Scout may read the stored activity records or derived training context. Storage and downstream use remain separate questions.

## Mobile Dashboard assessment

Reviewed current native Dashboard A1:C28 formulas/formatting and rendered its current Google-exported workbook. Its three-column content area is approximately 380 pixels wide, with 11-point body text, an uncluttered heading and no side chart. This is a reasonable narrow layout; row headers, app controls and device scaling reduce usable space on small phones, so actual phone viewing remains unverified. No production view was replaced or restyled.

Current coverage:

- Denver date and logging status appear first. Daily calories/protein/carbs/fat and target values are grouped together. Blank nutrition values remain distinct from zero; all totals cover logged food, not inferred full-day intake.
- Calories remaining is present. Remaining protein/carbs/fat are not shown; current daily summary already contains the totals and targets needed to calculate them without new input columns.
- Weight trend and weekly weight change are absent. Body metrics has suitable destination fields, but a validated Garmin normalizer/identity rule and measurement selection convention must come first. No weight-loss goal or expected rate is available, so percentage-of-goal progress would be invented.
- Training context is absent. This is consistent with no activity/body dependencies and pending permission/mapping. Do not use TrainingPeaks planned values as completed activity or add exercise calories to targets automatically.

Small next Dashboard changes, once coordinated:

1. Show remaining grams next to or below the existing four nutrient rows. Calculate target minus logged only when both values are numeric; preserve negatives as over-target, not clamped zero. Leave unknown/unset values blank. Keep this inside the existing narrow view rather than widening for a fourth column.
2. When weight data is validated, define one daily representative reading (proposed: latest valid exact-time reading per Denver day; review date-only ties). Use daily representatives for a compact seven-day trend, avoiding over-weighting days with multiple weigh-ins. Display sample-day coverage and last measurement date.
3. Label weekly change precisely: proposed latest seven-day mean minus preceding seven-day mean, with negative meaning weight loss. Show each window's valid-day count, incomplete coverage and blank when either window has no observations. Do not compare a weekly average with an arbitrarily selected single weigh-in or invent a goal pace. Confirm this rolling-window definition with Scout before formula changes.
4. After Claude's mapping and downstream-use gate, add a compact selected-day sport/duration context with source freshness/coverage. A missing activity is unknown until the import window is confirmed complete; it is not automatically a rest day. Use future plans as separately labelled context only.

These are scoped recommendations, not unannounced production formula changes. Existing schema and dependencies remain intact.

## Scout reliability review: v1.0 preserved

SCOUT_LOGGING.md is byte-for-byte unchanged. Its existing stable-ID, revision, precision and readback requirements remain authoritative. No demonstrated failure calls for Apps Script or a locking service.

| Edge case | Narrow operational recommendation under v1.0 |
| --- | --- |
| Lost response | Re-read by the same meal/operation IDs. Identical payload is success; newer/different state is a conflict. A stale retry must not overwrite a later correction. Failure to update last-write freshness never justifies appending the meal again. |
| Concurrent food requests | Keep one Scout food writer and one pending mutation. Claude's separate activity tab does not serialize two Scout chats. Keep source-tab operations separate and avoid global sorts or shared-block Settings writes. |
| Date-only/backdated meals | Date-only stays a real local date with no invented UTC instant. Use intended consumption date, not logging date. Check that backdated/future date is inside the prepared summary calendar before claiming Dashboard coverage. |
| Denver midnight/DST | Use America/Denver IANA conversion from an offset-aware instant. Repeated/ambiguous clock times need offset or reduced precision; nonexistent spring clock times need clarification. No fixed UTC offset or automatic UTC midnight for date-only meals. |
| Complete-day invalidation | Treat mutation plus clearing confirmation as one planned batch where possible; include both dates when moving a meal. After any uncertain response, verify both the meal and relevant confirmation cells before confirming. Fresh read and serialization still apply. This operational batching needs no new column or contract version. |
| Unknown versus zero | Missing macro stays blank; explicit zero stays zero. A missing nutrient blocks only that nutrient's daily/weekly total. Do not derive calories from macros to conceal an unknown source estimate. |
| No-entry complete day | Current formulas can show Complete with blank totals if zero meals are explicitly confirmed. Do not describe those blanks as a measured zero intake. A future coordinated rule for confirmed fasting/zero-intake days would need tests; no formula change is made here. |

Highest-value remaining controlled tests: lost-response reconciliation after a later correction, two competing Scout corrections to the same revision, backdated movement across two confirmed days, both DST transitions and an unknown-macro correction to explicit zero. Use synthetic fixtures only with a coordinated window and cleanup. Existing successful basic logging tests should not be repeated just to satisfy an old checklist.

## Next handoffs

1. Claude supplies its MCP field report and confirms the policy/permission gate for the actual data flow; it then remains the only routine activity writer.
2. Codex coordinates a private Garmin sample/normalization validation, including exact identity and units, before any Body metrics importer or daily schedule.
3. Scout retains v1.0 food logging and confirms weight-progress semantics. Coordinate only the narrow Dashboard formula additions after validated sources exist.

No separate spreadsheet, hosted service, database, API client, background job or credential setup was introduced. Colorado Compass and Air Quality are untouched.

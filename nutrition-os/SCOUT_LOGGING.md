# Scout logging contract v1.0

Use the dedicated Phase 1 workbook from the user's handoff. Do not use the old synthetic proof-of-concept Sheet. Read workbook metadata and Food log headers first. Stop if schema/version, permissions or tools differ; never create a replacement workbook to bypass an error.

## New meal

1. Resolve the user's intended meal/date and uncertainty. Weighing is optional. Use UUIDs generated once before the first write for `meal_id` and `operation_id`. Reuse both on retries. Do not derive identity from description or timestamp. Separate genuinely repeated meals have different meal IDs. If a repeated user request might refer to an existing meal, clarify or locate it before creating another ID.
2. Convert an offset-aware consumed timestamp to UTC and its America/Denver reporting date. Preserve date-only reports as a numeric date with `time_precision=date` and blank consumed_at_utc. For ambiguous local clock times during DST, obtain an offset or retain approximate/date precision. Never use a fixed UTC-7 offset. Backdated meals use their consumption date, not today's logging date. Recorded/updated UTC timestamps describe the write.
3. Read bounded ID columns across the full supported row range, chunking if needed. Compare exact text IDs in results; substring row search alone is insufficient. Search both meal_id and operation_id. Zero matches permits creation. One matching meal is read and reconciled; do not append again. Multiple matches or an operation attached to a different meal stops the mutation for resolution.
4. Read the destination and its validation immediately before writing. Use the first genuinely empty input row and write the full A:V record with typed `stringValue`/`numberValue` fields. Do not overwrite a partially populated row. Append is permissible only if no formatted/table structure changes the append destination. Never write beyond row 2001 without extending the foundation first. There are no prefilled formulas in Food log.
5. Require meal_id, operation_id, local_date, description, nutrition_basis, source, recorded_at_utc, updated_at_utc, positive integer revision and status. Normal new rows use revision=1 and status=active. Nutrition numbers are nonnegative, zero is meaningful, and unknown stays blank. Quantity is optional; record a unit when supplied. `quantity_method` distinguishes weighed, label, reported, photo_estimate and unknown. `nutrition_basis` distinguishes label, database, model_estimate, mixed and unknown. A weighed portion can still have model-estimated nutrients. Source is chatgpt, user or another verified origin; do not imply a photo estimate is a measurement. Optional source_id refers to a real source record, never a credential or an invented reference.
6. Read the persisted row in a separate call. Compare every intended field including IDs, macros, date, provenance and revision. Recheck the bounded ID columns and confirm exactly one meal row and one operation match. Only then say logged and update Settings' last_confirmed_food_write_utc. If the Settings write fails, the verified meal still exists; repair freshness separately, never reappend the meal.

## Correction or void

Locate by meal_id, never by cached row number. Read the entire current row, verify the expected revision, then update in place with the same meal_id and original recorded_at_utc. Generate a new operation_id for each intentional mutation, preserve it across its retries, increment revision once, set updated_at_utc and record a concise correction_reason. Preserve unchanged fields. If the meal moves dates, remove any explicit complete confirmation on both affected Daily summary dates, pending user reconfirmation. Any new, corrected or voided meal invalidates that day's previous completeness confirmation.

Void mistakes using status=void; do not silently delete rows. Read back and verify the revision, values and unique ID counts before confirming. Retain meal_id for voided rows, so retries cannot recreate them. Same operation_id plus identical persisted payload means the prior operation succeeded; do not increment revision again. A stale revision or changed payload is a conflict, not permission to overwrite.

## Uncertain results and concurrency

On timeout, disconnect or missing write response, say the result is unconfirmed. Re-read by the same IDs before retrying. If the matching record is identical, confirm it; if absent, retry the same mutation; if different, resolve the conflict. Never turn a timeout into a new meal ID. A previous creation retry after a later correction must not overwrite the newer revision or create another row.

Sheets has no transaction spanning search, write and readback and no revision compare-and-swap for these row edits. Strict validation is not an idempotency lock; API writes and simultaneous chats can bypass safeguards. One Scout writer, serialized requests and fresh reads are required. If concurrent writers become necessary, revisit an authenticated locking intake then. No Apps Script intermediary is required for this single-writer foundation.

Before confirming a day complete, obtain explicit user confirmation and check all intended meals are present. Write complete only to the matching Daily summary M cell; read it back. Do not infer complete from macro targets, time of day, or the presence of one meal.

## Live acceptance checks

Use synthetic data with an obvious synthetic source. Verify one append, exact readback, in-place correction, retry with unchanged IDs, void and cleanup; exactly one canonical row must remain through retries. Verify a backdated meal, local midnight, DST, a date-only report, missing versus zero macros, date-specific targets, and complete-day invalidation. Run simultaneous-chat and lost-response tests as controlled scenarios before permitting concurrent use. Do not use real health data as fixtures or put it in source control. Leave the live foundation empty after synthetic tests.


## Completed activities: Scout ownership restored October 29, 2026

Scout is the sole routine writer for Completed activities from the owner's screenshots, descriptions and manual entries. Strava MCP is not used. Read live metadata, A1:S1 headers and validation before activity writes; preserve the existing schema. Do not use the food-specific operation_id or time_precision fields in this tab, which has neither column.

Use one serialized activity writer and compare exact text activity IDs across A2:A2001 before writing. Preserve an existing activity_id even when it is a Strava ID: it is identity/reference, not proof of MCP provenance. For a new manual activity, generate one stable UUID and reuse it on retry; check for an existing screenshot/manual entry before adding a duplicate. Store the owner-provided local date as a numeric Denver date; write a UTC start only when the supplied time and timezone establish it. Missing time/metrics stay blank; clarify ambiguous times rather than inventing precision. Durations are seconds, distance meters, calories nutritional kcal, HR bpm, power watts and mechanical energy kJ. Never infer kcal from mechanical kJ or automatically credit activity calories to nutrition targets.

Use source=user for owner screenshots/descriptions/manual entries; retain a genuine source reference when available and never invent one. Preserve explicit zeros and distinguish them from missing values. Screenshot values must be visible or owner-confirmed; use the owner's original evidence, not the overwritten MCP row, to restore them. Do not assume moving duration equals elapsed duration or infer power provenance.

### Pending screenshot correction handoff

The owner reports that Claude replaced three Scout screenshot rows with MCP values on October 29, moving each to revision 2. Codex verified their exact IDs and revision 2 in the live Sheet and left all activity rows untouched. Scout must locate these by exact activity_id (row numbers are current hints only): rows 2, 3 and 5. Use the owner's handoff for the three IDs; do not put personal activity IDs or screenshot payloads in git.

For each row, restore values from the original owner screenshot in place, retain the same activity_id and original recorded_at_utc, set revision=3 and a fresh updated_at_utc, and use this exact correction_reason:

`Replaced Strava MCP values with screenshot values; MCP not used`

Read the full current row first and require revision 2 before this correction. If already at revision 3 with the intended values/reason, verify and treat as a successful no-op; do not increment again. A different/newer revision is a conflict to resolve. If the original screenshot is unavailable, ask the owner for it rather than reconstructing the lost values. Leave row 4 (the manual walk, source=user) untouched.

After each correction, independently read back the complete A:S row, compare every intended value including provenance, revision and preserved creation timestamp, and confirm exactly one matching activity ID. Report corrected only after verification. Never delete/reappend these rows or replace their identities. Claude and Codex must not perform these screenshot corrections.

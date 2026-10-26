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

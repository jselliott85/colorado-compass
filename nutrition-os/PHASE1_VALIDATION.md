# Phase 1 foundation validation

October 26, 2026. Feature branch: `nutrition-os/phase-1-foundation`.

## Executed

- Created a new native Google Sheets workbook in the existing ChatGPT Drive folder. Metadata confirmed private sharing, owner-only permissions, nine ordered tabs, Dashboard first, and America/Denver timezone.
- Checked the native headers and validation rules. IDs are text; reporting dates are numeric dates; UTC source timestamps are ISO text. Inputs have nonnegative-number, revision, date and finite-option validation, plus duplicate-ID validation/highlighting. Derived views and schema headers have warning protections.
- Local artifact formula tests verified corrected totals, one active record, missing versus zero macros, void exclusion and unset targets. No formula errors were found. Local previews covered all nine tabs.
- In the actual native workbook, a synthetic meal produced 400 kcal in daily/weekly/Dashboard views. Correcting the same row produced 450 kcal and revision 2. A bounded ID-column read confirmed exactly one matching canonical row. Missing protein stayed blank in daily and weekly views; explicit zero remained numeric zero.
- A synthetic date-specific 2,000 kcal target overrode a temporary 2,400 default. Remaining calories recalculated to 1,550. Blank targets for other nutrients remained unset.
- Explicit complete confirmation changed the day status; a synthetic void plus confirmation clearing removed its contribution. All synthetic source/target rows, temporary defaults and confirmations were cleared. Full supported source ranges were re-read as empty, not just the first rows.
- All daily/weekly/Dashboard formula outputs were scanned after cleanup: no effective-value errors. Defaults remained blank, statuses disabled/not_connected, and the Dashboard returned to No entries.
- Exported the finished native workbook and rendered all nine tabs for layout review. This checks the converted workbook's layout; a physical mobile-device view is still untested. Verified text-ID and date formats at the last supported input row after native range extension.
- Denver midnight and the repeated fall DST hour were checked using the IANA timezone reference. This verifies expected conversions, not Scout's conversational timestamp handling.
- Native import dropped the original Date-object scaffold value and defaulted to Los Angeles. Both were caught by readback and repaired with a persisted numeric date and explicit America/Denver settings. The reusable template now uses a numeric scaffold date. This is why import success alone was insufficient.

## Still requires Scout live tests

- Scout must follow the exact Phase 1 headers and handoff procedure. The user's earlier successful ChatGPT test establishes basic connector compatibility; these Codex tests do not establish Scout's behavior against the new contract.
- Duplicate prevention and corrections require serialized writes, stable IDs across retries, fresh row/revision reads and exact readback. Sheets does not provide a transaction or compare-and-swap across these operations. Strict validation is not an atomic lock and API writes may bypass it.
- Controlled timeout, stale-revision and simultaneous-chat scenarios remain untested. Keep one writer. Do not use multiple concurrent chats for logging.
- Completeness invalidation is Scout's responsibility, including both dates when a meal moves. The workbook cannot automatically clear an input when source data changes without an intermediary. No Apps Script is installed.
- Capacity is bounded at 2,000 records per input tab and 366 calendar days beginning October 26, 2026. Extend all affected ranges before either boundary. Settings capacity labels do not autoextend formulas.
- Warnings are editing aids, not access control. Keep the workbook private. History of corrections is revision/reason plus Sheets version history, not a separate immutable audit ledger.
- Body/workout data are reserved schemas only. No ingestion, activity calorie credit, or body-metric aggregation is implemented. Strava remains explicitly disabled pending policy resolution.

No existing production code or workflow was changed. No real food, body or workout records, nutrition prescriptions, credentials or new external services were populated.

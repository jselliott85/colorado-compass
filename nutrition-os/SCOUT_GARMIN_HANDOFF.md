# Scout coordination: Garmin Body metrics extension

**Coordinated and applied by Scout.** The user confirmed readback of S=bmi and T=source_record_json, with A:R and Settings unchanged. Codex then completed the explicitly approved one-real-record write/readback and no-op duplicate reconciliation. See [BODY_METRIC_PROFILE.md](BODY_METRIC_PROFILE.md) for the separate garmin-index-s2/1.0 profile and execution results. No meal, target, plan, activity or Dashboard changes were included in this test.

Validated Garmin Index S2 responses provide weight, body fat, muscle mass, water, BMI and bone mass. Actual samplePk supports exact source deduplication. Original timestamp/provenance must be retained alongside normalized units.

Append only these two Body metrics columns:

| Position | Header | Representation |
| --- | --- | --- |
| S | bmi | Optional nonnegative number; BMI index, kg/m² |
| T | source_record_json | Literal JSON text of the original individual Garmin measurement; preserves raw timestampGMT/date/calendarDate, samplePk, sourceType and null fields. Never includes key/token responses. |

Existing A:R headers/order stay unchanged. source_id is Garmin's actual samplePk as exact text; measurement_id uses a documented local garmin: namespace over that real ID. Canonical masses are kg, body fat/water are 0–100 percentages, and measured_at_utc is ISO UTC converted explicitly from the actual Unix-ms source instant. Muscle label remains Garmin estimated muscle mass, with the Index S2 provider definition retained; it is not a total-lean-mass measure.

Schema version coordination: preserve SCOUT_LOGGING.md v1.0 and its Food log headers/behavior unchanged. Introduce a separate body-metric profile version in repository documentation rather than silently changing Settings.schema_version and surprising Scout. If Scout requires a workbook-wide schema-version change, coordinate its exact compatibility handling before execution.

Migration must first read current headers and verify S:T are genuinely unused throughout the live grid. Recheck IDs before first data write. Add headers/formats/validation and update the Body metrics filter/header protection only; preserve all existing cells, defaults, target formulas and tab order. Add one validated record, read every persisted field back, re-read source IDs and repeat reconciliation without a second row. Do not overwrite existing body records or insert into an occupied/partially occupied row. A source conflict stops for review.

The approved one-record test is complete. No recurring schedule or new Google authorization was enabled. The existing native charts now have a real source measurement; limited history must still be distinguished from a meaningful trend.

Daily hosted sync and credential renewal: see [DAILY_SYNC_SETUP.md](DAILY_SYNC_SETUP.md). The approved GitHub job is configured for 11:45 America/Denver with a seven-day lookback. The user confirmed a 30-day Garmin key; renew both Keychain and GitHub Secret copies before expiry.

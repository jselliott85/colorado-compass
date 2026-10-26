# Scout coordination: Garmin Body metrics extension

**Proposed, not applied.** Review with Scout before changing production schema. No meal, target, plan, activity or Dashboard changes are included.

Validated Garmin Index S2 responses provide weight, body fat, muscle mass, water, BMI and bone mass. Actual samplePk supports exact source deduplication. Original timestamp/provenance must be retained alongside normalized units.

Append only these two Body metrics columns:

| Position | Header | Representation |
| --- | --- | --- |
| S | bmi | Optional nonnegative number; BMI index, kg/m² |
| T | source_record_json | Literal JSON text of the original individual Garmin measurement; preserves raw timestampGMT/date/calendarDate, samplePk, sourceType and null fields. Never includes key/token responses. |

Existing A:R headers/order stay unchanged. source_id is Garmin's actual samplePk as exact text; measurement_id uses a documented local garmin: namespace over that real ID. Canonical masses are kg, body fat/water are 0–100 percentages, and measured_at_utc is ISO UTC converted explicitly from the actual Unix-ms source instant. Muscle label remains Garmin estimated muscle mass, with the Index S2 provider definition retained; it is not a total-lean-mass measure.

Schema version coordination: preserve SCOUT_LOGGING.md v1.0 and its Food log headers/behavior unchanged. Introduce a separate body-metric profile version in repository documentation rather than silently changing Settings.schema_version and surprising Scout. If Scout requires a workbook-wide schema-version change, coordinate its exact compatibility handling before execution.

Migration must first read current headers and verify S:T are genuinely unused throughout the live grid. Recheck IDs before first data write. Add headers/formats/validation and update the Body metrics filter/header protection only; preserve all existing cells, defaults, target formulas and tab order. Add one validated record, read every persisted field back, re-read source IDs and repeat reconciliation without a second row. Do not overwrite existing body records or insert into an occupied/partially occupied row. A source conflict stops for review.

No schema edits, first measurement write or schedule are enabled by this proposal. The user's later final handoff explicitly requested the Dashboard charts before historical measurements populate the workbook; those three empty-safe native charts are now implemented independently. Schema/write coordination remains pending. Authentication and unit/source-ID validation are already complete.

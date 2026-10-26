# Nutrition OS

Independent personal Google Sheets foundation. No Colorado Compass or Air Quality code, shared credentials, deployment, dashboard app, database, or scheduled ingestion is used.

Phase 1 has a native Google Sheets Dashboard plus eight tabs. The live workbook is the sole data store; generated Excel files are temporary authoring artifacts. Do not import the template again to update a live workbook.

The production Dashboard has now been finished in place: today's nutrition/progress, goal-linked weight progress, three native weight/body-composition charts, weekly logging/pace review and a readable planned-duration card. It is prepared for incoming Body metrics even while that source is empty. See [DASHBOARD.md](DASHBOARD.md) for calculation rules, exact preservation checks and remaining Garmin write/schedule gates. All source data and Settings were preserved.

## Evidence and scope

On October 26, 2026, the user reported Scout verified the actual production workbook: synthetic creation, exact persisted readback, in-place correction with revision increment, daily recalculation, retry reconciliation without duplication, void exclusion and fixture cleanup. The Food log was verified empty after those tests. This supersedes the earlier outstanding basic Scout acceptance gate. Apps Script is unnecessary for basic logging; failure-injection and concurrency edge cases remain separate tests.

## Operating model

| Owner | Scope |
| --- | --- |
| Scout / ChatGPT | Food log, nutrition targets, future training-plan adjustments, recommendations and weekly nutrition analysis |
| Claude | Exclusive routine writer for completed Strava activities and their corrections in the existing Completed activities tab |
| Codex | Repository, schema, coordinated migrations, Garmin body-metric integration, formulas, native Dashboard and minimal infrastructure |
| Google Sheets | One persistent workbook, calculated summaries and charts |

The user activated official Strava MCP in Claude. That connection establishes an available integration route, not automatic permission for every downstream use. Real ingestion remains gated on the policy/permission review and Claude's actual field-availability report. Codex must not run a second routine activity importer, create a separate Strava API client, or import actual Strava records. Explicitly coordinated schema migrations or synthetic tests are exceptions to routine ownership. Scout may adjust future plans; it must not write completed activities. Garmin activity ingestion stays disabled.

See [CLAUDE_STRAVA.md](CLAUDE_STRAVA.md) for Claude's contract, [GARMIN_INTEGRATION.md](GARMIN_INTEGRATION.md) for the weight-only feasibility gates, and [INTEGRATION_REVIEW.md](INTEGRATION_REVIEW.md) for the live compatibility, Dashboard and reliability assessment. No credentials or additional services are required for this documentation update.

Scout's first live weekly screenshot import is now verified: seven prescribed workouts and seven corresponding dated nutrition targets for October 26–November 1, with all seven target sets retrieved by Daily summary. These are production records; do not rerun the blank-workbook builder or synthetic cleanup over them. Scout manages the working plan and targets conversationally. Preserve original coach-plan date/context when moving a workout. Optional sessions do not automatically activate long-ride targets. An optional/committed schema field is a future coordinated revision, not an implicit v1.0 change. Strava remains disabled pending the MCP storage-permission question.

The user confirmed Garmin Personal API Key access. The first-read setup is in [GARMIN_SETUP.md](GARMIN_SETUP.md): a recommended 30-day pilot key stored locally in Keychain, a prepared weight-only validator, and no Sheet writes or recurring ingestion before measurement validation.

Garmin authentication and an actual historical Index S2 measurement are validated. Weight, body fat, muscle mass, water, BMI and bone mass units were checked against Connect; the real samplePk stayed stable across reads. Scout applied Body metrics S:T without changing A:R or Settings. The approved one-real-record write/readback and duplicate reconciliation are complete: one real historical measurement, all 20 fields verified, repeated import no-op and revision preserved. See the independent [body-metric profile garmin-index-s2/1.0](BODY_METRIC_PROFILE.md); Settings.schema_version and SCOUT_LOGGING.md stay at 1.0. Existing native charts read the actual measurement and retain limited-history/old-reading warnings. No recurring ingestion or new Google authorization was activated. Empty windows are not zero measurements, and the starting-weight setting remains self-reported.

## Workbook

| Order | Tab | Ownership |
| --- | --- | --- |
| 1 | Dashboard | Formula view for a selected Denver date, macros and targets |
| 2 | Food log | Scout's canonical meal rows, stable IDs and provenance |
| 3 | Daily nutrition targets | Optional date-specific overrides with stable IDs |
| 4 | Completed activities | Claude exclusively writes routine Strava imports/corrections after gates clear |
| 5 | Planned workouts | Scout manages future coach plans; automated TrainingPeaks integration deferred |
| 6 | Body metrics | Codex owns subsequent Garmin weight integration; no Garmin workouts |
| 7 | Daily summary | Prepared calendar and food formulas; only day_confirmation is editable |
| 8 | Weekly summary | Monday weeks; averages over days with food entries, not presumed whole weeks |
| 9 | Settings | Blank configurable defaults, date override, source state and last confirmed write |

Exact headers and capacities are in [schema.json](schema.json). Dates are real date-only spreadsheet values displayed yyyy-mm-dd. Source UTC timestamps are ISO 8601 text ending in Z. IDs are text. Time precision preserves date-only or approximate reports without inventing an exact instant.

Settings B4:B7 are optional default kcal/protein/carbohydrate/fat targets and start blank. A unique active dated target row overrides that day's defaults. An omitted nutrient in a dated row stays unset; it does not inherit a default. Duplicate active dated target rows display an error instead of being added. Targets never incorporate exercise calories automatically. Settings B8 is an optional Dashboard date override; blank uses TODAY() in the workbook's America/Denver timezone. Keep the timezone fixed; changing the label alone cannot rederive stored dates.

The calendar starts October 26, 2026 and contains 366 daily rows plus Monday-week summaries. Inputs are included through row 2001 (2,000 records per input tab). These are initial bounds, not an indefinite capacity guarantee. Extend source ranges, validations, duplicate highlighting, filters, daily/weekly formula rows and any Dashboard lookup ranges together before exceeding them. Changing capacity settings alone does not extend formulas. Scaffold dates are not observations. Rows with no food show blank nutrition totals, not zero intake.

Daily summary M is an optional explicit `complete` confirmation supplied by the user. Blank is unconfirmed: entries show Partial and no entries show No entries. A complete day can have no entries only if the user explicitly confirms zero intake. If a logged meal lacks a macro, that day's affected total stays blank. Weekly averages stay blank when any logged day lacks that nutrient; averages cover logged days and do not imply complete reporting. Weight/workout summaries are deferred until ingestion semantics and provenance are validated.

## Scout handoff

Use [SCOUT_LOGGING.md](SCOUT_LOGGING.md) v1.0 unchanged for food write/readback/retry behavior. Workbook validation and duplicate highlighting are safeguards, not atomic uniqueness or concurrency locks. Use one writer and one pending mutation per source tab. Scout and Claude can work in separate tabs, but must not sort/restructure tabs or overwrite shared Settings blocks during another owner's operation. Coordinate migrations with all owners idle. Users can edit targets; routine food edits go through Scout, completed activity edits through Claude.

## Authoring and privacy

[build-workbook.mjs](build-workbook.mjs) creates a blank template using the approved `@oai/artifact-tool` runtime. It includes disposable synthetic formula checks and clears them before export. Run a copy in a temporary directory with a node_modules link to that runtime, passing this directory and a temporary output directory. No dependency is installed into this repository. Native post-import settings and validation are recorded in [native-foundation.mjs](native-foundation.mjs).

Keep health records, real test payloads, workbook exports, credentials, OAuth tokens and private subscription links outside git. `local/`, exports and environment files are ignored here. Workbook location and execution results belong in an ignored local handoff, not in public logs. No workflow or production code is changed.

# Native mobile Dashboard

The existing production Dashboard is now an in-place, three-column view. No new workbook, application, data store or service is used. `dashboard.mjs` builds requests scoped only to the existing Dashboard tab; it is not an ingestion client. Do not rerun the blank template builder against production.

## Visible sections

- Today's Denver date and explicit logging status, linked to Daily summary. Calories and grams consumed/target, calories remaining and a capped visual energy bar with the actual percentage. Unknown values stay blank, negatives remain visible when over target. Alcohol calories stay in total energy; do not recompute energy from protein/carbs/fat or invent an alcohol subtotal without a reliable Scout tag.
- Latest recorded weight/date, seven-calendar-day observed-weight mean, starting weight, goal range, change from baseline and a conditional weekly loss estimate. All goals come from the existing Settings keys; none are duplicated or overwritten.
- Three native line charts: daily weight with seven-day average, body-fat percentage, and Garmin-estimated muscle mass. Visible mass units are pounds; Body metrics remains canonical kg. Body composition is labelled as an estimate, with hydration/timing context.
- Weekly logged calorie/protein means and explicit complete-day count read the existing Weekly summary. The weight comparison uses two consecutive seven-day windows, requiring at least three observed days in each; it is not a claim of full calendar-week coverage. Positive weekly loss means the earlier window mean is higher. The Settings pace range determines the comparison label.
- Planned duration is shown in human units from canonical planned_duration_s, including 40 min, 1h 30m and 3h. It is display-only: no Planned workouts column, canonical value or nutrition target is changed. Optional plans do not automatically activate long-ride targets. Completed training remains paused while Strava permission is unresolved.

## Chart sources and empty states

Hidden Dashboard E:J contains the latest 84 calendar dates ending on the selected Dashboard date, the source-row index, daily weight in lb, seven-day mean, body-fat percent and estimated muscle in lb. N:P contains source-day and UTC-order helper keys. S:T holds a derived plan duration and the visible pace calculation's three-day coverage threshold. This is calculation space inside the same Sheet, not another record store.

Helpers read active Body metrics rows 2–2001. For multiple same-day observations, the daily representative is the latest UTC second; equal-second ties use the first source row. All original observations remain in Body metrics. UTC ISO text is interpreted structurally, not with a locale-sensitive timestamp guess. The raw-record preservation proposal is separate and pending.

The line-chart domain is E1:E85. Series are G/H for weight, I for body fat, J for muscle. HiddenDimensionStrategy=SHOW_ALL keeps hidden helper columns eligible as chart sources. The window advances with the Dashboard date; new source rows inside the prepared input range automatically populate the correct day. Old points leave the twelve-week view, not the source log. Expand the documented 2,000-record source capacity before exceeding it.

Missing weigh-ins are gaps, never zero or forward-filled observations. The rolling mean uses only observed daily representatives and is plotted on observed days. Empty/limited-history messages include Awaiting Garmin measurements, More weigh-ins needed for trend and Body-composition data unavailable. Old readings are dated and marked not current. A single old reading does not produce a current weight-loss pace.

## Verification on October 26, 2026

- All eight non-Dashboard source tabs' user-entered values/formulas were captured before the change and exactly matched afterward, including Food log, targets, plans, Body metrics, Settings and both summaries. No real records were cleared, replaced or migrated.
- The live Dashboard's nutrition values/targets were read back against the existing summary; current planned duration read back as 40 min. Source Settings, including Strava disabled, were unchanged.
- Three native chart objects were created, bound to formula ranges with no fabricated measurement values. All live Dashboard formula/helper ranges were scanned: no effective-value errors.
- A private local copy verified zero-measurement states and simulated incoming measurements, rolling means, source links, composition and loss-rate thresholds. Synthetic fixtures never entered production source tabs. The local spreadsheet engine coerces ISO text differently and caches some MAXIFS updates, so UTC ordering and latest-match semantics were checked separately in native Google Sheets using temporary scalar probes. Those probes were removed and read back as cleared; they were outside chart data ranges.
- The native workbook was exported privately for visual review. Physical phone verification is not available and remains outstanding. The content area is 330 pixels wide, vertically stacked; app chrome/row headers still consume device width.
- SCOUT_LOGGING.md v1.0 remains byte-for-byte unchanged. No production application or Air Quality code, source schema, credential or scheduled job was changed by the Dashboard work.

## Remaining integration gates

Scout applied the coordinated S=bmi and T=source_record_json extension. The first real upsert, exact 20-field readback and no-op repeat are complete; each chart now reads one actual historical observation. See BODY_METRIC_PROFILE.md for garmin-index-s2/1.0. The shared Settings schema version remains 1.0 and the self-reported starting-weight goal is not a Garmin observation.

Recurring daily ingestion remains off. Secure scheduled Google authorization and key-expiry/renewal setup are separate future steps. Keychain works for local authentication; do not assume a CI job can use the local Keychain or interactive connector. No Garmin workouts are imported.

Strava remains disabled pending the user's support inquiry (ticket #19194). Claude retains exclusive routine ownership of Completed activities. This does not block nutrition, native charts or Garmin body-metric readiness.

# Google Nest read-only observation integration

The integration supports live read-only collection and separately identified historical Takeout intervals. Runtime validation and source-specific import results belong in the private dataset and local operator audit, not this repository.

## Architecture and boundaries

The existing bound Apps Script, six-hour source collectors, signed Dyson/NCAR intake, historical data and Events remain in place. The bound join appends only `nest_present`, `nest_zone_count` and `nest_zones_json` to Master. Each JSON array item carries the fields of one zone; no thermostat runtimes are pooled. `Nest_15min` is the rectangular analytical source, keyed by `(UTC bin, zone)`.

A separate, owner-only Apps Script worker runs roughly every minute to pull an **owned Google Cloud Pub/Sub subscription**, and reconciles SDM device snapshots every five minutes. It publishes completed UTC quarters. Raw events, snapshots, discovery and continuity checkpoints are gzip files in a private Drive archive organized by ingestion month. Events are acknowledged only after raw archival and normalized-ledger persistence. No GitHub cron or local Mac uptime is needed. There is no Cloud Run server, paid scheduler, or inbound public Pub/Sub endpoint.

The worker uses its own Script Properties and OAuth grants. It does not change the existing bound project's scopes, identity or authorization. SDM scope is Google's `sdm.service`; Google does not provide a separate read-only SDM scope. The implementation restricts SDM transport to GET devices.list, with no executeCommand path. Other POST requests are OAuth exchanges and Pub/Sub pull/acknowledge operations, never equipment commands. Private setup deployment must have `access=MYSELF`, not anonymous/public access.

Configure one stable alias per HVAC zone. Separate Nest Temperature Sensors are not available through Device Access; do not invent remote sensor readings or treat them as extra HVAC zones. Inspect actual traits during discovery, including Eco settings and absent standard setpoints. Eco mode/setpoints are recorded separately.

## Fields and time semantics

`Nest_Observations` is a rolling normalized ledger (three days), keyed by observation ID. It retains SDM event IDs, source event time, snapshot **read time** (not device measurement time), device resource identity, event/snapshot kind, exact traits JSON and ingestion time. Full history remains in Drive. The registration date, Nest app history and local screenshots do not provide historical HVAC runtime for this collector.

`Nest_Collection_Health` retains collection checkpoints, queue-drained status, snapshot success and outcome. Its `finished_at_utc` is the observation checkpoint time used by the existing continuity calculation, not total execution end. During processing its status is `checkpoint`; only a completed processing path promotes it to `success`/`degraded`. Errors become `error`. Raw batches archive prior checkpoints after their final outcome is known; the current provisional checkpoint is deferred to the next batch. Abandoned checkpoints remain explicitly unsupported rather than becoming archived success. A script-lock miss produces no success checkpoint; missed heartbeats remain detectable. Collection start remains the first observation-bearing run start, not a fabricated earlier history.

`Nest_Run_Attempts` distinguishes invocation start, collection checkpoint and end-to-end completion. The worker writes and flushes a `running` record before source collection, then a checkpoint and finally `success` only after source persistence, required materialization/Master work, trimming, usage publication and status writes/flushes succeed. Read this final marker together with Source_Status; an early checkpoint or a platform `Completed` result alone is insufficient. Attempt stages and allowlisted error codes retain diagnostic context without persisting arbitrary exception bodies or credentials. A later lock owner marks an abandoned counted attempt `unfinished`, without inventing its elapsed time. The six-hour bound watchdog also detects old attempts without successful completion. The existing 180-second healthy-window and fresh-anchor rules remain unchanged.

`Nest_15min` has one row per device/zone per completed UTC quarter:

| Fields | Meaning |
| --- | --- |
| `bin_zone_key`, `timestamp_utc`, `timestamp_local` | Stable UTC quarter/zone key; America/Denver uses actual DST offset |
| `device_id`, `zone_id` | Authorized SDM device resource and stable configured zone alias |
| `hvac_status` | Last reported HEATING, COOLING or OFF; **not** thermostat mode |
| `thermostat_mode`, `eco_mode` | Standard HEAT/COOL/HEATCOOL/OFF mode and separate Eco mode |
| `fan_timer_state`, `fan_timer_expiration_utc` | SDM fan timer ON/OFF and timeout where exposed; **not physical blower status or measured blower runtime** |
| `temperature_c`, `relative_humidity_pct` | Last fresh SDM thermostat observations, not remote room sensors |
| `heat_setpoint_c`, `cool_setpoint_c` | Standard setpoints, null if trait fields absent |
| `eco_heat_setpoint_c`, `eco_cool_setpoint_c` | Separately reported Eco limits; never substituted silently for standard setpoints |
| `connectivity`, `latest_observation_utc` | Last reported device connectivity and source observation time |
| `heating_minutes`, `cooling_minutes`, `off_minutes` | Observed-state persistence within known stream coverage only; null if no supported duration |
| `known_duration_minutes`, `unknown_duration_minutes` | Known classified duration and remaining duration, summing to 15 |
| `known_duration_coverage_fraction` | Known minutes / 15; evaluate before comparing duration to VOC/PM |
| `observation_count`, `duration_basis`, `ingested_at_utc` | Deduplicated observations in bin, provisional event/polling basis and materialization timestamp |

A healthy window requires adjacent successful, queue-drained runs no more than 180 seconds apart. Each window requires a fresh in-window state anchor. HVAC classification additionally requires reported ONLINE connectivity. Errors, backlog, OFFLINE reports, heartbeat gaps, missing device snapshots, unavailable traits and contradictory simultaneous HVAC states create unknown durations until a new valid anchor. A matching snapshot after an outage does not establish that no short cycles occurred during the outage.

Partial trait updates are replayed in source time; duplicate event IDs are idempotent. Conflicting duplicate contents fail rather than overwrite history arbitrarily. Same-time contradictory HVAC states remain unknown. No linear interpolation is used. Event-derived persistence is explicitly **provisional**, subject to asynchronous delivery and later corrections; it is not an independent measurement of equipment operation. Snapshot-only mode intentionally produces no runtime minutes, even between matching snapshots.

Scalar fields use the last reported state, with a ten-minute freshness bound. Do not infer actual operation from a mode, setpoint, fan timer or an unavailable field. A bin may have a source row but zero known-duration coverage.

Normal replay covers the most recent 48 hours. Events older than that are archived and acknowledged, trigger a degraded checkpoint and require deliberate archive replay; they are not silently applied to recent history. Recent out-of-order events revise affected bins. Three days of raw-normalized observations/checkpoints are retained in Sheets to bound minute-worker reads. Yearly archival of `Nest_15min` follows the dataset's broader workbook-capacity policy.

The worker patches only appended Nest columns on **existing** Master UTC keys. It does not append Master keys concurrently with the bound writer or reconstruct historical sources. New Master keys appear through the existing collector cycle (up to six hours); `Nest_15min` is fresher in the meantime. A normal bound Master rebuild reads Nest source rows by UTC and preserves zones. Pre-collection values remain missing unless a separately validated historical source supports them.

## Google setup sequence

1. Use the personal Google account linked to Nest for Device Access registration. Registration is a one-time, non-refundable US$5 per account; Workspace accounts cannot register. Keep the existing Sheet/worker under its existing owner account.
2. Create/reuse a separate Cloud project; enable Smart Device Management and Pub/Sub APIs. Configure External OAuth consent, add the Nest account as a test user for initial setup, and create a **Web application** client. This direct API collector is not an AI-agent OAuth client.
3. Register exact redirect `http://localhost:8765/callback`; leave JavaScript origins empty. Download client JSON privately outside Git. Add its public client ID to the Device Access project.
4. Set Google Auth Platform Audience to **In production** for ongoing collection. Tokens issued in Testing can expire after seven days; renew both grants after the change. This is unrelated to applying for commercial Nest development.
5. Run `scripts/nest_authorize.py` using the local client JSON and Device Access project ID. It opens PCM, checks callback state and PKCE, exchanges tokens server-side and writes a mode-0600 local output without printing secrets. Use `--pubsub` for a separate ordinary Google OAuth grant limited to Pub/Sub.
6. Create a dedicated owned topic/subscription and grant `group:sdm-publisher@googlegroups.com` Publisher on that topic. `scripts/nest_cloud_setup.py` currently prepares the dedicated project resources. Set the exact `projects/PROJECT/topics/TOPIC` resource in the Device Access Console and enable events. Never use the legacy Google-owned `sdm-prod` topic.
7. Make an SDM devices.list call to finalize account linkage and initialize events. Inspect real traits; configure `NEST_ZONES_JSON` only after discovery. No setpoint/fan/HVAC command is required for verification—wait for naturally changing temperature/status events.
8. Build a separate worker with `python scripts/build_nest_worker.py`. Give it its own private `.clasp.json` under ignored `tmp/nest-worker`; never overwrite the bound collector project with worker files. Push/deploy owner-only, verify the manifest, and open its private setup web app as its owner.
9. The private setup JSON combines SDM/PubSub refresh grants, client ID/secret, Sheet ID, private archive-folder ID, subscription resource and zones map. Select that file **only on the owner-only setup page**, then Save. It is stored in the worker's Script Properties; it must never be pasted in chat, logged, committed, put in Sheet cells or exposed in a public web app. Retain only needed private local backups and clear any secret clipboard contents.
10. Use **Verify observation (read only)**. Confirm a real row in `Nest_Observations`, a private raw archive, `Source_Status` success and queue-drained state. Only then use **Start collection** to install the worker's one-minute trigger. Check completed `Nest_15min` bins and the subsequent Master UTC join.

Tokens refresh before expiry, with one 401 refresh/retry. Revoked grants surface as sanitized health failures. Recovery does not bridge the gap. Private setup files are never part of the worker's uploaded source tree or the Git commit.

## Cost and operational health

The US$5 registration is separate from cloud usage. Pub/Sub has a free allowance (Google currently documents 10 GB/month); one thermostat's traffic should be small, but billing is usage-based and not guaranteed zero. If billing is linked, configure a low budget alert; budget alerts are not spending caps. The worker uses existing Apps Script/Drive/Sheets services and quotas. Apps Script currently limits trigger runtime to 90 minutes/day for consumer accounts or six hours/day for Workspace; measure worker execution times before calling the minute cadence durable. Raw archives consume private Drive storage. No extra paid hosting has been deployed.

Check `Source_Status` for source `nest`: last attempt/success, failures, latest snapshot timestamp and message. Last attempt older than five minutes is stale, even if an old success remains visible. The bound six-hour watchdog marks stale Nest status independently; it does not replace minute-by-minute timestamp checks. `Nest_Collection_Health` shows backlog/errors; known-duration coverage in `Nest_15min` shows analytical availability. Google Cloud's subscription backlog/oldest-unacked age and Apps Script execution failures/runtime quota provide independent checks.

## Verification

Unit tests cover HVAC/mode/fan separation; missing fields; UTC boundaries; Denver DST fold; duplicate/order invariance; conflicting events; partial coverage; OFFLINE intervals; errors/backlog; outage recovery; snapshots-only runtime suppression; token caching and 401 retry; and prohibition of equipment-command endpoints. Existing source regression tests remain in the suite. Production acceptance additionally requires real API/Sheet observations, natural Pub/Sub delivery, token refresh, trigger execution and preservation of every pre-existing Master column.

Official references verified on 2026-10-19:

- [Device Access registration](https://developers.google.com/nest/device-access/registration)
- [Supported devices—temperature sensors excluded](https://developers.google.com/nest/device-access/supported-devices?hl=en)
- [Thermostat traits and event semantics](https://developers.google.com/nest/device-access/api/thermostat)
- [Account authorization](https://developers.google.com/nest/device-access/authorize)
- [Owned Pub/Sub topic setup](https://developers.google.com/nest/device-access/subscribe-to-events)
- [Events and service authentication](https://developers.google.com/nest/device-access/api/events)
- [OAuth refresh-token lifetime](https://developers.google.com/identity/protocols/oauth2/)
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)

## Cost controls and usage monitoring (2026-10-19)

Verify the project’s billing linkage during setup and record that state privately. Leave billing disabled when it is not needed. Billing linkage is not continuously checked by this worker, and the worker does not configure billing budgets or spend caps. If billing is linked later, create a project-scoped monthly alert budget (for example $1 with 10%, 50% and 100% thresholds) covering all services and confirm email delivery. Alerts-only budgets do not stop spending. Check current eligible services before relying on a native spend cap. Do not add BigQuery billing exports, Cloud Run or a paid monitoring stack for this one-device workload.

`Nest_Usage` is keyed by UTC calendar day (UTC midnight, independent of the workbook's Denver display timezone). It retains delivery/archive counters and a legacy baseline. Seven appended columns count post-repair `attempts`, `counted_runs`, `successful_runs`, `failed_runs`, `disabled_runs`, `lock_busy_runs` and `unfinished_runs`. Outcomes/counts belong to invocation start day; observable elapsed milliseconds are split at UTC midnight. Counted means the worker lock was acquired, including failed processing; disabled/busy invocations do not perform collection. Successful processing can still have degraded coverage due to backlog or old events. Existing duplicate daily rows remain unchanged except that normal updates target the latest existing snapshot. Never sum duplicate cumulative snapshots. Text-formatted new date keys and normalized Date-valued existing keys prevent another daily row from being appended for the same date. Reconciliation of historical duplicates requires separate review.

Unique per-invocation `NEST_PENDING_*` properties avoid shared-counter races for busy/disabled invocations. The next lock owner upserts them by run ID before deleting the pending records; a retry cannot double-count them. The final pending record measures elapsed time from function entry through the required processing, monitoring writes and flushes. It excludes the last pending-property write, lock release and platform startup/teardown. Hard termination or initial telemetry failure can leave elapsed time unknown. Totals lag until a subsequent lock-owning invocation drains the record; a stopped/disabled worker may have unpublished pending telemetry. The pending buffer is capped at 512 records; overflow is explicitly marked as a telemetry gap instead of claiming complete totals. Platform execution history remains necessary for full reconciliation.

The attempt sheet retains three complete UTC days plus today (including midnight-spanning runs until their end day ages out); older daily summaries are compacted before pruning. Daily operational summaries remain in `NEST_USAGE_DAY_*` properties and Sheets. Monitor the finite Properties storage allowance over long retention periods; no paid storage upgrade is configured. Legacy runs/runtime remain a documented baseline, and new outcome columns start at repair, so historical outcomes cannot be inferred. Pull/delivery/archive counts exclude failed calls, publisher traffic, other subscriptions/projects and external collectors; the delivery proxy is not Google's billed-byte calculation. This is operational telemetry, not an invoice or a platform quota meter.

Daily delivery proxy of 50 MiB, newly archived data of 10 MiB or accumulated worker runtime of 180 minutes flags `review_usage` in Nest_Usage only. It never overwrites a collection error, increments collection failures, or performs a redundant Source_Status write. Collection continues. These unchanged thresholds are review flags, not monetary caps. The independent bound watchdog emails the configured LHL owner about collection health; usage review is inspected separately in Nest_Usage. Read last_attempt_utc for stopped workers because a stopped worker cannot report its own failure. The existing six-hour bound watchdog supplies an independent stale check.

Pull cadence stays at one minute, max three batches of 100 per run. Reconciliation snapshots remain five minutes, plus recovery snapshots. This preserves state-change events and limits API work without trading away short-cycle evidence. Health checkpoints are archived in quarter-hour batches (about 96 files/day instead of 1,440), preserving each minute's checkpoint. Raw device observations remain archived. Drive storage grows over time and consumes the existing account's storage allowance. No automatic paid storage upgrade is configured.

Official pricing reviewed: https://cloud.google.com/pubsub/pricing . Basic delivery throughput has a 10 GiB/month billing-account free allowance, but cross-region transfer and backlog older than one day can incur separate charges if billing is enabled. Topic retention and acknowledged-message retention should stay off. Keep the seven-day unacknowledged recovery window rather than silently sacrificing recoverability to avoid a tiny potential backlog storage charge.

## Historical recovery and Takeout imports

`scripts/nest_recover_archive.js` normalizes timestamped raw discovery, snapshot and state-event evidence. Administrative events do not establish device state. A bare file modification time does not establish an observation timestamp. Repeat imports use stable identities; conflicting contents are rejected. Preserve the original archive and record source identities, retrieval dates, exclusions and outcomes in the private `Nest_Recovery_Log`.

`scripts/nest_takeout_import.py` is an offline validator/normalizer for `HvacRuntime.jsonl`. It accepts JSON lines or CSV-quoted JSON lines and requires explicit UTC interval bounds aligned to 900 seconds. Heating/cooling counters must be finite, nonnegative and sum to no more than the interval. Mode counters must cover exactly 900 seconds, with no unvalidated auxiliary-stage overlap, before runtime is supported. Anomalous coverage remains unknown; counters are never clipped. The counter scale is checked against the source's 900-second intervals before converting seconds to minutes.

Keep source intervals in `Nest_Takeout_15min`, including original counters, source member, ZIP SHA-256, retrieval timestamp and validation outcome. Canonical rows use `duration_basis=takeout_reported_interval_seconds`. Heating/cooling minutes are direct exported counters divided by 60; `off_minutes` is the remaining interval with neither heating nor cooling reported, and says nothing about blower operation. Exported `fan_time` remains separate from SDM fan timer state and must not be called independently measured physical blower runtime. Point-in-time HVAC, mode, fan and sensor state is not fabricated from interval summaries. Unverified source sensor/target values stay in the source table.

Import only intervals overlapping the canonical dataset unless an earlier dataset extension is explicitly requested. Retain older evidence in its private original archive. Do not distribute daily totals across quarters, derive runtime from temperatures/schedules/setpoints, fill missing quarters, or extend the first state backwards. Keep live SDM data when historical intervals overlap it until the sources are explicitly reconciled.

Before bulk insertion, pause the separate worker with a bounded maintenance gate, allow in-flight writes to finish, preserve live rows, and match Master by UTC key. Patch only the appended Nest columns. Remove the gate immediately after import. Events remain queued, but unsupported continuity must remain unknown. Verify all imported keys and durations, duplicate-free repeat processing, unaffected non-Nest Master fields and resumed scheduled success.

Example offline preparation (all paths and IDs are operator-supplied):

```sh
python3 scripts/nest_takeout_import.py --zip /private/path/export.zip \
  --start 2026-01-01T00:00:00Z --sdm-device enterprises/PROJECT/devices/DEVICE \
  --zone whole_house --output tmp/takeout-prepared.json
```

The offline helper prepares validated rows; writing to the live Sheet is a separate bounded, idempotent upsert operation. Never commit its output, the original ZIP or private run-specific audit notes.

## Independent email watchdog

The bound collector uses its existing Drive/mail scopes to resolve the private spreadsheet owner, or the `NEST_ALERT_EMAIL` Script Property, and sends only to the configured LHL domain. It avoids `Session.getEffectiveUser()` so no extra `userinfo.email` grant is needed. Notification failures are isolated from collection. Checks follow the existing six-hour collector, so alerts can be delayed up to six hours and depend on that collector remaining active. Setup/recovery notifications are sent, ongoing problems are limited to one email per day. Confirm live delivery separately; unit tests do not establish delivery.

## Local verification commands

```sh
npm test
npm run lint
python3 -m unittest discover -s tests -p 'test_nest_takeout.py'
```

Python tests cover wrapped JSON, missing/invalid counters, anomalous coverage, interval bounds, deterministic output, DST-fold keys and absence of fabricated HVAC/fan states. Live acceptance additionally requires source/native/canonical/Master readback and preservation of unrelated data.

Historical-export references:

- [Google Takeout instructions](https://support.google.com/accounts/answer/3024190)
- [Nest Energy History](https://support.google.com/googlehome/answer/9247300)
- [Nest privacy and data categories](https://support.google.com/googlehome/answer/9415830)

## Local repair deployment review (not yet deployed)

The worker caches workbook/sheet handles and worker-owned ledger/health/attempt rows only within an invocation; it never caches shared Source_Status or Master rows. Observation/health sheets no longer undergo a full-sheet sort on every append: replay and continuity still sort in memory. Upserts compare values excluding ingestion timestamps, skip identical rows, reject conflicting observation/input identities, and batch adjacent changed rows. Unchanged rows keep their original ingestion time. Master reads only affected Nest spans and writes only changed existing-key Nest cells. It does not create Master UTC keys or touch non-Nest fields, historical Takeout rows, source gaps or Events.

**Remaining cross-project race:** the bound project can write complete Master rows while the worker patches Nest columns. Their script locks are independent. A fresh key check before each worker block detects some row movement but is not a cross-project transaction and cannot prevent a bound writer from overwriting newer Nest values. This repair narrows stale writes; it does not claim to solve that race. A stronger shared-writer/coordination design requires separate review. Canonical Nest remains the live source, with provisional Master joins refreshed naturally.

After explicit approval of the diff and the following live effects:

1. Read live health and record both project IDs, worker deployment/version, actual trigger target/cadence, relevant headers/keys, properties baseline and non-Nest preservation checksums privately. Capture/export current deployed source for rollback. Do not expose credentials, change grants, enable billing, or run a collector/import.
2. Re-run local checks. Build the separate worker with `python3 -B scripts/build_nest_worker.py`. Review the resulting Core.js, Code.js and unchanged manifest; retain the separate private worker `.clasp.json`. Never push worker files over the bound collector.
3. Push the reviewed bound source using its existing project configuration; its existing Head six-hour trigger picks up the attempt-aware watchdog. Do not recreate that trigger or change its cadence.
4. Push worker source to its own project, create a new immutable version, and update the existing owner-only setup web-app deployment to that version. Preserve scopes/access and private configuration. A source push alone does not retarget the currently version-pinned worker trigger.
5. In the newly versioned owner-only setup app, use **Start collection** once to replace the owner's existing `runNestCollection` trigger with exactly one trigger targeting the new version at the same one-minute cadence. This calls activation/trigger installation, not observation verification or a collector. Do not press **Verify observation**. Reinspect the actual trigger target/count/cadence and the bound trigger. The trigger replacement and enabled flag are explicit live effects requiring approval.
6. Let naturally scheduled runs create `Nest_Run_Attempts`, append the seven Nest_Usage headers, and populate deferred telemetry properties. Do not manually run collection, migrate/delete old daily rows, replay history or fabricate source traffic.
7. Observe at least 30 minutes and two completed quarters, then the next natural six-hour bound run and UTC rollover. Require fresh successful final attempt markers with checkpoint <= completion, no abandoned attempts hidden by early success, correct error/usage separation, and usage totals reconciled with platform durations including documented exclusions/lag. Compare matched materializing/non-materializing execution medians, upper percentiles and overlap rates to the prechange baseline; mock timings do not establish production savings.
8. Verify natural snapshot cadence (five minutes plus recovery), pull bounds, archive-before-ack behavior from read-only evidence, fresh canonical completed bins, intended Master lag, absence of duplicate keys and new duplicate daily rows, preservation of historical keys/four documented source gaps/unknown durations, and unchanged non-Nest values. Inspect cross-project overlap explicitly. Do not project quota headroom without entitlement/reset/account-wide execution evidence.

Rollback after separately approved live execution: restore the captured worker version (currently observed as version 7, recheck first), repoint the owner-only deployment and replace its worker trigger from that version at the same cadence. Restore captured bound Head source and push it without modifying its trigger. Do not delete new tables, appended usage columns, properties, archives or observations, and do not restore a whole workbook over newly collected data. Preserve the repaired-period telemetry; the old meter's legacy properties will be stale, so accounting across rollback requires read-only reconciliation before any separate correction. Historical duplicate reconciliation is outside this rollback. Verify recovery only through naturally scheduled final outputs/platform history.

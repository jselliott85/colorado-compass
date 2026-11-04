# Nest processing repair and recovery

## Repair behavior

The worker preserves raw observations before processing. Two stored-data conditions
can prevent those observations from reaching the analysis tables:

- Interrupted retention previously copied retained rows over the original prefix,
  then cleared the tail in a separate operation. Termination between these writes
  can leave duplicate stored keys. The original termination cause remains unknown.
- A wholly empty observation row could reach the replay sort comparator with a
  null observation ID and abort aggregation.

Retention now deletes only expired contiguous row blocks, working from bottom to
top. Each completed deletion leaves retained rows intact, and a fresh invocation
can safely retry. The invocation row cache is invalidated before mutations.

Replay and upsert indexing ignore wholly empty records. Upserts retain physical
sheet row offsets so empty rows cannot shift updates onto neighboring records.
Partially populated observations fail explicitly instead of being discarded.

Health, source status and attempt error reports are independent. A damaged health
ledger cannot suppress the other reports. Static error codes identify duplicate
keys, conflicting stored observations and invalid stored observations without
persisting arbitrary exception bodies or credentials.

## Deployment and verification

The standalone worker repair was deployed as immutable version 10 at its existing
owner-only deployment. The manifest, scopes and other collectors were unchanged.
All 61 JavaScript tests and static security/schema checks pass. Regressions cover
interruption after committed deletion, retry safety, blank rows, physical update
addresses and reporting with a damaged health table.

Initial live checks covered at least 30 minutes of scheduled processing, two
completed quarters compared with replay, successful retention and existing-key
Master joins. Historical source rows and Events were preserved. Private run-specific
results, backups, identifiers and observations stay in ignored operator storage.
The next natural bound refresh and UTC rollover remain follow-up observations;
initial checks do not establish long-term quota headroom or complete backlog recovery.

For any future reconciliation or deployment:

1. Capture deployed source/version, owner-only deployment, trigger cadence and
   private data baselines for rollback. Inspect available execution errors without
   assuming that every termination is a timeout or quota exhaustion.
2. Pause the standalone Nest worker throughout cleanup and deployment. Wait for
   existing invocations to finish. Nest pulls and processing share one worker, so
   both pause together. Leave independent collectors active and record the pause
   as unknown coverage.
3. Back up affected tables and archives privately. Validate duplicate identities
   and all field values. Immediately before clearing approved duplicate cells,
   re-read those exact cells and their retained counterparts. Stop if records have
   moved, changed or become formulas. Re-read afterward to verify only the intended
   cells changed. Preserve provisional checkpoints and unfinished outcomes.
4. Build and push to the separate worker project. Create an immutable version and
   update the existing owner-only deployment. Read back the source and manifest.
   Resume with exactly one trigger installed from the updated setup page at the
   existing cadence. A source push alone does not retarget a version-pinned trigger.
5. Observe naturally scheduled completion markers, health timestamps, retention,
   unique keys and two completed quarters. Compare analysis fields against retained
   observations. Check Master joins on existing keys; new Master UTC keys still
   follow the bound collector's six-hour cycle. Do not manufacture keys or runtime
   to make an acceptance check pass.
6. Preserve new data during rollback. Do not restore an old workbook over newly
   collected observations. Returning to an older version can reintroduce its defects.

## Separate backlog recovery

Normal materialization replays 48 hours. Older gaps require an inventory and dry
run before historical writes:

1. Inventory retained raw events/snapshots, normalized observations, finalized
   health archives and attempts. Retain provenance, timestamp ranges and conflicts.
2. Deduplicate identical observation IDs idempotently and fail on conflicting
   contents. Snapshot read times remain distinct from device measurement times.
3. Use finalized successful checkpoints for supported continuity. Do not promote
   checkpoints, unfinished runs or processing errors to success because observations
   exist. Observation presence alone does not establish equipment runtime.
4. Compare proposed UTC-quarter/zone rows against canonical Nest. Preserve Takeout
   provenance, true source gaps and unknown durations. Do not interpolate or infer
   missed cycles from matching snapshots.
5. Review bounded canonical upserts and Nest-only Master patches before applying.
   Recheck keys and account for independent worker/bound locks and concurrent replay.
   Verify idempotence and unrelated-field preservation after each batch.

The processing repair does not implement or execute historical archive replay.

# Daily Garmin sync

The Dashboard baseline correction is live. The user approved hosted credentials and workbook access. A dedicated service account was created in the existing `air-quality-nest` project with no project roles or domain-wide delegation; Sheets API was enabled. The existing workbook alone was shared with that identity as Editor. Three repository Secrets were saved and their names verified. The temporary Google key download was removed after transfer and successful authorization validation. The existing Garmin Keychain item was retained.

The local real-record test through the new identity passed: one identical persisted-record write/readback, followed by an unchanged-ID no-op; all Body metrics fields and row counts remained unchanged. Hosted write/readback and duplicate reconciliation both passed. The daily schedule is configured at 11:45 America/Denver, with the repository kill switch true. Independent connector readback confirmed exactly one active canonical measurement at revision 1 and a blank pre-baseline Change vs start.

## Job configuration

Use a GitHub-hosted Ubuntu runner in the existing repository. The Mac does not need to be awake or online. The deployed workflow is `.github/workflows/nutrition-garmin-sync.yml`. Its intended daily schedule is:

```yaml
schedule:
  - cron: '45 11 * * *'
    timezone: America/Denver
```

GitHub documents IANA timezone scheduling with DST handling. Thus 11:45 corresponds to 17:45 UTC during MDT and 18:45 UTC during MST. No twice-daily UTC workaround is needed. Runs may queue/start late, and GitHub may drop scheduled events under load. Public-repository schedules may be disabled after 60 days without repository activity. This is a small low-cost scheduler, not an exact-time SLA or an independent outage monitor. [GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Manual and scheduled runs share concurrency group nutrition-os-garmin-body-metrics with cancel-in-progress=false. A local process lock is an additional guard, not a service. Keep ad hoc body-metric writers coordinated once this becomes the routine writer. No lock can make unrelated external editors transactional with Sheets.

## Minimum practical Google authorization

Create a dedicated service account named nutrition-os-garmin-sync in an existing user-selected Google Cloud project, with the Sheets API enabled. Do not grant project-wide data roles or domain-wide delegation. Share only the existing Nutrition OS workbook with that identity as Editor. Request only the Sheets API scope https://www.googleapis.com/auth/spreadsheets; no Drive, Gmail, Calendar or other API scopes.

This scope applies to spreadsheet files, not individual tabs. The service account's effective file access is limited by what is shared with it, but it has Editor access to the whole shared workbook. The runner enforces Body metrics A:T writes by resolving the live numeric sheet ID and exact headers. That code boundary is not a separate Google tab-level permission. [Google scope documentation](https://developers.google.com/workspace/sheets/api/scopes).

For the smallest initial setup, the proposal uses one Google service-account JSON key in encrypted GitHub Secrets. This is a persistent credential and requires approval before creation. Workload Identity Federation could avoid that key but adds identity configuration; it is not silently provisioned here. The current interactive connector cannot be exported or assumed available in GitHub Actions.

## Approved access/secret setup

1. Reuse an existing user-selected Google Cloud project; enable Sheets API if needed and create the dedicated service account (no project roles/domain-wide delegation).
2. Grant that identity Editor access to the existing Nutrition OS workbook only.
3. Create its Google JSON key and place it directly into repository secret NUTRITION_GOOGLE_SERVICE_ACCOUNT_JSON without displaying it in chat/logs. Delete any temporary local key download after secure transfer.
4. Copy the existing validated Garmin key from its Keychain item to repository secret NUTRITION_GARMIN_PERSONAL_API_KEY. Retain the current Keychain item; do not generate another Garmin key. Put the workbook ID in secret NUTRITION_SPREADSHEET_ID as private configuration.
5. After credential validation, install the reviewed workflow and perform the explicit manual end-to-end test, then activate the daily schedule. No new workbook, hosting service, database, webhook, Google OAuth user app or Garmin activity client is needed.

No secret contents should be pasted into chat or placed in command arguments. A temporary file, if unavoidable during Google key creation, must be private, excluded from git and removed after transfer. GitHub Secrets setup should use native secure forms or captured stdin, not printed values.

## Runner behavior and validation

`garmin_sync.py` reuses the validated Garmin endpoint, token exchange and garmin-index-s2/1.0 normalizer. Each normal run requests today plus the preceding six Denver dates (seven inclusive calendar days). It ignores adjacent context and observations outside the canonical window. Empty windows succeed quietly: they are not zero-valued weigh-ins. Missed/late data inside the window are reconciled; measurements older than it need a separately bounded manual backfill.

The runner re-reads Body metrics headers and records before each mutation, preserves occupied/partial rows, and uses the exact real source ID. Identical records are no-ops; changed/duplicate source records stop for review. It writes typed cells only in Body metrics A:T, verifies all 20 fields including revision/import timestamps by separate readback, and reconciles ambiguous write outcomes before any later retry. It never blindly replays an append after a timeout. Routine successful runs produce no console message and no health-data artifacts. Failures emit sanitized action codes only. No Settings, meal, plan, target, completed-activity or Dashboard writes occur.

Before activating the schedule:

- Confirm the actual Garmin key expiry in Connect. The user confirmed a 30-day Garmin access key on October 26, 2026. Confirm the exact expiry shown in Connect; plan renewal before that deadline (approximately November 25 if issued October 26). Renew through Connect before expiry and securely replace both approved secret copies. Bearer tokens are acquired fresh per run and kept in memory. Google service-account keys do not inherit Garmin's expiry; review/rotate/revoke that credential separately.
- Resolve the dedicated Google identity and access grant, confirm key storage, install the workflow initially for manual validation, and keep scheduled operation gated until that test passes.
- Dispatch the known historical validation date with verify_existing_write=true. This deliberately rewrites the identical persisted record only, retaining recorded_at_utc/revision, then checks readback. Dispatch it again normally: expect a source-ID no-op and exactly one canonical record. Report the actual cloud run URLs/results; do not call synthetic tests or the earlier connector write a hosted end-to-end run.
- Enable GitHub's failed-workflow-only notifications for the user who owns this schedule. No custom success email, chat message, issue bot or external notification service is configured. Verify that failure notifications reach the intended user; notification preferences are separate from this script. An entirely disabled/dropped schedule cannot report its own failure, so note the inactivity/queue limitation and check freshness in the workbook.
- Only then install/enable the 11:45 America/Denver schedule and record its verified configuration and first successful hosted run.

The proposed repository variable NUTRITION_GARMIN_SYNC_ENABLED is a separate kill switch. Removing/revoking a key or workbook grant also stops access. Explicit approval was received for these credential/access actions. Google service account: `nutrition-os-garmin-sync@air-quality-nest.iam.gserviceaccount.com`. Secret contents and private measurements are not stored in this repository.

## Program baseline correction

Dashboard hidden T3 is the labelled date-only program start, October 26, 2026. Change vs start is blank when the latest observation predates that date, while the real historical weight/date and chart points remain intact. The display says Awaiting post-start weigh-in. The weekly loss calculation also requires both seven-day comparison windows to be on/after the baseline, so historical backfills cannot become program loss pace. The starting-weight setting remains self-reported; it was not inserted as a Garmin measurement. Settings were not changed.

## Hosted validation evidence — October 26, 2026

- Real source fetch, identical persisted-record write, and exact separate readback: [successful run](https://github.com/jselliott85/colorado-compass/actions/runs/40383739675).
- Same source fetch without validation rewrite; exact-ID no-op and readback: [successful duplicate check](https://github.com/jselliott85/colorado-compass/actions/runs/40383873503).
- Independent connector readback after both runs: one active Body metrics record, revision 1; historical measurement retained; Change vs start blank and Awaiting post-start weigh-in shown. Local new-identity validation compared all fields before/after exactly and found no changes.
- All 26 synthetic tests passed, covering DST, rolling windows, ambiguous writes and retry reconciliation.
- GitHub notification preferences were verified in the signed-in account: Actions notifications on GitHub and by email, failed workflows only. Existing default email was left unchanged. Delivery of an actual failure email was not induced/tested. No new messaging service is configured. Routine sync success remains silent.

- Final deployed workflow verified active through GitHub API; remote main schedule parsed under on.schedule as 45 11 * * * with timezone America/Denver, and enabled gate read back true. The normal seven-day run on the final scheduled workflow [succeeded](https://github.com/jselliott85/colorado-compass/actions/runs/40384170010). The first automatic scheduled event is still future; manual dispatch exercises the same job.

# Daily Garmin sync: prepared, not activated

The independent Dashboard baseline correction is live. Hosted credentials/access have **not** been created or moved, and no schedule has been installed. The user approved the dedicated service account/key, workbook-only sharing, and transfer of the Google and existing Garmin credentials into repository Secrets. Existing-project selection is pending; approval has not yet been exercised.

## Concrete proposed job

Use a GitHub-hosted Ubuntu runner in the existing repository. The Mac does not need to be awake or online. The review copy is `garmin-sync.workflow.yml` inside nutrition-os, outside .github/workflows so it cannot run yet. It specifies:

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

## Approved access/secret actions awaiting setup

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

- Confirm the actual Garmin key expiry in Connect. The recommended pilot key was 30 days; its selected expiry was not independently read from the provider. Renew through Connect before expiry and securely replace both approved secret copies. Bearer tokens are acquired fresh per run and kept in memory. Google service-account keys do not inherit Garmin's expiry; review/rotate/revoke that credential separately.
- Resolve the dedicated Google identity and access grant, confirm key storage, install the workflow initially for manual validation, and keep scheduled operation gated until that test passes.
- Dispatch the known historical validation date with verify_existing_write=true. This deliberately rewrites the identical persisted record only, retaining recorded_at_utc/revision, then checks readback. Dispatch it again normally: expect a source-ID no-op and exactly one canonical record. Report the actual cloud run URLs/results; do not call synthetic tests or the earlier connector write a hosted end-to-end run.
- Enable GitHub's failed-workflow-only notifications for the user who owns this schedule. No custom success email, chat message, issue bot or external notification service is configured. Verify that failure notifications reach the intended user; notification preferences are separate from this script. An entirely disabled/dropped schedule cannot report its own failure, so note the inactivity/queue limitation and check freshness in the workbook.
- Only then install/enable the 11:45 America/Denver schedule and record its verified configuration and first successful hosted run.

The proposed repository variable NUTRITION_GARMIN_SYNC_ENABLED is a separate kill switch. Removing/revoking a key or workbook grant also stops access. Explicit approval was received for the listed credential/access actions. No credentials have yet been created or moved; project selection and hosted validation remain pending.

## Program baseline correction

Dashboard hidden T3 is the labelled date-only program start, October 26, 2026. Change vs start is blank when the latest observation predates that date, while the real historical weight/date and chart points remain intact. The display says Awaiting post-start weigh-in. The weekly loss calculation also requires both seven-day comparison windows to be on/after the baseline, so historical backfills cannot become program loss pace. The starting-weight setting remains self-reported; it was not inserted as a Garmin measurement. Settings were not changed.

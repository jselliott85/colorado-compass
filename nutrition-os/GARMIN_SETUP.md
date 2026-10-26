# First Garmin measurement validation

Status: Keychain access, token exchange and an authenticated historical weight-range read succeeded. The user confirmed the Index S2 measurement against Connect. Scout added the two coordinated columns, and Codex completed the approved one-real-record write/readback and no-op duplicate test. See [BODY_METRIC_PROFILE.md](BODY_METRIC_PROFILE.md). Recurring ingestion remains off; no new Google authorization was created.

## Key recommendation and secure storage

Use a **30-day key for initial validation**. This is a project recommendation to keep the pilot credential short-lived, not a provider requirement. Garmin supports 30/90/180-day and one-year expiry; keys are shown only once. If the later routine integration is approved, consider a separate 90-day key with an explicit rotation date. Tokens last up to 24 hours and have no refresh token. [Garmin FAQ](https://developer.garmin.com/gc-developer-program/personal/personal-faq/).

Before generating the key, open **Keychain Access** on this Mac and prepare a new password item in the **login** keychain:

- Keychain Item Name / service: `nutrition-os.garmin.personal-api`
- Account: `nutrition-os`
- Password: the generated Garmin Personal API key, entered directly into this native password field

Then generate the 30-day key in Garmin Connect, accept the provider terms, copy it directly to that password field and save. Do not put the key in chat, a terminal command, source files, a Sheet or an environment file. Do not select access for all applications. Keep normal Keychain access confirmation enabled; approve only the expected local validation read. Clear the clipboard after saving. Keep any recovery copy only in your own password manager. [Apple Keychain access controls](https://support.apple.com/en-gb/guide/mac-help/kychn002/26/mac/26).

Tell Codex only **“Key saved in Keychain”** when ready. Never run a command that displays the key. The validator reads the specific generic-password item into memory with a captured subprocess response; the secret is not passed in process arguments or printed. Its short-lived bearer token remains in memory and is not saved. This does not share credentials with Air Quality or any other project.

## Prepared one-time read

`garmin_validate.py` reads only the official token endpoint and weight/range endpoint with includeAll=true. The all endpoint returned HTTP 400 in execution, so the range route is used, matching Garmin's official client. There is no Sheets client, activity call, background service, scheduler or recurring workflow. It restricts the query to one to seven inclusive days, refuses redirects and suppresses provider error bodies. That seven-day bound is our safety guard, not an established Garmin history limit. A raw measurement response is saved owner-only in ignored `local/garmin/` for private inspection, never in tracked fixtures. The terminal report includes field names/counts and validation flags, not weight values, timestamps or measurement IDs. Keychain can require a local approval prompt when the run begins.

The token exchange follows Garmin's [official authentication client](https://github.com/garmin/connect-personal-api-python/blob/main/src/garmin_personal_api/auth.py), which receives a plain-text bearer token, not a JSON access_token object. The validator keeps it in memory and does not use that client's disk token cache.

After the key is stored, choose a short date window containing a known Index weigh-in. For example, a current-window command would be:

```bash
/Users/jselliott/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 nutrition-os/garmin_validate.py --start-date 2026-10-24 --end-date 2026-10-26
```

This command contains dates only. Use the bundled modern Python: this Mac's system Python uses LibreSSL without TLS 1.3 and failed negotiation. Do not disable certificate verification. The recent-window query executed successfully but contained no readings; its previousDateWeight pointer identified a historical reading, which was then retrieved in its own date window. No-reading windows are not zero-valued measurements or authentication failures. Network/Keychain sandbox approval may be required at execution, independently of Garmin authorization.

## First-measurement acceptance

1. Compare one actual record privately with the same Index reading in Garmin Connect: weight, display unit, date/time and device/source evidence. Personal API documentation says kg; do not apply grams/1000 merely because unofficial APIs have used grams. `weight_to_kg` accepts only an explicitly verified unit.
2. Confirm timestampGMT type, offset and precision in the actual response. Normalize to UTC and derive America/Denver date with IANA DST rules; compare the account's calendar date/timezone. The actual account response supplies Unix milliseconds, not the published date-time string. The confirmed Index S2 profile now parses numeric values explicitly as Unix ms; the generic parser still refuses ambiguous numeric timestamps.
3. Inspect actual stable ID availability. Preserve an exact provider ID if available; the published DTO does not promise one. Inspect repeated fetches and multiple same-day readings. Duplicate exact instants are surfaced, never silently merged. Do not use weight or local date as identity. Timestamp identity remains a coordinated fallback only after its limitations are accepted.
4. Verify optional bodyFat/bodyWater/muscleMass/boneMass presence, units and interpretation against the same Connect reading. Unknown values remain blank; none are imported by this validator. A populated field does not establish its unit or Index provenance.
5. Repeat the same small read to establish stable IDs/instants and unchanged payloads. Test normalization/reconciliation with synthetic duplicates and a changed measurement value. Account reads alone cannot prove that timestamp-based identity survives source edits.
6. Only after the first reading and identity strategy are validated, coordinate one Body metrics upsert/readback test against the existing schema. Keep meals, nutrition targets, workouts and Settings intact. Scheduling is a separate later step, including its Google authentication and secure credential storage decisions.

If any gate fails, retain the private capture for diagnosis and stop. Never guess units, invent a stable source ID, write partial body metrics or activate a recurring job to bypass a failed validation. Real response files should be deleted after the private comparison is complete; do not attach them to public issues or commit them.

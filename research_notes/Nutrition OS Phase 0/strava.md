# Strava integration feasibility

## Can the official API supply completed workouts?

### Takeaway
Verified in official documentation, not executed: endpoints provide the required activity record. Current access requires a subscription, but policy prevents treating this technical capability as approval for Nutrition OS.

### Cited Findings
- New applications start with one athlete (the developer); creating an app requires a Strava subscription. Upgrading to ten athletes is available in API settings; larger capacity requires review. [Getting started](https://developers.strava.com/docs/getting-started/)
- `GET /athlete/activities` supports epoch `after`/`before` and pagination. `GET /activities/{id}` supplies details including calories (kilocalories). Available fields include activity ID, `sport_type`, UTC `start_date`, local timestamp/timezone, distance in meters, moving and elapsed seconds, average/max heart rate when present, ride average power, weighted average power, and kilojoules. `device_watts` distinguishes meter power from estimates. Zones are subscription-dependent. Request `activity:read_all` for Only Me activities; `activity:read` omits those. [API reference](https://developers.strava.com/docs/reference/)
- Default limits: overall 200 requests/15 minutes and 2,000/day; reads 100/15 minutes and 1,000/day. Ten-athlete upgrade raises them. Honor actual response headers and back off on 429; daily reset is UTC. [Rate limits](https://developers.strava.com/docs/rate-limits/)

### Inferences
- Keep missing metrics null; zero must not mean unavailable. Calories remain an estimate; do not equate cycling mechanical kilojoules with calories. Store IDs as text in Sheets to avoid numeric precision loss. Derive reporting date from UTC in America/Denver rather than trusting a local timestamp bearing a misleading Z.

### Gaps
- No Strava account, app, scope grant, live response, metric availability, account subscription, or current account quota was inspected. These are unverified for this user.

## Is API to Sheets to Scout an allowed architecture?

### Takeaway
Verified in official documentation: **do not approve the proposed pipeline yet**. The June 1, 2026 API policy blocks AI context ingestion and also contains broad restrictions on analytics, combining data, and persistent retrieval stores.

### Cited Findings
- API policy §5.3 bars AI application operation using API data, including derived/aggregated data and context-window ingestion. §5.4 bars analytics and combining Strava data with other customer data. §5.5 restricts persistent retrieval storage. §3.5 provides a personal-use Strava MCP exception. §2.5 requires deletion on request or access withdrawal. These provisions make private non-AI Sheets storage **not automatically permission-cleared**, and exclude an API→Sheets→Scout workaround. [API policy](https://www.strava.com/legal/api_policy)
- The September 18, 2026 FAQ says MCP launch is with Anthropic/Claude, with other AI platforms a future possibility; subscribers can use it. Free users retain free access and download rights, but this does not verify downstream AI reuse permission. [Strava API and MCP FAQ](https://support.strava.com/en-us/articles/15401526-strava-api-and-mcp-faq)
- The controlling API agreement is dated June 1, 2026 and incorporates the policy. [API agreement](https://www.strava.com/legal/api)

### Inferences
- Keep completed-activity ingestion out of Phase 1 until Strava confirms an allowed personal storage/analysis path and an authorized Scout/ChatGPT route. Technical endpoint feasibility is green; the intended end-to-end usage is blocked on policy/capability verification. Do not route through derived summaries, manual exports, another platform, or Sheets to claim this gate is resolved.
- If user wants a definitive interpretation, seek Strava clarification rather than asserting private storage is categorically permitted or categorically prohibited. This report identifies documented restrictions, not a legal determination.

### Gaps
- No Strava MCP tool is known available in this Codex environment; no supported ChatGPT connection or permission for this architecture was verified. Whether Strava would grant an exception is unknown. No precise localized subscription cost verified; report a possible incremental paid subscription rather than claim free API setup.

## What is the minimum technical design if that gate is resolved?

### Takeaway
A small scheduled single-athlete job is technically sufficient, conditional on permission and secure rotating-token persistence. No webhook service is necessary initially.

### Cited Findings
- OAuth registration produces client ID/secret; consent grants scopes. Access tokens last six hours. Refresh via `POST /oauth/token`; persist the newest refresh token immediately because an older one is invalidated when replaced. [Authentication](https://developers.strava.com/docs/authentication/)
- Webhooks cover activity create/delete and title/type/privacy updates, plus deauthorization. A public callback must validate a challenge and acknowledge events within two seconds. [Webhooks](https://developers.strava.com/docs/webhooks/)

### Inferences
- Conditional design: scheduled/manual GitHub Action runs one at a time; paginate a small rolling overlap window; fetch detail for new/revisited IDs; upsert `(source=strava, source_id=activity_id)`; never append blindly. Persist `last_success_at` only after validated writes. No completed data from Garmin/Zwift/TrainingPeaks.
- Refresh-token persistence is a real requirement: an immutable initial GitHub secret alone fails after rotation. After approval, choose an explicitly authorized writable secret mechanism (or consider Apps Script private properties if it materially reduces complexity); never commit tokens, save them in sheet cells, or print them. A GitHub token able to replace a secret is an additional permission to assess, not something assumed available.
- Re-fetch a rolling window for late uploads/edits; periodic full reconciliation catches older changes but may hit rate/policy storage limits. Mark missing activity as unavailable pending investigation rather than interpret every 404 as deletion; revoked access must halt and trigger required data deletion. A scheduler alone cannot guarantee immediate deletion detection; test/document bounded lag. Webhooks can be a later improvement only if justified.
- Conditional acceptance tests: scopes include private activity, pagination, all sport types, nullable calories/HR/power, ID precision, rerun no duplicates, edited values overwrite same ID, deletions/privacy changes, refresh rotation across separate runs, overlapping runs serialized, 401/429/backoff, partial write recovery, UTC/Denver DST boundary. No health or token values in Actions logs/artifacts.

### Gaps
- No code implemented, OAuth credentials provisioned, external writes made, or ingestion tests executed. GitHub Actions runtime cost depends on repository visibility, plan allowance and usage; precise incremental cost unverified.

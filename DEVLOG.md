# Colorado Compass — Dev Log

A GeoGuessr-style geography game for Colorado, built collaboratively with Claude. This file
tracks the key decisions and why they were made, so future changes (by a person or an AI) don't
have to rediscover the reasoning from scratch.

## Core concept

Each round shows a real aerial/satellite view of a Colorado location. A game has 5 rounds worth
up to 1,000 points each. Players choose a mode before starting:

- **Easy:** choose the location from five answers. Correct is worth 1,000 points; wrong is 0.
- **Hard:** drop a pin on a reference map of the state. Distance from the true location determines
  the score using exponential decay, with any guess within 3 miles counted as a full-points
  bullseye (see "Hard-mode bullseye" below).

The two modes share the same location pool and round flow, but keep separate local best scores.
Existing `coCompassBest` scores from before v2 are treated as Hard-mode scores.

## Game modes

The v2 landing page explains both modes and starts the selected version directly. The photo and
result areas are shared; only the guessing control changes. Easy mode builds four random
distractors from the correct location's category, adds the real location, and shuffles all five.
Hard mode preserves the original Leaflet map interaction and distance scoring unchanged.

Categories are encoded on the flattened location records from five named groups rather than
inferred from array position: `landmarks_parks`, `lakes_reservoirs`, `ski_resorts`,
`mountains_wilderness`, and `towns_cities`. Mountain towns and cities are intentionally combined;
Downtown Denver moved from the old landmarks grouping into `towns_cities`. Airports remain in
`landmarks_parks` because the pool has only three, too few to generate four airport distractors.
Every category has at least eight entries, so Easy mode can always provide four same-category
distractors.

Final breakdowns and generated share cards identify the mode. Easy results show whether the
answer was correct instead of presenting a map distance, and analytics events include
`game_mode` so the two experiences can be evaluated independently.

## Why it's a downloadable file, not a claude.ai artifact

The first version was published as a claude.ai artifact using hand-illustrated SVG scenes
instead of real photos. Published artifact pages run under a content-security policy that blocks
remote images and most network requests — there's no way for a hosted claude.ai page to pull
live map tiles or satellite imagery.

Real aerial photography only became possible by switching to a plain downloadable HTML file,
which runs in the user's own browser with no such restriction and can freely load live tiles.

## Map providers

- **Photo panel (the "mystery" image):** originally Esri World Imagery for every scene; since
  v2.1 it is USGS `USGSImageryOnly` by default, with Esri as a per-location option. See
  "Imagery sources and phone framing" below. Locked/non-interactive per round (no drag, zoom,
  or scroll) so it functions like a fixed photo rather than an explorable map.
- **Reference/guess map:** originally tried OpenStreetMap's standard tile server
  (`tile.openstreetmap.org`). It actively blocked requests (403 — their usage policy explicitly
  disallows this kind of embedded-app/local-file use on their volunteer-run infrastructure).
  Switched to **Esri World Topo Map** instead — same provider as the imagery layer (so no
  separate blocking risk), and its shaded relief + roads + labels is actually a closer match to
  the "reference map" look than plain OSM was.
- **Hard-mode map since v2.2: USGS Topo** (`USGSTopo`), with Esri World Street Map as an
  automatic fallback after 3 tile errors (`guess_map_fallback` analytics event). Chosen from a
  side-by-side of 8 USGS/Esri basemaps at the zooms players use (statewide, Front Range, mountains,
  phone). The deciding factor was the opening statewide view (zoom 6): USGS Topo is the only one
  that labels multiple Colorado cities and numbered highways there; the Esri maps, including the
  old World Topo Map, label only Denver until you zoom in. Tradeoff: busier in the mountains
  (national-forest boundaries). No `detectRetina` on this map, because it would halve label size.
  Satellite + labels (`USGSImageryTopo`) was ruled out because players could match the scene
  photo against it.

## Location pool

Random lat/lon anywhere in Colorado was considered and rejected — much of the eastern plains is
visually indistinguishable brown/green farmland from above, which makes for a bad round. Instead
the game draws 5 locations per game from a curated pool, randomly ordered. The pool has grown
since the original 40; homepage copy deliberately says "famous spots" rather than citing a count,
so it doesn't go stale as the pool changes.

Current pool (68 locations):

- 16 landmarks/parks
- 8 bodies of water
- 16 ski resorts
- 12 mountain ranges/peaks
- 16 towns/cities (10 mountain towns, Downtown Denver, Fort Collins, Grand Junction, Pueblo,
  Greeley, and Boulder)

Known limitation: several of these cluster geographically (Summit County ski towns; the San
Juans), so a wrong guess in the right general area can still score well. Not fixed as of this
writing — worth watching if it makes the game feel too forgiving.

### Expansion notes (dedup, coordinate fixes, imagery sourcing)

When a large batch of new locations was added, a few needed judgment calls rather than a
straight append:

- **Duplicate real-world places skipped:** Steamboat Springs and Telluride were requested as new
  ski-resort entries, but the pool already had Steamboat (as a resort) and Telluride (as a
  mountain town) covering the same place — adding them again would've just been two pins on the
  same spot. Same for Pikes Peak (already a landmark) and Gore Range (already a range).
- **Range vs. individual peak overlap:** when a newly requested individual peak turned out to
  already be covered by an existing range entry, the range was dropped in favor of the specific
  peak (a tighter, more identifiable shot than a wide range view). This removed **Sawatch
  Range** (superseded by **Mount Massive**, with Mount Elbert already separate) and **Collegiate
  Peaks** (superseded by **Mount Harvard**). Sangre de Cristo Range was skipped outright in favor
  of **Blanca Peak**, its highest point, for the same reason.
- **Silverton Mountain dropped:** requested as a ski-resort entry, but it's an intentionally
  undeveloped, single-lift, guide-required area with no groomed trails or base village — from
  satellite it's indistinguishable from generic San Juans backcountry, and the pool already has
  both "Silverton" (town) and "San Juan Mountains" covering that same visual territory.
- **Steamboat Springs coordinates corrected:** the original pin (in the pool before this
  expansion) was centered too far north, mostly showing bare alpine ridgeline above the resort
  rather than its recognizable trail network. Verified by pulling the exact bbox Leaflet would
  render (via Esri's `/export` endpoint) at a few candidate points and eyeballing which one
  actually captured the trail fan, then recentered on it.
- **Wolf Creek's imagery seam:** Esri World Imagery has a hard mosaic seam (two different capture
  dates stitched together — green summer on one side, grainy dark snow imagery on the other)
  sitting almost exactly on Wolf Creek Pass. No nearby coordinate avoids it, since the seam is
  baked into Esri's basemap itself, not a framing problem. Fixed by giving this one location an
  optional per-location tile-layer override (`loc.tiles`, read in `buildPhotoMap()`) pointing at
  USGS's `USGSImageryOnly` service (`basemap.nationalmap.gov`) instead — public-domain U.S.
  government imagery, uses the same `{z}/{y}/{x}` tile scheme Leaflet already expects, and has no
  seam at that location. Credited separately in the footer attribution line.
- **Royal Gorge's cloud cover, Bear Lake's and St. Elmo's imagery quality:** all found during the
  image-audit pass (see below). Royal Gorge had a persistent cloud bank obscuring the canyon; Bear
  Lake had the same kind of Esri mosaic seam as Wolf Creek (a hard vertical line between two
  different capture dates); St. Elmo's Esri capture was a grainy, low-contrast winter/snow image
  that obscured the townsite. All three fixed the same way: a `loc.tiles` override to USGS
  `USGSImageryOnly`, which is clean at all three. Wolf Creek, Royal Gorge, Bear Lake, and St. Elmo
  are currently the only locations using a non-default imagery source; everything else still uses
  Esri.
- **Mesa Verde zoomed out:** was zoom 14 (too tight on one canyon), dropped to zoom 13 to show
  more of the surrounding mesa fingers — also found during the image-audit pass.
- **Three locations recentered on bad coordinates:** also found during the audit —
  **Trail Ridge Road Visitor Center** was pinned about 5km from the real Alpine Visitor Center
  (verified against Nominatim/OpenStreetMap's geocoder rather than guessing again); renamed to
  **"Trail Ridge Road: Alpine Visitor Center"** to match, and zoomed in from 13 to 15 so the
  visitor-center building and road are actually visible. **Barker Reservoir** was pinned at the
  reservoir's edge instead of open water; recentered on the water body itself. **St. Elmo** was
  about 500m south of the actual townsite; recentered north onto the cluster of buildings.
- **Hanging Lake removed from the pool entirely.** Initially just recentered (was ~2.8km off —
  resolved a shared Google Maps link, `maps.app.goo.gl`, which unlike the `share.google` short
  links used elsewhere in this feedback round redirects to a URL with the place's actual lat/lon
  embedded in it) and zoomed to 18, tighter than anything else in the pool, to compensate for how
  tiny and tree-covered the lake is. Even corrected, it was still too small and blurry to read as
  a fair round — cut rather than keep chasing a zoom level that might not exist. Pool count is 64,
  not 65, as a result.
- **Four ski resort framings adjusted**, all found during the audit — pure pan/zoom tweaks, no
  coordinate errors: **Vail** shifted south so I-70 sits near the top of frame with the full trail
  network below it instead of cutting it off; **Keystone** recentered and zoomed 13→14 onto the
  trail network, which was small and off to one side; **Winter Park** shifted south to bring the
  southern runs into frame at the same zoom; **Eldora** zoomed 13→14 for a closer view of the
  trail fan.
- **Longs Peak had the same Esri seam** as Wolf Creek/Royal Gorge/Bear Lake/St. Elmo — fixed with
  the same USGS `loc.tiles` override, now the fifth (and probably not last) location using it.
- **Indian Peaks Wilderness and Leadville zoomed out** one step each (12→11 and 14→13) per
  audit feedback wanting more surrounding context in both.
- **Indian Peaks Wilderness recentered again**, this time for framing rather than a fix: pulled
  south so Lake Granby (a large reservoir north of the wilderness) drops out of frame, and
  positioned so Ward sits near the northeast corner and Nederland near the southeast — both real
  towns, coordinates confirmed via Nominatim rather than eyeballing satellite imagery for once,
  since they're small enough to be easy to miss by eye at this zoom.
- **Leadville got a cloudy Esri capture too** — same USGS `loc.tiles` fix as the others. The
  accompanying "maybe 5% more zoom" request exposed a real gap: `loc.zoom` is passed straight to
  Leaflet's `L.map` constructor, and without `zoomSnap` set, Leaflet defaults to snapping zoom to
  whole integers — a fractional value like `13.1` would've silently rounded down to `13`, making
  a small zoom nudge impossible. Added `zoomSnap: 0` to the photo map's options (`buildPhotoMap()`
  in `index.html`) so fractional `zoom` values on any location now take effect exactly as
  written; confirmed via `map.getZoom()` in a standalone test. Only the fixed, non-interactive
  photo map needed this — the interactive guess map is untouched and still snaps to whole zooms,
  which is fine since nothing asks it to do otherwise.

## Location image audit

Built a review page (published as a Claude Artifact, not a Google Doc — see below) showing every
location's in-game satellite photo next to a reference map with the scoring coordinate marked,
grouped by category, so the pool could be sanity-checked by eye. Comments left on that page get
triaged and fixed here the same way any other bug report would be — see the imagery-source and
zoom fixes above found this way so far. This is an ongoing process, not a one-time pass; expect
more of these as review continues.

**Why an Artifact instead of the Google Doc that was asked for:** uploading to Google Drive
through the available tool requires the entire file's bytes to be sent as inline `base64Content`
in the tool call — there's no file-path-based upload path. A single test image (~108KB) cost
roughly 870K tokens to round-trip that way; scaling to 130 images would have cost tens of millions
of tokens, far beyond budget. An Artifact publish takes local file paths directly instead of
inlining content, so it doesn't hit this wall. A short Google Doc with just a link to the Artifact
was still placed in the requested Drive folder as a compromise.

## Versioning and release notes

Started tracking a simple version number (`v1.0`, `v1.1`, `v1.2`, ...) once the game had gone
through a few distinct rounds of changes worth telling a player about. Loosely semver: bump MINOR
(`v1.1` → `v1.2`) for new features or content, bump PATCH (`v1.2` → `v1.2.1`) for a bug fix with
no new content. Reserve a jump to `v2.0` for something that actually feels like a different game
(e.g. a real backend, multiplayer).

Shown in-page as a collapsed `<details class="release-info">` block between the start panel and
the footer (visible on every screen, since it isn't inside any of the hidden screen divs). Shows
**only the current version's notes** — no expandable history tree, by design (kept simple on
purpose). Within that current version, notes are cumulative: a PATCH bump appends a line to the
bottom of the existing list rather than replacing it (e.g. v1.2.1 kept both v1.2's original
bullets and added a third for the bug fix). A MINOR/MAJOR bump is what starts a fresh list.
History so far: v1.0 original game, v1.1 Lee Hill Labs rebrand, v1.2 location pool expansion to 65
spots, v1.2.1 fixed the "Lock in guess" double-submit bug, v1.2.2 the location image audit round
(imagery-source fixes, pin corrections/reframing, Hanging Lake removed — pool now 64), v1.3 added
shareable score cards, v1.3.1 added an explicit desktop download action, and v1.3.2 added new
locations, including a group of airports (pool now 68). v2.0 added Easy multiple-choice and Hard
map modes, mode-specific best scores, and mode-aware results and sharing.

This is a player-facing changelog (what changed), separate from this dev log (why it changed).
When shipping a future user-visible change, bump the version in two places: the `<summary>` text
and the `.release-list` items inside `<details class="release-info">` in `index.html`.

## Sharing results

The final-score screen has a secondary **Share result** action beside the primary **Play again**
action. It generates a purpose-built 1080×1080 PNG with the score, five-round breakdown, game
branding, and canonical URL. This is drawn directly with the browser Canvas API rather than
capturing the DOM, which keeps the output predictable and avoids a screenshot dependency.

An always-visible **Download PNG** action sits alongside Share result. This is necessary because
desktop browsers such as Chrome on macOS can support Web Share image files while the operating
system's resulting share sheet still provides no save-to-disk destination. The explicit action
uses the same pre-rendered score-card blob and records `score_share` with an
`explicit_download` method.

The card is prepared when the final screen appears so the later button click can immediately open
the device's native share sheet while its user activation is still valid. Browsers that support
sharing image files receive the PNG, caption, and URL through the Web Share API. Other browsers
download the PNG and attempt to copy the caption and URL to the clipboard. The app records a
`score_share` analytics event with the method and outcome, but cannot and does not identify the
chosen share destination.

The clickable/copied share URL is tagged with `utm_source=player_share`,
`utm_medium=referral`, and `utm_campaign=score_share`. Recipient sessions therefore appear in
GA4 Traffic acquisition as `player_share / referral` under the `score_share` campaign, even when
the destination app does not preserve referrer information. The clean, untagged domain remains
printed on the score-card image for readability.

## Bug: double-submitting a guess

`submitGuess()` originally only guarded on `guessLatLon` being set, which is never cleared after
a successful submit (only reset at the top of the next `startRound()`). The "Lock in guess"
button/row was also never hidden or re-disabled once the result was shown — it just sat there
next to "Next round" / "See final score". Clicking it again re-ran the full scoring logic: added
the round's points to `score` a second time and pushed a duplicate entry into `results`, most
visibly reachable on the last round since that's where the exploit button sits right next to
the "See final score" button players are about to click anyway.

Fixed by hiding the whole `#guess-actions` row (map hint + Lock in guess button) as soon as a
result is shown, showing it again in `startRound()`, and adding a second guard directly in
`submitGuess()` (checks `#result-block` is still hidden) so the scoring logic itself can't run
twice even if something else re-triggers the click handler.

## Deployment

- Static single HTML file, no backend, no build step.
- Hosted on GitHub Pages, repo `jselliott85/colorado-compass`.
- Custom domain `cocompass.leehilllabs.com` via a `CNAME` file in the repo (GitHub Pages reads
  this to know which domain to serve) plus a CNAME DNS record at GoDaddy pointing
  `cocompass` → `jselliott85.github.io`.
- Deliberately kept out of search engines via `<meta name="robots" content="noindex, nofollow">`
  and no links from the main site nav — it's unlisted, not access-restricted. Anyone with the
  exact URL can open it; there's no password gate. Worth adding one later if real restriction
  (not just obscurity) is ever wanted.

## Analytics

Google Analytics 4 is installed directly in `index.html` using the CO Compass web stream
(`G-NMP21XF9R0`). In addition to GA4's standard page view, the game sends `game_start`,
`round_start`, `guess_submitted`, `game_complete`, `play_again`, and `score_share` events. Event
parameters
cover game version, round number, scores, distances, elapsed time, and replay status. Exact
target and guessed coordinates are deliberately excluded.

The Google tag loads immediately, with Google Signals and ad-personalization signals explicitly
disabled. A footer disclosure explains what is collected and provides a persistent browser-level
toggle. Disabling analytics prevents future events, removes accessible GA cookies, and preserves
the choice in `localStorage` so GA remains disabled on later visits. The analytics data is not
used for advertising or remarketing.

## Branding: aligned with leehilllabs.com

The original palette (rust/spruce/gold on a tan background, Barlow Condensed + Roboto Slab
headers) was a standalone "Colorado desert" look with no tie to the parent company. Restyled to
share a visual language with leehilllabs.com, since this game is Lee Hill Labs-branded:

- Swapped the font stack to **Inter** everywhere (was Barlow/Barlow Condensed/Roboto Slab),
  matching the wordmark and body font LHL's marketing site uses.
- Replaced the primary action color (buttons, score highlights) with LHL's brand teal `#295C52`
  (hover `#214D45`), pulled directly from leehilllabs.com's compiled CSS. `--rust` stays as a
  secondary/map-pin color — still gives the guess pin and true-location pin visible contrast
  against the new teal.
- Backgrounds/borders/text colors retuned to LHL's warm-cream-and-near-black palette
  (`#FAF8F5` bg, `#1C241F` text, `#E5E0D9` borders) instead of the earlier tan/brown set.
- Card and button corner radii bumped from 4–6px to 8–12px, and an uppercase-eyebrow-label
  style (`.eyebrow`, `.hud`) was added, both matching patterns from LHL's page CSS
  (`page-module__E0kJGG__*` classes, fetched from the live site's `_next/static` chunks since
  there's no public design system doc).
- Dark mode variants were hand-derived (LHL's own site has no dark mode to copy) by keeping the
  same hue relationships — lighter teal (`#5FA697`) for contrast on a dark background.

## Footer: Lee Hill Labs attribution

Added a full-width footer band (cream `--surface-2`, border-top, matching LHL's own footer
styling) below the existing Esri attribution line, with a link to leehilllabs.com and the
company logo.

- Logo source: a flattened PNG (`LHL v5.png`) from the user's Google Drive, opaque white
  background, 2208×1948. Processed locally (Pillow) to key out the white background to
  transparency, cropped to the artwork's bounding box, and re-exported at 158×140 as
  `assets/lhl-logo.png` (~9KB) — small enough for a footer credit, retina-sharp at the ~26px
  display height used in CSS.
- Because the logo is solid black on transparent, it disappears against the dark-mode
  background; a `filter:invert(1)` is applied to `.lhl-logo` under the same
  `prefers-color-scheme: dark` query the rest of the theme uses, rather than shipping a second
  logo asset.

## Dark mode aligned to the LHL design system

LHL now has a canonical, approved dark theme (Lee Hill Labs design system), so Compass's
hand-derived dark palette above was replaced with its values: warm charcoal neutrals instead of
the green-tinted near-black (`--bg #1A1917`, `--surface #221F1A`, `--surface-2 #2A2620`,
`--border #302E2A`), `--text #F0EDE7` / `--text-muted #A6A29B` / `--eyebrow #8C9A94`, and a
desaturated teal (`--spruce #5C9C8C`, hover `#72AC9D`). Light mode was already an exact match.
`--rust` and `--gold` are Compass-only accents and stay as they were; both still clear 4.5:1
against the new backgrounds.

- `assets/og-image.png` re-rendered (headless Chrome, 1200×630) on the new dark palette. Its
  second tagline line now matches the site's ("View a satellite photo and figure out where it
  was taken.") since "Place your pin" no longer describes Easy mode.
- Button text now uses a new `--on-spruce` token: white in light mode, `#1A1917` in dark mode.
  White on the dark-mode teal was only 3.2:1 (2.6:1 on hover), under WCAG AA's 4.5:1 for 16px
  text; the dark text gives 5.5:1 (6.8:1 on hover). The rule was also added to the LHL design
  system as `text-on-brand`.

## Imagery sources and phone framing (v2.1)

**Why:** the photo frame was a fixed 280px tall at full page width, so a phone (~350px wide) saw
a near-square crop of the wide 860x280 desktop view: same zoom, roughly 40% of the ground width.
Wide or off-center features got cut off, and scenes looked different from what was approved on
desktop. Separately, live Esri imagery can change under us (new captures, snow, cloud, seams),
and every Esri problem found so far had been fixed by switching that scene to USGS.

- **Source audit:** all 68 scenes were rendered from both sources at desktop and proposed phone
  framing and reviewed side by side. Result: 66 USGS, 2 Esri (Georgetown, Great Sand Dunes).
  USGS imagery is mostly NAIP (summer, low cloud cover), so the look is consistent statewide.
- **Data shape:** `IMAGERY`, next to `buildPhotoMap()`, defines the two sources. USGS is
  the default; a location opts into Esri with `imagery:'esri'`. The old per-location `tiles`
  overrides are gone.
- **Esri is pinned** to World Imagery Wayback release `26334` (2026-08-05), whose tiles were
  verified byte-identical to live World Imagery for both Esri scenes at the time of the audit.
  To move to newer imagery, pick a release from
  `https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json`, review the
  Esri scenes, and change the release number in the URL.
- **USGS can't be pinned** and is refreshed when new NAIP flights arrive (roughly every 2-3 years
  for Colorado). Re-audit after a refresh.
- **Fallback:** after 3 USGS tile errors on a scene, the photo swaps to the pinned Esri layer and
  sends an `imagery_fallback` analytics event with the location name.
- **High-DPI:** `detectRetina` loads one zoom level deeper on retina screens. USGS only serves
  tiles through zoom 16 (17+ is 404), so `maxNativeZoom` is lowered by one on retina screens to
  keep requests inside what the service has.
- **Phone framing:** at 640px and below the frame is 4:3 instead of 280px tall. Each location's
  `zoom` is defined for an 860px-wide desktop frame; `photoZoom()` adds `log2(frameWidth/860)`,
  so any frame width shows the same ground width as approved on desktop, with extra context above
  and below on phones. A location may set `phoneZoom` (defined for a 350px-wide frame) when the
  phone view should differ from that; Boulder Reservoir and Keystone do, because their desktop
  views were zoomed out after the phone view was approved. The scene re-fits on resize/rotation.
- **Re-framed in the same pass:** Gross Reservoir, Grand Lake, Turquoise Lake, and Eldora were
  re-centered on the feature (which also moves their scoring point onto it); Boulder Reservoir
  and Keystone desktop views were zoomed out.

## Hard-mode bullseye (v2.3)

Any guess within 3 miles of the scoring point (`BULLSEYE_MILES`) earns the full 1,000 and is
labeled "Bullseye!" in the round result, the final breakdown, and the share card. Past that, the
exponential falloff starts at the bullseye edge instead of at 0 miles:
`1000 * exp(-(d - 3) / 55)`. Shifting the curve avoids a cliff (the unshifted curve would drop
from 1,000 at 3.0 mi to 945 at 3.1 mi), at the cost of every non-bullseye guess scoring ~5%
more than before (10 mi: 834 -> 880; 50 mi: 403 -> 425). Hard-mode personal bests from before
v2.3 are therefore slightly easier to beat; they were left as-is.

The bullseye test uses the distance rounded to 0.1 mi, the same value shown to the player, so a
guess shown as "3.0 miles off" is always a bullseye. `guess_submitted` analytics events carry a
`bullseye` flag (1/0).

## Possible next steps (not yet done)

- Grow the location pool further if repeats start feeling too frequent.
- Add a password/access gate if genuine privacy is wanted instead of just an unlisted URL.
- Consider tightening scoring in the tightly-clustered regions mentioned above.

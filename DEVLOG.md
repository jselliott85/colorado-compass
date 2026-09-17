# Colorado Compass — Dev Log

A GeoGuessr-style geography game for Colorado, built collaboratively with Claude. This file
tracks the key decisions and why they were made, so future changes (by a person or an AI) don't
have to rediscover the reasoning from scratch.

## Core concept

Each round shows a real aerial/satellite view of a Colorado location. The player drops a pin on
a reference map of the state; distance from the true location determines the score (up to 1,000
points/round, exponential decay, 5 rounds/game).

## Why it's a downloadable file, not a claude.ai artifact

The first version was published as a claude.ai artifact using hand-illustrated SVG scenes
instead of real photos. Published artifact pages run under a content-security policy that blocks
remote images and most network requests — there's no way for a hosted claude.ai page to pull
live map tiles or satellite imagery.

Real aerial photography only became possible by switching to a plain downloadable HTML file,
which runs in the user's own browser with no such restriction and can freely load live tiles.

## Map providers

- **Photo panel (the "mystery" image):** Esri World Imagery (satellite), loaded via Leaflet.
  Free, no API key, and permissive enough to embed directly. Locked/non-interactive per round
  (no drag, zoom, or scroll) so it functions like a fixed photo rather than an explorable map.
- **Reference/guess map:** originally tried OpenStreetMap's standard tile server
  (`tile.openstreetmap.org`). It actively blocked requests (403 — their usage policy explicitly
  disallows this kind of embedded-app/local-file use on their volunteer-run infrastructure).
  Switched to **Esri World Topo Map** instead — same provider as the imagery layer (so no
  separate blocking risk), and its shaded relief + roads + labels is actually a closer match to
  the "reference map" look than plain OSM was.

## Location pool

Random lat/lon anywhere in Colorado was considered and rejected — much of the eastern plains is
visually indistinguishable brown/green farmland from above, which makes for a bad round. Instead
the game draws 5 locations per game from a curated pool, randomly ordered. The pool has grown
since the original 40; homepage copy deliberately says "famous spots" rather than citing a count,
so it doesn't go stale as the pool changes.

Current pool (65 locations):

- 13 landmarks/parks
- 9 bodies of water
- 16 ski resorts
- 12 mountain ranges/peaks
- 10 mountain towns
- 5 cities (new category — Fort Collins, Grand Junction, Pueblo, Greeley, Boulder)

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
- **Royal Gorge's cloud cover, Bear Lake's imagery seam:** both found during the image-audit pass
  (see below). Royal Gorge had a persistent cloud bank obscuring the canyon; Bear Lake had the
  same kind of Esri mosaic seam as Wolf Creek (a hard vertical line between two different capture
  dates). Both fixed the same way: a `loc.tiles` override to USGS `USGSImageryOnly`, which is
  clean at both locations. Wolf Creek, Royal Gorge, and Bear Lake are currently the only three
  locations using a non-default imagery source; everything else still uses Esri.
- **Mesa Verde zoomed out:** was zoom 14 (too tight on one canyon), dropped to zoom 13 to show
  more of the surrounding mesa fingers — also found during the image-audit pass.

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
spots, v1.2.1 fixed the "Lock in guess" double-submit bug.

This is a player-facing changelog (what changed), separate from this dev log (why it changed).
When shipping a future user-visible change, bump the version in two places: the `<summary>` text
and the `.release-list` items inside `<details class="release-info">` in `index.html`.

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
`round_start`, `guess_submitted`, `game_complete`, and `play_again` events. Event parameters
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

## Possible next steps (not yet done)

- Grow the location pool further if repeats start feeling too frequent.
- Add a password/access gate if genuine privacy is wanted instead of just an unlisted URL.
- Consider tightening scoring in the tightly-clustered regions mentioned above.

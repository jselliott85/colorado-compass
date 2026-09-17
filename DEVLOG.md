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
the game draws 5 locations per game from a **curated pool of 40**, randomly ordered:

- 10 original landmarks/parks (Maroon Bells, Garden of the Gods, Great Sand Dunes, Royal Gorge,
  Pikes Peak, Mesa Verde, Red Rocks, downtown Denver, Bear Lake/RMNP, Colorado National Monument)
- 7 bodies of water (Dillon, Gross, Barker, Boulder reservoirs, Grand Lake, Blue Mesa Reservoir,
  Turquoise Lake)
- 7 ski resorts (Vail, Aspen Snowmass, Breckenridge, Steamboat, Winter Park, Copper Mountain,
  Keystone)
- 8 mountain ranges/peaks (Longs Peak, Collegiate Peaks, Mount Elbert, Mount Evans, San Juan
  Mountains, Gore Range, Sawatch Range, Flat Tops Wilderness)
- 8 small mountain towns (Crested Butte, Telluride, Silverton, Ouray, Leadville, Salida, Buena
  Vista, Georgetown)

Known limitation: several of these cluster geographically (Summit County ski towns; the San
Juans), so a wrong guess in the right general area can still score well. Not fixed as of this
writing — worth watching if it makes the game feel too forgiving.

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

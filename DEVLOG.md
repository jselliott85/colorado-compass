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

## Possible next steps (not yet done)

- Grow the location pool further if repeats start feeling too frequent.
- Add a password/access gate if genuine privacy is wanted instead of just an unlisted URL.
- Consider tightening scoring in the tightly-clustered regions mentioned above.

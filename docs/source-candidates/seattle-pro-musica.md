---
name: "Seattle Pro Musica"
status: investigating
firstSeen: 2026-05-14
lastChecked: 2026-05-14
---
**Seattle Pro Musica** — `https://www.seattlepromusica.org/calendar` — Squarespace — Tags: Music, Arts

Seattle choral ensemble presenting classical and contemporary choral concerts at venues around the Puget Sound region. Frequently performs at Seattle First Baptist Church (1000 Harvard Ave E, Capitol Hill).

Investigated 2026-05-14:
- Site is built on **Squarespace**; `/calendar?format=json` endpoint confirmed working (returns valid JSON)
- **Issue**: The `upcoming` array in the Squarespace response is empty `[]`; all events (including future ones) are in the `data.past` array — likely a misconfiguration of their Squarespace calendar collection type
- The built-in `SquarespaceRipper` only reads `data.upcoming` and `data.items`; it does not read `data.past`, so it would return 0 events
- **4 upcoming events** (after 2026-05-14) confirmed in the `past` array:
  - "The Traveler's Song" — June 13 & 14, 2026 (Seattle First Baptist)
  - "Mozart Requiem and Golijov Oceana" — June 27, 2026 (Seattle First Baptist); July 4, 2026 (Federal Way)
- To implement: either (a) modify `SquarespaceRipper` to also read `data.past` when `data.upcoming` is empty/missing, or (b) write a custom ripper that explicitly reads both arrays
- Low event volume (seasonal programming, ~6-8 concerts/year)
- `geo: null` appropriate (touring ensemble, no fixed venue)
- Tags: Music, Arts

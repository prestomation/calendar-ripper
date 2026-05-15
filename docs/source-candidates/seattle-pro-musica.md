---
name: "Seattle Pro Musica"
status: added
firstSeen: 2026-05-14
lastChecked: 2026-05-15
pr: claude/elegant-mayer-b5gfv
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
- Low event volume (seasonal programming, ~6-8 concerts/year)
- `geo: null` appropriate (touring ensemble, no fixed venue)
- Tags: Music, Arts

Implementation (2026-05-15): Modified `SquarespaceRipper.fetchUpcomingEvents()` to fall back to
`data.past` filtered to future dates when both `data.upcoming` and `data.items` are empty. Added
`sources/seattle_pro_musica/ripper.yaml`.

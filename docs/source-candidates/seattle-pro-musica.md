---
name: "Seattle Pro Musica"
status: investigating
firstSeen: 2026-05-14
lastChecked: 2026-05-16
---
**Seattle Pro Musica** — `https://www.seattlepromusica.org/calendar` — Squarespace — Tags: Music, Arts

Seattle choral ensemble presenting classical and contemporary choral concerts at venues around the Puget Sound region. Frequently performs at Seattle First Baptist Church (1000 Harvard Ave E, Capitol Hill).

Investigated 2026-05-14:
- Site is built on **Squarespace**; `/calendar?format=json` endpoint confirmed working (returns valid JSON)
- `data.upcoming` array is empty `[]`; all events are in `data.past`
- **Initial investigation incorrectly identified future events** by reading event description text rather than verifying `startDate` epoch values

Verified 2026-05-16:
- All 20 events in `data.past` have `startDate` values before today (May 16, 2026)
- "The Traveler's Song": `startDate: 1772319600224` → ~March 1, 2026 (past)
- "Mozart Requiem and Golijov Oceana": `startDate: 1777775400005` → ~May 2, 2026 (past)
- **No upcoming events are currently on their site** — ensemble is between seasons
- The `data.past` fallback in `SquarespaceRipper` was implemented (PR #318) and will pick up events when they post their next season
- Re-evaluate when Seattle Pro Musica posts 2026–27 season events (typically August–September)

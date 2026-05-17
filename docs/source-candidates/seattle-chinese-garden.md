---
name: "Seattle Chinese Garden"
status: added
firstSeen: 2026-05-17
lastChecked: 2026-05-17
pr: TBD
---
**Seattle Chinese Garden** — `https://www.seattlechinesegarden.org/events` — 6000 Delridge Way SW, Seattle, WA 98106 (Delridge/West Seattle) — Squarespace site with confirmed `?format=json` endpoint returning 2 future events — Tags: Arts, Community, West Seattle. OSM: way/31706566.

Investigated 2026-05-17:
- Squarespace site confirmed (`<!-- This is Squarespace. -->` comment, `sqs-` class prefix)
- `?format=json` returns `type: events`, `itemCount: 54` total
- `data.upcoming` has 2 confirmed future events: "Seattle Chinese Garden Annual Auction & Banquet" (startDate > now) and "Bamboo Circle Celebration 2026"
- Location data in Squarespace records is empty (default NYC placeholder) — ripper geo coordinates provide the correct location
- Uses the built-in `squarespace` type; no custom code needed

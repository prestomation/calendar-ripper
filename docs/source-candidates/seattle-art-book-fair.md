---
name: "Seattle Art Book Fair"
status: added
pr: 267
firstSeen: 2026-05-07
lastChecked: 2026-05-07
tags: [Books, Arts, "Central District"]
---
Cargo.site, custom HTML ripper at `sources/seattle_art_book_fair/`.
Annual free festival at Washington Hall (153 14th Ave, Central District)
celebrating independent publishing, book design, and artist books. 85+
exhibitors plus talks, activities, art installations.

The ripper parses the homepage for the fair date range (one event per
day, 11am–5pm) and the Prepress Launch Party (the evening before).
`expectEmpty: true` since the source is intentionally dormant outside
the annual event window.

---
name: "Theatre Off Jackson"
status: added
firstSeen: 2026-05-08
lastChecked: 2026-05-10
pr: 288
---
**Theatre Off Jackson** — `https://theatreoffjackson.org/` — 409 7th Ave S — Tags: Theatre, International District

Uses the VEM (Venture Event Manager) WordPress plugin. Tribe Events ICS export disabled. Implemented as a two-phase HTML scraper: homepage → individual show page URLs via `.vem-more-details a` links → parse `.vem-single-event-date-start` elements (format: "Friday, May 29, 2026, 7:30PM").

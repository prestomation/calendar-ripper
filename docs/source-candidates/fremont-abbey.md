---
name: "Fremont Abbey (Abbey Arts Presents)"
status: investigating
firstSeen: 2026-05-14
lastChecked: 2026-05-14
---
**Abbey Arts Presents (Fremont Abbey Arts Center)** — `https://events.humanitix.com/host/abbey-arts-presents` — Humanitix ticketing platform — Tags: Music, Arts, Community, Fremont

Independent nonprofit arts presenter (est. 2005) running shows at multiple Seattle venues: Fremont Abbey Arts Center (4272 Fremont Ave N), Ballard Homestead, St. Mark's Cathedral (Capitol Hill), Washington Hall (Central District), and others.

Investigated 2026-05-14:
- Primary ticketing moved to **Humanitix** (`events.humanitix.com/host/abbey-arts-presents`)
- Eventbrite organizer ID `11933347765` still exists but shows only 1 upcoming event (newsletter signup) — effectively inactive
- Humanitix page lists **12+ upcoming events** through June 2026: The Moth StorySLAM, Anjimile, Laraaji, Shane Torres, Sound Healing Symphony, etc.
- Humanitix has a public API (api.humanitix.com/v1) but requires per-organizer API keys — no unauthenticated public feed
- No ICS export from Humanitix for organizer pages
- The org's WordPress site (`fremontabbey.org/events/`) links to Humanitix; the `?ical=1` endpoint returns HTML (Tribe Events ICS disabled)
- HTML structure on Humanitix events page: event cards are `<a href="...">` with child `<div>` elements for date, title, and venue — no CSS class names or data attributes
- A custom HTMLRipper scraping `events.humanitix.com/host/abbey-arts-presents` is feasible

Next: implement custom HTMLRipper for the Humanitix events page. No proxy needed (page returns 200 from sandbox).

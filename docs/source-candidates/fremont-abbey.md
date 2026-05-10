---
name: "Fremont Abbey Arts Center"
status: candidate
firstSeen: 2026-05-10
lastChecked: 2026-05-10
---
**Fremont Abbey Arts Center (Abbey Arts Presents)** — `https://www.fremontabbey.org/events/` — 4272 Fremont Ave N, Seattle WA 98103, Fremont neighborhood. Nonprofit arts org (501c3) since 2005. Hosts live music, The Moth StorySLAM, songwriter rounds, improv (Bandit Theatre), workshops, and community events. Tickets sold via both Eventbrite and Humanitix.

Platform: **WordPress** (confirmed via `Link: <https://www.fremontabbey.org/wp-json/>` response header). Tribe Events ICS endpoint (`?post_type=tribe_events&ical=1`) returns HTML — ICS disabled. No Tribe Events REST API (`/wp-json/tribe/events/v1/events` → 404). Custom events listing — would need HTML scraper or Humanitix API. Tags: Music, Arts, Fremont — 🔴 Low confidence (custom scraper needed).

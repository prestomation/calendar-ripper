---
name: "Seattle Makers"
status: candidate
firstSeen: 2026-05-06
lastChecked: 2026-05-06
tags: [Workshops, Community]
---
`https://seattlemakers.org/events/` — Seattle makerspace running the
**EventPrime** WP plugin (`pp_event` post type, `pe-ajax-events` class).

Live probe 2026-05-06:
- `/events/?ical=1` returns `text/html` (ICS export disabled)
- `/events/feed/` returns valid RSS but only `pubDate` (post creation),
  no event start/end dates → unusable as primary feed
- `/wp-json/` is 401-walled site-wide (REST hardened)
- Single event pages have Yoast `WebPage` JSON-LD only, no `Event`
  schema
- List page renders via AJAX (`pe-ajax-events` container)

Custom scraper needs to either replicate the admin-ajax POST or fetch
each event slug page and extract rendered date HTML.

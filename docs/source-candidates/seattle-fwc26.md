---
name: Seattle FIFA World Cup 26
status: added
platform: Custom HTML (Webflow CMS)
url: https://www.seattlefwc26.org/event-calendar
tags: [Sports]
firstSeen: 2026-05-08
lastChecked: 2026-05-08
---

Official Seattle host city site for the 2026 FIFA Men's World Cup. Aggregates
community events leading up to and during the tournament — watch parties,
fan zones, soccer-adjacent cultural programming, museum exhibits, and
matchday gatherings across the broader Puget Sound (Seattle plus Renton,
Federal Way, Bellingham, Tacoma, etc.).

Webflow CMS site, no public ICS/JSON feed. Custom ripper paginates the
`/event-calendar-list` view, harvests `/full-event-calendar/<slug>` URLs,
then fetches each detail page for date/time/location/description. Year is
inferred from the day-of-week shown on the list view.

~39 events on initial run (2026-05-08), all 2026.

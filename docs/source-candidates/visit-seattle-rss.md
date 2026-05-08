---
name: "Visit Seattle (RSS)"
status: candidate
firstSeen: 2026-05-07
lastChecked: 2026-05-07
tags: [Community, Events]
---
`https://visitseattle.org/events/feed/`. Working RSS 2.0 feed but only
10 curated/featured events (Christmas Market, NCAA tournaments, Bite of
Seattle, Festál, etc.). The Tribe Events `?ical=1` parameter is
silently ignored (returns the HTML page, not ICS).

Low volume but high editorial quality — would surface major Seattle
events that don't have their own dedicated source. Need a small RSS
adapter (we don't have one yet) or extend `external` config to support
RSS feeds. New 2026-05-07.

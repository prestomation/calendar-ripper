---
name: "The Mountaineers"
status: notviable
firstSeen: 2026-05-08
lastChecked: 2026-05-17
---
**The Mountaineers** — `https://www.mountaineers.org/locations-lodges/seattle-program-center/events` — Tags: Outdoors

Investigated 2026-05-17:
- Plone-based site (x-powered-by: Zope) with a working ICS export at `ical-view`
- ICS feed URL: `https://www.mountaineers.org/locations-lodges/seattle-program-center/events/seattle-program-center-all-events/ical-view`
- Feed returns 795 events, but all are internal club activities: skills practices, committee meetings, climbing clinics, courses (Wilderness First Responder, etc.)
- No LOCATION data in any events (empty LOCATION field)
- Many events are CANCELED or internal branch meetings
- Categories are "Programs & Meetings", "Seattle Branch", "Rock Climbing" — not public-facing events
- Not suitable for 206.events: not public-attending events and no location data

---
name: "Cornish College of the Arts"
status: notviable
platform: Seattle University Localist
url: https://www.cornish.edu/cornish-college-event-calendar/
tags: [Arts, Music, Theatre]
firstSeen: 2026-05-08
lastChecked: 2026-05-13
---

Cornish's event calendar uses a Localist widget hosted on Seattle University's
instance (`https://events.seattleu.edu`). The widget URL uses
`groups=cornish-college-of-the-arts` as a filter, but the ICS export at
`https://events.seattleu.edu/calendar/cornish-college-of-the-arts.ics` returns 446
events that are a mix of Cornish and SU events (baseball games, registration
announcements, etc.). The `groups` filter in the JSON API doesn't filter properly.
Not viable as a Cornish-only source without additional filtering logic.

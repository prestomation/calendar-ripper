---
name: "Tim's Tavern"
status: investigating
platform: DICE
url: https://timslivemusic.com/upcoming-shows
tags: [Music, "White Center"]
firstSeen: 2026-05-08
lastChecked: 2026-05-13
---

Live music venue at 9655 16th Ave SW, Seattle, WA 98106 (White Center). Confirmed
on DICE at `https://dice.fm/venue/tims-tavern-avvl2` with venueName "Tim's Tavern".
Currently a sub-calendar in `seattle_showlists`.

Implementation attempted 2026-05-13: `type: dice`, `venueName: "Tim's Tavern"`, address
`9655 16th Ave SW, Seattle, WA 98106`. The DICE API key is configured in CI.
DICE API (`events-api.dice.fm/v1/events?filter[venues][]=Tim's+Tavern`) returns
`{"data":[]}` — venue has no upcoming events on DICE currently. Build policy
requires new sources to produce ≥1 event before merging. Reverted until events appear.

When Tim's Tavern posts events on DICE, implement with:
- Mark `skip: true` in showlists `VENUE_CONFIG`
- Remove the sub-calendar entry from `sources/seattle_showlists/ripper.yaml`
- Add `allowed-removals/seattle-showlists-tims-tavern.ics`
- Update `sources/seattle_showlists/ripper.test.ts` (move from includedVenues to skippedVenues)

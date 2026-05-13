---
name: "Tim's Tavern"
status: candidate
platform: DICE
url: https://timslivemusic.com/upcoming-shows
tags: [Music, "White Center"]
firstSeen: 2026-05-08
lastChecked: 2026-05-13
---

Live music venue at 9655 16th Ave SW, Seattle, WA 98106 (White Center). Confirmed
on DICE at `https://dice.fm/venue/tims-tavern-avvl2` with venueName "Tim's Tavern".
Currently a sub-calendar in `seattle_showlists`.

Implementation: `type: dice`, `venueName: "Tim's Tavern"`, address
`9655 16th Ave SW, Seattle, WA 98106`. The DICE API key is configured in CI.
When adding a dedicated source, mark `skip: true` in showlists `VENUE_CONFIG`
and remove the sub-calendar entry from `sources/seattle_showlists/ripper.yaml`.

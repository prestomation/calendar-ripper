---
name: "Tim's Tavern"
status: notviable
platform: DICE / Showlists
url: https://timslivemusic.com/upcoming-shows
tags: [Music, "White Center"]
firstSeen: 2026-05-08
lastChecked: 2026-05-14
---

Live music venue at 9655 16th Ave SW, Seattle, WA 98106 (White Center). Currently
a sub-calendar in `seattle_showlists` which provides working coverage.

The venue has a DICE page (`dice.fm/venue/tims-tavern-avvl2`) but the DICE API
(`filter[venues][]=Tim%27s+Tavern`) returns 0 upcoming events — they use DICE
only occasionally, not as their primary ticketing platform. Attempted a dedicated
DICE ripper in PR #306 (closed without merging) which confirmed 0 events in CI.

**Verdict**: Keep in `seattle_showlists`. Do not attempt a dedicated DICE ripper
unless the venue starts consistently listing shows on DICE.

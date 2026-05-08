---
name: Ballard FC
status: investigating
platform: Unknown (Squarespace? site uses turbot-amphibian-saad.squarespace.com staging URL)
url: https://www.goballardfc.com/schedule/
tags: [Sports, Ballard]
firstSeen: 2026-05-08
lastChecked: 2026-05-08
---

USL League Two amateur men's soccer team based in Seattle's Ballard
neighborhood. Plays home matches at Memorial Stadium (and historically
at Interbay Stadium). 2026 season schedule is published on the team
site but no obvious ICS subscription URL is exposed in the rendered
HTML.

Investigation needed:
- Site appears to be Squarespace (sister site at
  `turbot-amphibian-saad.squarespace.com`). Check `?format=json` on the
  schedule page or the events collection.
- FotMob does not currently publish an ICS feed for this team
  (`https://fixtur.es/en/team/seattle-sounders-fc.ics`-style URLs return
  404 for Ballard FC).
- Tickets sold via `tickets.upthebridges.shop` — possibly a different
  platform with its own feed.

Worth revisiting once the platform is identified. Sister club Salmon
Bay FC (USL W League women's side) shares the same site and would
likely be addable in the same source.

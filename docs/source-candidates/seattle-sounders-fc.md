---
name: Seattle Sounders FC
status: added
platform: ICS (FotMob)
url: https://www.soundersfc.com/schedule/matches
tags: [Sports]
firstSeen: 2026-05-08
lastChecked: 2026-05-08
---

Major League Soccer team — full match schedule (home games at Lumen Field
plus away fixtures across MLS and any cup/friendly competitions). The
official Sounders site offers a "Sync to Calendar" button that points at
FotMob's public ICS endpoint:

```
https://pub.fotmob.com/prod/pub/api/v2/calendar/team/130394.ics
```

40 VEVENTs at time of check (2026-05-08), covering preseason friendlies
plus the 2026 MLS season. Each event has a clean SUMMARY ("Seattle
Sounders FC - Colorado Rapids"), proper LOCATION for both home and away
stadiums, and a stable UID. `geo: null` because most matches are away.

Lumen Field (Ticketmaster) already covers home games as a venue feed,
but the Sounders ICS adds away matches and gives soccer fans a single
team-focused subscription.

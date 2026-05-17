---
name: "Seattle City of Literature"
status: candidate
platform: Tockify
url: https://www.seattlecityoflit.org/community-calendar
tags: [Books, Arts, Community]
firstSeen: 2026-05-16
lastChecked: 2026-05-16
---
Seattle City of Literature maintains a community calendar of literary events
at `seattlecityoflit.org/community-calendar`, powered by **Tockify**. Events
include author readings, workshops, book launches, and literary festivals across
Seattle. The site has a "Subscribe" link pointing at Tockify. There is no built-in
Tockify ripper type yet — would require investigating the Tockify API
(`tockify.com/api/feeds/ics/<calendar-id>` returns 404 for this calendar).

Tockify calendars do provide ICS export via their embed API. The calendar
identifier to try is `seattlecityoflit`. If the ICS endpoint resolves, this
could be a simple external ICS addition. Otherwise, a custom JSON ripper against
`tockify.com/api/feeds/rss/seattlecityoflit` (RSS) or the pinboard API may work.

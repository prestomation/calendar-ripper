---
name: "Jazz Alley"
status: proxy
platform: Custom JSP
url: https://www.jazzalley.com/www-home/calendar.jsp
tags: [Music, Belltown]
firstSeen: 2026-05-08
lastChecked: 2026-05-13
---

Established Seattle jazz venue at 2033 6th Ave, Belltown. Custom JSP calendar at
`https://www.jazzalley.com/www-home/calendar.jsp`. Returns HTTP 503 on all paths
from the sandbox (and from CI runner IPs). Site is clearly live — needs
`proxy: outofband` to fetch. Cannot determine data format without a live fetch.
Flag for outofband investigation.

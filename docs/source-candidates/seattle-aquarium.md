---
name: "Seattle Aquarium"
status: investigating
platform: Speak/SiteWrench
url: https://www.seattleaquarium.org/events/
tags: [Museums, Community]
firstSeen: 2026-05-08
lastChecked: 2026-05-13
---

Seattle Aquarium events page uses the Speak/SiteWrench WordPress calendar plugin.
API config found in page HTML:
- `apiUrl`: `https://api.sitewrench.com`
- `apiToken`: `d2ff77cfcd9e3989152364b4b1cc23436a4a55f7`
- `siteId`: 2920, `pagePartId`: 427114

WP REST API confirms `swwpc_calendar` custom post type but returns 0 posts —
events are fetched client-side from SiteWrench API. The JS SDK uses `fetch('/api/')`
(relative URL). Need to identify the correct API endpoint path; `api.sitewrench.com`
returns 404 for all attempted paths. Consider scraping the rendered HTML via proxy
or finding the undocumented SiteWrench API endpoint. Medium-priority investigation.

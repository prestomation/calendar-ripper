---
name: "Seattle Uncorked"
status: blocked
firstSeen: 2026-05-08
lastChecked: 2026-05-17
---
**Seattle Uncorked** — `https://seattleuncorked.com/events/` — WordPress, mostly Seattle-focused (some Eastside events) — Tags: Beer, Community

Investigated 2026-05-17:
- Returns HTTP 202 with `sg-captcha: challenge` header — SiteGround bot protection on all paths
- Same captcha challenge applies across all URL patterns
- Cannot fetch event data from sandbox or CI runner IPs
- Could potentially be fetched via outofband runner; flag for future investigation

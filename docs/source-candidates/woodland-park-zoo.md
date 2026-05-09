---
name: "Woodland Park Zoo"
status: proxy
firstSeen: 2026-05-08
lastChecked: 2026-05-09
---
**Woodland Park Zoo** — `https://zoo.org/events/` — Tribe Events ICS (~30 events: ZooTunes concerts, animal encounters, dining) — Tags: Community, Family, Music.

Probe 2026-05-09: `?post_type=tribe_events&ical=1` returns TLS handshake error (TLSV1_ALERT_PROTOCOL_VERSION) from sandbox over HTTPS; HTTP returns 301 redirect to HTTPS. Site is clearly live. Likely sandbox-only TLS version incompatibility — zoo.org may require TLS 1.2+ but sandbox's curl uses an older stack. Recommend `proxy: true` in ripper and implementing as a Tribe Events ICS external feed (or with `expectEmpty` until outofband confirms count).

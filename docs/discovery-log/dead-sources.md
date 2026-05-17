# Dead Source Reference

Static reference tables for sources that are broken, disabled, or confirmed gone.
Per-candidate status files under `docs/source-candidates/` are the authoritative
record; this file is a quick-lookup reference for things that don't have candidate
files (old entries predating the per-file split).

## Zero-Event Calendars (first flagged 2026-04-22)

| Name | Issue | Recommendation |
|------|-------|----------------|
| `spl-university` | SPL University Branch **closed for renovations until late 2026** (confirmed on spl.org) | Add `expectEmpty: true` |
| `external-langston` | ICS feed (`?post_type=tribe_events&ical=1`) returns HTML, not ICS. REST API also disabled. Site has events but no machine-readable feed | Flag — needs ripper rewrite or switch to Eventbrite |
| `belltown-community-council-all-events` | Custom WordPress.com API ripper. Site has posts but ripper returns 0 events. Possibly CI environment issue | Monitor — may be intermittent |
| `benaroya-hall-benaroya-nordstrom` | Ticketmaster venue `KovZpZAaIAkA` returns 0 events. Nordstrom Recital Hall has events on ticketmaster.com. Possible API key or venue ID issue | Investigate Ticketmaster API key |
| `jcccw-all-events` | Squarespace `itemCount: 30` but `0` upcoming. Last events are from 2022. May be abandoned calendar | Monitor — likely dead source |
| `beacon-hill-council-all-events` | Squarespace, 0 upcoming events. Site appears active | Monitor |
| `seattle-showlists-vermillion` | Showlists venue, currently no listings. `expectEmpty: true` already set | No action needed |
| `seattle-showlists-hotel-crocodile` | Showlists venue, currently no listings | Monitor |
| `seattle-showlists-bad-bar` | Showlists venue, currently no listings | Monitor |
| `tag-seward-park` | Has 5 events but marked `expectEmpty: true` — inconsistent | Review `expectEmpty` flag |
| `external-seattledances` | ICS was confirmed working 2026-04-22 (30 events) but now 0 events in production — may be intermittent or feed broken again | Investigate |
| `external-urban-league-seattle` | ICS was confirmed working 2026-04-27 (6+ events) but now 0 events — may be feed issue | Investigate |
| `crocodile-crocodile-madame-lous` | Crocodile sub-venue, currently no listings | Monitor |
| `seatoday-seatoday-nightlife` | seatoday nightlife calendar, 0 events — may be no upcoming nightlife events | Monitor |
| `tag-dance` | Dance tag aggregate shows 0 — likely caused by `external-seattledances` being empty | Resolve seattledances issue |

## Disabled Sources (revisit periodically)

**Seattle Night Market / 206 Night Markets** — `https://206nightmarkets.com/events` returns 404. Same org runs Seattle Street Food Festival.

## External ICS Feeds — Various Failures

| Name | Issue |
|------|-------|
| `nwtheatre` | HTTP 403 — WordPress ai1ec plugin may have been removed |
| `transit-riders-union` | Returns HTML instead of ICS — endpoint broken |
| `comedy-underground` | HTTP 200 with empty body — Tribe Events ICS returns no data |
| `gba-georgetown` | HTTP 503 — site was down, may be temporary |
| `seattle-artists-art-walks` | Catch-22: browser UA returns 200 + 0 events (likely HTML redirect); non-browser UA returns 406. Site is active but ICS export appears blocked/broken. Try `/calendar/?ical=1` as alternative URL next cycle. |
| `washington-ensemble-theatre` | ai1ec plugin, needs investigation |
| `iloveseattle-community` | Never confirmed working |

## Confirmed 410 Gone (do not re-attempt)

`seattlegov-parks`, `seattlegov-neighborhoods`, `seattlegov-outreach`, `seattlegov-arts`, `seattlegov-recreation`, `seattle-university`, `seattle-pacific-university`, `cornish`, `spl-events`, `seattle-public-library`

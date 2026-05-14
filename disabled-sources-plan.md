# Disabled Sources Recovery Plan

Investigation date: 2026-03-17

This document catalogs every disabled calendar source in the project, explains why it's broken, and recommends a fix strategy that does NOT require a headless browser.

---

## Summary

| Source | Type | Root Cause | Recommended Fix | Effort |
|--------|------|-----------|----------------|--------|
| Neumos | AXS ripper | Cloudflare blocks AXS API | Scrape neumos.com HTML directly | Medium |
| Barboza | AXS ripper | Cloudflare blocks AXS API | Scrape venue website HTML (SSL issue — needs investigation) | Medium |
| Clock-Out Lounge | AXS ripper | Cloudflare blocks AXS API | **Already has working ICS feed** in external.yaml | None |
| 5th Avenue Theatre | AXS ripper | Cloudflare blocks AXS API | Scrape 5thavenue.org or Tessitura TNEW API | Medium-High |
| AMC Theatres | GraphQL ripper | Cloudflare blocks GraphQL API | No viable non-browser path | Blocked |
| Seattle Night Market | Squarespace ripper | /events returns 404 | Find Eventbrite organizer ID or mark seasonal | Low |
| My Ballard | External ICS | Was 403 | **ICS feed now working** — re-enable | Trivial |
| Seattle Special Events | External ICS | Trumba 403 | Trumba still returning 403 — no fix available | Blocked |
| NWTheatre | External ICS | ai1ec 403 | **ICS feed now working** (ai1ec URL works) — re-enable | Trivial |
| Comedy Underground | External ICS | Empty body | TicketWeb as alternative — but TicketWeb returns 506 | Low-Medium |
| Georgetown Arts | External ICS | SSL/503 | SSL cert issue — retry periodically | Blocked |
| SeattleArtists.com | External ICS | 406 error | **ICS feed now working** — re-enable | Trivial |
| Climate Pledge Arena | External ICS | 503 error | **ICS feed now working** — re-enable | Trivial |
| iLoveSeattle.org | External ICS | Unverified | Uses EventON plugin (not Tribe Events) — ICS endpoint doesn't work | Low |
| Washington Ensemble | External ICS | ai1ec needs investigation | Site returns 404 on /events/ — investigate further | Low |
| Transit Riders Union | External ICS | Returns HTML | Tribe Events endpoint also returns empty — no events listed | Low |

---

## Detailed Analysis

### 1. AXS Venue Rippers (Cloudflare-blocked)

All four AXS venues share the same root cause: AXS.com uses aggressive Cloudflare bot protection that blocks both GitHub Actions runner IPs AND the project's authenticated Lambda proxy. The AXS API returns HTTP 403.

#### 1a. Neumos

- **Status:** `disabled: true`, `needsBrowser: true`, `proxy: "outofband"`
- **Root cause:** AXS API at `axs.com/venues/102495` returns 403
- **Investigation findings:**
  - The venue's own website at **neumos.com/events** IS accessible without a browser
  - Events are rendered in HTML with structured data (event names, dates, AXS ticket links)
  - Each event links to AXS for ticketing but the listing page itself is readable
  - 12+ events visible on the page with dates, times, and venue info
- **Recommended fix:** Write a new `HTMLRipper` that scrapes `neumos.com/events` directly instead of using the AXS API. Extract event name, date, and venue address from the HTML. The AXS event IDs in the ticket URLs can serve as unique identifiers for deduplication.
- **Effort:** Medium — need to write a new HTML parser and sample data

#### 1b. Barboza

- **Status:** `disabled: true`, `needsBrowser: true`, `proxy: "outofband"`
- **Root cause:** AXS API blocked, same as Neumos
- **Investigation findings:**
  - The venue website at `barboza.com` has an **expired SSL certificate** — fetch fails with "certificate has expired"
  - Bandsintown returns 403 for the venue page
  - DICE has no listing for Barboza
  - Barboza is a sister venue to Neumos (same building, same operators) — events may overlap
- **Recommended fix:** Wait for SSL cert renewal on barboza.com, then build an HTMLRipper similar to Neumos. Alternatively, check if Neumos events page also lists Barboza shows (they share the same building at 925 E Pike St). If the SSL issue persists, this source may need to remain disabled.
- **Effort:** Medium (blocked by SSL cert issue)

#### 1c. Clock-Out Lounge

- **Status:** `disabled: true` (AXS ripper), but **has a working ICS feed** in external.yaml
- **Root cause:** AXS API blocked
- **Investigation findings:**
  - The external.yaml entry `clock-out-lounge` uses a Tribe Events ICS feed at `clockoutlounge.com/?post_type=tribe_events&ical=1&eventDisplay=list`
  - **This ICS feed is confirmed WORKING** — returns 30+ valid events (March–May 2026)
  - The venue uses TicketWeb for ticketing, not AXS (despite the AXS ripper config)
  - The existing external ICS feed in external.yaml is NOT disabled
- **Recommended fix:** **No action needed.** The AXS ripper is disabled but the ICS feed in external.yaml is already active and working. Consider removing the disabled AXS ripper source entirely to reduce confusion.
- **Effort:** None (already covered)

#### 1d. 5th Avenue Theatre

- **Status:** `disabled: true`, `needsBrowser: true`, `proxy: "outofband"`
- **Root cause:** AXS API blocked
- **Investigation findings:**
  - The venue website at `5thavenue.org` IS accessible
  - Uses Tessitura TNEW ticketing at `my.5thavenue.org`
  - The ticketing portal currently shows "no results" (individual tickets go on sale summer 2026)
  - The main site uses Umbraco CMS and requires JavaScript for full show listings
  - DNS appears misconfigured for `www.5thavenuetheatre.org` (cert mismatch)
- **Recommended fix:** Two options:
  1. **Tessitura TNEW API** — Investigate the TNEW API at `my.5thavenue.org` for structured event data. TNEW often has JSON endpoints.
  2. **HTML scraping** of `5thavenue.org/shows` — would need JavaScript rendering (not viable without a browser).
  3. **Seasonal approach** — 5th Avenue has a small number of shows per season. Could add as recurring entries in `recurring.yaml` with manual updates each season.
- **Effort:** Medium-High. TNEW API investigation is the best path but may require reverse-engineering.

### 2. AMC Theatres (GraphQL API blocked)

- **Status:** `disabled: true`, `needsBrowser: true`, `proxy: "outofband"`
- **Root cause:** AMC's GraphQL API at `graph.amctheatres.com/graphql` returns 403 (Cloudflare)
- **Investigation findings:**
  - The AMC website at `amctheatres.com` also returns 403 — heavily protected
  - No public AMC API exists
  - No ICS feeds available
  - Third-party movie listing APIs (Fandango, TMDB) could be alternatives but don't provide theater-specific showtimes easily
- **Recommended fix:** **No viable non-browser path.** AMC's entire web presence is behind Cloudflare bot protection. Options:
  1. Accept this source as permanently blocked without browser automation
  2. Use a third-party movie data API (TMDB, OMDB) to get upcoming movie release dates, but this wouldn't give theater-specific showtimes
  3. Wait for AMC to publish a public API (unlikely)
- **Effort:** Blocked — no viable path without browser automation

### 3. Seattle Night Market (206 Night Markets)

- **Status:** `disabled: true` (Squarespace type)
- **Root cause:** `/events` Squarespace events collection returns 404
- **Investigation findings:**
  - The main site at `206nightmarkets.com` IS accessible and active
  - Shows an upcoming Lunar New Year Night Market event
  - The organization uses Eventbrite for ticket sales
  - The `/events` and `/upcoming-events` paths return 404 — the Squarespace events collection appears to have been removed
  - No Eventbrite organizer page found under common name variations
  - Events are infrequent (bi-annual night markets)
- **Recommended fix:**
  1. Find the Eventbrite organizer ID by examining ticket links on the main page
  2. Switch from Squarespace ripper to Eventbrite ripper
  3. Alternatively, since events are bi-annual, add specific dates as recurring entries in `recurring.yaml`
- **Effort:** Low

### 4. External ICS Feeds

#### 4a. My Ballard — RE-ENABLE

- **Status:** `disabled: true` — "403 Forbidden as of 2026-03-15"
- **Investigation:** **ICS feed is now working.** Returns 26 valid events (Feb–May 2026) with full metadata.
- **Recommended fix:** Remove `disabled: true`. The 403 was likely a transient issue or rate limiting.
- **Effort:** Trivial — one-line YAML change

#### 4b. NWTheatre.org — RE-ENABLE

- **Status:** `disabled: true` — "Returns HTTP 403 Forbidden"
- **Investigation:** The original ai1ec URL (`?plugin=all-in-one-event-calendar&controller=ai1ec_exporter_controller&action=export_events&no_html=true`) **IS working** and returns valid ICS data with theater events. The website also has The Events Calendar plugin installed, so the Tribe Events ICS endpoint may also work.
- **Recommended fix:** Re-enable with the existing URL. It returns valid ICS data now.
- **Note:** Events in the feed appear to be from 2023-2025 range — the calendar may not be actively maintained. Verify event dates after re-enabling.
- **Effort:** Trivial — one-line YAML change

#### 4c. SeattleArtists.com Art Walks — RE-ENABLE

- **Status:** `disabled: true` — "Returns 406 without browser-like User-Agent header"
- **Investigation:** **ICS feed is now working.** The Tribe Events ICS endpoint returns valid calendar data with 12+ art events. Either the 406 issue was fixed or the WebFetch tool sends appropriate headers.
- **Recommended fix:** Remove `disabled: true`. If 406 errors recur, the fix is to add a browser-like User-Agent header to the fetch request (may need `proxy: "outofband"` with header injection).
- **Effort:** Trivial — one-line YAML change

#### 4d. Climate Pledge Arena — RE-ENABLE

- **Status:** `disabled: true` — "Site returned 503 during testing, may have bot protection"
- **Investigation:** **ICS feed is now working.** Returns 60+ events (March–October 2026) including Kraken games, concerts, UFC events. Full ICS data with proper formatting.
- **Recommended fix:** Remove `disabled: true`. Note: this source may duplicate events from the existing `climate_pledge_arena` Ticketmaster ripper. Verify whether both sources are needed or if one should be preferred.
- **Effort:** Trivial — one-line YAML change

#### 4e. Transit Riders Union

- **Status:** `disabled: true` — "ICS endpoint returns HTML instead of calendar data"
- **Investigation:**
  - The original `?rhc_action=get_icalendar_events` endpoint still returns HTML (broken)
  - The site now uses The Events Calendar (Tribe Events) plugin
  - The Tribe Events ICS endpoint (`?post_type=tribe_events&ical=1&eventDisplay=list`) returns an **empty response** — the events page says "There are no upcoming events"
  - The organization may simply have no upcoming events listed
- **Recommended fix:** Update the ICS URL to use the Tribe Events endpoint: `https://transitriders.org/?post_type=tribe_events&ical=1&eventDisplay=list`. Enable with `expectEmpty: true` since they may have intermittent events.
- **Effort:** Low — URL change + re-enable

#### 4f. Comedy Underground

- **Status:** `disabled: true` — "ICS endpoint returns 200 with empty body"
- **Investigation:**
  - The Tribe Events ICS endpoint still returns an **empty body** (confirmed)
  - The website uses WordPress with The Events Calendar plugin
  - TicketWeb is the ticketing platform (orgId 17593)
  - TicketWeb listings endpoint returns **HTTP 506** — also broken
  - The venue appears to still be operating (has events on the website)
- **Recommended fix:** Build a custom HTMLRipper to scrape `comedyunderground.com` for event listings. The site is WordPress-based and accessible. Alternatively, investigate the TicketWeb API for a more structured approach.
- **Effort:** Low-Medium

#### 4g. Georgetown Arts & Cultural Alliance

- **Status:** `disabled: true` — "Site returned 503 during testing"
- **Investigation:** Fetch returns **SSL certificate error** ("unable to verify the first certificate"). The site has a certificate chain issue.
- **Recommended fix:** Cannot be fixed from our side — this is a server configuration issue on their end. Retry periodically. When accessible, test the Tribe Events ICS endpoint.
- **Effort:** Blocked — waiting on their SSL fix

#### 4h. iLoveSeattle.org Community Calendar

- **Status:** `disabled: true` — "Unverified feed"
- **Investigation:**
  - The site uses the **EventON** WordPress plugin, NOT Tribe Events
  - The Tribe Events ICS endpoint (`?post_type=tribe_events&ical=1`) does NOT work — returns HTML
  - EventON has a different ICS export mechanism
  - The page loads event data dynamically via JavaScript (Vue.js)
- **Recommended fix:** Investigate EventON's ICS export URL pattern (typically `?action=eventon_ical` or similar). If no ICS endpoint exists, this source cannot be enabled without HTML scraping or browser automation. Low priority — other community calendars provide similar coverage.
- **Effort:** Low (investigation) — may not be viable

#### 4i. Washington Ensemble Theatre

- **Status:** `disabled: true` — "Uses ai1ec plugin, ICS endpoint needs investigation"
- **Investigation:**
  - The `/events/` page returns **404** — the events page no longer exists
  - The main site at `washingtonensemble.org` IS accessible (Divi theme WordPress)
  - The `?ical=1` endpoint on `/events/` also returns 404
  - The theater may have removed their calendar or restructured their site
- **Recommended fix:** Investigate whether the theater is still producing shows and if they have events elsewhere (Eventbrite, social media). If the events page is permanently gone, remove this source. Low priority — small experimental theater.
- **Effort:** Low

#### 4j. Seattle Special Events Planning Calendar (Trumba)

- **Status:** `disabled: true` — "403 Forbidden as of 2026-03-15"
- **Investigation:** Trumba ICS endpoint still returns **403**. This appears to be an intentional access restriction by the City of Seattle or Trumba.
- **Recommended fix:** No fix available. The City of Seattle's other Trumba calendars (city-wide, neighborhoods, arts) are still working — this specific calendar has been restricted. Consider removing this entry.
- **Effort:** Blocked — access restricted by provider

---

## Action Plan (Priority Order)

### Immediate wins — re-enable working feeds (4 sources)

These feeds are confirmed working right now. Just remove `disabled: true`:

1. **My Ballard** — ICS feed returns 26 events
2. **SeattleArtists.com Art Walks** — ICS feed returns 12+ events
3. **Climate Pledge Arena** — ICS feed returns 60+ events (check for duplication with Ticketmaster ripper)
4. **NWTheatre.org** — ICS feed returns theater events (verify date freshness)

### Quick fixes (2 sources)

5. **Transit Riders Union** — Change ICS URL to Tribe Events endpoint, add `expectEmpty: true`
6. **Seattle Night Market** — Research Eventbrite organizer ID or convert to recurring entries

### Medium effort — new rippers needed (2 sources)

7. **Neumos** — Write HTMLRipper for neumos.com/events (venue website is accessible, well-structured)
8. **Comedy Underground** — Write HTMLRipper for comedyunderground.com

### Cleanup (3 sources)

9. **Clock-Out Lounge AXS ripper** — Delete the disabled ripper; the ICS feed in external.yaml already covers this venue
10. **Washington Ensemble Theatre** — Investigate if theater is still active; remove if defunct
11. **iLoveSeattle.org** — Investigate EventON ICS export; remove if not viable

### No viable path (4 sources)

12. **AMC Theatres** — Cloudflare blocks everything; no public API
13. **Barboza** — SSL cert expired on venue website; blocked
14. **5th Avenue Theatre** — Requires TNEW API reverse-engineering or JS rendering
15. **Georgetown Arts** — SSL cert chain broken on their server
16. **Seattle Special Events (Trumba)** — 403 access restriction, likely intentional

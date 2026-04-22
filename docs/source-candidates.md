# 206.events Source Candidates

Potential Seattle-area event sources to add, organized by status. Updated by the daily source discovery skill (`skills/source-discovery/SKILL.md`).

## Discovery Log

### 2026-04-22 — Removed 3 zero-event sources from PR #199
- **Can Can**: Abandoned Eventbrite (org page says "no upcoming events"). Squarespace site but `?format=json` returns `itemCount: 0` (tickets via Venmo only, no structured API)
- **Kremwerk**: Not a DICE venue — is a Squarespace site. `?format=json` returns `itemCount: 0` (JS-rendered events, no structured API)
- **Conor Byrne**: Squarespace `?format=json` returns `itemCount: 0`. Already covered by seattle-showlists (54 events) + recurring.yaml (1 open mic)
- All three returned 0 events in CI with `expectEmpty: true`; removed to avoid cluttering the source list

### 2026-04-21 — Batch implementation of easy built-in-type sources
- Implemented 5 new sources using built-in Eventbrite ripper: Laughs Comedy, CSz Seattle, Club Comedy, Third Place Books, Jet City Improv
- Added `Comedy` and `Books` tags to `lib/config/tags.ts`
- Removed: Can Can (no Eventbrite events), Kremwerk (not DICE), Conor Byrne (0 events, covered by seattle-showlists)
- Skylark Cafe: site is on Webflow (not Squarespace) — moved back to candidates for re-evaluation

### 2026-04-19 — Initial migration from ideas.md
- Migrated all source candidates from `ideas.md` into this file
- Feature ideas remain in `ideas.md`

---

## 💡 Candidate

### ICS Feeds (add to `sources/external.yaml`)

**UW Trumba Calendars** — lower priority, primarily academic/internal audiences:
- `sea_artsci` — UW College of Arts & Sciences — `https://www.trumba.com/calendars/sea_artsci.ics`
- `sea_info` — UW Information School — `https://www.trumba.com/calendars/sea_info.ics`
- `sea_lib` — UW Libraries Seattle — `https://www.trumba.com/calendars/sea_lib.ics`
- `sea_law` — UW School of Law — `https://www.trumba.com/calendars/sea_law.ics`
- `sea_foster` — UW Foster School of Business — `https://www.trumba.com/calendars/sea_foster.ics`
- `sea_nursing` — UW School of Nursing — `https://www.trumba.com/calendars/sea_nursing.ics`
- `sea_essuw` — UW Sustainability — `https://www.trumba.com/calendars/sea_essuw.ics`
- `sea_comp_lit` — UW Cinema & Media Studies — `https://www.trumba.com/calendars/sea_comp_lit.ics`
- `sea_evans-hub` — UW Evans School Community Hub — `https://www.trumba.com/calendars/sea_evans-hub.ics`

**MOHAI** — `https://mohai.org/events/` — WordPress with Tribe Events (try `?post_type=tribe_events&ical=1`) — Tags: Museums, Community

### Squarespace (built-in type)

**Seattle Public Theater** — `https://www.seattlepublictheater.org/current-season` — Green Lake Bathhouse — Note: may not work with SquarespaceRipper (page vs events collection)

**Skylark Cafe** — `https://www.skylarkcafe.com/calendar` — 3803 Delridge Way SW — Tags: Music, West Seattle — Note: site is on **Webflow** (not Squarespace); uses Eventbrite for ticketed events — need to find correct Eventbrite organizer ID or write custom scraper

### Ticketmaster (built-in type)

**Seattle Thunderbirds** — `https://chl.ca/whl-thunderbirds/schedule/` — accesso ShoWare Center, Kent — Tags: Sports — Note: Kent is outside Seattle city limits

### WordPress / Tribe Events ICS

**Rat City Roller Derby** — `https://ratcityrollerderby.com/events/` — try `?post_type=tribe_events&ical=1` — Tags: Community, Sports

**Theatre Off Jackson** — `https://theatreoffjackson.org/event-calendar/` — try `?post_type=tribe_events&ical=1` — 409 7th Ave S — Tags: Theatre, International District

### Custom HTML/JSON Scraping

**ACT Theatre / Union Arts Center** — `https://acttheatre.org/whats-on/` (redirects to unionartscenter.org) — WordPress with Avada — Tags: Theatre, Downtown

**Intiman Theatre** — `https://www.intiman.org/2025-26-season/` — WordPress — Tags: Theatre, Capitol Hill

**ArtsWest** — `https://www.artswest.org/calendar/` — WordPress with JS calendar — Tags: Theatre, West Seattle

**Seattle Children's Theatre** — `https://www.sct.org/tickets-shows/calendar/` — WordPress with Elementor — Tags: Theatre

**Seattle Opera** — `https://www.seattleopera.org/performances-events` — Custom, ticketing via Tessitura — Tags: Arts, Music

**Pacific Northwest Ballet** — `https://order.pnb.org/events` — WordPress, ticketing via Tessitura — Tags: Arts

**Book-It Repertory Theatre** — `https://book-it.org/` — WordPress — Tags: Theatre — Low volume

**Cornish College of the Arts** — `https://www.cornish.edu/cornish-college-event-calendar/` — Custom CMS — Tags: Arts, Music, Theatre

**Nectar Lounge** — `https://nectarlounge.com/events/calendar/` — Tixr ticketing — Tags: Music

**The Triple Door** — `https://thetripledoor.net/mainstage-calendar` — Bandzoogle — Tags: Music, Downtown

**Jazz Alley** — `https://www.jazzalley.com/www-home/calendar.jsp` — Custom JSP — `proxy: true` required (503 from CI IPs) — Tags: Music, Belltown

**Columbia City Theater** — `https://columbiacitytheater.org/` — WordPress — Tags: Music, Community

**Central Saloon** — `https://centralsaloon.com/music-events/` — WordPress — Tags: Music, Pioneer Square

**Tim's Tavern** — `https://timslivemusic.com/upcoming-shows` — Tags: Music, West Seattle

**Egan's Ballard Jam House** — `https://www.ballardjamhouse.com/schedule.html` — Custom static site — Tags: Music, Ballard

**Whim W'Him Seattle Contemporary Dance** — `https://whimwhim.org/calendar/` — Tags: Arts, Queen Anne

**Mox Boarding House Seattle** — `https://www.moxboardinghouse.com/pages/seattle-events` — Shopify — Tags: Gaming, Ballard

**The Mountaineers** — `https://www.mountaineers.org/locations-lodges/seattle-program-center/events` — Tags: Outdoors

**University Book Store** — `https://ubookstore.com/` — Tags: Books, University District

**Henry Art Gallery** — `https://henryart.org/programs/all` — Tags: Arts, Museums, University District

**National Nordic Museum** — `https://nordicmuseum.org/calendar` — Tags: Museums, Arts, Ballard

**Woodland Park Zoo** — `https://zoo.org/events/` — Custom (returns 503) — Tags: Community

**Seattle Aquarium** — `https://www.seattleaquarium.org/events/` — Custom CMS — Tags: Community, Museums

**CIDBIA Events** — `https://www.seattlechinatownid.com/local-events` — Tags: Community, International District

**El Centro de la Raza** — `https://www.elcentrodelaraza.org/` — Tags: Community, Beacon Hill

**Renegade Craft Fair** — `https://www.renegadecraft.com/events/` — Tags: MakersMarket

**Seattle Uncorked** — `https://seattleuncorked.com/events/` — Tags: Beer, Community

**ParentMap** — `https://www.parentmap.com/calendar` — Drupal — Tags: Community

**Seattle Indian Health Board** — `https://www.sihb.org/events/` — WordPress — Tags: Community

**Emerald City Comedy Club** — `https://www.emeraldcitycomedy.com/events` — SeatEngine platform — Tags: Comedy, Capitol Hill

**Here-After (at The Crocodile)** — `https://www.thecrocodile.com/here-after` — 2505 1st Ave — Tags: Comedy, Belltown — May overlap with existing `crocodile` ripper

**Hidden Door** — `https://www.hiddendoorseattle.com/` — Tags: Music, Capitol Hill

**Backfire Motobar** — `https://www.backfiremotobar.com/` — 7701 Aurora Ave N — Tags: Music, Nightlife

**The Royal Room** — `https://theroyalroomseattle.com/` — 5000 Rainier Ave S — Tags: Music, Columbia City

**Ada's Technical Books & Cafe** — `https://adasbooks.com/events` — 425 15th Ave E — Tags: Books, Capitol Hill

---

## ✅ Added

**Laughs Comedy Club** — `sources/laughs_comedy` — Eventbrite — 5220 Roosevelt Way NE — Tags: Comedy, University District

**CSz Seattle (ComedySportz)** — `sources/csz_seattle` — Eventbrite — 3509 Fremont Ave N — Tags: Comedy, Fremont

**Club Comedy Seattle** — `sources/club_comedy` — Eventbrite — 2100 Harvard Ave E — Tags: Comedy, Capitol Hill

**Third Place Books** — `sources/third_place_books` — Eventbrite — multi-location — Tags: Books, Education

**Jet City Improv** — `sources/jet_city_improv` — Eventbrite — 5031 University Way NE — Tags: Comedy, Theatre, University District

---

## ⏸️ Blocked

**AXS Venues (5th Avenue Theatre, Barboza, Clock-Out Lounge, Neumos)** — Cloudflare bot protection blocks both direct and proxy requests. Need residential proxy or headless browser. — Tags: Theatre, Music

**AMC Theatres** — Cloudflare bot protection on GraphQL API. — Tags: Movies

**EverOut Seattle (The Stranger)** — `https://everout.com/seattle/events/` — Heavy bot protection (403 on fetch). — Tags: Community, Music, Arts

**Do206** — `https://do206.com/events` — Algolia-powered. Search API keys may be extractable from page JS. — Tags: Community, Music

**Songkick** — API requires key. — Tags: Music

---

## ❌ Not Viable

**Village Theatre** — Issaquah and Everett venues — not Seattle city limits

**Woodinville Wine Country** — Woodinville — not Seattle city limits

**Filipino Community of Seattle** — Wix site, heavily JS-dependent — Eventbrite may be an alternative route (investigate)

**Climate Pledge Arena (external ICS)** — HTTP 503 — already covered by `climate_pledge_arena` Ticketmaster ripper

**Can Can Culinary Cabaret** — Abandoned Eventbrite (org page: "no upcoming events"). Squarespace site but `?format=json` returns `itemCount: 0` (sells tickets via Venmo only, no structured API). Revisit if they start using Eventbrite again or if `needsBrowser` support is added.

**Kremwerk + Timbre Room + Cherry** — Not a DICE venue; is a Squarespace site. `?format=json` returns `itemCount: 0` (JS-rendered events, no structured API). Revisit if `needsBrowser` support is added.

**Conor Byrne Pub** — Squarespace `?format=json` returns `itemCount: 0`. Already well-covered by seattle-showlists (54 events) + recurring.yaml (1 open mic). Low priority to re-attempt.

---

## 💀 Dead Source Investigation

### Disabled Sources (revisit periodically)

**Seattle Night Market / 206 Night Markets** — `https://206nightmarkets.com/events` returns 404. Same org runs Seattle Street Food Festival.

### External ICS Feeds — Various Failures

| Name | Issue |
|------|-------|
| `nwtheatre` | HTTP 403 — WordPress ai1ec plugin may have been removed |
| `transit-riders-union` | Returns HTML instead of ICS — endpoint broken |
| `comedy-underground` | HTTP 200 with empty body — Tribe Events ICS returns no data |
| `gba-georgetown` | HTTP 503 — site was down, may be temporary |
| `seattle-artists-art-walks` | HTTP 406 without browser User-Agent — needs custom headers |
| `washington-ensemble-theatre` | ai1ec plugin, needs investigation |
| `iloveseattle-community` | Never confirmed working |

### Confirmed 410 Gone (do not re-attempt)

`seattlegov-parks`, `seattlegov-neighborhoods`, `seattlegov-outreach`, `seattlegov-arts`, `seattlegov-recreation`, `seattle-university`, `seattle-pacific-university`, `cornish`, `spl-events`, `seattle-public-library`
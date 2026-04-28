# 206.events Source Candidates

Potential Seattle-area event sources to add, organized by status. Updated by the daily source discovery skill (`skills/source-discovery/SKILL.md`).

## Discovery Log

### 2026-04-28 — Source discovery: Improv, Comedy, Arts
- ✅ **Cannonball Arts Center** — Custom WordPress REST ripper implemented. Fetches from `/wp-json/wp/v2/cba-event`, parses dates from HTML content. 6 events, 19 tests. PR #230.
- ✅ **Unexpected Productions** — Eventbrite org `6607284485`, 23 upcoming events at Market Theater (Pike Place Market). Built-in EventbriteRipper, 8 tests. PR #231.
- ❌ **Club Sur** — Eventbrite org `19822842329`, only 9 events. SODO venue. Marginal volume, skip.
- ❌ **Abbey Arts** — Eventbrite org `11933347765`, only 1 upcoming event. Nonprofit, multi-venue (Fremont Abbey, Ballard Homestead, etc). Too few events.
- ❌ **Seattle Center** — Custom CMS, no ICS/API, JS-rendered calendar. Still not viable.
- ❌ **Pioneer Square Alliance** — JS-rendered events page, no structured feed. Not viable.
- ❌ **Book Love** — Eventbrite org `64943664533`, but located in Plymouth, MA. Not Seattle.
- 💡 **Emerald City Comedy Club** — Still candidate: SeatEngine platform, 40+ events. Would need custom ripper.

### 2026-04-27 — Source discovery: Community, Yoga, Jewish organizations
- ❌ **Jewish Federation of Greater Seattle** — ICS works but removed: we don't add religious sources.
- ✅ **Urban League of Metropolitan Seattle** — Tribe Events ICS confirmed working (6+ events: homebuyer workshops, Home Club, housing programs). Seattle-based at 105 14th Ave. Added to `external.yaml` as `urban-league-seattle`. Tags: Community, Education.
- ❌ **National Nordic Museum** — Tribe Events site but ICS endpoint redirects to HTML calendar page, not ICS data. REST API `/wp-json/wp/v2/` returns 404. Not viable.
- ❌ **Neighborhood Farmers Markets** — Squarespace `?format=json` returns site layout metadata, not event data. Events are JS-rendered or off-season. Not viable.
- ❌ **Stroum JCC** — Tribe Events ICS works but venue is on Mercer Island, outside Seattle city limits. Not viable per Seattle-focused rule.
- ❌ **Pratt Fine Arts** — Not Tribe Events, primarily classes (not public events). No ICS/API. Not viable.
- ❌ **Pottery Northwest** — Shopify site, no ICS or structured event API. Not viable.
- 🔍 **SeattleDances** — Previously marked ❌ (CAPTCHA), but ICS endpoint works fine directly. Already in `external.yaml` — no action needed. The 2026-04-23 ❌ entry was wrong (CAPTCHA only affects HTML page, not ICS feed).

### 2026-04-24 — Source discovery: Food & Drink, Comedy, Arts
- 💡 **Cannonball Arts Center** — Previously ❌ (503), now ✅ REST API returning 6 events at `/wp-json/wp/v2/cba-event`. New venue from Bumbershoot producers at 1930 3rd Ave (Downtown/Belltown). Custom WordPress REST endpoint — would need custom ripper (🔴 Low confidence). Tags: Arts, Downtown.
- 💡 **Emerald City Comedy Club** — SeatEngine platform (custom ripper needed). 40+ upcoming events, rich schedule at `emeraldcitycomedy.com`. Custom HTML/JSON scraper required (🔴 Low confidence). Tags: Comedy, Capitol Hill.
- ❌ **Mox Boarding House Seattle** — Shopify store but events are on `/pages/seattle-events` (not products). Events page is JS-rendered, no structured API for events. `/products.json` returns MTG products only. Not viable. Tags: Gaming, Ballard.
- 💡 **Seattle Uncorked** — WordPress site with wine/beer events, mostly Seattle-focused (some Eastside events). Custom scraper needed (🔴 Low confidence). Tags: Beer, Community.
- ❌ **Hidden Door** — DNS resolution fails (`hiddendoorseattle.com`). Appears dead/defunct. Tags: Music, Capitol Hill.
- ❌ **Backfire Motobar** — DNS resolution fails (`backfiremotobar.com`). Appears dead/defunct. Tags: Music, Nightlife.
- ❌ **Cohesion Brewing** — Located in Denver, CO. Not Seattle. Tags: N/A.
- ❌ **Salish Sea Brewing** — Located in Edmonds, WA. Outside Seattle city limits. Tags: N/A.
- 💀 **Zero-event calendars**: All 10 from build remain same status. No new dead sources detected.

### 2026-04-23 — Added Book Larder
- ✅ **Book Larder** — Shopify products.json API (`/collections/evey-events/products.json`). Dates parsed from body_html text. 8 of 10 products produce parseable events (book clubs without dates are skipped). Tags: Books, Food, Fremont.

### 2026-04-23 — Added The Royal Room
- ✅ **The Royal Room** — WP Event Manager RSS feed (`?feed=event_feed`) confirmed working with 49 events. Each event page has JSON-LD `startDate`. Custom `IRipper` fetches RSS then individual event pages. Tags: Music, Columbia City.
- ❌ **Ada's Technical Books** — removed; venue is closing permanently.
- 🔍 **SeattleDances** — ICS feed was marked ❌ due to CAPTCHA (sgcaptcha) on HTML page, but ICS endpoint works fine. Already in `external.yaml`. Updated 2026-04-27.
- ❌ **Theatre Off Jackson** — uses venture-event-manager plugin, no working ICS export.
- ❌ **Rat City Roller Derby** — no Tribe Events ICS, returns HTML.
- ❌ **Cannonball Arts Center** — REST API returning 503. ~~Updated 2026-04-24: REST API now working (6 events). Moved to 💡 Candidate.~~

### 2026-04-23 — Source discovery: Arts & Culture, Bookstores, New Venues
- ❌ **Frye Art Museum** — Already has a custom ripper (`sources/frye_art_museum/`). Calendar has 11+ pages of events but no ICS/Eventbrite/structured feed. No new source needed.
- ❌ **Picklewood Paddle Club** — New SODO venue. Only 1 Eventbrite event (grand opening). Insufficient volume for a source. Tags: Sports, SODO
- ❌ **Seattle Children's Museum** — Custom CMS, exports .ics from calendar page but no public ICS/Eventbrite feed. Already in candidates list.
- ❌ **TeenTix** — Aggregator/calendar at `teentix.org/calendar`. No public ICS feed. Would need custom scraper. Tags: Community, Arts
- ✅ **Elliott Bay Book Company** — Already implemented as `sources/elliott-bay` (Eventbrite org 30672130426, 25+ events). Confirmed working.
- ✅ **Town Hall Seattle** — Already in `sources/external.yaml` as `town-hall-seattle`. No new source needed.
- 💀 **Zero-event calendars re-checked**: All 11 zero-event calendars from 2026-04-22 remain in the same state. No new dead sources identified.

### 2026-04-22 (evening) — Source discovery: Outdoors, Community & City Calendars
- ✅ **Volunteer Park Trust** — Squarespace at `volunteerparktrust.org/events`, 6 upcoming events confirmed. Added as `sources/volunteer_park_trust/ripper.yaml`. PR #201 merged.
- 💡 **Seattle.Gov City-Wide (Trumba)** — `https://www.trumba.com/calendars/seattlegov-city-wide.ics` — Already in `sources/external.yaml` as `seattle-gov-city-wide`. Not a new source.
- ❌ **Seattle Farmers Markets** — Squarespace at `seattlefarmersmarkets.org`. `?format=json` returns `itemCount: 1077` but `0` upcoming (off-season; markets run May–Oct). Viable Squarespace candidate — will work in season. Tags: Food, Community
- ❌ **Waterfront Park Seattle** — Custom WordPress (built by Civilization agency). No Tribe Events ICS, no Eventbrite. Would need custom scraper. Not viable with built-in rippers.
- ❌ **Green Seattle Partnership** — WordPress with The Events Calendar but REST API disabled (`rest_no_route`), ICS returns HTML. Not viable.
- ❌ **West Seattle Blog Events** — Custom WordPress theme, no Tribe Events. Not viable.
- ❌ **Seattle Center** — Custom CMS, not Trumba. Not viable.
- ❌ **MOHAI** — WordPress with Cloudflare protection, no Eventbrite, ICS returns HTML. Not viable with built-in rippers.

### 2026-04-22 — Source discovery: Outdoors & Dance verticals
- 💡 **SeattleDances** — WordPress (The Events Calendar) at `seattledances.com`. ICS feed confirmed working (30 events). Tags: Dance, Arts
- ❌ **Langston (external-langston)** — ICS feed returns HTML (not ICS). WordPress REST API for Tribe Events not available (rest_no_route). Site has events but no machine-readable feed. Consider switching to HTML scraper or Eventbrite.
- 🔍 **Zero-event calendar investigation:**
  - `spl-university` — SPL University Branch is **closed for renovations until late 2026**. Should add `expectEmpty: true`.
  - `beacon-hill-council-all-events` — Site has events (Squarespace), likely just currently empty. Monitor.
  - `belltown-community-council-all-events` — WordPress.com API site, has recent events (March 2026). Likely intermittent.
  - `benaroya-hall-benaroya-nordstrom` — Ticketmaster source, Nordstrom Recital Hall has events. Possible config or API issue.
  - `jcccw-all-events` — Squarespace, has active events on website. Possible ripper issue.
  - `seattle-showlists-vermillion/bad-bar/hotel-crocodile` — Showlists sub-venues, likely currently empty listings.
  - `external-langston` — ICS feed broken (returns HTML). Needs ripper fix.
  - `tag-seward-park` — Actually has 5 events but marked expectEmpty. May need flag review.

### 2026-04-22 — Source discovery: Bookstores & Comedy verticals
- 💡 **Book Larder** — Shopify store at `booklarder.com`, events as products in `/collections/evey-events`. Shopify JSON API confirmed working (5 products). Tags: Books, Food, Fremont
- 💡 **Cannonball Arts Center** — New venue (from Bumbershoot producers) at `cannonballarts.com`. WordPress with custom `cba-event` REST endpoint (`/wp-json/wp/v2/cba-event`), 5 events currently. Tags: Arts, Belltown
- 💡 **Ada's Technical Books** — Updated: Has Eventbrite organizer ID `107124733511` for events at `adasbooks.com/events`. Could use built-in Eventbrite ripper instead of custom scraper. Tags: Books, Capitol Hill
- ❌ **Queen Anne Book Company** — IndieCommerce platform, no working ICS feed (`?post_type=tribe_events&ical=1` returns HTML, not ICS). No Eventbrite. Would need custom scraper. Tags: Books, Queen Anne
- ❌ **Comedy Underground** — Old static HTML site, no structured event data or API. Already listed in Dead Source Investigation section. Ticketing via TicketWeb. Not viable with current ripper tools.
- ❌ **comedy.tickets** — Aggregator site, not a primary source. Not viable.
- ❌ **Seattle City of Literature** — Tockify embed, but ICS/API feeds don't work (404). Underlying Google Calendar is private. Not viable.
- 🔍 **The Rendezvous** (Belltown) — Calendar shows no events since June 2025. Likely dead or on hiatus.

### 2026-04-22 — Removed future-primitive (never produced events)
- **Future Primitive Brewing**: Squarespace site with `itemCount: 0`, never appeared in production manifest. Removed source.

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

**Seattle.Gov City-Wide** — `https://www.trumba.com/calendars/seattlegov-city-wide.ics` — 500 events. City meetings, community events, parks volunteer events, commission meetings. Tags: Community, Government, Parks — **New 2026-04-22**

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

**SeattleDances** — `https://seattledances.com/events/` — ICS feed confirmed working at `?post_type=tribe_events&ical=1&eventDisplay=list` (30 events). Tags: Dance, Arts — **New 2026-04-22**

**Rat City Roller Derby** — `https://ratcityrollerderby.com/events/` — try `?post_type=tribe_events&ical=1` — Tags: Community, Sports

**Theatre Off Jackson** — `https://theatreoffjackson.org/event-calendar/` — try `?post_type=tribe_events&ical=1` — 409 7th Ave S — Tags: Theatre, International District

~~**Book Larder** — `https://booklarder.com/collections/evey-events` — Shopify store (events as products) — 4252 Fremont Ave N — Tags: Books, Food, Fremont — Shopify products.json API confirmed working~~

~~**Cannonball Arts Center**~~ — ✅ Added as `sources/cannonball_arts` (PR #230)

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

**Seattle Uncorked** — `https://seattleuncorked.com/events/` — WordPress, mostly Seattle-focused (some Eastside events) — Tags: Beer, Community

**ParentMap** — `https://www.parentmap.com/calendar` — Drupal — Tags: Community

**Seattle Indian Health Board** — `https://www.sihb.org/events/` — WordPress — Tags: Community

**Emerald City Comedy Club** — `https://www.emeraldcitycomedy.com/events` — SeatEngine platform, 40+ events, custom ripper needed — Tags: Comedy, Capitol Hill

**Here-After (at The Crocodile)** — `https://www.thecrocodile.com/here-after` — 2505 1st Ave — Tags: Comedy, Belltown — May overlap with existing `crocodile` ripper

**Hidden Door** — `https://www.hiddendoorseattle.com/` — Tags: Music, Capitol Hill

**Backfire Motobar** — `https://www.backfiremotobar.com/` — 7701 Aurora Ave N — Tags: Music, Nightlife

**The Royal Room** — `https://theroyalroomseattle.com/` — 5000 Rainier Ave S — Tags: Music, Columbia City

❌ **Ada's Technical Books & Cafe** — closing permanently — removed from candidates

---

## ✅ Added

**Laughs Comedy Club** — `sources/laughs_comedy` — Eventbrite — 5220 Roosevelt Way NE — Tags: Comedy, University District

**CSz Seattle (ComedySportz)** — `sources/csz_seattle` — Eventbrite — 3509 Fremont Ave N — Tags: Comedy, Fremont

**Club Comedy Seattle** — `sources/club_comedy` — Eventbrite — 2100 Harvard Ave E — Tags: Comedy, Capitol Hill

**Third Place Books** — `sources/third_place_books` — Eventbrite — multi-location — Tags: Books, Education

**Jet City Improv** — `sources/jet_city_improv` — Eventbrite — 5031 University Way NE — Tags: Comedy, Theatre, University District

**Volunteer Park Trust** — `sources/volunteer_park_trust` — Squarespace — Volunteer Park, 1247 15th Ave E — Tags: Community, Parks, Capitol Hill — PR #201

**The Royal Room** — `sources/royal_room` — WP Event Manager RSS + JSON-LD per-page — 5000 Rainier Ave S, Columbia City — Tags: Music, Columbia City

**Book Larder** — `sources/book_larder` — Shopify products.json API — 4252 Fremont Ave N, Fremont — Tags: Books, Food, Fremont

**Cannonball Arts Center** — `sources/cannonball_arts` — Custom WordPress REST ripper (`/wp-json/wp/v2/cba-event`) — 1930 3rd Ave, Belltown — Tags: Art, Belltown — PR #230

**Unexpected Productions** — `sources/unexpected_productions` — Eventbrite org `6607284485` — 1428 Post Alley, Pike Place Market — Tags: Comedy, Pike Place — PR #231

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

**Future Primitive Brewing** — Squarespace `?format=json` returns `itemCount: 0`. Never produced events on 206.events. Revisit if they start publishing events.

---

## 💀 Dead Source Investigation

### Zero-Event Calendars (2026-04-22)

| Name | Issue | Recommendation |
|------|-------|---------------|
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
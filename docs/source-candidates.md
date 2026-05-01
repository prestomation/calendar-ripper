# 206.events Source Candidates

Potential Seattle-area event sources to add, organized by status. Updated by the daily source discovery skill (`skills/source-discovery/SKILL.md`).

## Discovery Log

### 2026-05-01 — Source discovery: Music venues, Festivals, Arts, Breweries, Neighborhood orgs
- 💡 **Couth Buzzard Books** — Squarespace confirmed (watermelon-endive-hmky.squarespace.com). Bookstore + café + performance space at 8310 Greenwood Ave N. Open mic Wed, live music Fri–Sat, kids story time. **Implemented in PR #243 but returned 0 events in CI** — `?format=json` on `/event-calendar` may be the wrong path, or the Squarespace events collection may be empty/unpublished. Try `/events?format=json` or inspect the Squarespace backend. Tags: Books, Music, Greenwood.
- 💡 **Midwest Coast Brewing** — Squarespace site at `midwestcoastbrewing.com/upcoming`. Extremely active events calendar (trivia, music bingo, live music, dog market, sip & paint, yoga, book club). Tags: Music, Community, Greenwood. Verify: `?format=json`.
- 💡 **Roosevelt Neighborhood Association** — `rooseveltseattle.org/about/calendar/`. WordPress with Google Calendar embed — likely has webcal:// ICS URL. Monthly trivia nights, community events, Rooted in Roosevelt festival (Sept). Tags: Community. Check page source for webcal or .ics link.
- 💡 **West Seattle Junction** — `wsjunction.org/event-directory/`. WordPress neighborhood org. Annual events include West Seattle Summer Fest (July 10–12, 2026). Check for Tribe Events ICS: `?post_type=tribe_events&ical=1`. Tags: Community, West Seattle.
- 💡 **Elliott Bay Brewing** — `elliottbaybrewing.com/events/`. Multi-location WordPress brewery (West Seattle, Burien, Lake City). Weekly karaoke, trivia, live music, seasonal events — highly active. Would need custom ripper or check for ICS. Tags: Beer, Music, West Seattle.
- ❌ **Abbey Arts / Fremont Abbey** — WordPress site at `fremontabbey.org`. Uses Humanitix for ticketing (`events.humanitix.com/host/abbey-arts-presents`). Humanitix has no public ICS or REST API. HTML scraping only, fragile. Not viable.
- ❌ **Marymoor Live** — Outdoor summer concert series in Redmond, WA. Outside Seattle city limits.
- ❌ **Tacoma Comedy Club** — Located in Tacoma. Outside Seattle city limits.
- ❌ **Phinney Neighborhood Association** — Already in `sources/external.yaml` as `phinney-neighborhood-association`. No action needed.
- ❌ **SeattleArtists.com** — Already in `sources/external.yaml` as `seattle-artists-art-walks`. No action needed.

### 2026-05-01 — Source discovery: Comedy, Festivals, Bookstores, Jazz/Music
- ✅ **Earshot Jazz** — WordPress Tribe Events ICS (`https://www.earshot.org/?post_type=tribe_events&ical=1&eventDisplay=list`). 100+ concerts/year at venues throughout Seattle. Added to `sources/external.yaml`. Tags: Music.
- 💡 **The Rendezvous** — Previously flagged as dead (2026-04-22), now confirmed active with April 2026 events (comedy, music, burlesque). WordPress + Tribe Events (confirmed by URL structure: `/calendar/category/comedy/`). Address: 2322 2nd Ave, Belltown. Tags: Music, Comedy, Nightlife, Belltown. Try ICS: `https://www.therendezvous.rocks/?post_type=tribe_events&ical=1&eventDisplay=list`.
- 💡 **Couth Buzzard Books** — Squarespace site (confirmed via `watermelon-endive-hmky.squarespace.com`). Bookstore + café + performance space at 8310 Greenwood Ave N, Greenwood. Has open mic (Wed), live music (Fri–Sat), kids story time. Tags: Books, Music, Greenwood. Verify: `https://www.couthbuzzard.com/event-calendar?format=json`.
- 💡 **Seattle Farmers Markets** — Squarespace (seattlefarmersmarkets.org). Previously ❌ off-season. Markets are now opening for May 2026: Capitol Hill (Sundays 11am–3pm), West Seattle (Sundays 10am–2pm), Lake City (Aug), Magnolia (Jul), Columbia City (Jul), Phinney (Aug). Verify: `https://seattlefarmersmarkets.org/events?format=json`. Tags: FarmersMarket, Community, Food.
- 💡 **New Tech Northwest** — newtechnorthwest.com. WordPress + Tribe Events. Monthly tech meetups in Seattle with 60k+ member community (uses Luma as primary platform too). Tags: Community, Education. Try ICS: `https://www.newtechnorthwest.com/?post_type=tribe_events&ical=1&eventDisplay=list`.
- ❌ **The Rendezvous (dead source flag removed)** — Moved from 💀 Dead Source Investigation to 💡 Candidate above; confirmed active 2026.

### 2026-04-30 — Source discovery: Outdoors/Sports, Food/Drink, Theater/Arts, Nightlife, Tech/Meetups
- ✅ **Populus Seattle** — Tribe Events ICS, 10 events confirmed. Hotel venue at 100 S King St, Pioneer Square. Implemented in PR #240. Tags: Nightlife, Music, Downtown.
- ❌ **Theatre Puget Sound** — Tribe Events ICS confirmed working but only 4 events total; community aggregate calendar with events spread across venues including Studio East in Kirkland (outside Seattle). Low volume for Seattle-specific events. Not viable as primary source.
- ❌ **GeekWire Calendar** — Tribe Events ICS returns Cloudflare block (403). Already in `sources/external.yaml` as `geekwire`. Not a new source.
- ❌ **Cascade Bicycle Club** — Drupal site, no ICS feed. Events page is `/rides-events`, custom Drupal CMS. Not viable with built-in rippers.
- ❌ **Massive Club** — Webflow + Tixr ticketing, no ICS or structured event API. Not viable.
- ❌ **Central Saloon** — Uses Modern Events Calendar Lite (MEC) plugin, not Tribe Events. No public ICS export from MEC Lite. Would require custom scraper (HTML parsing). Tags: Music, Pioneer Square. Low priority.
- 💡 **Emerald City Comedy Club** — SeatEngine platform. JSON-LD schema.org `Event` data embedded in page HTML (confirmed working, 40+ shows visible). 210 Broadway E, Capitol Hill. Custom HTML scraper would parse JSON-LD from `https://www-emeraldcitycomedy-com.seatengine.com/events`. Tags: Comedy, Capitol Hill.
- ❌ **Cannonball Arts Center** — REST API now only returning 2 events (down from 6 on 2026-04-24). Too low volume; new venue still building programming. Monitor.

### 2026-04-30 — Source discovery: Bookstores, Music, Arts & Community
- ✅ **University Book Store / Barnes & Noble University District** — Eventbrite organizer `30331909434`, 10 events. Author readings, story times, poetry events at 4324 University Way NE. Adding as `sources/university_book_store`. Tags: Books, University District.
- 💡 **Cannonball Arts Center** — WordPress REST API (`/wp-json/wp/v2/cba-event`) confirmed returning 2 events. Only 2 events currently; low volume but new venue (opened Aug 2025) from Bumbershoot producers. Custom ripper needed. Tags: Arts, Belltown.
- ❌ **Tractor Tavern** — Uses TicketWeb ticketing; no ICS feed or public API. Already covered via seattle-showlists ripper. Not viable as separate source.
- ❌ **Hugo House** — Already in `sources/external.yaml` as `hugo-house`. Tribe Events ICS confirmed working (31 events). No action needed.
- ❌ **Rainier Arts Center** — Already has `sources/rainier_arts_center` ripper. No action needed.
- ❌ **Langston Hughes PAI** — Already in `sources/external.yaml` as `langston`. No action needed.
- ❌ **Wing Luke Museum** — Already has `sources/wing_luke` Squarespace ripper (itemCount 247, confirmed working). No action needed.
- ❌ **LANGSTON Seattle** — Only 2 upcoming events. Too low volume.
- ❌ **Intiman Theatre** — WordPress but no working ICS/Tribe Events feed. Custom scraper would be needed but very low volume. Not viable.
- ❌ **Cornish College of the Arts** — Uses Events Manager plugin + Ludus ticketing; no ICS/API. Events feed at events.seattleu.edu (not their site). Not viable.
- ❌ **Columbia City Theater** — WordPress but Tribe Events ICS returns HTML. Not viable without custom ripper.
- ❌ **Seattle Farmers Markets (seattlefarmersmarkets.org)** — Squarespace `?format=json` returns `itemCount: 0` (off-season). Revisit in May when season opens.
- ❌ **Queen Anne Farmers Market** — Not standard Squarespace events JSON. Market schedule info only. Not viable.

### 2026-04-28 — Source discovery: Zoo, Library, Community
- ✅ **Woodland Park Zoo** — Tribe Events ICS confirmed working (~30 events: ZooTunes, animal encounters, dining). Adding to external.yaml. Previously marked ❌ (503) but ICS endpoint works fine.
- ✅ **Seattle Public Library** — Already implemented as `sources/spl/` ripper (Trumba `kalendaro.json`, 24 branch calendars). No action needed.
- ❌ **We Heart Seattle** — BANNED (per Preston). Not a source we want.
- ❌ **Seattle Aquarium** — Only 3 upcoming events on Eventbrite. Too low volume.
- ❌ **Seattle Center Festál** — No ICS, custom CMS. Not viable.
- ❌ **ACT Theatre / Union Arts Center** — No ICS, Salesforce ticketing. Not viable.
- ❌ **ArtsWest** — Salesforce ticketing, no ICS. Not viable.
- ❌ **Nordic Museum** — Tribe Events ICS returns 404. Not viable.

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

**Couth Buzzard Books** — `https://www.couthbuzzard.com/event-calendar` — Squarespace confirmed (`watermelon-endive-hmky.squarespace.com`). Bookstore + café + performance space at 8310 Greenwood Ave N. Open mic Wed, live music Fri–Sat, kids story time. **Returned 0 events in CI (PR #243)** — try `/events?format=json` instead of `/event-calendar?format=json`. Tags: Books, Music, Greenwood — **New 2026-05-01**

**Midwest Coast Brewing** — `https://www.midwestcoastbrewing.com/upcoming` — Squarespace. Extremely active events calendar at this Greenwood/Seattle brewery: trivia, music bingo, live music, dog market, sip & paint, yoga, barre, book club. Verify: `?format=json`. Tags: Beer, Music, Greenwood — **New 2026-05-01**

**Roosevelt Neighborhood Association** — `https://rooseveltseattle.org/about/calendar/` — Google Calendar embed (likely public webcal ICS). Monthly trivia nights, litter pickups, clothing swaps, Rooted in Roosevelt festival (Sept 19, 2026). Check page source for `webcal://` or `calendar.google.com/calendar/ical/` URL. Tags: Community — **New 2026-05-01**

**West Seattle Junction** — `https://wsjunction.org/event-directory/` — WordPress neighborhood org. West Seattle Summer Fest (July 10–12, 2026), farmers markets, community events. Try ICS: `?post_type=tribe_events&ical=1&eventDisplay=list`. Tags: Community, West Seattle — **New 2026-05-01**

**Elliott Bay Brewing** — `https://elliottbaybrewing.com/events/` — WordPress, multi-location (West Seattle, Burien, Lake City). Weekly karaoke, trivia, live music, seasonal events. Custom ripper likely needed. Tags: Beer, Music, West Seattle — **New 2026-05-01**

**Seattle Farmers Markets** — `https://seattlefarmersmarkets.org/events` — Squarespace (previously ❌ off-season). Season opens May 2026: Capitol Hill (Sun 11am–3pm), West Seattle (Sun 10am–2pm), plus Magnolia/Columbia City/Phinney/Lake City markets in summer. Verify: `?format=json`. Tags: FarmersMarket, Community, Food — **Upgraded 2026-05-01**

**Seattle Public Theater** — `https://www.seattlepublictheater.org/current-season` — Green Lake Bathhouse — Note: may not work with SquarespaceRipper (page vs events collection)

**Skylark Cafe** — `https://www.skylarkcafe.com/calendar` — 3803 Delridge Way SW — Tags: Music, West Seattle — Note: site is on **Webflow** (not Squarespace); uses Eventbrite for ticketed events — need to find correct Eventbrite organizer ID or write custom scraper

### Ticketmaster (built-in type)

**Seattle Thunderbirds** — `https://chl.ca/whl-thunderbirds/schedule/` — accesso ShoWare Center, Kent — Tags: Sports — Note: Kent is outside Seattle city limits

### WordPress / Tribe Events ICS

**The Rendezvous** — `https://www.therendezvous.rocks/calendar/` — WordPress + Tribe Events (confirmed by URL structure). Historic Belltown arts venue at 2322 2nd Ave — comedy, music, burlesque, theater. Confirmed active with April 2026 events. ICS: `https://www.therendezvous.rocks/?post_type=tribe_events&ical=1&eventDisplay=list`. Tags: Music, Comedy, Nightlife, Belltown — **New 2026-05-01**

**New Tech Northwest** — `https://www.newtechnorthwest.com/events/` — WordPress + Tribe Events. Monthly tech meetups for Seattle's 60k+ member tech community. Also on Luma. ICS: `https://www.newtechnorthwest.com/?post_type=tribe_events&ical=1&eventDisplay=list`. Tags: Community, Education — **New 2026-05-01**

**SeattleDances** — `https://seattledances.com/events/` — ICS feed confirmed working at `?post_type=tribe_events&ical=1&eventDisplay=list` (30 events). Tags: Dance, Arts — **New 2026-04-22**

**Rat City Roller Derby** — `https://ratcityrollerderby.com/events/` — try `?post_type=tribe_events&ical=1` — Tags: Community, Sports

**Theatre Off Jackson** — `https://theatreoffjackson.org/event-calendar/` — try `?post_type=tribe_events&ical=1` — 409 7th Ave S — Tags: Theatre, International District

~~**Book Larder** — `https://booklarder.com/collections/evey-events` — Shopify store (events as products) — 4252 Fremont Ave N — Tags: Books, Food, Fremont — Shopify products.json API confirmed working~~

**Cannonball Arts Center** — `https://cannonballarts.com/cba-events/` — WordPress with custom `cba-event` REST API (`/wp-json/wp/v2/cba-event`) — **REST API confirmed working 2026-04-24** (previously 503). 6 events. Would need custom ripper for `cba-event` post type (dates in content HTML, not ACF fields). Tags: Arts, Belltown — New venue from Bumbershoot producers

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

**Woodland Park Zoo** — `https://zoo.org/events/` — Tribe Events ICS ✅ (~30 events: ZooTunes concerts, animal encounters, dining) — Tags: Community, Family, Music

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

**University Book Store / Barnes & Noble University District** — `sources/university_book_store` — Eventbrite organizer `30331909434` — 4324 University Way NE, Seattle — Tags: Books, University District

**Laughs Comedy Club** — `sources/laughs_comedy` — Eventbrite — 5220 Roosevelt Way NE — Tags: Comedy, University District

**CSz Seattle (ComedySportz)** — `sources/csz_seattle` — Eventbrite — 3509 Fremont Ave N — Tags: Comedy, Fremont

**Club Comedy Seattle** — `sources/club_comedy` — Eventbrite — 2100 Harvard Ave E — Tags: Comedy, Capitol Hill

**Third Place Books** — `sources/third_place_books` — Eventbrite — multi-location — Tags: Books, Education

**Jet City Improv** — `sources/jet_city_improv` — Eventbrite — 5031 University Way NE — Tags: Comedy, Theatre, University District

**Volunteer Park Trust** — `sources/volunteer_park_trust` — Squarespace — Volunteer Park, 1247 15th Ave E — Tags: Community, Parks, Capitol Hill — PR #201

**The Royal Room** — `sources/royal_room` — WP Event Manager RSS + JSON-LD per-page — 5000 Rainier Ave S, Columbia City — Tags: Music, Columbia City

**Book Larder** — `sources/book_larder` — Shopify products.json API — 4252 Fremont Ave N, Fremont — Tags: Books, Food, Fremont

**Populus Seattle** — `sources/external.yaml` — Tribe Events ICS — 100 S King St, Pioneer Square — Tags: Nightlife, Music, Downtown — PR #240

**Earshot Jazz** — `sources/external.yaml` — Tribe Events ICS (`earshot.org`) — Seattle jazz nonprofit, 100+ concerts/year at venues throughout Seattle — Tags: Music — Added 2026-05-01, CI confirmed events ✅

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
| `external-seattledances` | ICS was confirmed working 2026-04-22 (30 events) but now 0 events in production — may be intermittent or feed broken again | Investigate |
| `external-urban-league-seattle` | ICS was confirmed working 2026-04-27 (6+ events) but now 0 events — may be feed issue | Investigate |
| `crocodile-crocodile-madame-lous` | Crocodile sub-venue, currently no listings | Monitor |
| `seatoday-seatoday-nightlife` | seatoday nightlife calendar, 0 events — may be no upcoming nightlife events | Monitor |
| `tag-dance` | Dance tag aggregate shows 0 — likely caused by `external-seattledances` being empty | Resolve seattledances issue |

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
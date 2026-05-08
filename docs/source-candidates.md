# 206.events Source Candidates

Per-candidate triage data lives one-file-per-candidate under
[`source-candidates/`](./source-candidates/). See its
[README](./source-candidates/README.md) for the file layout and frontmatter
schema. **New candidates go in that directory**, not in this file.

This file is now log-only — it preserves:
- the chronological **Discovery Log** the daily skill appends to, and
- a few static reference tables (Dead Source Investigation, etc.) that
  don't have the per-entry conflict pattern that motivated the split.

Strikethrough entries in the status sections below are historical
markers of removed candidates and are kept here for searchability.

## Discovery Log

### 2026-05-07 — Source discovery: UW Trumba, Outdoors/Seasonal, Performing Arts, Art Book Fair
- ✅ **UW Information School** (Trumba `sea_info`) — Same Trumba platform as 4 existing working UW sources (`sea_campus`, `sea_music`, `sea_art`, `sea_essuw`). Added as `sources/external/uw-information-school.yaml`. Tags: Education, Tech, University District.
- ✅ **UW College of Arts & Sciences** (Trumba `sea_artsci`) — Same Trumba platform as existing working UW sources. Added as `sources/external/uw-college-of-arts-sciences.yaml`. CI confirmed 100 events. Tags: Arts, Education, University District. (was PR #268)
- ✅ **Emerald City Comedy Club** — Already implemented in `sources/emerald_city_comedy/`. Status flipped candidate → added in `docs/source-candidates/emerald-city-comedy-club.md`. (was PR #268)
- ✅ **Seattle Art Book Fair** — Cargo.site, custom HTML ripper. Annual free festival at Washington Hall (Central District). `expectEmpty: true` between annual events. Added as `sources/seattle_art_book_fair/`. Tags: Books, Arts, Central District. (was PR #267)
- ❌ **Theatre Off Jackson** (correcting duplicate) — Previously confirmed ❌ on 2026-04-23: uses `venture-event-manager` plugin, no working ICS export.
- 💡 **Seafair** — Seattle's summer event series (Torchlight Parade, Hydroplane races, Fleet Week, Summer Music Series). `seafair.org/events/`. Custom CMS, custom HTML scraper required. Tags: Community, Music. (was PR #268)
- 💡 **The Rendezvous** (status update) — `rendezvous.squarespace.com` confirmed indexed by Google, suggesting possible Squarespace migration from WordPress.
- 💡 **Visit Seattle (RSS)** — `visitseattle.org/events/feed/`. Working RSS 2.0 but only 10 curated events. Would need an RSS adapter. Tags: Community, Events. (was PR #267)
- ❌ **Seattle Chamber Music Society** — `seattlechambermusic.org/calendar/`. Salesforce ticketing; multi-location venue (some Eastside). Low priority. (was PR #268)

### 2026-05-06 — Source discovery: Markets (prompted by 5/16 Seattle Art Market flyer)
- ❌ **Sugar Metal Customs** — SLC-based metal-art studio doing guest welding workshops in Seattle. WordPress; `/events/` and `/workshops/` both 404. Their Seattle pop-ups surface via the venues that host them. Not viable as a standalone source. (was PR #263)
- 💡 **Seattle Makers** — Seattle makerspace running EventPrime WP plugin. ICS export disabled; RSS lacks event dates; `/wp-json/` 401-walled; list page renders via AJAX. Custom scraper required. (was PR #263)
- 💡 **Big Whale Consignment** — Recurring Sat/Sun Artist & Makers Market, EverOut-tracked. Likely Shopify — try `/products.json` first. Tags: MakersMarket, Arts. (was PR #263)
- 🔍 **Pioneer Square Market** — `pioneersquaremarket.net/markets` returned 403 from sandbox; live status TBD. (was PR #263)
- ❌ **Seattle Local Markets** (Magnolia Flea, Fremont Night Market) — no ICS/RSS/API; site directs visitors to socials only. Not viable. (was PR #263)

### 2026-05-06 — Source discovery: Theatre, LGBTQ/Nightlife, Breweries, Community
- ✅ **a/stir** — 818 E Pike St, Capitol Hill. Bar/restaurant/event space. Regular jazz nights, open mic, trivia. Uses SpotHopper for events (not Squarespace despite Squarespace hosting). Added as SpotHopper ripper in `sources/a_stir/`; no proxy needed. PR #264, post-merge tweak in PR #266. Tags: Music, OpenMic, Capitol Hill.
- 💡 **Julia's on Broadway / Le Faux** — Drag dinner theater at 300 Broadway E, Capitol Hill. Weekly shows (Fri/Sat evenings, Sat/Sun brunch). Eventbrite organizer `80473185523` (3 upcoming listed) but primarily uses SimpleTix (`lefauxproductions.simpletix.com`). Need to check SimpleTix API. Tags: Nightlife, Capitol Hill.
- ❌ **Abbey Arts / Fremont Abbey** — Eventbrite organizer `11933347765`. Only 1 upcoming event currently. Insufficient volume. Tags: Music, Fremont.
- ❌ **Pike Place Market (Eventbrite)** — Eventbrite organizer `18639581077`. Only 2 upcoming events. Too low volume for a dedicated source. Tags: Community, Pike Place.
- ❌ **Seattle Art Fair** — One-time annual event (July 23–26, 2026), not an ongoing source. Not viable.
- 🔍 **All sandbox web requests blocked** — curl/WebFetch returns `x-deny-reason: host_not_allowed` for all outbound URLs in this environment. This is a sandbox-level restriction; CI (GitHub Actions) is unaffected. Sites confirmed live via WebSearch.

### 2026-05-03 — Source discovery: Food/Drink, Arts, Outdoors
- ✅ **Henry Art Gallery** — Eventbrite organizer `775590393`, 5 upcoming events (May–June 2026). Contemporary art museum on UW campus. Tags: Arts, Museums, University District. Implementing in this PR.
- ✅ **Cannonball Arts Center** — WordPress custom REST API (`/wp-json/wp/v2/cba-event`). New Belltown venue from Bumbershoot producers at 1930 3rd Ave. Custom ripper parses dates from content HTML. Tags: Arts, Belltown. `expectEmpty: true` since venue is still building programming.
- ❌ **The Triple Door** — Bandzoogle site, returns 403 from sandbox. Bandzoogle has no structured API. Not viable.
- ❌ **Museum of Flight** — Custom CMS (no Eventbrite/ICS). Located at 9404 E Marginal Way S (Tukwila, outside Seattle). Not viable.
- ❌ **Jazz Alley** — Custom JSP calendar, no ICS/Eventbrite found. Bandsintown/Songkick listings only (aggregators, not primary sources). Not viable with built-in rippers; would need custom JSP scraper.
- 💡 **Seattle Mountaineers** — Custom CMS at mountaineers.org, individual events have iCal download links but no bulk ICS feed. Would need custom scraper. Tags: Outdoors, Community.

### 2026-05-01 — Source discovery: Comedy, Festivals, Bookstores, Jazz/Music
- ✅ **Earshot Jazz** — WordPress Tribe Events ICS (`https://www.earshot.org/?post_type=tribe_events&ical=1&eventDisplay=list`). 100+ concerts/year at venues throughout Seattle. Added to `sources/external.yaml`. Tags: Music.
- ✅ **Couth Buzzard Books** — Uses StyledCalendar (not plain Squarespace) at 8310 Greenwood Ave N, Greenwood. Open mic (Wed), live music (Fri–Sat), kids story time. Added as StyledCalendar ripper in PR #246. Tags: Books, Music, Greenwood.
- 💡 **Seattle Farmers Markets** — Squarespace (seattlefarmersmarkets.org). Note: Squarespace `?format=json` returns 0 events — standard SquarespaceRipper does not work for this site. Existing `recurring.yaml` entries already cover these markets. Not viable as a dedicated source.
- 💡 **The Rendezvous** — Previously flagged as dead (2026-04-22), confirmed active with April 2026 events. WordPress + Tribe Events. 2322 2nd Ave, Belltown. Note: ICS returns 0 bytes and HTTP 403 from CI IPs — external ICS feeds don't support proxy. Not currently addable.
- ❌ **New Tech Northwest** — newtechnorthwest.com. WordPress + Tribe Events. Content is 100% spam/marketing, not real community events. Not viable.

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
- ❌ **Seattle Farmers Markets (seattlefarmersmarkets.org)** — Squarespace `?format=json` returns 0 events even in-season. SquarespaceRipper not viable; existing recurring.yaml entries already cover these markets.
- ❌ **Queen Anne Farmers Market** — Not standard Squarespace events JSON. Market schedule info only. Not viable.

### 2026-05-05 — Re-enable seattle-artists-art-walks investigation + new candidates
- ❌ **SeattleArtists.com Art Walks** (`seattle-artists-art-walks`) — Re-enable attempted (was PR #260) but CI confirmed ICS returns 0 events. Catch-22: browser UA → 200 + HTML (0 events); non-browser UA → 406. Chrome User-Agent fix landed in `lib/calendar_ripper.ts` for benefit of other sources. Source re-disabled with updated notes. Try `/calendar/?ical=1` as alternative URL next cycle.
- 💡 **United Indians of All Tribes / Daybreak Star** — WordPress + The Events Calendar at unitedindians.org. Multiple 2026 events confirmed (Indian Days Powwow, Art Market, monthly 5K runs, Gala). 5011 Bernie Whitebear Way NW (Discovery Park). On reverify: already implemented in `sources/external/united-indians-daybreak-star.yaml`. Tags: Community, Parks.

### 2026-05-05 — Source discovery: LGBTQ, Dance, Outdoors, Breweries
- 🔍 **UW Libraries Seattle** — Trumba ICS (`sea_lib.ics`) attempted but removed: could not verify events from sandbox (all Trumba fetches blocked). CI build fails on new zero-event sources. Moved back to 💡 Candidate pending out-of-band verification.
- 💡 **Swing It Seattle** — Lindy Hop/swing dance org at swingitseattle.com. Regular socials at South Park Hall and Russian Community Center. Has calendar at `/calendar`. Platform unknown (sandbox blocked). Tags: Dance.
- 💡 **Queer/Bar** — LGBTQ venue at 1426 Broadway, Capitol Hill. Regular drag shows, DJ nights. Events at thequeerbar.com/calendar. Uses Fever for ticketing. Platform (Squarespace vs Webflow) unknown. Tags: Nightlife, Capitol Hill.
- 💡 **Elliott Bay Brewing** — Seattle brewery with West Seattle (4720 California Ave SW) and SoDo locations. Has events page (karaoke, trivia, tastings, community nights). Platform unknown. Tags: Beer, West Seattle.
- ❌ **MOHAI** — Already in `sources/external.yaml` as `mohai` (Tribe Events ICS). No action needed.
- ❌ **Rat City Roller Derby** — Calendar page appears password-protected. ICS endpoint likely returns HTML (previously noted). Not viable without direct verification.
- ❌ **Uplift Climbing** — Returns 403 from sandbox and WebFetch. Cloudflare-protected. Not viable.

### 2026-05-05 — Source discovery: Seattle Tech Event Aggregators
- ✅ **GeekWire** (`Geekwire` in external.yaml) — Already existed; added `Tech` tag so events flow into aggregate calendars. Also fixed external calendar fetcher to send browser User-Agent header.
- ❌ **ctrlaltcreate.live** — Uses Luma platform. No free ICS feed (Luma Plus paid API required). Monthly in-person + weekly livestream AI/vibe coding events hosted at "Foundations" (1605 Boylston Ave, Capitol Hill). Not addable without paid Luma API key or direct organizer partnership.
- ❌ **IEEE Seattle Section** (`ieee-seattle.org/calendar/?ical=1`) — ICS works, but events span well beyond Seattle: Vancouver BC, California, Everett, Ellensburg, mostly virtual. Not a good fit for a Seattle-focused site.
- ❌ **WTIA** (`washingtontechnology.org/events-calendar/?ical=1`) — CAPTCHA-protected (sgcaptcha). Cannot fetch programmatically. Not viable.
- ❌ **Calagator** — Portland-only tech calendar. Not relevant.
- ❌ **Luma Seattle tech calendars** (SeattleJS, YoungTech Seattle, Seattle AI Week, DWeb Seattle) — No free ICS feeds; Luma Plus paid API required. Not addable.
- ❌ **Startup Grind Seattle** — Bevy platform, low event volume (~1/month), no ICS. Not viable.
- ❌ **Meetup.com** — Removed free ICS feed years ago. Not viable.

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

### 2026-05-08 — Source discovery: Beacon Hill Markets (prompted by Beacon Arts flyer)
- ✅ **Beacon Arts Street Fairs** — Free monthly street fair on Beacon Hill (Roberto Maestas Festival Street + Light Rail Plaza + Plaza Roberto Maestas). 2nd Saturday, May–Sep, 11am–5pm. Site is Wix with no ICS/API; added as `sources/recurring/beacon-arts-street-fairs.yaml` with `months: [5,6,7,8,9]`. Tags: MakersMarket, Community, Beacon Hill.

---

## 💡 Candidate

_Per-candidate files now live under [`source-candidates/`](./source-candidates/). Strikethrough entries below are historical records of removed candidates._

### ICS Feeds (add to `sources/external.yaml`)

~~**MOHAI**~~ — Already in `sources/external.yaml` as `mohai` (ICS: `?post_type=tribe_events&ical=1&eventDisplay=list`) — No action needed.

### Squarespace (built-in type)

~~**Couth Buzzard Books**~~ — Added as StyledCalendar ripper in PR #246 (not plain Squarespace — uses StyledCalendar widget)

### Ticketmaster (built-in type)

### WordPress / Tribe Events ICS

### Custom HTML/JSON Scraping

~~**Henry Art Gallery**~~ — Added as Eventbrite ripper (organizer `775590393`) — see ✅ Added section

---

## ✅ Added

_Per-candidate files now live under [`source-candidates/`](./source-candidates/). Strikethrough entries below are historical records of removed candidates._

---

## ⚙️ Requires Proxy

_Per-candidate files now live under [`source-candidates/`](./source-candidates/). Strikethrough entries below are historical records of removed candidates._

Sources confirmed live but blocked from GitHub Actions IPs. Implemented with `proxy: "outofband"` — event counts verified from outofband build logs, not PR preview.

---

## ⏸️ Blocked

_Per-candidate files now live under [`source-candidates/`](./source-candidates/). Strikethrough entries below are historical records of removed candidates._

---

## ❌ Not Viable

_Per-candidate files now live under [`source-candidates/`](./source-candidates/). Strikethrough entries below are historical records of removed candidates._

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
| `seattle-artists-art-walks` | Catch-22: browser UA returns 200 + 0 events (likely HTML redirect); non-browser UA returns 406. Site is active but ICS export appears blocked/broken. Try `/calendar/?ical=1` as alternative URL next cycle. |
| `washington-ensemble-theatre` | ai1ec plugin, needs investigation |
| `iloveseattle-community` | Never confirmed working |

### Confirmed 410 Gone (do not re-attempt)

`seattlegov-parks`, `seattlegov-neighborhoods`, `seattlegov-outreach`, `seattlegov-arts`, `seattlegov-recreation`, `seattle-university`, `seattle-pacific-university`, `cornish`, `spl-events`, `seattle-public-library`
# Calendar Source Ideas

Potential Seattle-area calendar sources to add in the future, organized by integration method.

## Disabled Sources (Investigate to Re-enable)

These sources have existing ripper configurations but are currently disabled. They should be investigated periodically to see if they can be re-enabled.

### AXS Venues — Cloudflare Bot Protection

**Status:** All 4 AXS venue rippers are disabled. The project has an authenticated Lambda proxy (`infra/authenticated-proxy/`) designed to bypass IP-based blocking from GitHub Actions runners, but **the current proxy endpoint is also blocked by Cloudflare's bot protection**. Re-enabling these requires either:
- A proxy solution that can pass Cloudflare's bot challenge (e.g., a residential proxy service, or a headless browser behind the Lambda)
- Finding an alternative data source for AXS events (e.g., Songkick, Bandsintown, or the venue's own website)
- AXS publishing a public API or calendar feed

| Ripper | Venue | venueId | Tags |
|--------|-------|---------|------|
| `5thavenue` | The 5th Avenue Theatre | 133070 | Theatre, Downtown |
| `barboza` | Barboza | 124813 | Music, Capitol Hill |
| `clockout_lounge` | Clock-Out Lounge | 128701 | Music, Beacon Hill |
| `neumos` | Neumos | 102495 | Music, Capitol Hill |

**Note:** Clock-Out Lounge also has an ICS feed in `external.yaml` (`clock-out-lounge`) that uses Tribe Events — this is an alternative path that doesn't need AXS at all.

### AMC Theatres — Cloudflare Bot Protection

**Status:** Disabled. Same Cloudflare issue as AXS. Uses a custom GraphQL ripper against `graph.amctheatres.com/graphql`.
- **Calendars:** AMC Pacific Place 11, AMC Oak Tree 6
- **Tags:** Movies
- **Investigation:** AMC's GraphQL API is behind aggressive bot protection. Alternative approaches: RSS feeds, third-party movie listing APIs (e.g., Fandango, Google Movies), or a headless browser proxy.

### Seattle Night Market (206 Night Markets) — 404

**Status:** Disabled. The Squarespace events page at `https://206nightmarkets.com/events` returns 404.
- **Tags:** Community, Food
- **Investigation:** Check if the site has restructured (new events URL), moved to a different platform, or shut down. The same organizer runs the Seattle Street Food Festival — check `https://206nightmarkets.com` for current event listings.

### External ICS Feeds — Various Failures

These external calendars in `sources/external.yaml` are disabled due to endpoint issues:

| Name | Issue | Investigation |
|------|-------|---------------|
| `nwtheatre` | HTTP 403 Forbidden | NWTheatre.org uses the All-in-One Event Calendar (ai1ec) WordPress plugin. The ICS export endpoint may have been restricted or the plugin removed. Check if the site still has a calendar and look for alternative export options. |
| `transit-riders-union` | Returns HTML instead of ICS | The `?rhc_action=get_icalendar_events` endpoint is broken. Check if they've switched calendar plugins or if a Tribe Events ICS feed is available instead. |
| `comedy-underground` | HTTP 200 with empty body | Tribe Events ICS endpoint returns no data. May indicate no events are listed, or the plugin is misconfigured. Alternative: investigate TicketWeb (orgId `17593`) as a data source. |
| `gba-georgetown` | HTTP 503 | Site was down during testing. Retry periodically — may be a temporary hosting issue. Georgetown has an active arts community so this is worth re-checking. |
| `seattle-artists-art-walks` | HTTP 406 without browser User-Agent | Tribe Events ICS endpoint requires a browser-like `User-Agent` header. Could be fixed by adding custom headers via the proxy, or by using `proxy: true` with appropriate header injection. |
| `climate-pledge-arena` | HTTP 503 | Site has bot protection. This is a major venue (Seattle Kraken, concerts). Alternative: Ticketmaster ripper already covers Climate Pledge Arena via `climate_pledge_arena` ripper (also a Ticketmaster type). Check if that ripper is working. |
| `iloveseattle-community` | Unverified feed | Never confirmed working. Test the ICS URL and enable if valid. |
| `washington-ensemble-theatre` | ai1ec plugin, needs investigation | Uses All-in-One Event Calendar plugin. Test if the ICS endpoint works with proper headers. Small experimental theater — low event volume. |

## ICS Feeds (Add to external.yaml)

### Trumba Calendars

Trumba is a calendar platform used by the City of Seattle, Seattle Public Library, and the University of Washington. All feeds follow the pattern `https://www.trumba.com/calendars/<webname>.ics`. The city-wide Seattle.gov calendar (`seattlegov-city-wide`) is already implemented. The following sub-calendars are confirmed working (HTTP 200, `BEGIN:VCALENDAR`).

---
**Other confirmed-valid UW Trumba feeds** (lower priority — primarily academic/internal audiences):
- `sea_artsci` — UW College of Arts & Sciences (lectures, prospective student sessions)
- `sea_info` — UW Information School (program info sessions)
- `sea_lib` — UW Libraries Seattle (exhibitions, open scholarship workshops)
- `sea_law` — UW School of Law (seminars, public lectures)
- `sea_foster` — UW Foster School of Business (MBA events)
- `sea_nursing` — UW School of Nursing (DEI events, seminars)
- `sea_essuw` — UW Sustainability (environmental seminars)
- `sea_comp_lit` — UW Cinema & Media Studies (film screenings, talks)
- `sea_evans-hub` — UW Evans School Community Hub (public policy events)

**Confirmed 410 Gone** (do not attempt): `seattlegov-parks`, `seattlegov-neighborhoods`, `seattlegov-outreach`, `seattlegov-arts`, `seattlegov-recreation`, `seattle-university`, `seattle-pacific-university`, `cornish`, `spl-events`, `seattle-public-library`.

---

## APIs (Needs API Key or Custom Ripper)

### Songkick API
- **Docs:** https://www.songkick.com/developer
- **Auth:** API key
- **Tags:** Music
- **Note:** Supports venue-based queries. Could pull events for specific Seattle venues.

### Seattle Public Library (LibCal API)
- **URL:** https://calendar.spl.org/event-calendar
- **API:** LibCal REST API v1.1 at `https://calendar.spl.org/1.1/`
- **Platform:** Springshare LibCal (calendar.spl.org); also uses Trumba on spl.org/event-calendar
- **Tags:** Community, Education
- **Note:** Free events across 27 branches — author talks, story times, classes, film screenings, concerts. LibCal has a documented REST API with structured endpoints. High event volume. **Simpler alternative:** the Trumba ICS feed (`https://www.trumba.com/calendars/kalendaro.ics`, `webName: "kalendaro"`) is confirmed working and ready to add to external.yaml — see the ICS Feeds section above.

### Do206 (Algolia Search API)
- **URL:** https://do206.com/events
- **Platform:** Ruby on Rails with Algolia search
- **Tags:** Community, Music, Arts
- **Note:** Seattle's major event discovery platform. Uses Algolia with separate indexes for bands, venues, events, and users. The Algolia search API keys may be extractable from the page JavaScript, enabling direct queries of the events index. Could be a comprehensive aggregator source.

### SeattleFoodTruck.com (Undocumented API)
- **URL:** https://www.seattlefoodtruck.com/schedule/westlake-park
- **Platform:** Ruby on Rails
- **Tags:** Food
- **Note:** Comprehensive food truck schedule covering 500+ trucks across 675+ locations. Has an undocumented API reverse-engineered by the `seattle-food-truck` Python package on PyPI (https://github.com/clintval/seattle-food-truck). Provides location discovery and schedule queries.


## New Tags Needed

Several venues below would benefit from new tags in `lib/config/tags.ts`:
- **`Comedy`** — for comedy clubs and improv theaters (Laughs, CSz, Club Comedy, Emerald City, Jet City, Here-After)
- **`Books`** — for bookstores with author events (Third Place Books, Ada's, University Book Store)
- **`Gaming`** — for board game cafes and gaming conventions (Mox Boarding House, ECCC, PAX West)
- **`Outdoors`** — for outdoor recreation organizations (The Mountaineers)

## Eventbrite Rippers (Use Built-in Eventbrite Type)

These venues have confirmed Eventbrite organizer pages and can use the built-in `eventbrite` ripper type.

### Comedy Venues

#### Laughs Comedy Club
- **URL:** https://laughscomedyclub.com/
- **Eventbrite organizer ID:** `29222289085` (~30 upcoming events)
- **Address:** 5220 Roosevelt Way NE, Seattle, WA 98105
- **Tags:** Nightlife (needs new `Comedy` tag — add to `tags.ts`)
- **Note:** Wed-Sat shows, 200-capacity. Also on AXS. Strong candidate — high event volume.

#### CSz Seattle / ComedySportz
- **URL:** https://cszseattle.com/
- **Eventbrite organizer ID:** `18822177366` (~10 upcoming events)
- **Address:** 3509 Fremont Ave N, Seattle, WA 98103
- **Tags:** Nightlife, Fremont (needs new `Comedy` tag)
- **Note:** Competitive improv comedy since the 90s. Located in Fremont.

#### Club Comedy Seattle
- **URL:** https://do206.com/venues/club-comedy-seattle
- **Eventbrite organizer ID:** `18936516174` (~5 upcoming events)
- **Tags:** Nightlife, Capitol Hill (needs new `Comedy` tag)
- **Note:** Boutique comedy venue. No dedicated website; events via Eventbrite.

### Entertainment & Nightlife

#### Can Can Culinary Cabaret
- **URL:** https://thecancan.com
- **Eventbrite organizer ID:** `33221255261` (~20 upcoming events)
- **Address:** 95 Pine St, Seattle, WA 98101 (Pike Place Market)
- **Tags:** Arts, Nightlife
- **Note:** 120-seat dinner theater, cabaret shows. 20 years running. French-inspired cuisine.

### Bookstores & Community

#### Third Place Books
- **URL:** https://www.thirdplacebooks.com/events
- **Eventbrite organizer ID:** `30353358534` (~40 upcoming events)
- **Locations:** Ravenna (6504 20th Ave NE), Seward Park (5041 Wilson Ave S), Lake Forest Park
- **Tags:** Community (needs new `Books` tag — add to `tags.ts`)
- **Note:** 1,000+ free events/year across 3 locations. Largest author events program in the PNW.

#### Ada's Technical Books & Cafe
- **URL:** https://adasbooks.com/events
- **Eventbrite organizer ID:** (some events on Eventbrite, others only on their site)
- **Address:** 425 15th Ave E, Seattle, WA 98112
- **Tags:** Community, Capitol Hill (needs new `Books` tag)
- **Note:** Regular book clubs (5+), community events. Queer-friendly tech bookstore. May need both Eventbrite and HTML scraping for full coverage.

### Music Venues

#### The Highline
- **URL:** https://www.highlineseattle.com/calendar/
- **Eventbrite organizer ID:** (needs investigation — calendar is Eventbrite-powered)
- **Address:** 210 Broadway Ave E, Seattle, WA 98102
- **Tags:** Music, Capitol Hill
- **Note:** Live music bar, vegan food, 25+ beers. Calendar requires JavaScript. May have intermittent events — use `expectEmpty: true`.

#### High Dive Seattle
- **URL:** https://highdiveseattle.com/e/calendar/
- **Eventbrite organizer ID:** (needs investigation — calendar is Eventbrite-powered)
- **Address:** Fremont neighborhood
- **Tags:** Music, Fremont
- **Note:** Live music venue in Fremont. Calendar requires JavaScript. Note: site also hosts Hidden Hall events (which may already be covered).

## Other Platform-Based Integrations

### DICE Platform

#### Kremwerk + Timbre Room + Cherry Complex
- **URL:** https://www.kremwerk.com/upcoming-events
- **Platform:** Squarespace; also on DICE (dice.fm)
- **Address:** 1809 Minor Ave, Seattle, WA 98101
- **Tags:** Music, Nightlife, Belltown
- **Note:** Queer-owned underground electronic music/drag venue. Three interconnected spaces. Very active calendar. Try DICE ripper first (events confirmed on dice.fm), fall back to Squarespace ripper. Need to determine DICE venue name.

### Ticketmaster Platform

#### Seattle Thunderbirds (WHL Hockey)
- **URL:** https://chl.ca/whl-thunderbirds/schedule/
- **Platform:** Ticketmaster, AXS
- **Address:** accesso ShoWare Center, Kent, WA
- **Tags:** Sports
- **Note:** WHL junior hockey. Home games in Kent (not Seattle proper). Could use existing Ticketmaster ripper type.

### WordPress ICS (Try Tribe Events Endpoint First)

#### Rat City Roller Derby
- **URL:** https://ratcityrollerderby.com/events/
- **Platform:** WordPress (try `?post_type=tribe_events&ical=1`)
- **Tags:** Community, Sports
- **Note:** Season 20, 4 home games at Edmonds CC. Tickets via Zeffy. Low event volume but unique. Try WordPress Tribe Events ICS endpoint first.

#### Theatre Off Jackson
- **URL:** https://theatreoffjackson.org/event-calendar/
- **Platform:** WordPress (try `?post_type=tribe_events&ical=1`)
- **Address:** 409 7th Ave S, Seattle, WA 98104
- **Tags:** Theatre, International District
- **Note:** Affordable rental venue for small arts groups. 140-seat theater. Hosts SPF (Solo Performance Festival) and multiple company productions.

### SeatEngine Platform

#### Emerald City Comedy Club
- **URL:** https://www.emeraldcitycomedy.com/events
- **Platform:** SeatEngine (www-emeraldcitycomedy-com.seatengine.com)
- **Address:** 210 Broadway E, Seattle, WA 98102
- **Tags:** Nightlife, Capitol Hill (needs new `Comedy` tag)
- **Note:** Tue-Sun 6-11 PM, cabaret-style. Full food/drink menu. Investigate whether SeatEngine has an API before falling back to HTML scraping.

## HTML Scraping (Last Resort)

### Theaters

#### ACT Theatre / Union Arts Center
- **URL:** https://acttheatre.org/whats-on/ (redirects to unionartscenter.org)
- **Platform:** WordPress with Avada theme; ticketing at `order.unionartscenter.org`
- **Tags:** Theatre, Downtown
- **Note:** Merged with Seattle Shakespeare Company in 2025 to form Union Arts Center. Five performance venues at 700 Union St. Ticketing platform returned 503 during testing.

#### Intiman Theatre
- **URL:** https://www.intiman.org/2025-26-season/
- **Platform:** WordPress; ticketing via Salesforce Sites
- **Tags:** Theatre, Capitol Hill
- **Note:** Professional theater-in-residence at Seattle Central College. Mainstage at Broadway Performance Hall plus cabaret shows at Erickson Theatre. Show listings with dates embedded in WordPress content.

#### ArtsWest
- **URL:** https://www.artswest.org/calendar/
- **Platform:** WordPress with custom `xdtheme` and `xdgp-calendar` JavaScript component; ticketing via Salesforce Sites
- **Tags:** Theatre, West Seattle
- **Note:** Theater and art gallery in West Seattle Junction. Calendar uses JavaScript rendering — the static season page may be easier to scrape.

#### Seattle Children's Theatre (SCT)
- **URL:** https://www.sct.org/tickets-shows/calendar/
- **Platform:** WordPress with Elementor
- **Tags:** Theatre
- **Note:** One of the nation's largest professional theaters for young audiences at Seattle Center. Structured calendar layout with accessibility flags (ASL, sensory-friendly). WordPress REST API available but no events-specific endpoints found.

#### Village Theatre
- **URL:** https://villagetheatre.org/see-a-show/
- **Platform:** WordPress with custom theme
- **Tags:** Theatre
- **Note:** Leading musical theater in the Pacific Northwest. Two venues in Issaquah and Everett. Shows organized by season with separate dates per venue. Note: not in Seattle proper.

#### Seattle Opera
- **URL:** https://www.seattleopera.org/performances-events
- **Platform:** Custom; ticketing via Tessitura TNEW at `secure.seattleopera.org`
- **Tags:** Arts, Music
- **Note:** Major opera company at Marion Oliver McCaw Hall. Investigate TNEW internal API calls. Also available via McCaw Hall event listings.

#### Pacific Northwest Ballet (PNB)
- **URL:** https://order.pnb.org/events
- **Platform:** WordPress (Avada theme); ticketing via Tessitura TNEW at `order.pnb.org`
- **Tags:** Arts
- **Note:** Major ballet company at McCaw Hall. 100+ performances per year. Also available via McCaw Hall listings.

#### Seattle Public Theater
- **URL:** https://www.seattlepublictheater.org/current-season
- **Platform:** Squarespace; ticketing via Arts-People
- **Tags:** Theatre
- **Note:** Community theater at the historic Green Lake Bathhouse. Explore if Squarespace per-event `?format=ical` links work.

#### Book-It Repertory Theatre
- **URL:** https://book-it.org/
- **Platform:** WordPress; ticketing via Salesforce/Tessitura
- **Tags:** Theatre
- **Note:** Adapts literary works for the stage. Revived after closing in 2023, now producing one show at a time. Low event volume — lower priority.

#### Cornish College of the Arts
- **URL:** https://www.cornish.edu/cornish-college-event-calendar/
- **Platform:** WordPress (custom CMS); no calendar plugin detected; ticketing varies by event
- **Tags:** Arts, Music, Theatre
- **Note:** Art school with public performances, concerts, exhibitions, and visiting artist talks at the Cornish Playhouse at Seattle Center (201 Mercer St) and main campus (2014 9th Ave). September–May season with dozens of free and low-cost events. WordPress REST API exists but no events-specific endpoints; HTML scraping is the most viable route.

#### Jet City Improv
- **URL:** https://www.jetcityimprov.org/calendar.html
- **Platform:** Webflow (main site); ticketing via PatronTicket (Salesforce) at `jetcityimprov.my.salesforce-sites.com/ticket/PatronTicket__PublicTicketApp`; also on Eventbrite (organizer ID `66421638433`, ~10 upcoming events)
- **Tags:** Arts, Nightlife, University District (needs new `Comedy` tag)
- **Note:** Seattle's premier improv comedy theater at 5031 University Way NE, University District. Since 1992. Weekly house ensemble shows plus six improvised plays per year at West of Lenin. **Preferred approach:** Use Eventbrite ripper with organizer `66421638433` instead of HTML scraping.

### Music Venues

#### Nectar Lounge
- **URL:** https://nectarlounge.com/events/calendar/
- **Tags:** Music
- **Note:** WordPress-based. Previously used Eventbrite but now uses Tixr (tixr.com/groups/nectarlounge) for ticketing. Would require Tixr API investigation or HTML scraping.

#### The Triple Door
- **URL:** https://thetripledoor.net/mainstage-calendar and https://thetripledoor.net/mq-stage-calendar
- **Platform:** Bandzoogle; legacy ASP ticketing at `tickets.thetripledoor.net`
- **Tags:** Music, Downtown
- **Note:** 264-capacity dinner theater at 216 Union St. Two stages: Mainstage and Musicquarium (MQ) Lounge. Bandzoogle does not expose calendar APIs.

#### Jazz Alley (Dimitriou's Jazz Alley)
- **URL:** https://www.jazzalley.com/www-home/calendar.jsp
- **Platform:** Java/JSP custom website; blocks requests from cloud/CI IPs with 503
- **Tags:** Music, Belltown
- **Proxy required:** Yes — site returns 503 from GitHub Actions IPs; use `proxy: true` in `ripper.yaml`
- **Note:** Intimate jazz supper club at 2033 6th Ave. Operating since 1979. Low event volume (one artist per multi-day engagement). Old-school JSP site will need the authenticated Lambda proxy to fetch successfully.

#### Columbia City Theater
- **URL:** https://columbiacitytheater.org/
- **Platform:** WordPress; events manually posted
- **Tags:** Music, Community
- **Note:** Historic theater at 4916 Rainier Ave S, now Black-owned. Hosts live music and community events. Low event volume. No calendar plugin detected.

#### Conor Byrne Pub
- **URL:** https://www.conorbyrnepub.com/calendar
- **Platform:** Squarespace
- **Tags:** Music, Ballard
- **Note:** Community co-op venue at 5140 Ballard Ave NW — Ballard's first cooperatively owned music space. Hosts a weekly Sunday open mic (sign-ups 7:30 PM, music 8 PM–1 AM) plus ticketed shows throughout the week. Historically launched acts like The Head and the Heart and Damien Jurado. Squarespace-based — try the `SquarespaceRipper` directly against the calendar page.

#### Skylark Cafe
- **URL:** https://www.skylarkcafe.com/calendar
- **Platform:** Squarespace (`skylarkcafe.squarespace.com`)
- **Tags:** Music, West Seattle
- **Note:** West Seattle venue at 3803 Delridge Way SW. Hosts a weekly Wednesday open mic (sign-up 7:30 PM, music 8:30 PM) with a full backline and 16-track recording available, plus ticketed shows on other nights. Squarespace-based — try the `SquarespaceRipper`. **Caution:** Skylark faces potential displacement due to an incoming Sound Transit light rail station; verify the venue is still operating before implementing.

#### Hidden Door
- **URL:** https://www.hiddendoorseattle.com/
- **Tags:** Music, Capitol Hill
- **Note:** Capitol Hill venue that hosts a weekly Tuesday open mic (8 PM, music and comedy) and a weekly Thursday open mic (7 PM, music and comedy). No calendar platform identified — investigate further. Low-to-medium event volume.

#### Backfire Motobar
- **URL:** https://www.backfiremotobar.com/
- **Tags:** Music, Nightlife
- **Note:** Moto-themed bar at 7701 Aurora Ave N. Hosts "Tune Up Tuesday" weekly open mic (sign-up 7 PM, show 7:30–9:30 PM). All genres welcome: music gets 5–10 min sets; comedy, poetry, and other performers get 5 min sets. 21+, free. Investigate calendar platform — may have structured event listings.

#### The Royal Room
- **URL:** https://theroyalroomseattle.com/
- **Platform:** Unknown (site returned 403 on fetch)
- **Address:** 5000 Rainier Ave S, Seattle, WA 98118
- **Tags:** Music, Columbia City
- **Note:** Live music venue/restaurant/lounge. Jazz, funk, world music. Active 2026 calendar.

#### Central Saloon
- **URL:** https://centralsaloon.com/music-events/
- **Platform:** WordPress (no calendar plugin detected)
- **Address:** 207 First Ave S, Seattle, WA 98104
- **Tags:** Music, Pioneer Square
- **Note:** Seattle's oldest bar (est. 1892), birthplace of grunge. Active music calendar on Bandsintown. Events on their own site may be sparse.

#### Tim's Tavern
- **URL:** https://www.timslivemusic.com/events or https://timslivemusic.com/upcoming-shows
- **Address:** 9655 16th Ave SW, Seattle, WA 98106 (White Center)
- **Tags:** Music, West Seattle
- **Note:** "Together In Music" venue. Relocated from Greenwood (that location is permanently closed). Active concert calendar.

#### Egan's Ballard Jam House
- **URL:** https://www.ballardjamhouse.com/schedule.html
- **Platform:** Custom static site
- **Address:** 1707 NW Market St, Seattle, WA 98107
- **Tags:** Music, Ballard
- **Note:** Intimate jazz venue featured in Atlas Obscura and Earshot Jazz. Small, historic venue with regular jazz shows.

### Dance

#### Whim W'Him Seattle Contemporary Dance
- **URL:** https://whimwhim.org/calendar/
- **Platform:** WordPress or custom CMS
- **Tags:** Arts, Queen Anne
- **Note:** Award-winning contemporary dance company. 3 programs/year at Cornish Playhouse and their own Dance Center. Summer pop-ups in parks. Moderate event volume.

### Gaming

#### Mox Boarding House Seattle
- **URL:** https://www.moxboardinghouse.com/pages/seattle-events
- **Platform:** Shopify-based website
- **Address:** 5105 Leary Ave NW, Seattle, WA 98107
- **Tags:** Community, Ballard (needs new `Gaming` tag — add to `tags.ts`)
- **Note:** Board game cafe/restaurant/retail. Weekly MTG, Pokemon, D&D, Warhammer events. Very high event volume. Investigate Shopify API for structured event data.

### Outdoors

#### The Mountaineers
- **URL:** https://www.mountaineers.org/locations-lodges/seattle-program-center/events
- **Platform:** Custom website
- **Tags:** Community (needs new `Outdoors` tag — add to `tags.ts`)
- **Note:** Pacific Northwest outdoor recreation organization. Hiking, climbing, skiing events. High event volume.

### Bookstores (HTML Fallback)

#### University Book Store
- **URL:** https://ubookstore.com/
- **Address:** 4326 University Way NE, Seattle, WA 98105
- **Tags:** Community, University District (needs new `Books` tag)
- **Note:** Hundreds of author events/year, many free. Oldest independent bookseller in Seattle area (since 1900). Events also listed on Do206 and EverOut.

### Other Venues to Investigate

#### Here-After (at The Crocodile)
- **URL:** https://www.thecrocodile.com/here-after
- **Address:** 2505 1st Ave, Seattle, WA 98121
- **Tags:** Nightlife, Belltown (needs new `Comedy` tag)
- **Note:** 100-seat comedy club, movie theater, and bar. Part of the Crocodile family. Monthly showcases, film series. May already be partially covered by the existing `crocodile` ripper — verify before creating a separate source.

#### Seattle Symphony
- **URL:** https://www.seattlesymphony.org/concerttickets/calendar
- **Tags:** Music, Arts, Downtown
- **Note:** Major classical music institution at Benaroya Hall. Verify whether the existing `benaroya_hall` ripper already covers Symphony events before building a separate one.

### Museums and Venues

#### Woodland Park Zoo
- **URL:** https://zoo.org/events/
- **Platform:** Custom (returns 503); ticketing at `tickets.zoo.org`
- **Tags:** Community
- **Note:** Major seasonal events (WildLanterns, ZooTunes summer concerts, holiday events) plus educational programming. 92-acre zoo with 800+ animals.

#### Seattle Aquarium
- **URL:** https://www.seattleaquarium.org/events/
- **Platform:** Custom CMS
- **Tags:** Community, Museums
- **Note:** Public aquarium on the waterfront with new Ocean Pavilion. After Hours monthly 21+ events, seasonal programs, galas. Uses Eventbrite for some events.

#### Henry Art Gallery
- **URL:** https://henryart.org/programs/all
- **Platform:** Custom website
- **Tags:** Arts, Museums, University District
- **Note:** Free-admission contemporary art museum on the UW campus. Low event volume (exhibitions with occasional programs/talks).

#### National Nordic Museum
- **URL:** https://nordicmuseum.org/calendar
- **Platform:** Unknown (site returned 503); ticketing at `tickets.nordicmuseum.org`
- **Tags:** Museums, Arts, Ballard
- **Note:** Museum in Ballard dedicated to Nordic history, art, and culture. Events include the Mostly Nordic Chamber Music Series, Nordic Sol, Julefest, film screenings, and lectures.

### Community and Cultural Centers

#### Chinatown-International District (CIDBIA) Events
- **URL:** https://www.seattlechinatownid.com/local-events
- **Tags:** Community, International District
- **Note:** Monthly calendar view with expandable event details and "Add to Calendar" buttons. Events include Lunar New Year, Dragon Fest, CID Night Market, CID Block Party. Platform unclear — appears custom-built.

#### Filipino Community of Seattle (FilCom)
- **URL:** https://www.filcommsea.org/upcoming-events
- **Platform:** Wix
- **Tags:** Community
- **Note:** Founded 1935. Community center on MLK Jr. Way S. Events also listed on Eventbrite. Wix sites are heavily JavaScript-dependent — the Eventbrite route may be simpler.

#### Seattle Indian Health Board (SIHB)
- **URL:** https://www.sihb.org/events/
- **Platform:** WordPress (no calendar plugin)
- **Tags:** Community
- **Note:** Events include SpiritWalk & Warrior Run, Family Saturdays, Indigenous People Festival. Events displayed as standard WordPress posts. Low volume.

#### El Centro de la Raza
- **URL:** https://www.elcentrodelaraza.org/
- **Platform:** Likely WordPress (returned 503)
- **Tags:** Community, Beacon Hill
- **Note:** Educational, cultural, and social service agency on Beacon Hill. 43 programs. Also operates Centilia Cultural Center. Needs further investigation when site is accessible.


### Markets and Food

#### Renegade Craft Fair (Seattle)
- **URL:** https://www.renegadecraft.com/events/
- **Platform:** WordPress with Gravity Forms
- **Tags:** MakersMarket
- **Note:** National indie craft fair with Seattle editions at Magnuson Park and Seattle Center. 180+ independent makers. Multiple dates per year (spring, fall/winter). Events organized by season and city.

#### Seattle Uncorked
- **URL:** https://seattleuncorked.com/events/
- **Platform:** Likely WordPress (returned 503)
- **Tags:** Beer, Community
- **Note:** Greater Seattle's largest club for wine, beer, spirits, and cider enthusiasts. Produces wine walks and tasting events across neighborhoods (Ballard, Queen Anne, West Seattle). 15+ events planned for 2026.

#### Woodinville Wine Country Events
- **URL:** https://woodinvillewinecountry.com/events/
- **Platform:** WordPress; also uses Wild Apricot at `woodinvillewinecountry.wildapricot.org/events`
- **Tags:** Community
- **Note:** Aggregated events for 100+ wineries, breweries, and distilleries in Woodinville. SSL issues on fetch. Not Seattle proper but popular day-trip destination.

### Event Aggregators

#### ParentMap (Family Events)
- **URL:** https://www.parentmap.com/calendar
- **Platform:** Drupal CMS
- **Tags:** Community
- **Note:** Pacific Northwest family events resource covering Seattle, Bellevue, Tacoma, Olympia. 50+ pages of family-friendly events with date, time, location, price, and age filters. Investigate Drupal JSON API at `/jsonapi/`.

#### Visit Seattle Events
- **URL:** https://visitseattle.org/things-to-do/events/
- **Platform:** WordPress with Gravity Forms
- **Tags:** Community
- **Note:** Official tourism board events calendar. Community-submitted events. Has search/filter functionality but no structured feed or export. Event data quality may be variable.

#### EverOut Seattle (The Stranger)
- **URL:** https://everout.com/seattle/events/
- **Tags:** Community, Music, Arts, Theatre
- **Note:** Comprehensive curated events calendar from the team behind The Stranger's event listings. Returns 403 on fetch — heavy bot protection. Would require sophisticated anti-bot measures. Low feasibility for scraping.

## Additional Farmers Markets

Add these to `sources/recurring.yaml` using the `"every <day>"` schedule format (see existing farmers market entries for examples). Verify schedules at the URLs below before adding — hours and seasons can change year to year.


## Additional Recurring Events

These are fixed-schedule events that can be added to `sources/recurring.yaml` without needing a ripper.


### Seattle Christmas Market
- **Schedule:** Daily, November 20 - December 24 (annual)
- **Location:** Seattle Center, Fisher Pavilion
- **URL:** https://seattlechristmasmarket.com/
- **Note:** German-inspired Christmas market. 80+ artisan huts. Timed-entry tickets required.

### Bite of Seattle
- **Schedule:** Three days in late July (annual)
- **Location:** Seattle Center
- **URL:** https://biteofseattle.com/
- **Note:** Seattle's largest free-admission food festival. 300+ vendors, live music. Now managed by FoodieLand.

### Seattle Street Food Festival
- **Schedule:** Two days in late August (annual)
- **Location:** South Lake Union
- **URL:** https://206nightmarkets.com
- **Note:** 75+ food trucks across five city blocks. Same organizer as Seattle Night Market.

### PhinneyWood Winter Festival
- **Schedule:** First weekend of December (annual)
- **Location:** Phinney Center
- **URL:** https://www.phinneycenter.org/events/winter-festival/
- **Note:** 140+ local vendors, juried art show, live music. 45+ years running.

### Northwest Folklife Festival
- **Schedule:** Memorial Day weekend (annual, 4 days) — 2026 dates: May 22–25
- **Location:** Seattle Center
- **URL:** https://nwfolklife.org/
- **Note:** Free (donation suggested), 250,000+ attendees. 20+ stages of folk, world music, dance, storytelling. Since 1972. One of the largest community-powered arts events in the US. Add as a recurring annual entry.

### Bumbershoot
- **Schedule:** Labor Day weekend (annual, typically 2–3 days) — check bumbershoot.com for annual dates
- **Location:** Seattle Center
- **URL:** https://bumbershoot.com/
- **Note:** Seattle's iconic summer-ending music and arts festival. Multi-stage event with headliners and local acts. Paid admission. Dates shift year to year; confirm before adding. Add as a recurring annual entry.

### Seattle Art Fair
- **Schedule:** Four days in late July (annual) — 2026 dates: July 23–26
- **Location:** Lumen Field Event Center, 800 Occidental Ave S
- **URL:** https://seattleartfair.com/
- **Note:** Major contemporary art fair with 100+ galleries from around the world. The existing `lumen_field` ripper may pick up ticketed events, but the fair itself is worth a dedicated recurring entry. Add as an annual recurring event.

### Conventions & Major Events

#### Emerald City Comic Con (ECCC)
- **Schedule:** Four days in early March (annual) — 2026 dates: March 5-8
- **Location:** Seattle Convention Center
- **URL:** https://www.emeraldcitycomiccon.com/
- **Tags:** Community (needs new `Gaming` tag)
- **Note:** 90,000+ attendees. Platform: ShowClix for ticketing. Add as annual recurring entry.

#### Sakura-Con
- **Schedule:** Three-four days in early April (annual) — 2026 dates: April 2-5
- **Location:** Seattle Convention Center
- **URL:** https://sakuracon.org/
- **Tags:** Community, Arts
- **Note:** Oldest anime convention in PNW. Add as annual recurring entry.

#### PAX West
- **Schedule:** Four days over Labor Day weekend (annual) — 2026 dates: September 4-7
- **Location:** Seattle Convention Center
- **URL:** https://west.paxsite.com/
- **Tags:** Community (needs new `Gaming` tag)
- **Note:** Major gaming convention. Add as annual recurring entry.

#### Seattle Pride Parade
- **Schedule:** Late June (annual) — 2026 date: June 28
- **Location:** Downtown Seattle along 4th Ave
- **URL:** https://seattlepride.org/events
- **Tags:** Community
- **Note:** 300,000+ attendees. May already have coverage via city calendar — check before adding.

### Neighborhood Festivals

#### Ballard Seafood & Music Fest
- **Schedule:** Three days in mid-July (annual) — 2026 dates: July 10-12
- **Location:** Ballard
- **URL:** https://ballardalliance.com/programs/community-events/
- **Tags:** Music, Food, Ballard
- **Note:** Rebranded from Ballard SeafoodFest. Annual summer festival.

#### Ballard ArtWalk
- **Schedule:** Second Saturday of each month
- **Location:** Ballard neighborhood businesses
- **URL:** https://ballardalliance.com/programs/community-events/
- **Tags:** Artwalk, Ballard
- **Note:** Monthly event since 1997. Businesses host local artists in pop-up galleries.

## Open Mic Nights (Needs Investigation)

These open mics have unknown or unconfirmed schedules. Verify the specific day before adding to `sources/recurring.yaml`.

#### Comedy Underground — Weekly Open Mic
- **Schedule:** Weekly (day TBD — check website)
- **Time:** Evening
- **Location:** 109 S Washington St, Seattle (Pioneer Square) — at Swannies
- **URL:** http://comedyunderground.com/seattle/open_mic.php
- **Tags:** Nightlife, Pioneer Square, OpenMic
- **Note:** Professional and amateur comedians test new material. 3-minute sets. The Comedy Underground also appears in `sources/external.yaml` as a disabled ICS feed (empty body) — the open mic page is a separate HTML page worth investigating as a data source.

#### The Rendezvous — Road Runners Open Mic Comedy
- **Schedule:** Weekly (check Eventbrite for specific day)
- **Location:** The Rendezvous, 2322 2nd Ave, Seattle (Belltown)
- **URL:** https://www.eventbrite.com/o/road-runners-comedy-seattle
- **Tags:** Nightlife, Belltown, OpenMic
- **Note:** Free, friendly weekly comedy open mic. Events listed on Eventbrite — if the organizer ID is consistent, an Eventbrite ripper could pull these automatically.

## Meta-Sources / Aggregators

### Bandsintown API
- **Docs:** https://help.artists.bandsintown.com/en/articles/9186477-api-documentation
- **Auth:** `app_id` parameter
- **Note:** Artist-centric (query by artist, not by venue). Covers many Seattle venues but not ideal for venue-based aggregation.

### Eventbrite API
- **Docs:** https://www.eventbrite.com/platform/api
- **Auth:** OAuth
- **Note:** Could pull events for specific Seattle organizers/venues. Many local organizations use Eventbrite. Known organizer IDs: Substation (`18831550522`), Nectar Lounge (venue group IDs: 2463, 748).

### Washington State Farmers Market Association Directory
- **URL:** https://wafarmersmarkets.org/washingtonfarmersmarketdirectory/
- **Note:** Useful reference for discovering additional markets, but no calendar data itself.

### Squarespace Events-to-ICS Pattern
- **Reference:** https://github.com/hawry/events-are-square
- **Note:** A `SquarespaceRipper` base class has been implemented in `lib/config/squarespace.ts`. Wing Luke, NAAM, JCCCW, LANGSTON, On the Boards, Georgetown Trailer Park Mall, and 206 Night Markets are already using it. Seattle Public Theater uses Squarespace for its site but its `/current-season` page is a regular page (not an events collection), so the SquarespaceRipper cannot be used directly — the ticketing API (Arts-People) would need to be explored instead.

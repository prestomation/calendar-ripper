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
- **Platform:** Webflow (main site); ticketing via PatronTicket (Salesforce) at `jetcityimprov.my.salesforce-sites.com/ticket/PatronTicket__PublicTicketApp`
- **Tags:** Arts, University District
- **Note:** Seattle's premier improv comedy theater at 5031 University Way NE, University District. Since 1992. Weekly house ensemble shows plus six improvised plays per year at West of Lenin. No ICS feed — would require HTML scraping the calendar page or PatronTicket API investigation.

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
- **Platform:** Java/JSP custom website; returned 503 on fetch
- **Tags:** Music, Belltown
- **Note:** Intimate jazz supper club at 2033 6th Ave. Operating since 1979. Low event volume (one artist per multi-day engagement). Old-school JSP site may require specific headers.

#### Columbia City Theater
- **URL:** https://columbiacitytheater.org/
- **Platform:** WordPress; events manually posted
- **Tags:** Music, Community
- **Note:** Historic theater at 4916 Rainier Ave S, now Black-owned. Hosts live music and community events. Low event volume. No calendar plugin detected.

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

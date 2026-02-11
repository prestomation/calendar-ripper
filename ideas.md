# Calendar Source Ideas

Potential Seattle-area calendar sources to add in the future, organized by integration method.

## APIs (Needs API Key or Custom Ripper)

### Ticketmaster Discovery API
- **Docs:** https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
- **Auth:** API key (free tier, 5000 calls/day)
- **Tags:** Music, Theatre, Community
- **Note:** Covers many Seattle venues including Climate Pledge Arena, The Paramount, The Moore, Neptune, McCaw Hall, Benaroya Hall, Chop Suey. Search by city/venue. Well-documented, reliable. A single integration could cover dozens of venues.

### Songkick API
- **Docs:** https://www.songkick.com/developer
- **Auth:** API key
- **Tags:** Music
- **Note:** Supports venue-based queries. Could pull events for specific Seattle venues.

### Seattle.gov Department Calendars (Trumba)
- **Trumba Docs:** https://www.trumba.com/help/api/
- **Parks:** Try `https://www.trumba.com/calendars/seattlegov-parks.ics`
- **Neighborhoods:** Try `https://www.trumba.com/calendars/seattlegov-neighborhoods.ics`
- **Public Outreach:** Try `https://www.trumba.com/calendars/seattlegov-outreach.ics`
- **Note:** The city-wide Trumba calendar is already added (`seattlegov-city-wide`). These are potential subcalendars for more targeted event feeds. The exact calendar web names need to be discovered — inspect the seattle.gov pages for `trumba.com/calendars/<name>` links.

### Taproot Theatre (OvationTix API)
- **URL:** https://taproottheatre.org/
- **API:** OvationTix public REST API — `https://api.ovationtix.com/public/events/client(37019)`
- **API Docs:** https://api.ovationtix.com/public/documentation/index.html
- **Platform:** WordPress; ticketing via OvationTix (AudienceView Professional), client ID `37019`
- **Tags:** Theatre, Greenwood
- **Note:** Community-focused theater in Greenwood. The OvationTix public API returns JSON with events, calendar, and series endpoints. Requires `clientId` header.

### Seattle Public Library (LibCal API)
- **URL:** https://calendar.spl.org/event-calendar
- **API:** LibCal REST API v1.1 at `https://calendar.spl.org/1.1/`
- **Platform:** Springshare LibCal (calendar.spl.org); also uses Trumba on spl.org/event-calendar
- **Tags:** Community, Education
- **Note:** Free events across 27 branches — author talks, story times, classes, film screenings, concerts. LibCal has a documented REST API with structured endpoints. High event volume. The main spl.org page uses Trumba with `webName: "kalendaro"`.

### Do206 (Algolia Search API)
- **URL:** https://do206.com/events
- **Platform:** Ruby on Rails with Algolia search
- **Tags:** Community, Music, Arts
- **Note:** Seattle's major event discovery platform. Uses Algolia with separate indexes for bands, venues, events, and users. The Algolia search API keys may be extractable from the page JavaScript, enabling direct queries of the events index. Could be a comprehensive aggregator source.

### Substation (Eventbrite API)
- **URL:** https://www.substationseattle.com/
- **Eventbrite Organizer ID:** `18831550522` (64 upcoming events)
- **Platform:** WordPress; ticketing via Eventbrite
- **Tags:** Music, Ballard
- **Note:** 150-capacity DIY venue between Fremont and Ballard. Rock, punk, electronic, metal. Best accessed through the Eventbrite API querying organizer `18831550522`.

### The Vera Project (DICE Widget API)
- **URL:** https://theveraproject.org/events/
- **Platform:** WordPress with DICE ticketing widget (partner ID `4b00dde0`)
- **Tags:** Music, Arts
- **Note:** All-ages nonprofit music and arts venue at Seattle Center. ~300 capacity. DICE partner ID and API key are visible in page source. The DICE Event List Widget loads events client-side — the widget API endpoint could potentially be reverse-engineered.

### Sunset Tavern (DICE Widget API)
- **URL:** https://sunsettavern.com/shows/
- **Platform:** WordPress with Elementor; DICE Event List Widget
- **Tags:** Music, Ballard
- **Note:** 200-capacity live music venue in Ballard. Same DICE widget integration as The Vera Project. Hosts local and touring artists 7 days a week.

### SeattleFoodTruck.com (Undocumented API)
- **URL:** https://www.seattlefoodtruck.com/schedule/westlake-park
- **Platform:** Ruby on Rails
- **Tags:** Food
- **Note:** Comprehensive food truck schedule covering 500+ trucks across 675+ locations. Has an undocumented API reverse-engineered by the `seattle-food-truck` Python package on PyPI (https://github.com/clintval/seattle-food-truck). Provides location discovery and schedule queries.

### Hidden Hall (Tixr API)
- **URL:** https://hiddenhall.com/events/calendar/
- **API Docs:** https://tixrapi.docs.apiary.io/
- **Platform:** WordPress with custom "SG Events" plugin; ticketing via Tixr
- **Tags:** Music, Fremont
- **Note:** New music venue in Fremont (replaced High Dive). JSON-LD Event schema present in page markup. Tixr has a documented API. Active venue with a packed schedule.

## HTML Scraping (Last Resort)

### Theaters

#### NWTheatre.org Regional Theatre Calendar
- **URL:** https://www.nwtheatre.org/calendar/
- **Tags:** Theatre
- **Note:** Most comprehensive regional theatre calendar covering King, Pierce, Snohomish, Thurston, and Kitsap counties. Categories include Theatre, Comedy, Dance, Outdoor Shows. No ICS or API found.

#### The 5th Avenue Theatre
- **URL:** https://www.5thavenue.org/shows/
- **Platform:** Umbraco (.NET CMS); ticketing via Tessitura TNEW at `my.5thavenue.org`
- **Tags:** Theatre, Downtown
- **Note:** Premier musical theater venue downtown. Broadway-scale musicals and touring shows. Events page loads dynamically via JavaScript (Tessitura TNEW v7.77.0.3). Could investigate TNEW internal API calls. STG also presents shows here, so some events may be covered by Ticketmaster API.

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

### Music Venues

#### The Crocodile / Madame Lou's
- **URL:** https://www.thecrocodile.com/
- **Tags:** Music, Belltown
- **Note:** Showtime CMS / AXS platform. Ticketing through TicketWeb (venue ID: 10352). Madame Lou's (300-capacity, 2505 1st Ave) is part of the same site. Could potentially use TicketWeb API instead of scraping. Events also on Ticketmaster/Live Nation.

#### Tractor Tavern
- **URL:** https://tractortavern.com/
- **Tags:** Music, Ballard
- **Note:** No ICS or API. Event listing on homepage.

#### Nectar Lounge
- **URL:** https://nectarlounge.com/events/calendar/
- **Tags:** Music
- **Note:** WordPress-based, uses Eventbrite for listings (venue group IDs: 2463, 748). Could use Eventbrite API instead of scraping.

#### 19hz.info Electronic Music Events
- **URL:** https://19hz.info/eventlisting_Seattle.php
- **Reference:** https://github.com/19hz/19hz-map (third-party scraper for this data)
- **Tags:** Music
- **Note:** Plain HTML listing of electronic music events. Has SSL issues. The 19hz-map project may be useful reference for parsing the HTML structure.

#### Chop Suey
- **URL:** https://chopsuey.com/calendar/
- **Platform:** WordPress with TicketWeb integration and FullCalendar.js
- **Tags:** Music, Capitol Hill
- **Note:** 500-capacity nightclub on Capitol Hill. Event data stored in a JavaScript `all_events` array with JSON-LD schema markup — relatively easy to parse. TicketWeb is a Ticketmaster subsidiary so Ticketmaster API may also cover this venue.

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

#### Seattle Center Event Calendar
- **URL:** https://www.seattlecenter.com/events/event-calendar
- **Tags:** Arts, Community
- **Note:** Custom-built calendar with no export or API. Would require scraping dynamic content. jQuery-based with custom event filtering.

#### Seattle Art Museum (SAM)
- **URL:** https://www.seattleartmuseum.org/whats-on/events
- **Platform:** Kirby CMS with custom JavaScript filtering
- **Tags:** Arts, Museums
- **Note:** Three locations: SAM downtown, Seattle Asian Art Museum, Olympic Sculpture Park. Events have structured `data-attributes` (data-end-date, data-location, data-category, data-audiences) on HTML article elements, making scraping more straightforward.

#### Museum of Pop Culture (MoPOP)
- **URL:** https://www.mopop.org/events
- **Platform:** Webflow CMS with FullCalendar 6.1.19
- **Tags:** Museums, Arts, Community
- **Note:** Major museum at Seattle Center. JSON-LD Event schema present. Interestingly hosts pricing data as JSON on GitHub (`Marketing-Ops-MOPOP/ticket-prices`). May be accessible via Webflow `?format=json` convention.

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

#### Benaroya Hall / Seattle Symphony
- **URL:** https://www.seattlesymphony.org/benaroyahall
- **Platform:** Custom
- **Tags:** Music, Downtown
- **Note:** Home of Seattle Symphony. 2,500-seat auditorium plus 540-seat Nordstrom Recital Hall. Mix of symphony performances and external rentals. Ticketmaster Discovery API covers non-symphony events.

#### McCaw Hall
- **URL:** https://www.mccawhall.com/events-tickets/events-calendar
- **Platform:** Showtime CMS / Ticketmaster
- **Tags:** Arts
- **Note:** 2,900-seat venue at Seattle Center. Home of PNB and Seattle Opera. Events on Ticketmaster — Discovery API could cover this venue.

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

#### Seattle Night Market (206 Night Markets)
- **URL:** https://206nightmarkets.com
- **Platform:** Squarespace; tickets via Eventbrite
- **Tags:** Community, Food
- **Note:** Seattle's largest monthly indoor marketplace at Magnuson Park Hangar 30. 125+ vendor booths, food trucks, live DJs. 21+ only. Themed events (Lunar New Year, Winter Solstice). Also runs the Seattle Street Food Festival.

#### Georgetown Trailer Park Mall Events
- **URL:** http://georgetowntrailerparkmall.com/events
- **Platform:** Squarespace
- **Tags:** MakersMarket, Georgetown
- **Note:** Quirky vintage trailer-based market hosting seasonal themed markets: Georgetown Flea Market (monthly 1st Saturday), Get Sprung, Monster Mash Market, Bizarre Bazaar. Could split between recurring entries and scraped seasonal events.

#### Renegade Craft Fair (Seattle)
- **URL:** https://www.renegadecraft.com/events/
- **Platform:** WordPress with Gravity Forms
- **Tags:** MakersMarket
- **Note:** National indie craft fair with Seattle editions at Magnuson Park and Seattle Center. 180+ independent makers. Multiple dates per year (spring, fall/winter). Events organized by season and city.

#### Washington Beer Blog Events
- **URL:** https://washingtonbeerblog.com/wa-beer-events/
- **Platform:** WordPress with BoldWP Pro theme; custom events system
- **Tags:** Beer
- **Note:** Community-driven calendar of beer events across Washington — tap takeovers, beer releases, festivals, brewery anniversaries. Events submitted via form. No calendar plugin (custom system). Comprehensive source for the beer scene.

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
- **Note:** A `SquarespaceRipper` base class has been implemented in `lib/config/squarespace.ts`. Wing Luke, NAAM, JCCCW, LANGSTON, and On the Boards are already using it. Remaining Squarespace sites (Georgetown Trailer Park Mall, Seattle Night Market, Seattle Public Theater) can reuse the same base class — just create a ripper.yaml + one-line ripper.ts.

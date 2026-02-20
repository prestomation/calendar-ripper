# Calendar Source Ideas

Potential Seattle-area calendar sources to add in the future, organized by integration method.

## ICS Feeds (Add to external.yaml)

## APIs (Needs API Key or Custom Ripper)

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
- **Note:** WordPress-based, uses Eventbrite for listings (venue group IDs: 2463, 748). Could use Eventbrite API instead of scraping.

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

#### Frye Art Museum
- **URL:** https://fryemuseum.org/calendar
- **Platform:** Custom CMS; uses Bloomberg Connects for in-museum digital guides. No ICS or API found.
- **Tags:** Arts, Museums
- **Note:** Free-admission art museum at 704 Terry Ave (First Hill). Artist talks, lectures, film screenings, performances, and receptions. Calendar page has structured event listings with dates — HTML scraping appears viable. Events linked to from individual pages with schema.org microdata. Low-to-medium event volume.

#### Burke Museum
- **URL:** https://www.burkemuseum.org/calendar
- **Platform:** Custom CMS (Drupal suspected based on URL structure); no ICS feed found
- **Tags:** Museums, University District
- **Note:** Washington State Museum of natural history and culture on the UW campus. Hosts public lectures, Free First Thursday events (monthly, 10am–8pm extended hours), Dino Fest (annual May), and behind-the-scenes tours. Medium event volume. HTML scraping viable; Free First Thursday is also a candidate for a recurring event entry.

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

#### Rainier Arts Center (SEEDArts)
- **URL:** https://rainierartscenter.org/events-calendar/
- **Platform:** WordPress with Modern Events Calendar Lite (MEC) plugin v7.25.0; parent org is SEEDArts
- **Tags:** Arts, Music, Community
- **Note:** Community arts center in Rainier Valley (Rainier Beach area). Concerts, performances, and community events including World Class Music Live series. MEC Lite does not expose a global ICS feed. WP REST API at `https://rainierartscenter.org/wp-json/wp/v2/mec-events` returns events but dates are not included in the REST response — only in individual event page HTML or embedded Google Calendar link parameters (`dates=YYYYMMDD`). HTML scraping is needed; individual event pages contain date/time in schema.org microdata.


### Markets and Food

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

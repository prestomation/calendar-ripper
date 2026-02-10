# Calendar Source Ideas

Potential Seattle-area calendar sources to add in the future, organized by integration method.

## ICS Feeds (Needs Investigation)

### SeattleArtists.com Art Walks
- **URL:** https://www.seattleartists.com/calendar/
- **Feed:** `https://www.seattleartists.com/?post_type=tribe_events&ical=1&eventDisplay=list`
- **Platform:** WordPress with The Events Calendar (tribe_events)
- **Tags:** Arts, Artwalk
- **Note:** Returns 406 without a browser-like User-Agent header. The project's fetch() doesn't send one, so this won't work without adding a User-Agent to the fetcher.

### Climate Pledge Arena
- **URL:** https://climatepledgearena.com/events/
- **Feed:** `webcal://climatepledgearena.com/?post_type=tribe_events&ical=1&eventDisplay=list` (unverified)
- **Platform:** WordPress with The Events Calendar
- **Tags:** Music, Community
- **Note:** Site returned 503 during testing. May have bot protection. Worth retrying.

### iLoveSeattle.org Community Calendar
- **URL:** https://iloveseattle.org/all-events/
- **Feed:** `https://iloveseattle.org/?post_type=tribe_events&ical=1&eventDisplay=list` (unverified)
- **Platform:** Likely WordPress with The Events Calendar
- **Tags:** Community

## RSS Feeds (Needs RSS/XML Ripper)

### Showbox Presents (Showbox, Showbox SoDo, Neumos)
- **URL:** https://www.showboxpresents.com/events/all
- **Feed:** `https://www.showboxpresents.com/events/rss` (verified, RSS 2.0 with Dublin Core)
- **Tags:** Music
- **Note:** Would need an RSS/XML ripper base class or conversion to ICS. Feed includes event title, date, link (AXS ticketing), and description.

## APIs (Needs API Key or Custom Ripper)

### Ticketmaster Discovery API
- **Docs:** https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
- **Auth:** API key (free tier, 5000 calls/day)
- **Tags:** Music, Theatre, Community
- **Note:** Covers many Seattle venues including Climate Pledge Arena, The Paramount, The Moore. Search by city/venue. Well-documented, reliable.

### Songkick API
- **Docs:** https://www.songkick.com/developer
- **Auth:** API key
- **Tags:** Music
- **Note:** Supports venue-based queries. Could pull events for specific Seattle venues.

### Pike Place Market Events
- **URL:** https://www.pikeplacemarket.org/events/
- **Platform:** WordPress with Modern Events Calendar (MEC)
- **MEC Docs:** https://webnus.net/dstarter/flavor/flavors/modern-events-calendar/
- **Feed:** `https://www.pikeplacemarket.org/events/?mec-ical-feed=1` (returned HTML, not ICS)
- **Tags:** Community, Markets
- **Note:** MEC plugin should support ICS/API but the feed URL didn't work. Try `/wp-json/mec/v1/` REST endpoints or find the correct MEC export path. May need to fall back to HTML scraping.

### Seattle.gov Department Calendars (Trumba)
- **Trumba Docs:** https://www.trumba.com/help/api/
- **Parks:** Try `https://www.trumba.com/calendars/seattlegov-parks.ics`
- **Neighborhoods:** Try `https://www.trumba.com/calendars/seattlegov-neighborhoods.ics`
- **Public Outreach:** Try `https://www.trumba.com/calendars/seattlegov-outreach.ics`
- **Note:** The city-wide Trumba calendar is already added (`seattlegov-city-wide`). These are potential subcalendars for more targeted event feeds. The exact calendar web names need to be discovered — inspect the seattle.gov pages for `trumba.com/calendars/<name>` links.

## HTML Scraping (Last Resort)

### NWTheatre.org Regional Theatre Calendar
- **URL:** https://www.nwtheatre.org/calendar/
- **Tags:** Theatre
- **Note:** Most comprehensive regional theatre calendar covering King, Pierce, Snohomish, Thurston, and Kitsap counties. Categories include Theatre, Comedy, Dance, Outdoor Shows. No ICS or API found.

### Seattle Center Event Calendar
- **URL:** https://www.seattlecenter.com/events/event-calendar
- **Tags:** Arts, Community
- **Note:** Custom-built calendar with no export or API. Would require scraping dynamic content.

### The Crocodile
- **URL:** https://www.thecrocodile.com/
- **Tags:** Music
- **Note:** Squarespace-based. Ticketing through TicketWeb (venue ID: 10352). Could potentially use TicketWeb API instead of scraping.

### Tractor Tavern
- **URL:** https://tractortavern.com/
- **Tags:** Music
- **Note:** No ICS or API. Event listing on homepage.

### Nectar Lounge
- **URL:** https://nectarlounge.com/events/calendar/
- **Tags:** Music
- **Note:** WordPress-based, uses Eventbrite for listings (venue group IDs: 2463, 748). Could use Eventbrite API instead of scraping.

### 19hz.info Electronic Music Events
- **URL:** https://19hz.info/eventlisting_Seattle.php
- **Reference:** https://github.com/19hz/19hz-map (third-party scraper for this data)
- **Tags:** Music
- **Note:** Plain HTML listing of electronic music events. Has SSL issues. The 19hz-map project may be useful reference for parsing the HTML structure.

## Additional Farmers Markets

Add these to `sources/recurring.yaml` using the `"every <day>"` schedule format (see existing farmers market entries for examples). Verify schedules at the URLs below before adding — hours and seasons can change year to year.

### Magnolia Farmers Market
- **Org:** Seattle Neighborhood Farmers Markets
- **Schedule:** Saturdays 10am-2pm, June-October
- **Location:** Magnolia neighborhood, Seattle
- **URL:** https://seattlefarmersmarkets.org/
- **Note:** Add as a seasonal recurring event with `seasonal: "summer"` (close enough for Jun-Oct, though imperfect).

### Wallingford Farmers Market
- **Org:** Seattle Neighborhood Farmers Markets
- **Schedule:** Wednesdays 3-7pm, May-September
- **Location:** Wallingford neighborhood, Seattle
- **URL:** https://seattlefarmersmarkets.org/
- **Note:** Add as a seasonal recurring event with `seasonal: "summer"`.

### Capitol Hill Tuesday Market (Seasonal)
- **Org:** Seattle Neighborhood Farmers Markets
- **Schedule:** Tuesdays 3-7pm, June-September
- **Location:** E Barbara Bailey Way, Capitol Hill, Seattle
- **URL:** https://seattlefarmersmarkets.org/chfm
- **Note:** Evening summer market in addition to the year-round Sunday market already in recurring.yaml.

## Meta-Sources / Aggregators

### Bandsintown API
- **Docs:** https://help.artists.bandsintown.com/en/articles/9186477-api-documentation
- **Auth:** `app_id` parameter
- **Note:** Artist-centric (query by artist, not by venue). Covers many Seattle venues but not ideal for venue-based aggregation.

### Eventbrite API
- **Docs:** https://www.eventbrite.com/platform/api
- **Auth:** OAuth
- **Note:** Could pull events for specific Seattle organizers/venues. Many local organizations use Eventbrite.

### Washington State Farmers Market Association Directory
- **URL:** https://wafarmersmarkets.org/washingtonfarmersmarketdirectory/
- **Note:** Useful reference for discovering additional markets, but no calendar data itself.

# 206.events Feature Ideas

Non-source feature ideas and improvements for 206.events. Source candidates live in `docs/source-candidates.md`.

## Cross-Source Event Deduplication

The same event scraped from multiple sources (e.g., a concert listed on both a venue's site and Ticketmaster) currently appears multiple times in aggregate tag feeds. Implement fuzzy matching on title + date + venue to deduplicate:
- Normalize event titles (strip "LIVE:", "presents:", casing differences)
- Match events within a time window (e.g., same day, within 1 hour)
- Match venues by alias (e.g., "Climate Pledge Arena" vs "Climate Pledge")
- Keep the version with the most complete metadata (description, location, URL)
- Apply deduplication at the tag aggregation stage so individual source feeds remain unchanged

## Comedy Tag & Comedy Venue Sources

Add a `Comedy` tag to `lib/config/tags.ts` and implement rippers for Seattle comedy venues. Several are already documented in `docs/source-candidates.md` with confirmed Eventbrite organizer IDs. This would fill a clear content gap — comedy is one of the most popular event categories with no tag or dedicated sources today.

## Seattle Center Festal — Recurring Cultural Festivals

Seattle Center Festal is a series of 25 free cultural festivals running February through November, celebrating diverse communities. Add all 25 as recurring entries in `sources/recurring.yaml`. This would provide excellent multicultural event coverage with no scraping required.

2026 schedule includes: Tet in Seattle (Feb), Irish Festival (Mar), French Fest (Mar), Cherry Blossom & Japanese Cultural Festival (Apr), AANHPI Heritage Month (May), A Glimpse of China (May), Spirit of Africa (May), Pagdiriwang Philippine Festival (Jun), Indigenous People Festival (Jun), Seattle Iranian Festival (Jun), Polish Festival (Jul), Seattle Arab Festival (Jul), A Day in Punjab (Aug), Tibet Fest (Aug), BrasilFest (Aug), Festival Sundiata / Black Arts Fest (Aug), Live Aloha Hawaiian Cultural Festival (Sep), Sea Mar Fiestas Patrias (Sep), Italian Festival (Sep), CroatiaFest (Oct), Turkfest (Oct), Dia de Muertos Festival (Oct-Nov), Diwali: Lights of India (Nov), Seattle Hmong New Year (Nov).

Needs confirmation of exact dates each year — check https://www.seattlecenter.com/events/featured-events/festal annually.

## Columbia City Night Market — Monthly Recurring

Held every third Saturday, 6-10 PM, year-round on 37th Ave S. Organized by Peace Peloton, features 60+ local vendors, food trucks, live music, and a beer garden. Prioritizes Black-owned businesses. Add as a recurring entry with schedule `"every third Saturday"`. Tags: Community, Food, Columbia City.

## Local Sports Teams — New Content Category

Seattle-area minor league and amateur sports teams are not currently covered. None have ICS feeds, so most would be recurring entries or require custom rippers.

- **DubSea Fish Sticks** (Summer Collegiate Baseball) — Mel Olson Stadium, White Center — June-August — Tags: Sports, White Center
- **Ballard FC** (USL League Two Soccer) — Memorial Stadium, Seattle Center — May-July — Tags: Sports, Ballard
- **West Seattle Junction FC** (USL League Two Soccer) — Nino Cantu SW Athletic Complex — May-July — Tags: Sports, West Seattle

## Additional Farmers Markets

Add to `sources/recurring.yaml` using the `"every <day>"` schedule format. Verify schedules at the URLs before adding — hours and seasons can change year to year.

## Additional Recurring Events

### Seattle Christmas Market
Daily, November 20 - December 24 (annual) — Seattle Center, Fisher Pavilion — `https://seattlechristmasmarket.com/`

### Bite of Seattle
Three days in late July (annual) — Seattle Center — `https://biteofseattle.com/`

### Seattle Street Food Festival
Two days in late August (annual) — South Lake Union — `https://206nightmarkets.com`

### PhinneyWood Winter Festival
First weekend of December (annual) — Phinney Center — `https://www.phinneycenter.org/events/winter-festival/`

### Northwest Folklife Festival
Memorial Day weekend (annual, 4 days) — 2026: May 22-25 — Seattle Center — `https://nwfolklife.org/`

### Bumbershoot
Labor Day weekend (annual) — Seattle Center — `https://bumbershoot.com/`

### Seattle Art Fair
Four days in late July (annual) — 2026: July 23-26 — Lumen Field Event Center — `https://seattleartfair.com/`

### Emerald City Comic Con (ECCC)
Four days in early March (annual) — 2026: March 5-8 — Seattle Convention Center — Tags: Gaming

### Sakura-Con
Three-four days in early April (annual) — 2026: April 2-5 — Seattle Convention Center — Tags: Community, Arts

### PAX West
Four days over Labor Day weekend (annual) — 2026: September 4-7 — Seattle Convention Center — Tags: Gaming

### Seattle Pride Parade
Late June (annual) — 2026: June 28 — Downtown Seattle along 4th Ave — `https://seattlepride.org/events`

### Ballard Seafood & Music Fest
Three days in mid-July (annual) — 2026: July 10-12 — Ballard — `https://ballardalliance.com/programs/community-events/`

## New Tags Needed

Several venues would benefit from new tags in `lib/config/tags.ts`:
- **`Comedy`** — for comedy clubs and improv theaters
- **`Books`** — for bookstores with author events
- **`Gaming`** — for board game cafes and gaming conventions
- **`Outdoors`** — for outdoor recreation organizations

## Dynamic Calendar Generation for Multi-Venue Sources

Sources like DSA (Downtown Seattle Association) manage 17+ venues on a single Tribe Events API, but calendars are currently hardcoded per venue ID in `ripper.yaml`. When a new venue gets events, someone must manually add it.

Refactor multi-venue rippers to support a `dynamic: true` mode that:
1. Fetches all events from the API (no venue filter)
2. Groups events by venue automatically
3. Creates per-venue calendars for any venue with ≥1 event
4. Skips venues with 0 events (no calendar generated)
5. Looks up geo/OSM IDs from the API's `geo_lat`/`geo_lng` when available, or falls back to `KNOWN_VENUE_COORDS`
6. Auto-generates calendar names and friendly names from venue data

This eliminates manual venue tracking and makes the calendar self-maintaining. Applies to any Tribe Events source with multiple venues.

PR previews currently share the production Cloudflare Worker (favorites API). Deploy a separate staging worker environment with isolated KV namespaces so preview users can't modify production data. See `docs/idea-staging-worker.md` for full design.
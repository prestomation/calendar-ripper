import { ZonedDateTime, Duration, LocalDateTime, LocalDate } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

export interface ShowlistEvent {
    date: string;    // YYYYMMDD
    title: string;
    id: number;
    venueName: string;
}

const DEFAULT_SHOW_HOUR = 20; // 8 PM
const DEFAULT_DURATION_HOURS = 3;

interface VenueInfo {
    address: string;
    skip?: boolean; // true = covered by an active dedicated ripper
}

// Maps showlists venue names to metadata.
// Venues with skip:true have active dedicated rippers that provide richer data
// (exact times, descriptions, ticket links, images).
// Venues without skip get per-venue calendars from this ripper.
export const VENUE_CONFIG: Record<string, VenueInfo> = {
    // --- SKIP: active dedicated rippers exist ---
    "Showbox Market":       { address: "1426 1st Ave, Seattle, WA 98101", skip: true },
    "Showbox Sodo":         { address: "1700 1st Ave S, Seattle, WA 98134", skip: true },
    "Neumos":               { address: "925 E Pike St, Seattle, WA 98122", skip: true },
    "The Crocodile":        { address: "2505 1st Ave, Seattle, WA 98121", skip: true },
    "Neptune Theater":      { address: "1303 NE 45th St, Seattle, WA 98105", skip: true },
    "The Moore Theater":    { address: "1932 2nd Ave, Seattle, WA 98101", skip: true },
    "The Paramount Theater":{ address: "911 Pine St, Seattle, WA 98101", skip: true },
    "WAMU Theater":         { address: "800 Occidental Ave S, Seattle, WA 98134", skip: true },
    "The Vera Project":     { address: "305 Harrison St, Seattle, WA 98109", skip: true },
    "The Sunset Tavern":    { address: "5433 Ballard Ave NW, Seattle, WA 98107", skip: true },
    "Tractor Tavern":       { address: "5213 Ballard Ave NW, Seattle, WA 98107", skip: true },
    "Substation":           { address: "645 NW 45th St, Seattle, WA 98107", skip: true },
    "Chop Suey":            { address: "1325 E Madison St, Seattle, WA 98122", skip: true },

    // --- INCLUDE: per-venue calendars ---
    "Baba Yaga":            { address: "124 S Washington St, Seattle, WA 98104" },
    "Bad Bar":              { address: "819 5th Ave N, Seattle, WA 98109" },
    "Barboza":              { address: "925 E Pike St, Seattle, WA 98122" },
    "Belltown Yacht Club":  { address: "2320 1st Ave, Seattle, WA 98121" },
    "Black &amp; Tan Hall": { address: "5608 Rainier Ave S, Seattle, WA 98118" }, // server sends HTML entity
    "Black Lodge":          { address: "427 Eastlake Ave E, Seattle, WA 98109" },
    "Blue Moon Tavern":     { address: "712 NE 45th St, Seattle, WA 98105" },
    "Central Saloon":       { address: "207 1st Ave S, Seattle, WA 98104" },
    "Clock-Out Lounge":     { address: "4864 Beacon Ave S, Seattle, WA 98108" },
    "Conor Byrne Pub":      { address: "5140 Ballard Ave NW, Seattle, WA 98107" },
    "Darrell's Tavern":     { address: "18041 Aurora Ave N, Shoreline, WA 98133" },
    "Hotel Crocodile":      { address: "2505 1st Ave, Seattle, WA 98121" },
    "Nectar Lounge":        { address: "412 N 36th St, Seattle, WA 98103" },
    "Skylark":              { address: "3803 Delridge Way SW, Seattle, WA 98106" },
    "The Rabbit Box":       { address: "94 Pike St, Seattle, WA 98101" },
    "The Royal Room":       { address: "5000 Rainier Ave S, Seattle, WA 98118" },
    "Tim's Tavern":         { address: "9655 16th Ave SW, Seattle, WA 98106" },
    "Vermillion":           { address: "1508 11th Ave, Seattle, WA 98122" },
};

export default class SeattleShowlistsRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const url = ripper.config.url.toString();

        const res = await fetchFn(url);
        if (!res.ok) {
            throw Error(`${res.status} ${res.statusText}`);
        }

        const html = await res.text();
        const showData = this.extractShowData(html);

        // Detect unknown venues so we can update VENUE_CONFIG
        const unknownVenueErrors = this.detectUnknownVenues(showData);

        return ripper.config.calendars.map(cal => {
            const venueFilter: string | undefined = cal.config?.venue;

            const filtered = venueFilter
                ? showData.filter(s => s.venueName === venueFilter)
                : showData.filter(s => {
                    // Unfiltered calendar: exclude events from venues with active dedicated rippers
                    const info = VENUE_CONFIG[s.venueName];
                    return !info?.skip;
                });

            const venueInfo = venueFilter ? VENUE_CONFIG[venueFilter] : undefined;
            const events = this.parseEvents(filtered, cal.timezone, venueInfo?.address);
            const calEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];
            const errors = events.filter(e => "type" in e) as RipperError[];

            // Attach unknown venue errors to the first calendar only
            if (cal === ripper.config.calendars[0]) {
                errors.push(...unknownVenueErrors);
            }

            return {
                name: cal.name,
                friendlyname: cal.friendlyname,
                events: calEvents,
                errors,
                parent: ripper.config,
                tags: cal.tags || []
            };
        });
    }

    public extractShowData(html: string): ShowlistEvent[] {
        const match = html.match(/window\.upcomingShows\s*=\s*(\[[\s\S]*?\]);?\s*<\/script>/);
        if (!match) {
            throw new Error("Could not find window.upcomingShows data in page");
        }

        return JSON.parse(match[1]);
    }

    /** Detect venues in the data that aren't in VENUE_CONFIG so we know to update the map. */
    public detectUnknownVenues(shows: ShowlistEvent[]): RipperError[] {
        const unknownVenues = new Set<string>();
        for (const show of shows) {
            if (show.venueName && !VENUE_CONFIG[show.venueName]) {
                unknownVenues.add(show.venueName);
            }
        }
        return Array.from(unknownVenues).map(name => ({
            type: "ParseError" as const,
            reason: `Unknown venue "${name}" not in VENUE_CONFIG — add it so events are routed to a calendar`,
            context: `venue: ${name}`
        }));
    }

    public parseEvents(shows: ShowlistEvent[], timezone: any, defaultAddress?: string): RipperEvent[] {
        const events: RipperEvent[] = [];
        const today = LocalDate.now();

        for (const show of shows) {
            try {
                if (!show.date || !show.title) {
                    continue;
                }

                const year = parseInt(show.date.substring(0, 4));
                const month = parseInt(show.date.substring(4, 6));
                const day = parseInt(show.date.substring(6, 8));

                if (isNaN(year) || isNaN(month) || isNaN(day)) {
                    events.push({
                        type: "ParseError",
                        reason: `Invalid date format: ${show.date}`,
                        context: `id=${show.id}`
                    });
                    continue;
                }

                const eventDate = LocalDate.of(year, month, day);
                if (eventDate.isBefore(today)) {
                    continue;
                }

                const dateTime = ZonedDateTime.of(
                    LocalDateTime.of(year, month, day, DEFAULT_SHOW_HOUR, 0),
                    timezone
                );

                const location = defaultAddress
                    ? `${show.venueName}, ${defaultAddress}`
                    : show.venueName || undefined;

                const event: RipperCalendarEvent = {
                    id: `showlist-${show.id}`,
                    ripped: new Date(),
                    date: dateTime,
                    duration: Duration.ofHours(DEFAULT_DURATION_HOURS),
                    summary: show.title,
                    location: location,
                    url: "https://seattle.showlists.net"
                };

                events.push(event);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse show: ${error}`,
                    context: JSON.stringify(show).substring(0, 100)
                });
            }
        }

        return events;
    }
}

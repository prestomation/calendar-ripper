import { ZonedDateTime, Duration, Instant, ZoneId, LocalDate, Period } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const API_BASE = "https://www.seattlefoodtruck.com/api";
const SITE_BASE = "https://www.seattlefoodtruck.com";

// Bounding box covering Seattle and immediately adjacent areas
const SEATTLE_BOUNDS = {
    minLat: 47.49,
    maxLat: 47.74,
    minLng: -122.46,
    maxLng: -122.22,
};

// Max concurrent event-fetch requests to avoid rate-limiting
const CONCURRENCY = 10;

export interface SFTLocation {
    uid: number;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    slug?: string;
    neighborhood?: string;
}

export interface SFTTruck {
    id: number;
    name: string;
    slug?: string;
    food_categories?: string[];
}

export interface SFTBooking {
    id: number;
    truck: SFTTruck;
}

export interface SFTEvent {
    id: number;
    start_time: string;
    end_time: string;
    bookings: SFTBooking[];
}

interface SFTPagination {
    total_pages: number;
    total_entries: number;
    per_page: number;
    current_page: number;
}

interface SFTLocationsResponse {
    locations: SFTLocation[];
    pagination: SFTPagination;
}

interface SFTEventsResponse {
    events: SFTEvent[];
    pagination: SFTPagination;
}

export default class SeattleFoodTruckRipper implements IRipper {
    private fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const today = LocalDate.now(ZoneId.of("America/Los_Angeles"));
        const lookahead = ripper.config.lookahead ?? Period.ofDays(14);
        const endDate = today.plus(lookahead);

        const locations = await this.fetchSeattleLocations();
        const allLocationEvents = await this.fetchEventsForLocations(locations, today.toString(), endDate.toString());

        const events: RipperEvent[] = [];
        for (const { location, sftEvents } of allLocationEvents) {
            events.push(...this.parseLocationEvents(location, sftEvents));
        }

        return ripper.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: events.filter(e => "date" in e) as RipperCalendarEvent[],
            errors: events.filter(e => "type" in e) as RipperError[],
            parent: ripper.config,
            tags: cal.tags || [],
        }));
    }

    public async fetchSeattleLocations(): Promise<SFTLocation[]> {
        const allLocations: SFTLocation[] = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
            const url = `${API_BASE}/locations?page=${page}&per=100`;
            const res = await this.fetchFn(url);
            if (!res.ok) throw new Error(`Locations API error: HTTP ${res.status}`);

            const data: SFTLocationsResponse = await res.json();
            allLocations.push(...(data.locations || []));
            totalPages = data.pagination?.total_pages ?? 1;
            page++;
        }

        return allLocations.filter(loc =>
            loc.latitude >= SEATTLE_BOUNDS.minLat &&
            loc.latitude <= SEATTLE_BOUNDS.maxLat &&
            loc.longitude >= SEATTLE_BOUNDS.minLng &&
            loc.longitude <= SEATTLE_BOUNDS.maxLng
        );
    }

    public async fetchEventsForLocations(
        locations: SFTLocation[],
        startDate: string,
        endDate: string,
    ): Promise<{ location: SFTLocation; sftEvents: SFTEvent[] }[]> {
        const results: { location: SFTLocation; sftEvents: SFTEvent[] }[] = [];

        // Process in batches to limit concurrent requests
        for (let i = 0; i < locations.length; i += CONCURRENCY) {
            const batch = locations.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.all(
                batch.map(async loc => {
                    const events = await this.fetchEventsForLocation(loc.uid, startDate, endDate);
                    return { location: loc, sftEvents: events };
                })
            );
            results.push(...batchResults);
        }

        return results;
    }

    public async fetchEventsForLocation(locationUid: number, startDate: string, endDate: string): Promise<SFTEvent[]> {
        const allEvents: SFTEvent[] = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
            const params = new URLSearchParams({
                for_locations: String(locationUid),
                with_active_trucks: "true",
                include_bookings: "true",
                with_booking_status: "approved",
                start_time: startDate,
                end_time: endDate,
                page: String(page),
                per: "100",
            });
            const url = `${API_BASE}/events?${params}`;
            const res = await this.fetchFn(url);
            if (!res.ok) throw new Error(`Events API error for location ${locationUid}: HTTP ${res.status}`);

            const data: SFTEventsResponse = await res.json();
            allEvents.push(...(data.events || []));
            totalPages = data.pagination?.total_pages ?? 1;
            page++;
        }

        return allEvents;
    }

    public parseLocationEvents(location: SFTLocation, events: SFTEvent[]): RipperEvent[] {
        const results: RipperEvent[] = [];
        const seenIds = new Set<string>();

        for (const event of events) {
            for (const booking of event.bookings || []) {
                const eventKey = `sft-${event.id}-${booking.id}`;
                if (seenIds.has(eventKey)) continue;
                seenIds.add(eventKey);

                try {
                    const startDate = this.parseISO8601(event.start_time);
                    const endDate = this.parseISO8601(event.end_time);
                    if (!startDate) {
                        results.push({
                            type: "ParseError",
                            reason: `Could not parse start_time: ${event.start_time}`,
                            context: `event id ${event.id}`,
                        });
                        continue;
                    }

                    const durationMillis = endDate
                        ? endDate.toEpochSecond() - startDate.toEpochSecond()
                        : 3 * 3600;
                    const duration = Duration.ofSeconds(Math.max(durationMillis, 0) || 3 * 3600);

                    const truckName = booking.truck?.name ?? "Unknown Truck";
                    const locationUrl = location.slug
                        ? `${SITE_BASE}/schedule/${location.slug}`
                        : SITE_BASE;

                    const calEvent: RipperCalendarEvent = {
                        id: eventKey,
                        ripped: new Date(),
                        date: startDate,
                        duration,
                        summary: truckName,
                        location: `${location.name}, ${location.address}`,
                        url: locationUrl,
                    };

                    results.push(calEvent);
                } catch (error) {
                    results.push({
                        type: "ParseError",
                        reason: `Failed to parse event: ${error}`,
                        context: `event id ${event.id}, booking id ${booking.id}`,
                    });
                }
            }
        }

        return results;
    }

    public parseISO8601(dateStr: string): ZonedDateTime | null {
        if (!dateStr) return null;
        try {
            const instant = Instant.parse(
                // ISO 8601 with offset (e.g. "2026-03-10T11:00:00-08:00") —
                // ZonedDateTime.parse handles this directly.
                dateStr.replace(/([+-]\d{2}):(\d{2})$/, (_, h, m) =>
                    h === "+00" && m === "00" ? "Z" : `${h}:${m}`
                )
            );
            return ZonedDateTime.ofInstant(instant, ZoneId.of("America/Los_Angeles"));
        } catch {
            // Fall back to ZonedDateTime.parse for formats with timezone name
            try {
                return ZonedDateTime.parse(dateStr);
            } catch {
                return null;
            }
        }
    }
}

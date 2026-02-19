import { Duration, Instant, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "./schema.js";
import { getFetchForConfig, FetchFn } from "./proxy-fetch.js";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

/**
 * Squarespace event item as returned by the ?format=json endpoint.
 */
export interface SquarespaceEvent {
    id: string;
    title: string;
    startDate: number;
    endDate?: number;
    fullUrl?: string;
    urlId?: string;
    excerpt?: string;
    body?: string;
    sourceUrl?: string;
    assetUrl?: string;
    location?: {
        addressTitle?: string;
        addressLine1?: string;
        addressLine2?: string;
        addressCountry?: string;
    };
    tags?: string[];
    categories?: string[];
}

interface SquarespaceResponse {
    upcoming?: SquarespaceEvent[];
    past?: SquarespaceEvent[];
    items?: SquarespaceEvent[];
    pagination?: {
        nextPage: boolean;
        nextPageOffset: number;
        nextPageUrl: string;
    };
}

const MAX_PAGES = 10;

/**
 * Base ripper for Squarespace-powered event pages.
 *
 * Squarespace sites expose calendar/event data as JSON by appending
 * `?format=json` to the events page URL. The response contains `upcoming`
 * and `past` arrays of event objects plus pagination metadata.
 *
 * Subclasses typically need no overrides — just extend and configure via
 * ripper.yaml with the events page URL.
 */
export class SquarespaceRipper implements IRipper {
    private fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const baseUrl = ripper.config.url;

        let allEvents: SquarespaceEvent[];
        try {
            allEvents = await this.fetchUpcomingEvents(baseUrl);
        } catch (error) {
            return ripper.config.calendars.map(c => ({
                name: c.name,
                friendlyname: c.friendlyname,
                events: [],
                errors: [{
                    type: "ParseError" as const,
                    reason: `Failed to fetch events from Squarespace: ${error}`,
                    context: baseUrl.toString()
                }],
                parent: ripper.config,
                tags: c.tags || []
            }));
        }

        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        for (const cal of ripper.config.calendars) {
            for (const sqEvent of allEvents) {
                try {
                    const event = this.mapEvent(sqEvent, cal.timezone, baseUrl);
                    if (event) {
                        calendars[cal.name].events.push(event);
                    }
                } catch (error) {
                    calendars[cal.name].events.push({
                        type: "ParseError",
                        reason: `Failed to parse Squarespace event: ${error}`,
                        context: sqEvent.title || sqEvent.id
                    });
                }
            }
        }

        return Object.keys(calendars).map(key => ({
            name: key,
            friendlyname: calendars[key].friendlyName,
            events: calendars[key].events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: calendars[key].events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: calendars[key].tags
        }));
    }

    /**
     * Fetch all upcoming events from the Squarespace JSON endpoint,
     * following pagination links up to MAX_PAGES.
     */
    protected async fetchUpcomingEvents(baseUrl: URL): Promise<SquarespaceEvent[]> {
        const allEvents: SquarespaceEvent[] = [];
        const seenUrls = new Set<string>();
        let url = new URL(baseUrl.toString());
        url.searchParams.set('format', 'json');

        for (let page = 0; page < MAX_PAGES; page++) {
            const urlString = url.toString();
            if (seenUrls.has(urlString)) {
                break;
            }
            seenUrls.add(urlString);

            const res = await this.fetchFn(urlString);
            if (!res.ok) {
                throw new Error(`${res.status} ${res.statusText}`);
            }

            const data: SquarespaceResponse = await res.json();

            if (data.upcoming) {
                allEvents.push(...data.upcoming);
            } else if (data.items) {
                allEvents.push(...data.items);
            }

            if (data.pagination?.nextPage && data.pagination.nextPageUrl) {
                url = new URL(data.pagination.nextPageUrl, baseUrl);
                url.searchParams.set('format', 'json');
            } else {
                break;
            }
        }

        return allEvents;
    }

    /**
     * Convert a Squarespace event object into a RipperCalendarEvent.
     * Returns null if the event lacks required fields (title, startDate).
     */
    protected mapEvent(sqEvent: SquarespaceEvent, timezone: ZoneId, baseUrl: URL): RipperCalendarEvent | null {
        if (!sqEvent.title || !sqEvent.startDate) {
            return null;
        }

        const startInstant = Instant.ofEpochMilli(sqEvent.startDate);
        const eventDate = ZonedDateTime.ofInstant(startInstant, timezone);

        let duration = Duration.ofHours(2);
        if (sqEvent.endDate) {
            const durationMs = sqEvent.endDate - sqEvent.startDate;
            if (durationMs > 0) {
                duration = Duration.ofMillis(durationMs);
            }
        }

        let location: string | undefined;
        if (sqEvent.location) {
            const parts = [
                sqEvent.location.addressTitle,
                sqEvent.location.addressLine1,
                sqEvent.location.addressLine2
            ].filter(Boolean);
            location = parts.length > 0 ? parts.join(', ') : undefined;
        }

        let eventUrl: string | undefined;
        if (sqEvent.fullUrl) {
            eventUrl = new URL(sqEvent.fullUrl, baseUrl).toString();
        }

        let description = sqEvent.excerpt || undefined;
        if (description) {
            description = this.stripHtml(description).trim();
        }

        return {
            id: sqEvent.id,
            ripped: new Date(),
            date: eventDate,
            duration,
            summary: sqEvent.title,
            description,
            location,
            url: eventUrl,
            image: sqEvent.assetUrl || undefined
        };
    }

    private stripHtml(html: string): string {
        return parse(html).textContent;
    }
}

import { ZonedDateTime, Duration, LocalDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperEvent } from "./schema.js";
import '@js-joda/timezone';

const EVENTS_PER_PAGE = 10;
const MAX_PAGES = 10;

/**
 * Shared ripper for venues that use the AXS ticketing platform.
 *
 * Each calendar entry in ripper.yaml must include a `config` block with:
 *   - venueId: the AXS venue ID (e.g. 133070)
 *   - venueSlug: the URL slug for the venue page (e.g. "5th-avenue-theatre-seattle-tickets")
 *   - venueName: display name used as location fallback
 *   - venueAddress: full address used as location fallback
 */
export class AXSRipper implements IRipper {
    private seenEvents = new Set<string>();

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        for (const cal of ripper.config.calendars) {
            const venueId = cal.config?.venueId as number | undefined;
            const venueSlug = cal.config?.venueSlug as string | undefined;
            if (!venueId || !venueSlug) continue;

            const rawEvents = await this.fetchVenueEvents(venueId, venueSlug);
            const parsed = this.parseEvents(rawEvents, cal.timezone, cal.config);
            calendars[cal.name].events = parsed;
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

    private async fetchVenueEvents(venueId: number, venueSlug: string): Promise<any[]> {
        const allEvents: any[] = [];

        for (let page = 1; page <= MAX_PAGES; page++) {
            const pageParam = page > 1 ? `?page=${page}` : '';
            const url = `https://www.axs.com/venues/${venueId}/${venueSlug}${pageParam}`;

            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
            });
            if (!res.ok) {
                throw new Error(`AXS fetch error: ${res.status} ${res.statusText} for venue ${venueId}`);
            }

            const html = await res.text();
            const pageData = this.extractNextData(html);
            if (!pageData) {
                throw new Error(`Could not extract event data from AXS page for venue ${venueId}`);
            }

            const events = pageData.venueEventsData?.eventItems || [];
            allEvents.push(...events);

            const totalEvents = pageData.venueEventsData?.totalEvents || 0;
            if (allEvents.length >= totalEvents || events.length < EVENTS_PER_PAGE) {
                break;
            }
        }

        return allEvents;
    }

    private extractNextData(html: string): any | null {
        const match = html.match(/__NEXT_DATA__[^>]*>(.*?)<\/script>/s);
        if (!match) return null;

        try {
            const data = JSON.parse(match[1]);
            return data?.props?.pageProps || null;
        } catch {
            return null;
        }
    }

    public parseEvents(eventsData: any[], timezone: any, config: any): RipperEvent[] {
        const events: RipperEvent[] = [];

        for (const event of eventsData) {
            try {
                const eventId = event.id;
                const title = event.headlinersText;
                if (!eventId || !title) continue;

                const dedupKey = String(eventId);
                if (this.seenEvents.has(dedupKey)) continue;
                this.seenEvents.add(dedupKey);

                const date = this.parseDate(event.date, timezone);
                if (!date) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date for event: ${title}`,
                        context: String(event.date).substring(0, 200)
                    });
                    continue;
                }

                const location = config?.venueAddress
                    ? `${config.venueName}, ${config.venueAddress}`
                    : config?.venueName || undefined;

                const url = `https://www.axs.com/events/${eventId}`;

                const image = this.getBestImage(event.relatedMedia);

                const descParts: string[] = [];
                if (event.supportingText) descParts.push(event.supportingText);
                if (event.tourTitle) descParts.push(`Tour: ${event.tourTitle}`);
                if (event.majorCategory) descParts.push(`Category: ${event.majorCategory}`);

                const calEvent: RipperCalendarEvent = {
                    id: `axs-${eventId}`,
                    ripped: new Date(),
                    date: date,
                    duration: Duration.ofHours(2),
                    summary: title,
                    description: descParts.length > 0 ? descParts.join('\n') : undefined,
                    location: location || undefined,
                    url: url,
                    image: image,
                };

                events.push(calEvent);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse AXS event: ${error}`,
                    context: JSON.stringify(event).substring(0, 200)
                });
            }
        }

        return events;
    }

    private parseDate(dateStr: string | undefined, timezone: any): ZonedDateTime | null {
        if (!dateStr) return null;

        try {
            const dt = LocalDateTime.parse(dateStr);
            return ZonedDateTime.of(dt, timezone);
        } catch {
            return null;
        }
    }

    private getBestImage(media: any[]): string | undefined {
        if (!media?.length) return undefined;

        // Prefer larger images (mediaTypeId 17 is 678x399, 18 is 564x564)
        const preferred = media.find((m: any) => m.mediaTypeId === 17);
        if (preferred?.fileName) return preferred.fileName;

        const square = media.find((m: any) => m.mediaTypeId === 18);
        if (square?.fileName) return square.fileName;

        return media[0]?.fileName;
    }
}

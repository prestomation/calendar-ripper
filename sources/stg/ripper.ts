import { ZonedDateTime, Duration, LocalDateTime, LocalDate, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import '@js-joda/timezone';

const PAGE_SIZE = 200;
const LOOKAHEAD_MONTHS = 3;

export default class STGRipper implements IRipper {
    private seenEvents = new Set<string>();

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const apiKey = process.env.TICKETMASTER_API_KEY;
        if (!apiKey) {
            throw new Error("TICKETMASTER_API_KEY environment variable is required for STG ripper");
        }

        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        for (const cal of ripper.config.calendars) {
            const venueId = cal.config?.venueId;
            if (!venueId) continue;

            const rawEvents = await this.fetchVenueEvents(apiKey, venueId);
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

    private async fetchVenueEvents(apiKey: string, venueId: string): Promise<any[]> {
        const allEvents: any[] = [];
        let page = 0;

        const startDate = LocalDate.now().toString() + "T00:00:00Z";
        const endDate = LocalDate.now().plusMonths(LOOKAHEAD_MONTHS).toString() + "T23:59:59Z";

        while (true) {
            const url = `https://app.ticketmaster.com/discovery/v2/events.json?venueId=${venueId}&startDateTime=${startDate}&endDateTime=${endDate}&size=${PAGE_SIZE}&page=${page}&apikey=${apiKey}`;

            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`Ticketmaster API error: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            const events = data._embedded?.events || [];
            allEvents.push(...events);

            const totalPages = data.page?.totalPages || 0;
            page++;
            if (page >= totalPages || page * PAGE_SIZE >= 1000) break;
        }

        return allEvents;
    }

    public parseEvents(eventsData: any[], timezone: any, config: any): RipperEvent[] {
        const events: RipperEvent[] = [];

        for (const event of eventsData) {
            try {
                const eventId = event.id;
                if (!eventId || !event.name) continue;

                if (this.seenEvents.has(eventId)) continue;
                this.seenEvents.add(eventId);

                const status = event.dates?.status?.code;
                if (status === 'cancelled' || status === 'canceled') continue;

                const date = this.parseDate(event.dates, timezone);
                if (!date) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date for event: ${event.name}`,
                        context: JSON.stringify(event.dates?.start).substring(0, 200)
                    });
                    continue;
                }

                const venue = event._embedded?.venues?.[0];
                let location = config?.venueName || '';
                if (venue?.address?.line1) {
                    location = `${venue.name || config?.venueName}, ${venue.address.line1}, ${venue.city?.name || 'Seattle'}, ${venue.state?.stateCode || 'WA'}`;
                } else if (config?.venueAddress) {
                    location = `${config.venueName}, ${config.venueAddress}`;
                }

                const descParts: string[] = [];
                if (event.info) descParts.push(event.info);
                if (event.pleaseNote) descParts.push(event.pleaseNote);
                if (event.priceRanges?.length) {
                    const range = event.priceRanges[0];
                    if (range.min != null && range.max != null) {
                        descParts.push(`Price: $${range.min} - $${range.max}`);
                    }
                }
                if (status === 'postponed') descParts.push('POSTPONED');
                if (status === 'rescheduled') descParts.push('RESCHEDULED');

                const calEvent: RipperCalendarEvent = {
                    id: `tm-${eventId}`,
                    ripped: new Date(),
                    date: date,
                    duration: Duration.ofHours(2),
                    summary: event.name,
                    description: descParts.length > 0 ? descParts.join('\n') : undefined,
                    location: location || undefined,
                    url: event.url || undefined,
                    image: this.getBestImage(event.images),
                };

                events.push(calEvent);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse Ticketmaster event: ${error}`,
                    context: JSON.stringify(event).substring(0, 200)
                });
            }
        }

        return events;
    }

    private parseDate(dates: any, timezone: any): ZonedDateTime | null {
        if (!dates?.start) return null;

        const start = dates.start;

        if (start.localDate && start.localTime) {
            const dt = LocalDateTime.parse(`${start.localDate}T${start.localTime}`);
            return ZonedDateTime.of(dt, timezone);
        }

        if (start.dateTime) {
            try {
                const instant = ZonedDateTime.parse(start.dateTime).toInstant();
                return ZonedDateTime.ofInstant(instant, timezone);
            } catch {
                return null;
            }
        }

        if (start.localDate) {
            const dt = LocalDateTime.parse(`${start.localDate}T19:30:00`);
            return ZonedDateTime.of(dt, timezone);
        }

        return null;
    }

    private getBestImage(images: any[]): string | undefined {
        if (!images?.length) return undefined;

        const preferred = images.find((i: any) => i.ratio === '16_9' && i.width >= 640);
        if (preferred) return preferred.url;

        return images[0]?.url;
    }
}

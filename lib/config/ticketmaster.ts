import { ZonedDateTime, Duration, LocalDateTime, LocalDate, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "./schema.js";
import { getFetchForConfig, FetchFn } from "./proxy-fetch.js";
import '@js-joda/timezone';

const PAGE_SIZE = 200;
const DEFAULT_LOOKAHEAD_MONTHS = 3;
const DEFAULT_DURATION_HOURS = 2;

/**
 * Shared ripper for venues that use the Ticketmaster Discovery API v2.
 *
 * Each calendar entry in ripper.yaml must include a `config` block with
 * at least one of the following search parameters:
 *   - venueId: the Ticketmaster Discovery API venue ID (e.g. "KovZpZAFkvEA")
 *   - attractionId: the Ticketmaster Discovery API attraction ID (e.g. "K8vZ917Gku7")
 *   - keyword: keyword search term (e.g. "Seattle Symphony Orchestra")
 *
 * Optional config fields:
 *   - venueName: display name used as location fallback
 *   - venueAddress: full address used as location fallback
 *   - stateCode: state filter for keyword searches (e.g. "WA")
 *   - defaultDurationHours: event duration in hours (default: 2)
 *
 * The ripper-level `lookahead` field (ISO-8601 period) controls how far ahead
 * to search. Defaults to 3 months if not set.
 *
 * Requires the TICKETMASTER_API_KEY environment variable.
 */
export class TicketmasterRipper implements IRipper {
    private seenEvents = new Set<string>();
    private fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const apiKey = process.env.TICKETMASTER_API_KEY;
        if (!apiKey) {
            return ripper.config.calendars.map(cal => ({
                name: cal.name,
                friendlyname: cal.friendlyname,
                events: [],
                errors: [{ type: "ParseError" as const, reason: "TICKETMASTER_API_KEY environment variable is not set", context: cal.name }],
                parent: ripper.config,
                tags: cal.tags || [],
            }));
        }

        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        for (const cal of ripper.config.calendars) {
            const venueId = cal.config?.venueId as string | undefined;
            const attractionId = cal.config?.attractionId as string | undefined;
            const keyword = cal.config?.keyword as string | undefined;
            if (!venueId && !attractionId && !keyword) continue;

            const rawEvents = await this.fetchEvents(apiKey, ripper, { venueId, attractionId, keyword, stateCode: cal.config?.stateCode as string | undefined });
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

    private async fetchEvents(apiKey: string, ripper: Ripper, params: { venueId?: string, attractionId?: string, keyword?: string, stateCode?: string }): Promise<any[]> {
        const allEvents: any[] = [];
        let page = 0;

        const startDate = LocalDate.now().toString() + "T00:00:00Z";
        const lookahead = ripper.config.lookahead;
        const endDate = (lookahead
            ? LocalDate.now().plus(lookahead).toString()
            : LocalDate.now().plusMonths(DEFAULT_LOOKAHEAD_MONTHS).toString()) + "T23:59:59Z";

        while (true) {
            const searchParams = new URLSearchParams();
            if (params.venueId) searchParams.set('venueId', params.venueId);
            if (params.attractionId) searchParams.set('attractionId', params.attractionId);
            if (params.keyword) searchParams.set('keyword', params.keyword);
            if (params.stateCode) searchParams.set('stateCode', params.stateCode);
            searchParams.set('startDateTime', startDate);
            searchParams.set('endDateTime', endDate);
            searchParams.set('size', String(PAGE_SIZE));
            searchParams.set('page', String(page));
            searchParams.set('apikey', apiKey);

            const url = `https://app.ticketmaster.com/discovery/v2/events.json?${searchParams.toString()}`;

            const res = await this.fetchFn(url);
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

                const durationHours = (config?.defaultDurationHours as number | undefined) ?? DEFAULT_DURATION_HOURS;
                const calEvent: RipperCalendarEvent = {
                    id: `tm-${eventId}`,
                    ripped: new Date(),
                    date: date,
                    duration: Duration.ofHours(durationHours),
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

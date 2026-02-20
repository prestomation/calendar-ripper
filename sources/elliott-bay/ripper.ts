import { ZonedDateTime, Duration, LocalDateTime, ZoneId, ChronoUnit } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import '@js-joda/timezone';

const ORGANIZER_ID = '30672130426';
const DEFAULT_LOCATION = '1521 10th Ave, Seattle, WA 98122';

export default class ElliottBayRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const token = process.env.EVENTBRITE_TOKEN;

        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        const rawEvents = await this.fetchAllEvents(token);

        for (const cal of ripper.config.calendars) {
            calendars[cal.name].events = this.parseEvents(rawEvents, cal.timezone);
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

    public async fetchAllEvents(token: string | undefined): Promise<any[]> {
        const events: any[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const url = `https://www.eventbriteapi.com/v3/organizers/${ORGANIZER_ID}/events/?status=live&expand=venue&time_filter=current_future&page=${page}`;

            const headers: HeadersInit = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const res = await fetch(url, { headers });
            if (!res.ok) {
                throw new Error(`Eventbrite API error: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();

            if (!data.events || !Array.isArray(data.events)) {
                break;
            }

            events.push(...data.events);
            hasMore = data.pagination?.has_more_items ?? false;
            page++;
        }

        return events;
    }

    public parseEvents(events: any[], timezone: ZoneId): RipperEvent[] {
        const results: RipperEvent[] = [];
        const seenIds = new Set<string>();

        for (const event of events) {
            try {
                const id = event.id?.toString();
                if (id && seenIds.has(id)) continue;
                if (id) seenIds.add(id);

                const name = event.name?.text;
                if (!name) {
                    results.push({
                        type: "ParseError",
                        reason: "Event has no name",
                        context: id
                    });
                    continue;
                }

                const startLocal = event.start?.local;
                if (!startLocal) {
                    results.push({
                        type: "ParseError",
                        reason: `No start time for event "${name}"`,
                        context: id
                    });
                    continue;
                }

                // Parse start datetime: "2026-03-10T19:00:00"
                const startDt = LocalDateTime.parse(startLocal);
                const eventZoneStr = event.start?.timezone;
                const eventZone = eventZoneStr ? ZoneId.of(eventZoneStr) : timezone;
                const startDate = startDt.atZone(eventZone);

                // Calculate duration from end time, default 2 hours
                let duration = Duration.ofHours(2);
                const endLocal = event.end?.local;
                if (endLocal) {
                    const endDt = LocalDateTime.parse(endLocal);
                    const endDate = endDt.atZone(eventZone);
                    const seconds = startDate.until(endDate, ChronoUnit.SECONDS);
                    if (seconds > 0) {
                        duration = Duration.ofSeconds(seconds);
                    }
                }

                // Format location from venue, fall back to store address
                let location = DEFAULT_LOCATION;
                if (event.venue) {
                    const v = event.venue;
                    const parts = [
                        v.name,
                        v.address?.address_1,
                        v.address?.city,
                        v.address?.region,
                        v.address?.postal_code
                    ].filter(Boolean);
                    if (parts.length > 0) {
                        location = parts.join(', ');
                    }
                }

                const calEvent: RipperCalendarEvent = {
                    id,
                    ripped: new Date(),
                    date: startDate,
                    duration,
                    summary: name,
                    description: event.description?.text || undefined,
                    location,
                    url: event.url
                };

                results.push(calEvent);
            } catch (error) {
                results.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${error}`,
                    context: JSON.stringify(event).substring(0, 100) + "..."
                });
            }
        }

        return results;
    }
}

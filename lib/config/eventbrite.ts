import { Duration, LocalDateTime, ZoneId, ChronoUnit } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "./schema.js";
import '@js-joda/timezone';

const MAX_PAGES = 100;

/**
 * Shared ripper for organizers that use the Eventbrite ticketing platform.
 *
 * Each calendar entry in ripper.yaml must include a `config` block with:
 *   - organizerId: the Eventbrite organizer ID (e.g. "30672130426")
 *   - defaultLocation: fallback address when no venue is provided
 *   - defaultDurationHours: (optional) fallback duration in hours when no end time is provided (default: 2)
 */
export class EventbriteRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const token = process.env.EVENTBRITE_TOKEN;
        if (!token) {
            throw new Error("EVENTBRITE_TOKEN environment variable is not set");
        }
        if (token.length < 20) {
            throw new Error("EVENTBRITE_TOKEN appears to be invalid (too short)");
        }

        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        for (const cal of ripper.config.calendars) {
            const organizerId = cal.config?.organizerId as string | undefined;
            const defaultLocation = cal.config?.defaultLocation as string | undefined ?? '';
            const defaultDurationHours = (cal.config?.defaultDurationHours as number | undefined) ?? 2;

            if (!organizerId) {
                calendars[cal.name].events = [{
                    type: "ParseError",
                    reason: "Missing required config field: organizerId",
                    context: cal.name
                }];
                continue;
            }

            try {
                const rawEvents = await this.fetchAllEvents(organizerId, token);
                calendars[cal.name].events = this.parseEvents(rawEvents, cal.timezone, defaultLocation, defaultDurationHours);
            } catch (error) {
                calendars[cal.name].events = [{
                    type: "ParseError",
                    reason: `Failed to fetch Eventbrite events for organizer ${organizerId}: ${error}`,
                    context: cal.name
                }];
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

    public async fetchAllEvents(organizerId: string, token: string): Promise<any[]> {
        const events: any[] = [];
        let page = 1;

        while (page <= MAX_PAGES) {
            const url = `https://www.eventbriteapi.com/v3/organizers/${organizerId}/events/?status=live&expand=venue&page=${page}`;

            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                throw new Error(`Eventbrite API error: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();

            if (!data.events || !Array.isArray(data.events)) {
                break;
            }

            events.push(...data.events);

            if (!data.pagination?.has_more_items) {
                break;
            }

            page++;
        }

        return events;
    }

    public parseEvents(events: any[], timezone: ZoneId, defaultLocation: string, defaultDurationHours: number = 2): RipperEvent[] {
        const results: RipperEvent[] = [];
        const seenIds = new Set<string>();

        for (const event of events) {
            try {
                const id = event.id?.toString() ?? 'unknown';
                if (seenIds.has(id)) continue;
                seenIds.add(id);

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

                // Calculate duration from end time, fall back to defaultDurationHours
                let duration = Duration.ofHours(defaultDurationHours);
                const endLocal = event.end?.local;
                if (endLocal) {
                    const endDt = LocalDateTime.parse(endLocal);
                    const endDate = endDt.atZone(eventZone);
                    const seconds = startDate.until(endDate, ChronoUnit.SECONDS);
                    if (seconds > 0) {
                        duration = Duration.ofSeconds(seconds);
                    }
                }

                // Format location from venue, fall back to defaultLocation
                let location = defaultLocation;
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
                    context: event.id?.toString() ?? 'unknown'
                });
            }
        }

        return results;
    }
}

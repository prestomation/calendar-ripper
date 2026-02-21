import { Duration, LocalDateTime, ZoneId, ChronoUnit, ZonedDateTime, DateTimeFormatter } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "./schema.js";
import '@js-joda/timezone';

const MAX_PAGES = 10;
const DICE_API_URL = "https://events-api.dice.fm/v1/events";

/**
 * Shared ripper for venues that use the DICE ticketing platform.
 *
 * Requires the DICE_API_KEY environment variable to be set.
 *
 * Each calendar entry in ripper.yaml must include a `config` block with:
 *   - venueName: the venue name as it appears on DICE (used as the API filter)
 *   - defaultLocation: fallback address when the API doesn't provide one
 *   - defaultDurationHours: (optional) fallback duration in hours (default: 3)
 */
export class DICERipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const apiKey = process.env.DICE_API_KEY;
        if (!apiKey) {
            return ripper.config.calendars.map(cal => ({
                name: cal.name,
                friendlyname: cal.friendlyname,
                events: [],
                errors: [{ type: "ParseError" as const, reason: "DICE_API_KEY environment variable is not set", context: cal.name }],
                parent: ripper.config,
                tags: cal.tags || [],
            }));
        }

        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        for (const cal of ripper.config.calendars) {
            const venueName = cal.config?.venueName as string | undefined;
            const defaultLocation = cal.config?.defaultLocation as string | undefined ?? '';
            const defaultDurationHours = (cal.config?.defaultDurationHours as number | undefined) ?? 3;

            if (!venueName) {
                calendars[cal.name].events = [{
                    type: "ParseError",
                    reason: "Missing required config field: venueName",
                    context: cal.name
                }];
                continue;
            }

            try {
                const rawEvents = await this.fetchAllEvents(venueName, apiKey);
                calendars[cal.name].events = this.parseEvents(rawEvents, cal.timezone, defaultLocation, defaultDurationHours);
            } catch (error) {
                calendars[cal.name].events = [{
                    type: "ParseError",
                    reason: `Failed to fetch DICE events for venue "${venueName}": ${error}`,
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

    public async fetchAllEvents(venueName: string, apiKey: string): Promise<any[]> {
        const events: any[] = [];
        let page = 1;
        let nextUrl: string | null = `${DICE_API_URL}?page%5Bsize%5D=50&filter%5Bvenues%5D%5B%5D=${encodeURIComponent(venueName)}`;

        while (nextUrl && page <= MAX_PAGES) {
            const res = await fetch(nextUrl, {
                headers: {
                    'x-api-key': apiKey,
                    'Accept': 'application/json'
                }
            });
            if (!res.ok) {
                throw new Error(`DICE API error: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();

            if (!data.data || !Array.isArray(data.data)) {
                break;
            }

            events.push(...data.data);
            nextUrl = data.links?.next ?? null;
            page++;
        }

        return events;
    }

    public parseEvents(events: any[], timezone: ZoneId, defaultLocation: string, defaultDurationHours: number = 3): RipperEvent[] {
        const results: RipperEvent[] = [];
        const seenIds = new Set<string>();

        for (const event of events) {
            try {
                const id = event.id?.toString() ?? 'unknown';
                if (seenIds.has(id)) continue;
                seenIds.add(id);

                const name = event.name?.trim();
                if (!name) {
                    results.push({
                        type: "ParseError",
                        reason: "Event has no name",
                        context: id
                    });
                    continue;
                }

                if (!event.date) {
                    results.push({
                        type: "ParseError",
                        reason: `No start time for event "${name}"`,
                        context: id
                    });
                    continue;
                }

                // DICE dates are in UTC ISO format: "2026-02-21T03:00:00Z"
                const utcDateTime = LocalDateTime.parse(
                    event.date.replace('Z', ''),
                    DateTimeFormatter.ISO_LOCAL_DATE_TIME
                );
                const utcZoned = utcDateTime.atZone(ZoneId.of('UTC'));
                // Convert to the calendar's configured timezone
                const eventZone = event.timezone ? ZoneId.of(event.timezone) : timezone;
                const startDate = utcZoned.withZoneSameInstant(eventZone);

                // Calculate duration from end time, fall back to defaultDurationHours
                let duration = Duration.ofHours(defaultDurationHours);
                if (event.date_end) {
                    const endUtcDateTime = LocalDateTime.parse(
                        event.date_end.replace('Z', ''),
                        DateTimeFormatter.ISO_LOCAL_DATE_TIME
                    );
                    const endUtcZoned = endUtcDateTime.atZone(ZoneId.of('UTC'));
                    const endDate = endUtcZoned.withZoneSameInstant(eventZone);
                    const seconds = startDate.until(endDate, ChronoUnit.SECONDS);
                    if (seconds > 0) {
                        duration = Duration.ofSeconds(seconds);
                    }
                }

                // Build location from API address field, fall back to defaultLocation
                let location = defaultLocation;
                if (event.address) {
                    location = event.address;
                } else if (event.location?.street) {
                    const parts = [
                        event.location.street,
                        event.location.city,
                        event.location.state,
                        event.location.zip
                    ].filter(Boolean);
                    if (parts.length > 0) {
                        location = parts.join(', ');
                    }
                }

                // Strip markdown-style formatting from description
                let description = event.raw_description || event.description || undefined;
                if (description) {
                    description = this.cleanDescription(description);
                }

                // Build event URL: prefer the DICE link, fall back to external_url
                const url = event.url || event.external_url || undefined;

                // Get event image
                const image = event.images?.[0] || event.event_images?.landscape || undefined;

                const calEvent: RipperCalendarEvent = {
                    id,
                    ripped: new Date(),
                    date: startDate,
                    duration,
                    summary: name,
                    description,
                    location,
                    url,
                    image
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

    private cleanDescription(text: string): string {
        return text
            .replace(/\\\*/g, '*')   // unescape \*
            .replace(/\*{2,}/g, '')  // remove ** bold markers
            .replace(/\*([^*]+)\*/g, '$1') // remove *italic* markers
            .trim();
    }
}

import { ZonedDateTime, Duration, LocalDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import '@js-joda/timezone';

interface VeeziEvent {
    "@type": string;
    startDate: string;
    duration: string;
    name: string;
    url: string;
    location?: {
        "@type": string;
        address: string;
        name: string;
    };
}

/**
 * Ripper for Majestic Bay Theatres using Veezi ticketing platform.
 * Extracts JSON-LD structured data embedded in the Veezi sessions page.
 */
export default class MajesticBayRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        const res = await fetch(ripper.config.url.toString());
        if (!res.ok) {
            throw Error(`${res.status} ${res.statusText}`);
        }

        const html = await res.text();
        const events = this.extractEvents(html);
        const cal = ripper.config.calendars[0];
        const parsed = this.parseEvents(events, cal.timezone);
        calendars[cal.name].events = parsed;

        return Object.keys(calendars).map(key => ({
            name: key,
            friendlyname: calendars[key].friendlyName,
            events: calendars[key].events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: calendars[key].events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: calendars[key].tags
        }));
    }

    public extractEvents(html: string): VeeziEvent[] {
        const jsonLdMatches = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g);
        if (!jsonLdMatches) return [];

        for (const match of jsonLdMatches) {
            const jsonStr = match
                .replace(/<script type="application\/ld\+json">\s*/, '')
                .replace(/\s*<\/script>$/, '');

            try {
                const data = JSON.parse(jsonStr);
                if (Array.isArray(data)) {
                    return data.filter((item: any) =>
                        item["@type"] === "VisualArtsEvent" &&
                        item.startDate &&
                        item.name
                    );
                }
            } catch {
                continue;
            }
        }

        return [];
    }

    public parseEvents(eventsData: VeeziEvent[], timezone: any): RipperEvent[] {
        const events: RipperEvent[] = [];
        const seenEvents = new Set<string>();

        for (const event of eventsData) {
            try {
                // Use the purchase URL's ID as a unique key
                const purchaseId = event.url?.match(/\/purchase\/(\d+)/)?.[1];
                const dedupKey = purchaseId || `${event.name}-${event.startDate}`;
                if (seenEvents.has(dedupKey)) continue;
                seenEvents.add(dedupKey);

                const date = this.parseDate(event.startDate);
                if (!date) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date for event: ${event.name}`,
                        context: event.startDate
                    });
                    continue;
                }

                const duration = this.parseDuration(event.duration);

                const location = event.location?.name
                    ? `${event.location.name}, ${event.location.address}`
                    : "Majestic Bay Theatres, 2044 NW Market St., Seattle, WA, 98107, USA";

                const calEvent: RipperCalendarEvent = {
                    id: purchaseId ? `veezi-${purchaseId}` : undefined,
                    ripped: new Date(),
                    date,
                    duration,
                    summary: event.name,
                    location,
                    url: event.url || undefined
                };

                events.push(calEvent);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse Veezi event: ${error}`,
                    context: JSON.stringify(event).substring(0, 200)
                });
            }
        }

        return events;
    }

    private parseDate(isoString: string): ZonedDateTime | null {
        // Parse "2026-02-15T12:30:00-08:00"
        const match = isoString.match(
            /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2})$/
        );
        if (!match) return null;

        const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, offsetStr] = match;
        const localDateTime = LocalDateTime.of(
            parseInt(yearStr),
            parseInt(monthStr),
            parseInt(dayStr),
            parseInt(hourStr),
            parseInt(minuteStr),
            parseInt(secondStr)
        );

        return localDateTime.atZone(ZoneId.of(offsetStr));
    }

    private parseDuration(isoDuration: string): Duration {
        // Parse ISO 8601 duration: "PT2H6M", "PT1H40M", "PT2H", "PT90M"
        const match = isoDuration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
        if (!match) return Duration.ofHours(2); // fallback

        const hours = parseInt(match[1] || '0');
        const minutes = parseInt(match[2] || '0');
        return Duration.ofMinutes(hours * 60 + minutes);
    }
}

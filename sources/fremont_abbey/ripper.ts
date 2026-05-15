import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

interface HumanitixEvent {
    "@type": string;
    name: string;
    url: string;
    startDate: string;
    endDate?: string;
    description?: string;
    image?: string;
    location?: {
        "@type"?: string;
        name?: string;
        address?: {
            streetAddress?: string;
            addressLocality?: string;
            addressRegion?: string;
            postalCode?: string;
        };
    };
}

interface HumanitixListItem {
    "@type": string;
    position?: number;
    item?: HumanitixEvent;
    // Sometimes the event is inlined directly
    name?: string;
    url?: string;
    startDate?: string;
}

// Strip leading date prefixes like "5/15 ", "6/4 ", "4/14, 5/5, 6/9 " from titles.
export function stripDatePrefix(name: string): string {
    return name.replace(/^[\d/,\s]+(?=\S)/, '').trim();
}

// Humanitix emits offsets like "-0700" (no colon); js-joda requires "-07:00".
function normalizeIsoOffset(dateStr: string): string {
    return dateStr.replace(/([+-])(\d{2})(\d{2})$/, '$1$2:$3');
}

// Format location as "Venue Name, Street Address"
function formatLocation(location: HumanitixEvent["location"]): string | undefined {
    if (!location) return undefined;
    const street = location.address?.streetAddress ?? '';
    if (!street || street.toLowerCase().includes('varies')) return undefined;
    const venueName = location.name ?? '';
    return venueName ? `${venueName}, ${street}` : street;
}

export function extractHumanitixEvents(html: string): { events: HumanitixEvent[]; parseError?: RipperError } {
    const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(html)) !== null) {
        try {
            const data: unknown = JSON.parse(match[1]);
            if (
                data !== null &&
                typeof data === 'object' &&
                !Array.isArray(data) &&
                (data as Record<string, unknown>)['@type'] === 'ItemList'
            ) {
                const items = (data as { itemListElement?: HumanitixListItem[] }).itemListElement ?? [];
                const events: HumanitixEvent[] = [];
                for (const listItem of items) {
                    const event = (listItem.item ?? listItem) as HumanitixEvent;
                    if (event?.['@type'] === 'Event') {
                        events.push(event);
                    }
                }
                if (events.length > 0) return { events };
            }
        } catch { /* skip malformed JSON-LD */ }
    }
    return {
        events: [],
        parseError: {
            type: "ParseError",
            reason: "No Humanitix ItemList JSON-LD found on page",
            context: "fremont-abbey",
        },
    };
}

export function parseAbbeyArtsEvents(
    rawEvents: HumanitixEvent[],
    now: ZonedDateTime,
    timezone: ZoneId,
): { events: RipperCalendarEvent[]; errors: RipperError[] } {
    const events: RipperCalendarEvent[] = [];
    const errors: RipperError[] = [];
    const seen = new Set<string>();

    for (const event of rawEvents) {
        if (event['@type'] !== 'Event') continue;

        // Skip volunteer/meta events that have no fixed venue
        const street = event.location?.address?.streetAddress ?? '';
        if (!street || street.toLowerCase().includes('varies')) continue;

        if (seen.has(event.url)) continue;
        seen.add(event.url);

        let startZdt: ZonedDateTime;
        try {
            startZdt = ZonedDateTime.parse(normalizeIsoOffset(event.startDate)).withZoneSameInstant(timezone);
        } catch {
            errors.push({
                type: "ParseError",
                reason: `Invalid startDate: ${event.startDate}`,
                context: event.name,
            });
            continue;
        }

        if (startZdt.isBefore(now)) continue;

        let duration = Duration.ofHours(2);
        if (event.endDate) {
            try {
                const endZdt = ZonedDateTime.parse(normalizeIsoOffset(event.endDate)).withZoneSameInstant(timezone);
                const diffMinutes = Duration.between(startZdt, endZdt).toMinutes();
                if (diffMinutes > 0 && diffMinutes <= 8 * 60) {
                    duration = Duration.ofMinutes(diffMinutes);
                }
            } catch { /* keep default duration */ }
        }

        const slug = event.url.split('/').filter(Boolean).pop() ?? '';
        const title = decode(stripDatePrefix(event.name));
        const location = formatLocation(event.location);
        const description = event.description ? decode(event.description).substring(0, 500) : undefined;

        events.push({
            id: `fremont-abbey-${slug}`,
            ripped: new Date(),
            date: startZdt,
            duration,
            summary: title,
            description: description || undefined,
            location: location || undefined,
            url: event.url,
            image: event.image,
        });
    }

    return { events, errors };
}

export default class FremontAbbeyRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!res.ok) throw new Error(`Fremont Abbey returned HTTP ${res.status}`);

        const html = await res.text();
        const { events: rawEvents, parseError } = extractHumanitixEvents(html);
        const errors: RipperError[] = parseError ? [parseError] : [];
        const { events, errors: parseErrors } = parseAbbeyArtsEvents(rawEvents, now, timezone);

        const calConfig = ripper.config.calendars[0];
        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors: [...errors, ...parseErrors],
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}

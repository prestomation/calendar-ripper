import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, ParseError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const DEFAULT_LOCATION = "Emerald City Comedy Club, 210 Broadway E, Seattle, WA 98102";
const DEFAULT_DURATION_MINUTES = 120;
const BASE_URL = "https://www-emeraldcitycomedy-com.seatengine.com";

export interface SeatEngineEvent {
    "@type": string;
    name: string;
    startDate: string;
    endDate?: string;
    url?: string;
    image?: string;
    eventStatus?: string;
}

// Extract all JSON-LD blocks from an HTML page. Returns Event entries and any ParseErrors.
// Non-Event JSON-LD types (Organization, etc.) are silently skipped.
// Handles three JSON-LD shapes:
//   1. Single object: {"@type": "Event", ...}
//   2. Root array:    [{"@type": "Event", ...}, ...]
//   3. @graph block:  {"@graph": [{"@type": "Event", ...}, ...]}
export function parseEventsFromHtml(html: string): Array<SeatEngineEvent | ParseError> {
    const results: Array<SeatEngineEvent | ParseError> = [];
    const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;

    while ((match = scriptRe.exec(html)) !== null) {
        const raw = match[1].trim();
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            results.push({
                type: 'ParseError',
                reason: 'Malformed JSON-LD block',
                context: raw.slice(0, 100),
            });
            continue;
        }

        // Collect all candidate objects from this JSON-LD block
        const candidates: unknown[] = [];
        if (Array.isArray(parsed)) {
            candidates.push(...parsed);
        } else if (parsed && typeof parsed === 'object') {
            const obj = parsed as Record<string, unknown>;
            if (Array.isArray(obj['@graph'])) {
                candidates.push(...(obj['@graph'] as unknown[]));
            } else {
                candidates.push(parsed);
            }
        }

        for (const candidate of candidates) {
            if (!candidate || typeof candidate !== 'object') continue;
            const obj = candidate as Record<string, unknown>;

            // @type may be a string or an array of strings
            const typeVal = obj['@type'];
            const isEvent = typeVal === 'Event' ||
                (Array.isArray(typeVal) && typeVal.includes('Event'));
            if (!isEvent) continue;

            if (typeof obj['name'] !== 'string' || !obj['name']) {
                results.push({ type: 'ParseError', reason: 'Event JSON-LD missing name', context: undefined });
                continue;
            }
            if (typeof obj['startDate'] !== 'string' || !obj['startDate']) {
                results.push({ type: 'ParseError', reason: 'Event JSON-LD missing startDate', context: obj['name'] as string });
                continue;
            }

            results.push({
                '@type': 'Event',
                name: obj['name'] as string,
                startDate: obj['startDate'] as string,
                endDate: typeof obj['endDate'] === 'string' ? obj['endDate'] : undefined,
                url: typeof obj['url'] === 'string' ? obj['url'] : undefined,
                image: typeof obj['image'] === 'string' ? obj['image'] : undefined,
                eventStatus: typeof obj['eventStatus'] === 'string' ? obj['eventStatus'] : undefined,
            });
        }
    }

    return results;
}

// Parse an ISO 8601 datetime string (e.g. "2026-05-15T19:30:00-07:00") into a ZonedDateTime.
// The offset in the source string is ignored — events are always in Pacific time.
// Returns a ParseError if the date components are missing or invalid.
export function parseStartDate(startDate: string, name: string, zone: ZoneId): ZonedDateTime | ParseError {
    const m = startDate.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (!m) {
        return { type: 'ParseError', reason: `Unparseable startDate format: ${startDate}`, context: name };
    }

    try {
        const ldt = LocalDateTime.of(
            parseInt(m[1], 10),
            parseInt(m[2], 10),
            parseInt(m[3], 10),
            parseInt(m[4], 10),
            parseInt(m[5], 10),
            parseInt(m[6], 10),
        );
        return ZonedDateTime.of(ldt, zone);
    } catch {
        return { type: 'ParseError', reason: `Invalid date components in: ${startDate}`, context: name };
    }
}

// Calculate duration in minutes between two ISO 8601 datetime strings.
// Falls back to DEFAULT_DURATION_MINUTES if endDate is missing or invalid.
export function parseDurationMinutes(startDate: string, endDate: string | undefined): number {
    if (!endDate) return DEFAULT_DURATION_MINUTES;

    const startMs = Date.parse(startDate);
    const endMs = Date.parse(endDate);
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return DEFAULT_DURATION_MINUTES;

    return Math.round((endMs - startMs) / 60000);
}

export default class EmeraldCityComedyRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const zone = ZoneId.of(calConfig.timezone.toString());
        const now = ZonedDateTime.now(zone);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) {
            throw new Error(`SeatEngine returned ${res.status} ${res.statusText}`);
        }

        const html = await res.text();
        const parsed = parseEventsFromHtml(html);

        const errors: RipperError[] = [];
        const events: RipperCalendarEvent[] = [];
        const seenUrls = new Set<string>();

        for (const item of parsed) {
            if ('type' in item) {
                errors.push(item);
                continue;
            }

            // Skip cancelled events
            if (
                item.eventStatus === 'https://schema.org/EventCancelled' ||
                item.eventStatus === 'EventCancelled'
            ) {
                continue;
            }

            const dateResult = parseStartDate(item.startDate, item.name, zone);
            if ('type' in dateResult) {
                errors.push(dateResult);
                continue;
            }

            // Skip past events
            if (dateResult.isBefore(now)) continue;

            // Deduplicate by URL (same show may appear multiple times for different ticket tiers)
            const url = item.url ?? `${BASE_URL}/shows`;
            if (seenUrls.has(url)) continue;
            seenUrls.add(url);

            const durationMinutes = parseDurationMinutes(item.startDate, item.endDate);
            const slug = url.split('/').filter(Boolean).pop() ?? '';
            const id = slug
                ? `emerald-city-comedy-${slug}`
                : `emerald-city-comedy-${item.startDate.slice(0, 10)}`;

            events.push({
                id,
                ripped: new Date(),
                date: dateResult,
                duration: Duration.ofMinutes(durationMinutes),
                summary: item.name,
                location: DEFAULT_LOCATION,
                url: item.url,
                ...(item.image ? { image: item.image } : {}),
            });
        }

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}

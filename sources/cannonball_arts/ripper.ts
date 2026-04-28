import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, ParseError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const LOCATION = "1930 3rd Ave, Seattle, WA 98101";
const DEFAULT_DURATION_MINUTES = 120;
const DEFAULT_START_HOUR = 18; // 6pm fallback when no time found

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

export interface CbaApiEvent {
    id: number;
    date: string;
    title: { rendered: string };
    content: { rendered: string };
    link: string;
    yoast_head_json?: {
        og_image?: Array<{ url: string }>;
    };
}

export interface ParsedDate {
    month: number;
    day: number;
    hour: number;
    minute: number;
    durationMinutes: number;
}

export function decodeHtmlEntities(str: string): string {
    return str
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'");
}

export function stripHtml(html: string): string {
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'")
        // Decode numeric HTML entities in text (e.g. &#8217; = right single quote)
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Parse event dates from plain text scraped from the content HTML.
 *
 * Handles two patterns:
 * 1. Single date with time range: "Month D from H–H PM" or "Month D from H:MM-H:MM AM/PM"
 * 2. Multi-day ranges: "Month D1-D2" or "Month D1-D2 & D3-D4" (with optional time)
 *
 * Returns an empty array if no parseable date is found.
 */
export function parseDatesFromText(text: string): ParsedDate[] {
    const monthPattern = MONTHS.map(m => m[0].toUpperCase() + m.slice(1)).join('|');
    const results: ParsedDate[] = [];

    // Pattern 1: "Month D from H[-–]H PM" or "Month D from H:MM[-–]H:MM AM/PM"
    // Covers en-dash (–, U+2013) and ASCII hyphen
    const timeRangeRe = new RegExp(
        `(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b[^.\\n]*?from\\s+(\\d{1,2})(?::(\\d{2}))?\\s*[-\u2013]\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)`,
        'gi'
    );

    let match: RegExpExecArray | null;
    timeRangeRe.lastIndex = 0;
    while ((match = timeRangeRe.exec(text)) !== null) {
        const monthIdx = MONTHS.findIndex(m => m === match![1].toLowerCase());
        if (monthIdx === -1) continue;
        const month = monthIdx + 1;
        const day = parseInt(match[2], 10);
        let startH = parseInt(match[3], 10);
        const startM = parseInt(match[4] ?? '0', 10);
        let endH = parseInt(match[5], 10);
        const endM = parseInt(match[6] ?? '0', 10);
        const ampm = match[7].toLowerCase();

        // Adjust end hour for AM/PM
        if (ampm === 'pm' && endH !== 12) endH += 12;
        else if (ampm === 'am' && endH === 12) endH = 0;

        // Infer start AM/PM: if start < 12 and the adjusted end hour minus 12 is still > start,
        // then start is PM (e.g., "from 2–5pm" → start=2, end=17, 2 < 17-12=5 → start=14pm)
        if (startH !== 12 && startH < 12) {
            const endIn12h = endH > 12 ? endH - 12 : endH;
            if (ampm === 'pm' && startH < endIn12h) startH += 12;
        }

        const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
        results.push({
            month,
            day,
            hour: startH,
            minute: startM,
            durationMinutes: durationMinutes > 0 ? durationMinutes : DEFAULT_DURATION_MINUTES,
        });
    }

    if (results.length > 0) return results;

    // Pattern 2: "Month D1-D2 [& D3-D4]" — multi-day ranges with optional second range
    // Require the day range separator to be an ASCII hyphen (not en-dash) to avoid false
    // positives on en-dash time ranges that lack a "from" keyword.
    const multiDayRe = new RegExp(
        `(${monthPattern})\\s+(\\d{1,2})-(\\d{1,2})(?:\\s*&\\s*(\\d{1,2})-(\\d{1,2}))?`,
        'gi'
    );

    // Also look for a standalone time ("@Hpm" or "from H:MMam/pm") to attach to multi-day events
    const standaloneTimeRe = /(?:@|from\s+|at\s+)(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
    const standaloneMatch = text.match(standaloneTimeRe);
    let standaloneHour = DEFAULT_START_HOUR;
    let standaloneMinute = 0;
    if (standaloneMatch) {
        standaloneHour = parseInt(standaloneMatch[1], 10);
        standaloneMinute = parseInt(standaloneMatch[2] ?? '0', 10);
        const ampm = standaloneMatch[3].toLowerCase();
        if (ampm === 'pm' && standaloneHour !== 12) standaloneHour += 12;
        else if (ampm === 'am' && standaloneHour === 12) standaloneHour = 0;
    }

    multiDayRe.lastIndex = 0;
    while ((match = multiDayRe.exec(text)) !== null) {
        const monthIdx = MONTHS.findIndex(m => m === match![1].toLowerCase());
        if (monthIdx === -1) continue;
        const month = monthIdx + 1;
        const startDay1 = parseInt(match[2], 10);
        const endDay1 = parseInt(match[3], 10);

        for (let d = startDay1; d <= endDay1; d++) {
            results.push({ month, day: d, hour: standaloneHour, minute: standaloneMinute, durationMinutes: DEFAULT_DURATION_MINUTES });
        }

        if (match[4] !== undefined && match[5] !== undefined) {
            const startDay2 = parseInt(match[4], 10);
            const endDay2 = parseInt(match[5], 10);
            for (let d = startDay2; d <= endDay2; d++) {
                results.push({ month, day: d, hour: standaloneHour, minute: standaloneMinute, durationMinutes: DEFAULT_DURATION_MINUTES });
            }
        }
    }

    return results;
}

export default class CannonballArtsRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const zone = ZoneId.of(calConfig.timezone.toString());
        const now = ZonedDateTime.now(zone);
        const currentYear = now.year();

        const res = await fetchFn(
            `${ripper.config.url.toString()}?per_page=100&_fields=id,title,content,link,date,yoast_head_json`,
            { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' } }
        );
        if (!res.ok) throw new Error(`Cannonball Arts API returned ${res.status} ${res.statusText}`);

        let apiEvents: CbaApiEvent[];
        try {
            apiEvents = await res.json();
        } catch (e) {
            throw new Error(`Failed to parse Cannonball Arts API response: ${e instanceof Error ? e.message : String(e)}`);
        }

        const errors: RipperError[] = [];
        const events: RipperCalendarEvent[] = [];

        for (const apiEvent of apiEvents) {
            const title = decodeHtmlEntities(apiEvent.title.rendered);
            const plainText = stripHtml(apiEvent.content.rendered);
            const image = apiEvent.yoast_head_json?.og_image?.[0]?.url;

            const parsedDates = parseDatesFromText(plainText);

            if (parsedDates.length === 0) {
                errors.push({
                    type: 'ParseError',
                    reason: 'No parseable date found in event content',
                    context: title,
                });
                continue;
            }

            // Determine a stable year for each parsed date. Use current year; if that date
            // is already in the past we skip it (not an error — past events are expected).
            const useMultiSuffix = parsedDates.length > 1;

            for (let i = 0; i < parsedDates.length; i++) {
                const pd = parsedDates[i];

                // Resolve year: use current year; if date is in the past, skip silently.
                let year = currentYear;
                let tryZdt: ZonedDateTime;
                try {
                    const tryDate = LocalDateTime.of(year, pd.month, pd.day, pd.hour, pd.minute);
                    tryZdt = ZonedDateTime.of(tryDate, zone);
                } catch (e) {
                    errors.push({
                        type: 'ParseError',
                        reason: `Invalid date: ${pd.month}/${pd.day}/${year} ${pd.hour}:${pd.minute}`,
                        context: title,
                    });
                    continue;
                }
                if (tryZdt.isBefore(now)) {
                    continue;
                }

                const dateStr = `${year}-${String(pd.month).padStart(2, '0')}-${String(pd.day).padStart(2, '0')}`;
                const id = useMultiSuffix
                    ? `cannonball-arts-${apiEvent.id}-${dateStr}`
                    : `cannonball-arts-${apiEvent.id}`;

                const eventDate = ZonedDateTime.of(
                    LocalDateTime.of(year, pd.month, pd.day, pd.hour, pd.minute),
                    zone
                );

                events.push({
                    id,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofMinutes(pd.durationMinutes),
                    summary: title,
                    location: LOCATION,
                    url: apiEvent.link,
                    ...(image ? { image } : {}),
                });
            }

            // If all parsed dates were in the past, it's a silently-skipped expired event,
            // not a parse error.
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

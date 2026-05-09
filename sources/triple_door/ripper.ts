import { Duration, LocalDate, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, ParseError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const BASE_URL = "https://thetripledoor.net";
const DEFAULT_LOCATION = "216 Union St, Seattle, WA 98101";
const DEFAULT_DURATION_MINUTES = 120;
const MAX_PAGES = 60;

const MONTHS: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
    sep: 9, oct: 10, nov: 11, dec: 12,
};

export interface ParsedEvent {
    title: string;
    url: string;
    dateStr: string;
    timeStr: string;
    location: string;
    ticketUrl: string;
}

// Extract the turbo-stream list feature URL from the main calendar page.
// Returns the base path like "/mainstage-calendar/features/load/calendar_feature_906435.turbo_stream"
export function extractTurboStreamBase(html: string): string | null {
    const m = html.match(/href="(\/mainstage-calendar\/features\/load\/calendar_feature_\d+\.turbo_stream)\?calendar_page=2"/);
    return m ? m[1] : null;
}

// Parse the max page number from pagination links.
export function extractMaxPage(html: string): number {
    const matches = [...html.matchAll(/calendar_page=(\d+)/g)];
    let max = 1;
    for (const m of matches) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
    }
    return max;
}

// Strip HTML entities and tags from a string.
function decodeHtml(str: string): string {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Parse events from an HTML chunk (main page or turbo-stream response).
// Each event div has class "event-detail". Only parses the "date-long" span
// to avoid duplicate entries from the "date-short" span.
export function parseEventsFromHtml(html: string): ParsedEvent[] {
    const events: ParsedEvent[] = [];

    // Split by event-detail divs
    const eventDivs = html.split('<div class="event-detail"');
    // First element is before first event, skip it
    for (const div of eventDivs.slice(1)) {
        // Title and URL
        const titleMatch = div.match(/class="event-info event-title[^"]*"[^>]*><a href="([^"]+)">([\s\S]*?)<\/a>/);
        if (!titleMatch) continue;
        const url = titleMatch[1].startsWith('http') ? titleMatch[1] : BASE_URL + titleMatch[1];
        const title = decodeHtml(titleMatch[2]);

        // Date and time — only from date-long span to avoid duplicate short form
        const dateLongMatch = div.match(/<span class="date-long">([\s\S]*?)<\/span>\s*<span class="date-short">/);
        if (!dateLongMatch) continue;
        const dateLong = dateLongMatch[1];
        const dateMatch = dateLong.match(/<span class="date">(.*?)<\/span>/);
        const timeMatch = dateLong.match(/class="time">(.*?)<\/span>/);
        if (!dateMatch || !timeMatch) continue;
        const dateStr = decodeHtml(dateMatch[1]);
        const timeStr = decodeHtml(timeMatch[1]);

        // Location
        const locationMatch = div.match(/class="event-info event-location"[\s\S]*?<a[^>]*>(.*?)<\/a>/);
        const location = locationMatch ? decodeHtml(locationMatch[1]) : DEFAULT_LOCATION;

        // Ticket URL
        const ticketMatch = div.match(/class="tickets button"[^>]*href="([^"]+)"/);
        const ticketUrl = ticketMatch ? ticketMatch[1] : url;

        events.push({ title, url, dateStr, timeStr, location, ticketUrl });
    }

    return events;
}

// Parse a date string like "Friday, May 8" or "Tuesday, March 9, 2027"
// Returns a LocalDate or null if parsing fails.
// If no year in string and computed date is in the past, bumps to next year.
export function parseDateStr(dateStr: string, today: LocalDate): LocalDate | null {
    // Match: Weekday, Month Day[, Year]
    const m = dateStr.match(/\w+,\s+(\w+)\s+(\d+)(?:,\s+(\d{4}))?/);
    if (!m) return null;

    const monthName = m[1].toLowerCase();
    const day = parseInt(m[2], 10);
    const explicitYear = m[3] ? parseInt(m[3], 10) : null;

    const monthNum = MONTHS[monthName];
    if (!monthNum) return null;

    if (explicitYear !== null) {
        try {
            return LocalDate.of(explicitYear, monthNum, day);
        } catch {
            return null;
        }
    }

    // No explicit year: try current year, then next year if past
    const year = today.year();
    try {
        const candidate = LocalDate.of(year, monthNum, day);
        return candidate.isBefore(today) ? LocalDate.of(year + 1, monthNum, day) : candidate;
    } catch {
        return null;
    }
}

// Parse a time string like "7:30PM" or "11:00AM"
// Returns [hour, minute] in 24-hour or null if parsing fails.
export function parseTimeStr(timeStr: string): [number, number] | null {
    const m = timeStr.match(/(\d{1,2}):(\d{2})(AM|PM)/i);
    if (!m) return null;
    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    const ampm = m[3].toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    else if (ampm === 'AM' && hour === 12) hour = 0;
    return [hour, minute];
}

// Convert a ParsedEvent into a RipperCalendarEvent or ParseError.
export function toCalendarEvent(
    parsed: ParsedEvent,
    zone: ZoneId,
    today: LocalDate,
): RipperCalendarEvent | ParseError {
    const date = parseDateStr(parsed.dateStr, today);
    if (!date) {
        return { type: 'ParseError', reason: `Could not parse date: "${parsed.dateStr}"`, context: parsed.title };
    }

    const time = parseTimeStr(parsed.timeStr);
    if (!time) {
        return { type: 'ParseError', reason: `Could not parse time: "${parsed.timeStr}"`, context: parsed.title };
    }

    const [hour, minute] = time;
    let eventDate: ZonedDateTime;
    try {
        eventDate = ZonedDateTime.of(
            LocalDateTime.of(date.year(), date.monthValue(), date.dayOfMonth(), hour, minute),
            zone,
        );
    } catch (e) {
        return { type: 'ParseError', reason: `Invalid date/time: ${e}`, context: parsed.title };
    }

    return {
        id: `triple-door-${parsed.url.replace(/[^a-z0-9]/gi, '-')}`,
        ripped: new Date(),
        date: eventDate,
        duration: Duration.ofMinutes(DEFAULT_DURATION_MINUTES),
        summary: parsed.title,
        location: parsed.location,
        url: parsed.ticketUrl,
    };
}

export default class TripleDoorRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const zone = ZoneId.of(calConfig.timezone.toString());
        const now = ZonedDateTime.now(zone);
        const today = now.toLocalDate();

        // Fetch the main calendar page to get the turbo-stream URL and max page
        const mainRes = await fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!mainRes.ok) {
            throw new Error(`Triple Door calendar returned ${mainRes.status} ${mainRes.statusText}`);
        }
        const mainHtml = await mainRes.text();

        const turboBase = extractTurboStreamBase(mainHtml);
        if (!turboBase) {
            throw new Error('Could not find turbo-stream pagination URL in Triple Door calendar page');
        }
        const maxPage = Math.min(extractMaxPage(mainHtml), MAX_PAGES);

        const errors: RipperError[] = [];
        const events: RipperCalendarEvent[] = [];
        const seenIds = new Set<string>();

        // Process main page events
        for (const parsed of parseEventsFromHtml(mainHtml)) {
            const result = toCalendarEvent(parsed, zone, today);
            if ('date' in result) {
                if (result.date.isAfter(now) && !seenIds.has(result.id)) {
                    seenIds.add(result.id);
                    events.push(result);
                }
            } else {
                errors.push(result);
            }
        }

        // Fetch subsequent pages
        for (let page = 2; page <= maxPage; page++) {
            const pageUrl = `${BASE_URL}${turboBase}?calendar_page=${page}`;
            const pageRes = await fetchFn(pageUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)',
                    'Accept': 'text/vnd.turbo-stream.html, text/html',
                },
            });
            if (!pageRes.ok) break;

            const pageHtml = await pageRes.text();
            const pageEvents = parseEventsFromHtml(pageHtml);
            if (pageEvents.length === 0) break;

            for (const parsed of pageEvents) {
                const result = toCalendarEvent(parsed, zone, today);
                if ('date' in result) {
                    if (result.date.isAfter(now) && !seenIds.has(result.id)) {
                        seenIds.add(result.id);
                        events.push(result);
                    }
                } else {
                    errors.push(result);
                }
            }
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

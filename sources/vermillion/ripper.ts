import { Duration, LocalDate, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const TIMEZONE = ZoneId.of('America/Los_Angeles');
const LOCATION = "Vermillion, 1508 11th Ave, Seattle, WA 98122";
const BASE_URL = "https://www.vermillionseattle.com";
const ARTCHIVES_URL = `${BASE_URL}/artchives?format=json`;
// h4 headings that are NOT exhibition names (navigation/utility sections)
const NON_EXHIBITION_H4 = /^(having a party|location|contact|hours|about|gallery|event rental|open now|currently)/i;

const MONTH_NAMES: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const MONTH_PATTERN = Object.keys(MONTH_NAMES).join('|');

export function stripHtml(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

// Parse a time string like "5pm", "5-9pm", "5:30pm", "6-10pm" into {hour, minute, endHour, endMinute}
export function parseTimeRange(timeStr: string): { hour: number; minute: number; endHour?: number; endMinute?: number } | null {
    const match = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(?:-\s*(\d{1,2})(?::(\d{2}))?\s*)?(am|pm)$/i);
    if (!match) return null;

    const [, startH, startM, endH, endM, meridiem] = match;
    const isPM = meridiem.toLowerCase() === 'pm';

    let hour = parseInt(startH, 10);
    const minute = startM ? parseInt(startM, 10) : 0;

    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;

    const result: { hour: number; minute: number; endHour?: number; endMinute?: number } = { hour, minute };

    if (endH) {
        let endHour = parseInt(endH, 10);
        const endMinute = endM ? parseInt(endM, 10) : 0;
        if (isPM && endHour !== 12) endHour += 12;
        result.endHour = endHour;
        result.endMinute = endMinute;
    }

    return result;
}

interface ParsedEvent {
    label: string;
    month: number;
    day: number;
    year: number;
    hour: number;
    minute: number;
    endHour?: number;
    endMinute?: number;
}

// Extract the exhibition name from the blog post title ("May 2026: SKRIMSLI - Leah Fadness" → "SKRIMSLI - Leah Fadness")
export function extractExhibitionName(title: string): string {
    return title.replace(/^[A-Za-z]+\s+\d{4}:\s*/, '').trim();
}

// Parse a line of text for a dated event. Returns null if no date found.
export function parseLine(line: string, contextYear: number): ParsedEvent | null {
    // Strip leading label words like "Opening", "Capitol Hill Artwalk", then look for date + time
    // Pattern: [optional label,] [DayName,] Month Day[, Year][,] H[:MM][–H[:MM]]am/pm
    const dateTimeRe = new RegExp(
        `(${MONTH_PATTERN})\\s+(\\d{1,2})(?:,\\s*(\\d{4}))?[,\\s]+` +
        `(\\d{1,2}(?::\\d{2})?(?:\\s*-\\s*\\d{1,2}(?::\\d{2})?)?\\s*(?:am|pm))`,
        'i'
    );

    const m = line.match(dateTimeRe);
    if (!m) return null;

    const [, monthStr, dayStr, yearStr, timeStr] = m;
    const month = MONTH_NAMES[monthStr.toLowerCase()];
    const day = parseInt(dayStr, 10);
    const year = yearStr ? parseInt(yearStr, 10) : contextYear;
    const time = parseTimeRange(timeStr.trim());
    if (!time) return null;

    // Derive a short label from the line (trim date/time noise)
    const label = line
        .replace(dateTimeRe, '')
        .replace(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s]*/i, '')
        .replace(/[,\s]+$/, '')
        .trim();

    return { label, month, day, year, ...time };
}

export function parseBodyForEvents(
    body: string,
    exhibitionName: string,
    contextYear: number
): Array<RipperCalendarEvent | RipperError> {
    const text = stripHtml(body);
    const lines = text.split(/\n|(?<=pm|am)\s+(?=[A-Z])/i).map(l => l.trim()).filter(Boolean);

    const results: Array<RipperCalendarEvent | RipperError> = [];
    const seen = new Set<string>();

    for (const line of lines) {
        const parsed = parseLine(line, contextYear);
        if (!parsed) continue;

        const { month, day, year, hour, minute, endHour, endMinute, label } = parsed;

        const dedup = `${year}-${month}-${day}-${hour}-${minute}`;
        if (seen.has(dedup)) continue;
        seen.add(dedup);

        let startMinutes = hour * 60 + minute;
        let endMinutes = endHour !== undefined ? endHour * 60 + (endMinute ?? 0) : startMinutes + 180;
        if (endMinutes <= startMinutes) endMinutes = startMinutes + 180;
        const durationMinutes = endMinutes - startMinutes;

        let summary = exhibitionName;
        if (label) {
            if (/opening/i.test(label)) summary = `${exhibitionName} — Opening Reception`;
            else if (/artwalk/i.test(label)) summary = `${exhibitionName} — Capitol Hill Artwalk`;
            else summary = `${exhibitionName} — ${label}`;
        }

        try {
            const dt = ZonedDateTime.of(
                LocalDateTime.of(year, month, day, hour, minute),
                TIMEZONE
            );
            results.push({
                summary,
                date: dt,
                duration: Duration.ofMinutes(durationMinutes),
                location: LOCATION,
                url: 'https://vermillionseattle.com',
            } as RipperCalendarEvent);
        } catch {
            results.push({ type: 'ParseError', reason: `Invalid date: ${year}-${month}-${day}`, context: line } as RipperError);
        }
    }

    return results;
}

interface ArtchivesItem {
    title: string;
    publishOn: number;
    body: string;
    urlId?: string;
}

interface ArtchivesResponse {
    items: ArtchivesItem[];
}

export default class VermillionRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    private async fetchWithUA(url: string): Promise<Response> {
        return this.fetchFn(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
    }

    // Scrape the homepage to get the current exhibition's events, which appear
    // on the live site before being archived to /artchives.
    private async fetchHomepageEvents(now: LocalDate): Promise<{ events: RipperCalendarEvent[]; errors: RipperError[] }> {
        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        try {
            const res = await this.fetchWithUA(BASE_URL);
            if (!res.ok) return { events, errors };

            const html = await res.text();

            // Find the exhibition name from the first h4 that isn't a utility heading
            const h4Regex = /<h4[^>]*>([\s\S]*?)<\/h4>/gi;
            let exhibitionName = '';
            let m;
            while ((m = h4Regex.exec(html)) !== null) {
                const text = stripHtml(m[1]).trim();
                if (text && !NON_EXHIBITION_H4.test(text)) {
                    exhibitionName = text;
                    break;
                }
            }
            if (!exhibitionName) return { events, errors };

            const parsed = parseBodyForEvents(html, exhibitionName, now.year());
            for (const result of parsed) {
                if ('date' in result) {
                    if (!result.date.toLocalDate().isBefore(now)) events.push(result);
                } else {
                    errors.push(result);
                }
            }
        } catch {
            // Homepage scraping is best-effort; don't crash the ripper
        }

        return { events, errors };
    }

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const now = LocalDate.now();
        const windowStart = now.minusMonths(2);
        const windowEnd = now.plusMonths(4);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];
        // Track seen events by date+time to avoid duplicating events that appear
        // in both the homepage (current show) and artchives (once archived).
        const seenKeys = new Set<string>();

        const addEvent = (e: RipperCalendarEvent) => {
            const key = `${e.date.year()}-${e.date.monthValue()}-${e.date.dayOfMonth()}-${e.date.hour()}-${e.date.minute()}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                events.push(e);
            }
        };

        // Homepage first: current show may not be in artchives yet
        const homepage = await this.fetchHomepageEvents(now);
        homepage.events.forEach(addEvent);
        errors.push(...homepage.errors);

        // Artchives: previous shows with upcoming events (e.g. closing receptions)
        const res = await this.fetchWithUA(ARTCHIVES_URL);
        if (!res.ok) throw new Error(`Vermillion artchives returned HTTP ${res.status}`);

        const data = await res.json() as ArtchivesResponse;
        const items = data.items ?? [];

        for (const item of items) {
            const publishDate = LocalDate.ofEpochDay(Math.floor(item.publishOn / 86400000));
            if (publishDate.isBefore(windowStart) || publishDate.isAfter(windowEnd)) continue;

            const exhibitionName = extractExhibitionName(item.title);
            const contextYear = publishDate.year();
            const parsed = parseBodyForEvents(item.body ?? '', exhibitionName, contextYear);

            for (const result of parsed) {
                if ('date' in result) {
                    if (!result.date.toLocalDate().isBefore(now)) addEvent(result);
                } else {
                    errors.push(result);
                }
            }
        }

        const cal = ripper.config.calendars[0];
        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            tags: [...(ripper.config.tags ?? []), ...(cal.tags ?? [])],
            events,
            errors,
        }];
    }
}

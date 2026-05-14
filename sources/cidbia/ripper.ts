import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const BASE_URL = "https://www.seattlechinatownid.com";
const TIMEZONE = ZoneId.of('America/Los_Angeles');
const DEFAULT_DURATION_HOURS = 2;

const MONTH_NAMES: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

interface ParsedTime {
    hour: number;
    minute: number;
}

export default class CIDBIARipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const now = ZonedDateTime.now(TIMEZONE);
        const months = await this.fetchMonths(ripper.config.url.href, now);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const { html, monthUrl } of months) {
            const results = this.parseEvents(html, monthUrl);
            for (const r of results) {
                if ('date' in r) {
                    if (!r.date.isBefore(now)) events.push(r);
                } else {
                    errors.push(r);
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

    private async fetchMonths(baseUrl: string, now: ZonedDateTime): Promise<{ html: string; monthUrl: string }[]> {
        const results: { html: string; monthUrl: string }[] = [];

        // Fetch current month and next 2 months
        for (let offset = 0; offset < 3; offset++) {
            const date = now.plusMonths(offset);
            const year = date.year();
            const month = date.monthValue();
            const url = offset === 0 ? baseUrl : `${BASE_URL}/local-events/month/${year}/${month}/`;

            const res = await this.fetchFn(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
            });
            if (!res.ok) throw new Error(`CIDBIA events page returned ${res.status}`);
            results.push({ html: await res.text(), monthUrl: url });
        }

        return results;
    }

    // Public for testing
    parseEvents(html: string, pageUrl: string): Array<RipperCalendarEvent | RipperError> {
        const results: Array<RipperCalendarEvent | RipperError> = [];

        const year = this.parseMonthYear(html);
        if (!year) return results;

        // Split on <h2> day headers to pair each header with its event block
        const sections = html.split(/<h2>[^<]*<\/h2>/);
        const headers = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)];

        for (let i = 0; i < headers.length; i++) {
            const headerText = headers[i][1].trim(); // e.g. "Friday May. 15th"
            const sectionHtml = sections[i + 1] ?? '';

            // Extract all collaItem divs in this section (before next h2)
            const collaItems = this.splitCollaItems(sectionHtml);
            for (const itemHtml of collaItems) {
                const result = this.parseEvent(itemHtml, headerText, year, pageUrl);
                results.push(result);
            }
        }

        return results;
    }

    private splitCollaItems(html: string): string[] {
        const items: string[] = [];
        const re = /<div class="collaItem">([\s\S]*?)<\/div>\s*\n\s*\t\n/g;
        // Match everything between collaItem divs using a simpler approach
        let start = 0;
        while (true) {
            const openIdx = html.indexOf('<div class="collaItem">', start);
            if (openIdx === -1) break;

            // Find the matching closing div by counting depth
            let depth = 1;
            let pos = openIdx + '<div class="collaItem">'.length;
            while (depth > 0 && pos < html.length) {
                const nextOpen = html.indexOf('<div', pos);
                const nextClose = html.indexOf('</div>', pos);
                if (nextClose === -1) break;
                if (nextOpen !== -1 && nextOpen < nextClose) {
                    depth++;
                    pos = nextOpen + 4;
                } else {
                    depth--;
                    pos = nextClose + 6;
                }
            }
            items.push(html.slice(openIdx, pos));
            start = pos;
        }
        return items;
    }

    private parseEvent(html: string, headerText: string, year: number, pageUrl: string): RipperCalendarEvent | RipperError {
        const title = this.extractText(html, /<div class="title">\s*<p>([^<]+)<\/p>/);
        if (!title) {
            return { type: 'ParseError', reason: 'No title found', context: headerText };
        }

        // Date text from time div: "May 15th"
        const datePText = this.extractText(html, /class="time bottomMargin">\s*<p class="title">When<\/p>\s*<p>([^<]+)<\/p>/);
        // Time text: "6:30pm - 9:30pm"
        const timePText = this.extractText(html, /class="time bottomMargin">[\s\S]*?<p>[^<]+<\/p>\s*<p>([^<]+)<\/p>/);

        if (!datePText) {
            return { type: 'ParseError', reason: 'No date found', context: title };
        }

        const monthDay = this.parseMonthDay(datePText);
        if (!monthDay) {
            return { type: 'ParseError', reason: `Could not parse date: ${datePText}`, context: title };
        }

        const { month, day } = monthDay;
        let startHour = 12, startMinute = 0;
        let durationMinutes = DEFAULT_DURATION_HOURS * 60;

        if (timePText) {
            const parsed = this.parseTimeRange(timePText);
            if (parsed) {
                startHour = parsed.start.hour;
                startMinute = parsed.start.minute;
                if (parsed.end) {
                    const endTotalMin = parsed.end.hour * 60 + parsed.end.minute;
                    const startTotalMin = startHour * 60 + startMinute;
                    if (endTotalMin > startTotalMin) {
                        durationMinutes = endTotalMin - startTotalMin;
                    }
                }
            }
        }

        const location = this.extractText(html, /class="address bottomMargin">\s*<p class="title">Where<\/p>\s*<p>([^<]+)<\/p>/);

        const icsLinkMatch = html.match(/href="https:\/\/www\.seattlechinatownid\.com\/local-events\/events\/(\d+)"/);
        const eventId = icsLinkMatch ? icsLinkMatch[1] : null;
        const url = eventId
            ? `https://www.seattlechinatownid.com/local-events/events/${eventId}`
            : pageUrl;

        let date: ZonedDateTime;
        try {
            date = ZonedDateTime.of(
                LocalDateTime.of(year, month, day, startHour, startMinute),
                TIMEZONE
            );
        } catch (e) {
            return { type: 'ParseError', reason: `Invalid date: ${year}-${month}-${day}`, context: title };
        }

        return {
            id: eventId ? `cidbia-${eventId}` : `cidbia-${year}-${month}-${day}-${title.slice(0, 20)}`,
            ripped: new Date(),
            date,
            duration: Duration.ofMinutes(durationMinutes),
            summary: title,
            location: location ?? undefined,
            url,
        };
    }

    // Public for testing
    parseMonthYear(html: string): number | null {
        // Matches: <p>May 2026</p> inside div.eventMonth
        const match = html.match(/class="eventMonth[^"]*"[\s\S]*?<p>(\w+ \d{4})<\/p>/);
        if (!match) return null;
        const parts = match[1].split(' ');
        return parts[1] ? parseInt(parts[1], 10) : null;
    }

    // Public for testing
    parseMonthDay(text: string): { month: number; day: number } | null {
        // e.g. "May 15th", "June 13th", "July 4th"
        const match = text.trim().match(/^(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?$/i);
        if (!match) return null;
        const month = MONTH_NAMES[match[1].toLowerCase()];
        const day = parseInt(match[2], 10);
        if (!month || !day) return null;
        return { month, day };
    }

    // Public for testing
    parseTimeRange(text: string): { start: ParsedTime; end?: ParsedTime } | null {
        // e.g. "6:30pm - 9:30pm", "11:00am - 5:00pm", "3:00pm - 7:00pm"
        const rangeRe = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
        const rangeMatch = text.match(rangeRe);
        if (rangeMatch) {
            const start = this.parseTime(rangeMatch[1], rangeMatch[2], rangeMatch[3]);
            const end = this.parseTime(rangeMatch[4], rangeMatch[5], rangeMatch[6]);
            return { start, end };
        }

        // Single time: "3:00pm"
        const singleRe = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
        const singleMatch = text.match(singleRe);
        if (singleMatch) {
            return { start: this.parseTime(singleMatch[1], singleMatch[2], singleMatch[3]) };
        }

        return null;
    }

    private parseTime(hourStr: string, minuteStr: string | undefined, ampm: string): ParsedTime {
        let hour = parseInt(hourStr, 10);
        const minute = minuteStr ? parseInt(minuteStr, 10) : 0;
        const isPm = ampm.toLowerCase() === 'pm';
        if (isPm && hour !== 12) hour += 12;
        if (!isPm && hour === 12) hour = 0;
        return { hour, minute };
    }

    private extractText(html: string, re: RegExp): string | null {
        const match = html.match(re);
        return match ? match[1].trim() : null;
    }
}

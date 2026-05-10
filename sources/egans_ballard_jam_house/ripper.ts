import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const LOCATION = "Egan's Ballard Jam House, 1707 NW Market St, Seattle, WA 98107";
const TIMEZONE = ZoneId.of('America/Los_Angeles');
const DEFAULT_DURATION_MINUTES = 120;
const URL = "https://www.ballardjamhouse.com/schedule.html";

const MONTH_NAMES: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

export interface ParsedDate {
    month: number;
    day: number;
}

export interface ParsedShow {
    hour: number;
    minute: number;
    summary: string;
}

export default class EgansBallardJamHouseRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const res = await this.fetchFn(URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' }
        });
        if (!res.ok) throw new Error(`Schedule page returned ${res.status}`);

        const html = await res.text();
        const now = ZonedDateTime.now(TIMEZONE);
        const parsed = this.parseSchedule(html, now);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: parsed.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: parsed.filter((e): e is RipperError => 'type' in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    // Public for testing
    parseSchedule(html: string, now: ZonedDateTime): Array<RipperCalendarEvent | RipperError> {
        const results: Array<RipperCalendarEvent | RipperError> = [];

        // Split on <dt> to get one section per date entry
        const sections = html.split(/(?=<dt>)/);

        for (const section of sections) {
            // Extract dt content (date text)
            const dtMatch = section.match(/<dt>([\s\S]*?)<\/dt>/);
            if (!dtMatch) continue;

            const dateInfo = this.parseDt(dtMatch[1]);
            if (!dateInfo) continue;

            // Extract all <dd>...</dd> in this section
            const ddPattern = /<dd>([\s\S]*?)<\/dd>/g;
            let ddMatch;
            while ((ddMatch = ddPattern.exec(section)) !== null) {
                const ddText = this.stripHtml(ddMatch[1]);
                const showInfo = this.parseShow(ddText);
                if (!showInfo) continue;

                const { month, day } = dateInfo;
                const { hour, minute, summary } = showInfo;

                const curYear = now.year();
                let eventDate = ZonedDateTime.of(
                    LocalDateTime.of(curYear, month, day, hour, minute),
                    TIMEZONE
                );
                // If event is in the past, try next year
                if (eventDate.isBefore(now)) {
                    eventDate = ZonedDateTime.of(
                        LocalDateTime.of(curYear + 1, month, day, hour, minute),
                        TIMEZONE
                    );
                }

                const id = `egans-${eventDate.year()}-${month}-${day}-${hour}-${minute}`;
                results.push({
                    id,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofMinutes(DEFAULT_DURATION_MINUTES),
                    summary,
                    location: LOCATION,
                    url: URL,
                });
            }
        }

        return results;
    }

    // Public for testing — parse "Fri May 1" or "Thu Jun 25" -> { month, day }
    parseDt(text: string): ParsedDate | null {
        // Format: optional "DayName " then "MonthName Day"
        const clean = text.replace(/\s+/g, ' ').trim();
        const match = clean.match(/(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+)?([A-Za-z]+)\s+(\d{1,2})/);
        if (!match) return null;

        const monthName = match[1].toLowerCase();
        // Accept full names ("may") and 3-letter abbreviations ("jun" -> "june")
        let month = MONTH_NAMES[monthName];
        if (!month) {
            const full = Object.keys(MONTH_NAMES).find(k => k.startsWith(monthName));
            if (full) month = MONTH_NAMES[full];
        }
        if (!month) return null;

        const day = parseInt(match[2], 10);
        return { month, day };
    }

    // Public for testing — parse "7pm - Performer Name..." -> { hour, minute, summary }
    parseShow(text: string): ParsedShow | null {
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!clean) return null;

        // Must start with a time like "7pm", "9:30pm", "9am"
        const timeMatch = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*-\s*/i);
        if (!timeMatch) return null;

        let hour = parseInt(timeMatch[1], 10);
        const minute = parseInt(timeMatch[2] ?? '0', 10);
        const ampm = timeMatch[3].toLowerCase();

        if (ampm === 'pm' && hour !== 12) hour += 12;
        else if (ampm === 'am' && hour === 12) hour = 0;

        // Summary: everything after "Xpm - "
        const summaryRaw = clean.slice(timeMatch[0].length).trim();
        const summary = this.cleanSummary(summaryRaw);
        if (!summary) return null;

        return { hour, minute, summary };
    }

    // Public for testing
    cleanSummary(text: string): string {
        return text
            .replace(/\[Website\]/gi, '')       // Remove "[Website]" link labels
            .replace(/\[[^\]]*\]/g, '')          // Remove any remaining [...] blocks
            .replace(/\(\$\d+[^)]*\)/g, '')      // Remove cover charge like "($15 cover)"
            .replace(/\(no cover\)/gi, '')        // Remove "(no cover)"
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Public for testing
    stripHtml(html: string): string {
        return html
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }
}

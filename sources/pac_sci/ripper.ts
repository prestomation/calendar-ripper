import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneRegion, ChronoUnit } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { parse } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

const MONTHS: Record<string, number> = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
};

const CONCURRENCY_LIMIT = 5;

interface ParsedDate {
    startDate: ZonedDateTime;
    duration: Duration;
}

export default class PacificScienceCenterRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const apiUrl = ripper.config.url.toString();

        // Fetch the event list from WordPress REST API
        const res = await fetch(`${apiUrl}?per_page=100`);
        if (!res.ok) {
            throw Error(`${res.status} ${res.statusText}`);
        }

        const eventsJson = await res.json();
        if (!Array.isArray(eventsJson)) {
            throw Error("Invalid API response: expected an array");
        }

        // Fetch individual event pages to extract actual dates
        // Batched to avoid overwhelming the server
        const eventPages = await this.fetchEventPages(eventsJson);

        // Initialize calendars
        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        // Parse events
        for (const cal of ripper.config.calendars) {
            const events = this.parseEvents(eventPages, cal.timezone);
            calendars[cal.name].events = events;
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

    private async fetchEventPages(eventsJson: any[]): Promise<{ event: any, heroHtml: string | null }[]> {
        const results: { event: any, heroHtml: string | null }[] = [];
        for (let i = 0; i < eventsJson.length; i += CONCURRENCY_LIMIT) {
            const batch = eventsJson.slice(i, i + CONCURRENCY_LIMIT);
            const batchResults = await Promise.all(
                batch.map(async (event: any) => {
                    const link = event.link;
                    if (!link) return { event, heroHtml: null };
                    try {
                        const pageRes = await fetch(link);
                        if (!pageRes.ok) return { event, heroHtml: null };
                        const html = await pageRes.text();
                        return { event, heroHtml: html };
                    } catch {
                        return { event, heroHtml: null };
                    }
                })
            );
            results.push(...batchResults);
        }
        return results;
    }

    public parseEvents(eventPages: { event: any, heroHtml: string | null }[], timezone: ZoneRegion): RipperEvent[] {
        const events: RipperEvent[] = [];

        for (const { event, heroHtml } of eventPages) {
            try {
                const title = event.title?.rendered
                    ? decode(event.title.rendered)
                    : "Untitled Event";

                // Extract date from the hero-event__description div on the event page
                let heroDateText: string | null = null;
                if (heroHtml) {
                    heroDateText = this.extractHeroDate(heroHtml);
                }

                if (!heroDateText) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not extract event date for "${title}"`,
                        context: event.link || undefined
                    });
                    continue;
                }

                const parsed = this.parseHeroDate(heroDateText, timezone);
                if (!parsed) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date "${heroDateText}" for "${title}"`,
                        context: event.link || undefined
                    });
                    continue;
                }

                // Build description from excerpt
                let description: string | undefined;
                if (event.excerpt?.rendered) {
                    description = this.stripHtml(decode(event.excerpt.rendered));
                }

                const url = event.link || undefined;

                // Extract image from yoast_head_json
                let image: string | undefined;
                if (event.yoast_head_json?.og_image?.length > 0) {
                    image = event.yoast_head_json.og_image[0].url;
                }

                const calendarEvent: RipperCalendarEvent = {
                    id: event.id?.toString(),
                    ripped: new Date(),
                    date: parsed.startDate,
                    duration: parsed.duration,
                    summary: title,
                    description,
                    location: "Pacific Science Center, 200 2nd Ave N, Seattle, WA",
                    url,
                    image
                };

                events.push(calendarEvent);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${error}`,
                    context: JSON.stringify(event).substring(0, 100) + "..."
                });
            }
        }

        return events;
    }

    /**
     * Extract the date text from the hero-event__description div.
     * The div contains the event date in formats like:
     *   "February 14, 7:00 p.m. <span> - </span> 10:00 p.m."
     *   "March 12 <span> - </span> March 15"
     *   "February 27, 7:30 p.m."
     *   "May 15"
     */
    public extractHeroDate(html: string): string | null {
        const root = parse(html);
        const heroDesc = root.querySelector('.hero-event__description');
        if (!heroDesc) return null;

        // Get the text content, replacing <span> separators with " - "
        let text = heroDesc.innerHTML;
        text = text.replace(/<span[^>]*>\s*-\s*<\/span>/gi, ' - ');
        text = text.replace(/<[^>]+>/g, '');
        // Normalize whitespace
        text = text.replace(/\s+/g, ' ').trim();

        return text || null;
    }

    /**
     * Parse a hero date text string into a ZonedDateTime and Duration.
     * Handles these formats:
     *   "February 14, 7:00 p.m. - 10:00 p.m."
     *   "March 21, 10:00 a.m. - 5:00 p.m."
     *   "February 27, 7:30 p.m."
     *   "March 12 - March 15"
     *   "May 15"
     *   "May 15, 2026, from 10:45 a.m.–1 p.m."
     */
    public parseHeroDate(text: string, timezone: ZoneRegion): ParsedDate | null {
        // Normalize dashes and whitespace
        text = text.replace(/–/g, '-').replace(/\s+/g, ' ').trim();
        // Remove "from " prefix before times
        text = text.replace(/,?\s*from\s+/i, ', ');

        const timePattern = /(\d{1,2}(?::\d{2})?)\s*(a\.m\.|p\.m\.|am|pm)/i;
        const monthDayPattern = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i;

        // Try: "Month Day, Time - Time" or "Month Day, Time"
        const singleDayWithTime = text.match(
            /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s*(\d{4}))?,?\s+(\d{1,2}(?::\d{2})?)\s*(a\.m\.|p\.m\.|am|pm)(?:\s*-\s*(\d{1,2}(?::\d{2})?)\s*(a\.m\.|p\.m\.|am|pm))?/i
        );

        if (singleDayWithTime) {
            const month = MONTHS[singleDayWithTime[1]];
            const day = parseInt(singleDayWithTime[2]);
            const explicitYear = singleDayWithTime[3] ? parseInt(singleDayWithTime[3]) : null;
            const startTime = this.parseTime(singleDayWithTime[4], singleDayWithTime[5]);
            const endTime = singleDayWithTime[6]
                ? this.parseTime(singleDayWithTime[6], singleDayWithTime[7])
                : null;

            const year = explicitYear || this.inferYear(month, day);
            const startDate = ZonedDateTime.of(
                LocalDateTime.of(year, month, day, startTime.hour, startTime.minute),
                timezone
            );

            let duration: Duration;
            if (endTime) {
                const endDate = ZonedDateTime.of(
                    LocalDateTime.of(year, month, day, endTime.hour, endTime.minute),
                    timezone
                );
                let minutes = startDate.until(endDate, ChronoUnit.MINUTES);
                // Handle cross-midnight events (e.g., 10 p.m. - 1 a.m.)
                if (minutes <= 0) minutes += 1440;
                duration = Duration.ofMinutes(minutes);
            } else {
                duration = Duration.ofHours(2);
            }

            return { startDate, duration };
        }

        // Try: "Month Day - Month Day" (multi-day)
        const multiDay = text.match(
            /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*-\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i
        );

        if (multiDay) {
            const startMonth = MONTHS[multiDay[1]];
            const startDay = parseInt(multiDay[2]);
            const endMonth = MONTHS[multiDay[3]];
            const endDay = parseInt(multiDay[4]);

            const startYear = this.inferYear(startMonth, startDay);
            // Handle year boundary (e.g., December 30 - January 2)
            const endYear = endMonth < startMonth ? startYear + 1 : startYear;
            const startDate = ZonedDateTime.of(
                LocalDateTime.of(startYear, startMonth, startDay, 0, 0),
                timezone
            );
            const endDate = ZonedDateTime.of(
                LocalDateTime.of(endYear, endMonth, endDay, 23, 59),
                timezone
            );

            const minutes = startDate.until(endDate, ChronoUnit.MINUTES);
            return {
                startDate,
                duration: Duration.ofMinutes(minutes > 0 ? minutes : 1440)
            };
        }

        // Try: "Month Day" (no time, no range)
        const dateOnly = text.match(
            /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s*(\d{4}))?$/i
        );

        if (dateOnly) {
            const month = MONTHS[dateOnly[1]];
            const day = parseInt(dateOnly[2]);
            const explicitYear = dateOnly[3] ? parseInt(dateOnly[3]) : null;
            const year = explicitYear || this.inferYear(month, day);

            const startDate = ZonedDateTime.of(
                LocalDateTime.of(year, month, day, 0, 0),
                timezone
            );

            return {
                startDate,
                duration: Duration.ofHours(24)
            };
        }

        return null;
    }

    private parseTime(timeStr: string, period: string): { hour: number, minute: number } {
        const parts = timeStr.split(':');
        let hour = parseInt(parts[0]);
        const minute = parts.length > 1 ? parseInt(parts[1]) : 0;

        const isPM = /p\.?m\.?/i.test(period);
        const isAM = /a\.?m\.?/i.test(period);

        if (isPM && hour !== 12) hour += 12;
        if (isAM && hour === 12) hour = 0;

        return { hour, minute };
    }

    private inferYear(month: number, day: number): number {
        const now = LocalDate.now();
        const currentYear = now.year();
        const candidateDate = LocalDate.of(currentYear, month, day);

        // If the date is more than 30 days in the past, assume next year
        if (candidateDate.isBefore(now.minusDays(30))) {
            return currentYear + 1;
        }

        return currentYear;
    }

    private stripHtml(html: string): string {
        return html.replace(/<\/?[^>]+(>|$)/g, "").replace(/\s+/g, ' ').trim();
    }
}

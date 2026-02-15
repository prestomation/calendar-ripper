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

// WordPress taxonomy IDs for show locations
const LOCATION_LASER_DOME = 40;
const LOCATION_PACCAR_IMAX = 39;

interface ParsedDate {
    startDate: ZonedDateTime;
    duration: Duration;
}

export default class PacificScienceCenterRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const baseUrl = ripper.config.url.toString().replace(/\/wp-json\/.*$/, '');

        // Fetch both events and shows from the WordPress REST API
        const [eventsJson, showsJson] = await Promise.all([
            this.fetchApi(`${baseUrl}/wp-json/wp/v2/event?per_page=100`),
            this.fetchApi(`${baseUrl}/wp-json/wp/v2/show?per_page=100`)
        ]);

        // Fetch individual pages in parallel (batched) to extract dates/showtimes
        const allItems = [...eventsJson, ...showsJson];
        const pages = await this.fetchPages(allItems);

        // Split pages back into events and shows
        const eventPages = pages.slice(0, eventsJson.length);
        const showPages = pages.slice(eventsJson.length);

        // Initialize calendars
        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        // Parse events and shows for each calendar
        for (const cal of ripper.config.calendars) {
            const locationFilter = (cal.config as { location_id?: number } | undefined)?.location_id;

            if (locationFilter) {
                // Show calendar: parse showtimes filtered by location
                const events = this.parseShows(showPages, cal.timezone, locationFilter);
                calendars[cal.name].events = events;
            } else {
                // Event calendar: parse special events
                const events = this.parseEvents(eventPages, cal.timezone);
                calendars[cal.name].events = events;
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

    private async fetchApi(url: string): Promise<any[]> {
        const res = await fetch(url);
        if (!res.ok) {
            throw Error(`${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
            throw Error(`Invalid API response from ${url}: expected an array`);
        }
        return data;
    }

    private async fetchPages(items: any[]): Promise<{ item: any, html: string | null }[]> {
        const results: { item: any, html: string | null }[] = [];
        for (let i = 0; i < items.length; i += CONCURRENCY_LIMIT) {
            const batch = items.slice(i, i + CONCURRENCY_LIMIT);
            const batchResults = await Promise.all(
                batch.map(async (item: any) => {
                    const link = item.link;
                    if (!link) return { item, html: null };
                    try {
                        const pageRes = await fetch(link);
                        if (!pageRes.ok) return { item, html: null };
                        const html = await pageRes.text();
                        return { item, html };
                    } catch {
                        return { item, html: null };
                    }
                })
            );
            results.push(...batchResults);
        }
        return results;
    }

    public parseEvents(eventPages: { item: any, html: string | null }[], timezone: ZoneRegion): RipperEvent[] {
        const events: RipperEvent[] = [];

        for (const { item: event, html: heroHtml } of eventPages) {
            try {
                const title = event.title?.rendered
                    ? decode(event.title.rendered)
                    : "Untitled Event";

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

                let description: string | undefined;
                if (event.excerpt?.rendered) {
                    description = this.stripHtml(decode(event.excerpt.rendered));
                }

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
                    url: event.link || undefined,
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
     * Parse showtimes from show pages. Each show page has an "Upcoming Showtimes"
     * section with structured HTML tables containing dates and times.
     */
    public parseShows(showPages: { item: any, html: string | null }[], timezone: ZoneRegion, locationFilter?: number): RipperEvent[] {
        const events: RipperEvent[] = [];

        for (const { item: show, html } of showPages) {
            try {
                // Filter by location if specified
                if (locationFilter && Array.isArray(show.location) && !show.location.includes(locationFilter)) {
                    continue;
                }

                const title = show.title?.rendered
                    ? decode(show.title.rendered)
                    : "Untitled Show";

                if (!html) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not fetch page for show "${title}"`,
                        context: show.link || undefined
                    });
                    continue;
                }

                const showtimes = this.extractShowtimes(html);

                let description: string | undefined;
                if (show.excerpt?.rendered) {
                    description = this.stripHtml(decode(show.excerpt.rendered));
                }

                let image: string | undefined;
                if (show.yoast_head_json?.og_image?.length > 0) {
                    image = show.yoast_head_json.og_image[0].url;
                }

                // Determine location name from taxonomy
                const locationName = Array.isArray(show.location) && show.location.includes(LOCATION_LASER_DOME)
                    ? "Laser Dome, Pacific Science Center"
                    : "PACCAR IMAX Theater, Pacific Science Center";

                for (const showtime of showtimes) {
                    const parsed = this.parseShowtime(showtime.date, showtime.time, timezone);
                    if (!parsed) continue;

                    const calendarEvent: RipperCalendarEvent = {
                        id: `show-${show.id}-${showtime.date}-${showtime.time}`.replace(/\s+/g, ''),
                        ripped: new Date(),
                        date: parsed.startDate,
                        duration: parsed.duration,
                        summary: title,
                        description,
                        location: locationName,
                        url: show.link || undefined,
                        image
                    };

                    events.push(calendarEvent);
                }
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse show: ${error}`,
                    context: JSON.stringify(show).substring(0, 100) + "..."
                });
            }
        }

        return events;
    }

    /**
     * Extract showtimes from a show page's HTML.
     * The page has structured tables with:
     *   <caption class="showtimes__caption">Saturday, February 14, 2026</caption>
     *   <td class="showtime__time">10:30 pm</td>
     */
    public extractShowtimes(html: string): { date: string, time: string }[] {
        const root = parse(html);
        const showtimes: { date: string, time: string }[] = [];

        const blocks = root.querySelectorAll('.showtimes__block');
        for (const block of blocks) {
            const caption = block.querySelector('.showtimes__caption');
            if (!caption) continue;

            const dateText = caption.text.trim();
            const timeElements = block.querySelectorAll('.showtime__time');

            for (const timeEl of timeElements) {
                const timeText = timeEl.text.trim();
                if (dateText && timeText) {
                    showtimes.push({ date: dateText, time: timeText });
                }
            }
        }

        return showtimes;
    }

    /**
     * Parse a showtime date+time into a ZonedDateTime.
     * Date format: "Saturday, February 14, 2026"
     * Time format: "10:30 pm" or "2:10 pm"
     */
    public parseShowtime(dateStr: string, timeStr: string, timezone: ZoneRegion): ParsedDate | null {
        // Parse date: "Saturday, February 14, 2026" or "February 14, 2026"
        const dateMatch = dateStr.match(
            /(?:\w+,\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/i
        );
        if (!dateMatch) return null;

        const month = MONTHS[dateMatch[1]];
        const day = parseInt(dateMatch[2]);
        const year = parseInt(dateMatch[3]);

        // Parse time: "10:30 pm" or "2:10 pm"
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
        if (!timeMatch) return null;

        let hour = parseInt(timeMatch[1]);
        const minute = parseInt(timeMatch[2]);
        const isPM = /pm/i.test(timeMatch[3]);
        const isAM = /am/i.test(timeMatch[3]);

        if (isPM && hour !== 12) hour += 12;
        if (isAM && hour === 12) hour = 0;

        const startDate = ZonedDateTime.of(
            LocalDateTime.of(year, month, day, hour, minute),
            timezone
        );

        // Default show duration: 1 hour for laser, 45 min for IMAX
        // Using 1 hour as a reasonable default for both
        return { startDate, duration: Duration.ofHours(1) };
    }

    /**
     * Extract the date text from the hero-event__description div.
     */
    public extractHeroDate(html: string): string | null {
        const root = parse(html);
        const heroDesc = root.querySelector('.hero-event__description');
        if (!heroDesc) return null;

        let text = heroDesc.innerHTML;
        text = text.replace(/<span[^>]*>\s*-\s*<\/span>/gi, ' - ');
        text = text.replace(/<[^>]+>/g, '');
        text = text.replace(/\s+/g, ' ').trim();

        return text || null;
    }

    /**
     * Parse a hero date text string into a ZonedDateTime and Duration.
     */
    public parseHeroDate(text: string, timezone: ZoneRegion): ParsedDate | null {
        text = text.replace(/–/g, '-').replace(/\s+/g, ' ').trim();
        text = text.replace(/,?\s*from\s+/i, ', ');

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

        if (candidateDate.isBefore(now.minusDays(30))) {
            return currentYear + 1;
        }

        return currentYear;
    }

    private stripHtml(html: string): string {
        return html.replace(/<\/?[^>]+(>|$)/g, "").replace(/\s+/g, ' ').trim();
    }
}

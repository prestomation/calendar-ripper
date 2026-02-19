import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

const EVENTS_URL = "https://reubensbrews.com/events/";

const LOCATION_ADDRESSES: Record<string, string> = {
    "The Taproom": "Reuben's Brews Taproom, 5010 14th Ave NW, Seattle, WA 98107",
    "Downtown Seattle": "Reuben's Brews Downtown, 1201 1st Ave, Seattle, WA 98101",
};

const MONTH_MAP: Record<string, number> = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
};

export interface ParsedEvent {
    url: string;
    month: string;
    day: string;
    title: string;
    locationText: string;
    groupLocation: string;
}

export default class ReubensBrewsRipper implements IRipper {
    private fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        const html = await this.fetchPage();
        const root = parse(html);

        for (const cal of ripper.config.calendars) {
            const locationFilter = cal.config?.location as string | undefined;
            if (!locationFilter) continue;

            const locationAddress = LOCATION_ADDRESSES[locationFilter] || "";
            const extracted = this.extractEvents(root, locationFilter);
            const parsed = this.parseEvents(extracted, locationAddress);
            calendars[cal.name].events = parsed;
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

    private async fetchPage(): Promise<string> {
        const res = await this.fetchFn(EVENTS_URL);
        if (!res.ok) {
            throw new Error(`Reuben's Brews error: HTTP ${res.status}`);
        }
        return res.text();
    }

    public extractEvents(root: HTMLElement, locationFilter: string): ParsedEvent[] {
        const events: ParsedEvent[] = [];

        // Find the event-grouping div matching the location
        const groupings = root.querySelectorAll('.event-grouping');

        for (const group of groupings) {
            const groupLocation = group.getAttribute('location') || '';
            if (groupLocation !== locationFilter) continue;

            const anchors = group.querySelectorAll('a.event');
            for (const anchor of anchors) {
                const url = anchor.getAttribute('href') || '';
                const month = anchor.querySelector('.month-name')?.text?.trim() || '';
                const day = anchor.querySelector('.month-day')?.text?.trim() || '';
                const title = anchor.querySelector('.event-name')?.text?.trim() || '';
                const locationText = anchor.querySelector('.location')?.text?.trim() || '';

                if (month && day && title) {
                    events.push({
                        url,
                        month,
                        day,
                        title,
                        locationText,
                        groupLocation,
                    });
                }
            }
        }

        return events;
    }

    public parseEvents(events: ParsedEvent[], location: string): RipperEvent[] {
        const results: RipperEvent[] = [];
        const seenUrls = new Set<string>();

        for (const event of events) {
            try {
                if (seenUrls.has(event.url)) continue;
                seenUrls.add(event.url);

                const date = this.parseDate(event.month, event.day);
                if (!date) {
                    results.push({
                        type: "ParseError",
                        reason: `Could not parse date: ${event.month} ${event.day}`,
                        context: event.title,
                    });
                    continue;
                }

                // Generate a stable ID from URL slug
                const slug = event.url.replace(/.*\/event\//, '').replace(/\/$/, '');
                const id = `reubens-${slug}`;

                const calEvent: RipperCalendarEvent = {
                    id,
                    ripped: new Date(),
                    date,
                    duration: Duration.ofHours(2),
                    summary: event.title,
                    location,
                    url: event.url,
                };

                results.push(calEvent);
            } catch (error) {
                results.push({
                    type: "ParseError",
                    reason: `Failed to parse Reuben's event: ${error}`,
                    context: JSON.stringify(event).substring(0, 200),
                });
            }
        }

        return results;
    }

    public parseDate(monthStr: string, dayStr: string): ZonedDateTime | null {
        const month = MONTH_MAP[monthStr];
        if (!month) return null;

        const day = parseInt(dayStr);
        if (isNaN(day) || day < 1 || day > 31) return null;

        // Infer year: assume current year, but if the date is more than 2 months in the past, assume next year
        const now = LocalDate.now();
        let year = now.year();
        const candidateDate = LocalDate.of(year, month, day);
        if (candidateDate.isBefore(now.minusMonths(2))) {
            year += 1;
        }

        // No time info on the listing page; default to 6 PM (typical event start)
        const localDateTime = LocalDateTime.of(year, month, day, 18, 0);
        return localDateTime.atZone(ZoneId.of("America/Los_Angeles"));
    }
}

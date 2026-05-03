import { Duration, LocalDate, LocalDateTime, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { parse, HTMLElement } from "node-html-parser";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const MONTHS: Record<string, number> = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12,
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4,
    'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
};

export default class TCCRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const url = ripper.config.url.toString();

        const res = await fetchFn(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });

        if (!res.ok) {
            throw new Error(`${res.status} ${res.statusText}`);
        }

        const html = parse(await res.text());

        // The page has two #tcc-events sections. querySelector returns the first,
        // which is the "Upcoming Events" section. The second is inside #past-events.
        const upcomingSection = html.querySelector('#tcc-events');

        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        if (ripper.config.calendars.length === 0) {
            throw new Error('No calendars configured');
        }
        const timezone = ripper.config.calendars[0].timezone;
        const events = this.parseUpcomingEvents(upcomingSection, timezone);

        for (const cal of ripper.config.calendars) {
            calendars[cal.name].events = events;
        }

        return Object.keys(calendars).map(key => ({
            name: key,
            friendlyname: calendars[key].friendlyName,
            events: calendars[key].events.filter(e => 'date' in e).map(e => e as RipperCalendarEvent),
            errors: calendars[key].events.filter(e => 'type' in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: calendars[key].tags,
        }));
    }

    public parseUpcomingEvents(section: HTMLElement | null, timezone: any): RipperEvent[] {
        if (!section) return [];

        const events: RipperEvent[] = [];
        const today = LocalDate.now();

        for (const div of section.querySelectorAll('.tcc-upcoming-event')) {
            const eventId = div.getAttribute('id') ?? undefined;

            const dateEl = div.querySelector('.tcc-event-date');
            if (!dateEl) {
                events.push({ type: 'ParseError', reason: 'No date element found', context: eventId });
                continue;
            }
            const parsedDate = this.parseDate(dateEl.textContent?.trim() ?? '', today);
            if (!parsedDate) {
                events.push({ type: 'ParseError', reason: `Could not parse date: "${dateEl.textContent?.trim() ?? ''}"`, context: eventId });
                continue;
            }

            const titleLink = div.querySelector('.event-title-wrap a');
            if (!titleLink) {
                events.push({ type: 'ParseError', reason: 'No title link found', context: eventId });
                continue;
            }
            const title = titleLink.textContent?.trim() ?? '';
            const eventUrl = titleLink.getAttribute('href') ?? undefined;

            const timeEl = div.querySelector('.tcc-event-time-day-of-week');
            const { startHour, startMinute, durationMinutes } = this.parseTime(timeEl?.textContent.trim() ?? '');

            const locationEl = div.querySelector('.tcc-event-location');
            const cityEl = div.querySelector('.tcc-event-city');
            const location = this.buildLocation(
                locationEl?.textContent.trim() ?? '',
                cityEl?.textContent.trim() ?? '',
            );

            const eventDate = ZonedDateTime.of(
                LocalDateTime.of(parsedDate.year(), parsedDate.monthValue(), parsedDate.dayOfMonth(), startHour, startMinute),
                timezone,
            );

            const event: RipperCalendarEvent = {
                id: eventId ? `tcc-${eventId}` : undefined,
                ripped: new Date(),
                date: eventDate,
                duration: Duration.ofMinutes(durationMinutes),
                summary: title,
                location: location || undefined,
                url: eventUrl,
            };

            events.push(event);
        }

        return events;
    }

    public parseDate(dateText: string, today: LocalDate): LocalDate | null {
        // Format: "May 05", "Jan 15", "December 3", etc.
        const match = dateText.match(/([A-Za-z]+)\s+(\d{1,2})/);
        if (!match) return null;

        const month = MONTHS[match[1].toLowerCase()];
        if (!month) return null;
        const day = parseInt(match[2]);

        // If the date has already passed this year, it belongs to next year
        let year = today.year();
        if (LocalDate.of(year, month, day).isBefore(today)) {
            year += 1;
        }

        return LocalDate.of(year, month, day);
    }

    public parseTime(timeText: string): { startHour: number; startMinute: number; durationMinutes: number } {
        // Default: 6 pm, 2-hour duration
        const defaults = { startHour: 18, startMinute: 0, durationMinutes: 120 };

        // Format: "Tuesday, 6:00pm to 7:30pm" or "Monday, 9am to 5pm"
        const match = timeText.match(/(\d{1,2})(?::(\d{2}))?([ap]m)\s+to\s+(\d{1,2})(?::(\d{2}))?([ap]m)/i);
        if (!match) return defaults;

        const startHour = this.toHour24(parseInt(match[1]), match[3]);
        const startMinute = match[2] ? parseInt(match[2]) : 0;
        const endHour = this.toHour24(parseInt(match[4]), match[6]);
        const endMinute = match[5] ? parseInt(match[5]) : 0;

        let durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
        if (durationMinutes <= 0) durationMinutes += 24 * 60;

        return { startHour, startMinute, durationMinutes };
    }

    private toHour24(hour: number, ampm: string): number {
        const lower = ampm.toLowerCase();
        if (lower === 'pm' && hour !== 12) return hour + 12;
        if (lower === 'am' && hour === 12) return 0;
        return hour;
    }

    private buildLocation(locationText: string, cityText: string): string {
        if (!locationText) return cityText;
        if (!cityText) return locationText;

        // If the location already includes a zip code or ends with a US state abbreviation,
        // it's a full address — no need to append the city
        if (/\b[A-Z]{2}\s+\d{5}\b/.test(locationText) || /,\s*[A-Z]{2}$/.test(locationText)) {
            return locationText;
        }

        return `${locationText}, ${cityText}`;
    }
}

import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneRegion } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { parse, HTMLElement } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

const MONTHS: Record<string, number> = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
};

const MAX_PAGES = 10;
const BASE_URL = "https://www.seattlecenter.com";

export default class SeattleCenterRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        const baseUrl = ripper.config.url.toString();
        const allEvents = await this.fetchAllPages(baseUrl);

        for (const cal of ripper.config.calendars) {
            const events = this.parseEventsFromHtml(allEvents, cal.timezone);
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

    private async fetchAllPages(baseUrl: string): Promise<string[]> {
        const pages: string[] = [];
        const firstPageRes = await fetch(baseUrl);
        if (!firstPageRes.ok) {
            throw Error(`${firstPageRes.status} ${firstPageRes.statusText}`);
        }
        const firstPageHtml = await firstPageRes.text();
        pages.push(firstPageHtml);

        const root = parse(firstPageHtml);
        const totalPages = this.getTotalPages(root);

        for (let page = 2; page <= Math.min(totalPages, MAX_PAGES); page++) {
            const url = `${baseUrl}?page=${page}`;
            const res = await fetch(url);
            if (!res.ok) break;
            pages.push(await res.text());
        }

        return pages;
    }

    private getTotalPages(root: HTMLElement): number {
        const pageLinks = root.querySelectorAll('.pager__link');
        let maxPage = 1;
        for (const link of pageLinks) {
            const href = link.getAttribute('href') || '';
            const match = href.match(/page=(\d+)/);
            if (match) {
                maxPage = Math.max(maxPage, parseInt(match[1]));
            }
        }
        return maxPage;
    }

    public parseEventsFromHtml(pages: string[], timezone: ZoneRegion): RipperEvent[] {
        const events: RipperEvent[] = [];

        for (const pageHtml of pages) {
            const root = parse(pageHtml);
            const sections = root.querySelectorAll('section.l-section');

            let currentDate: string | null = null;

            for (const section of sections) {
                const dateBar = section.querySelector('.date-bar__date');
                if (dateBar) {
                    currentDate = dateBar.text.trim();
                }

                const eventRow = section.querySelector('.row.no-gutters');
                if (!eventRow) continue;

                const parsed = this.parseEventSection(eventRow, currentDate, timezone);
                if (parsed) {
                    events.push(parsed);
                }
            }
        }

        return events;
    }

    private parseEventSection(eventRow: HTMLElement, currentDate: string | null, timezone: ZoneRegion): RipperEvent | null {
        const titleLink = eventRow.querySelector('.event-list__title a');
        if (!titleLink) return null;

        const title = decode(titleLink.text.trim());
        if (!title) return null;

        const href = titleLink.getAttribute('href') || '';
        const slug = href.replace(/^.*event-calendar\//, '');
        const eventUrl = href.startsWith('http') ? href : `${BASE_URL}/${href.replace(/^\//, '')}`;

        const timeEl = eventRow.querySelector('.event-list__time');
        const timeText = timeEl ? timeEl.text.trim() : '';

        const locationLink = eventRow.querySelector('.event-list__location-link');
        const location = this.extractLocation(locationLink);

        const descEl = eventRow.querySelector('.event-list__text');
        const description = descEl ? decode(descEl.text.trim()) : undefined;

        if (!currentDate) {
            return {
                type: "ParseError",
                reason: `No date context for event "${title}"`,
                context: slug
            };
        }

        const parsedDate = this.parseDateTime(currentDate, timeText, timezone);
        if (!parsedDate) {
            return {
                type: "ParseError",
                reason: `Could not parse date "${currentDate}" time "${timeText}" for "${title}"`,
                context: slug
            };
        }

        const isAllDay = /all\s*day/i.test(timeText);

        const calendarEvent: RipperCalendarEvent = {
            id: slug || undefined,
            ripped: new Date(),
            date: parsedDate,
            duration: isAllDay ? Duration.ofHours(12) : Duration.ofHours(2),
            summary: title,
            description: description || undefined,
            location: location || "Seattle Center",
            url: eventUrl
        };

        return calendarEvent;
    }

    public extractLocation(locationLink: HTMLElement | null): string | null {
        if (!locationLink) return null;

        const href = locationLink.getAttribute('href') || '';
        const match = href.match(/\/maps\/place\/([^/@]+)/);
        if (!match) return null;

        let venue = decodeURIComponent(match[1].replace(/\+/g, ' '));
        // Clean up address suffixes like ", Seattle, WA 98109"
        venue = venue.replace(/,\s*(Seattle|WA).*$/i, '');
        return venue.trim() || null;
    }

    public parseDateTime(dateStr: string, timeStr: string, timezone: ZoneRegion): ZonedDateTime | null {
        // Parse date: "February 15" or "March 3"
        const dateMatch = dateStr.match(
            /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})$/i
        );
        if (!dateMatch) return null;

        const month = MONTHS[dateMatch[1]];
        const day = parseInt(dateMatch[2]);
        const year = this.inferYear(month, day);

        // Parse time: "11:00 a.m.", "7:00 p.m.", or "All Day"
        if (/all\s*day/i.test(timeStr)) {
            return ZonedDateTime.of(
                LocalDateTime.of(year, month, day, 0, 0),
                timezone
            );
        }

        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.|am|pm)/i);
        if (!timeMatch) return null;

        let hour = parseInt(timeMatch[1]);
        const minute = parseInt(timeMatch[2]);
        const isPM = /p\.?m\.?/i.test(timeMatch[3]);
        const isAM = /a\.?m\.?/i.test(timeMatch[3]);

        if (isPM && hour !== 12) hour += 12;
        if (isAM && hour === 12) hour = 0;

        return ZonedDateTime.of(
            LocalDateTime.of(year, month, day, hour, minute),
            timezone
        );
    }

    private inferYear(month: number, day: number): number {
        const now = LocalDate.now();
        const currentYear = now.year();
        const candidateDate = LocalDate.of(currentYear, month, day);

        // If the date is more than 7 days in the past, assume next year
        if (candidateDate.isBefore(now.minusDays(7))) {
            return currentYear + 1;
        }

        return currentYear;
    }
}

import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

const MUSEUM_ADDRESS = "National Nordic Museum, 2655 NW Market St, Seattle, WA 98107";
const TIMEZONE = ZoneId.of("America/Los_Angeles");

const MONTHS: Record<string, number> = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12,
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4,
    "Jun": 6, "Jul": 7, "Aug": 8,
    "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
};

export interface ParsedEventCard {
    href: string;
    title: string;
    dateText: string;
    timeText: string;
}

export default class NationalNordicMuseumRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        let page = 1;
        while (true) {
            const baseUrl = ripper.config.url.toString();
            const url = page === 1 ? baseUrl : `${baseUrl}?page=${page}`;
            const res = await fetchFn(url, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

            const html = parse(await res.text());
            const cards = this.parseEventCards(html);

            for (const card of cards) {
                if (this.isRecurringPattern(card.dateText)) continue;
                if (/^CANCELLED\b/i.test(card.title)) continue;

                const result = this.parseEvent(card);
                if ('date' in result) events.push(result);
                else errors.push(result);
            }

            const nextLink = html.querySelector('a.pagination__link[rel="next"]');
            if (!nextLink) break;
            page++;
            if (page > 10) break;
        }

        return ripper.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            parent: ripper.config,
            tags: cal.tags || [],
        }));
    }

    public parseEventCards(html: HTMLElement): ParsedEventCard[] {
        const cards: ParsedEventCard[] = [];

        for (const card of html.querySelectorAll('div.card-event')) {
            // Skip Ticketure events — dates are loaded via JavaScript, not in static HTML
            if (card.classList.contains('js-event-card-ticketure')) continue;

            const titleEl = card.querySelector('a.card-title-link');
            const subheadEl = card.querySelector('div.subheading p');
            const timeEl = card.querySelector('p.content-text');

            if (!titleEl || !subheadEl) continue;

            const href = titleEl.getAttribute('href') || '';
            const title = titleEl.text?.trim() || '';
            const dateText = subheadEl.text?.trim() || '';
            const timeText = timeEl?.text?.trim() || '';

            if (!href || !title || !dateText) continue;

            cards.push({ href, title, dateText, timeText });
        }

        return cards;
    }

    public parseEvent(card: ParsedEventCard): RipperCalendarEvent | RipperError {
        const parsedDate = this.parseDate(card.dateText);
        if (!parsedDate) {
            return {
                type: "ParseError",
                reason: `Could not parse date "${card.dateText}"`,
                context: card.title,
            };
        }

        try {
            const { hour, minute, durationMinutes } = this.parseTime(card.timeText);
            const eventDate = ZonedDateTime.of(
                LocalDateTime.of(parsedDate.year, parsedDate.month, parsedDate.day, hour, minute),
                TIMEZONE
            );
            const slug = card.href.split('/').pop() || card.href;
            return {
                id: `nordic-museum-${slug}`,
                ripped: new Date(),
                date: eventDate,
                duration: Duration.ofMinutes(durationMinutes),
                summary: card.title,
                location: MUSEUM_ADDRESS,
                url: card.href,
            };
        } catch (error) {
            return {
                type: "ParseError",
                reason: `Invalid date for "${card.title}": ${error}`,
                context: card.dateText,
            };
        }
    }

    public isRecurringPattern(dateText: string): boolean {
        const ordinalPrefixes = /^(First|Second|Third|Fourth|Fifth|Last|Every|Monthly|Weekly)\b/i;
        const pluralDays = /(?:Sundays|Mondays|Tuesdays|Wednesdays|Thursdays|Fridays|Saturdays)/i;
        return ordinalPrefixes.test(dateText) || pluralDays.test(dateText) || !/\d/.test(dateText);
    }

    public parseDate(dateText: string): { year: number; month: number; day: number } | null {
        // Find the first "Month Day" pattern in the text (handles ranges and complex descriptions)
        const monthNames = Object.keys(MONTHS).join('|');
        const match = dateText.match(new RegExp(`(${monthNames})\\s+(\\d{1,2})`));
        if (!match) return null;

        const monthName = match[1];
        const day = parseInt(match[2], 10);
        const month = MONTHS[monthName];
        if (!month) return null;

        const yearMatch = dateText.match(/(\d{4})/);
        if (yearMatch) {
            return { year: parseInt(yearMatch[1], 10), month, day };
        }

        const now = LocalDate.now();
        let year = now.year();
        try {
            const candidate = LocalDate.of(year, month, day);
            if (candidate.isBefore(now.minusDays(7))) year += 1;
        } catch {
            return null;
        }
        return { year, month, day };
    }

    public parseTime(timeText: string): { hour: number; minute: number; durationMinutes: number } {
        const normalised = timeText.replace(/–/g, "-").replace(/\s+/g, " ");

        const rangeMatch = normalised.match(
            /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i
        );
        if (rangeMatch) {
            const [, startHStr, startMStr, startPeriod, endHStr, endMStr, endPeriod] = rangeMatch;
            let startHour = parseInt(startHStr, 10);
            const startMin = startMStr ? parseInt(startMStr, 10) : 0;
            let endHour = parseInt(endHStr, 10);
            const endMin = endMStr ? parseInt(endMStr, 10) : 0;

            const ep = endPeriod.toLowerCase();
            if (ep === "pm" && endHour !== 12) endHour += 12;
            if (ep === "am" && endHour === 12) endHour = 0;

            const sp = (startPeriod || endPeriod).toLowerCase();
            if (sp === "pm" && startHour !== 12) startHour += 12;
            if (sp === "am" && startHour === 12) startHour = 0;

            if (startHour > endHour) {
                startHour = parseInt(startHStr, 10);
                const flipped = sp === "pm" ? "am" : "pm";
                if (flipped === "pm" && startHour !== 12) startHour += 12;
                if (flipped === "am" && startHour === 12) startHour = 0;
            }

            const durationMinutes = Math.max((endHour * 60 + endMin) - (startHour * 60 + startMin), 30);
            return { hour: startHour, minute: startMin, durationMinutes };
        }

        const singleMatch = normalised.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
        if (singleMatch) {
            let hour = parseInt(singleMatch[1], 10);
            const minute = singleMatch[2] ? parseInt(singleMatch[2], 10) : 0;
            const period = singleMatch[3].toLowerCase();
            if (period === "pm" && hour !== 12) hour += 12;
            if (period === "am" && hour === 12) hour = 0;
            return { hour, minute, durationMinutes: 120 };
        }

        return { hour: 10, minute: 0, durationMinutes: 120 };
    }
}

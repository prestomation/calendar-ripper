import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { HTMLElement } from "node-html-parser";
import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { Ripper, RipperCalendar, RipperEvent, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import "@js-joda/timezone";

const LOCATION = "Washington Hall, 153 14th Ave, Seattle, WA 98122";
const URL = "https://www.seattleartbookfair.org/";

const MONTHS: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Default fair hours when not parseable from the page
const DEFAULT_FAIR_START_HOUR = 11;
const DEFAULT_FAIR_DURATION = Duration.ofHours(6);

export default class SeattleArtBookFairRipper extends HTMLRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        try {
            return await super.rip(ripper);
        } catch (err) {
            // Site goes offline between annual events — return empty calendars rather than crashing
            if (err instanceof Error && (/^\d{3}\b/.test(err.message) || /fetch\s+failed/i.test(err.message))) {
                return ripper.config.calendars.map(cal => ({
                    name: cal.name,
                    friendlyname: cal.friendlyname,
                    events: [],
                    errors: [],
                    parent: ripper.config,
                    tags: cal.tags || [],
                }));
            }
            throw err;
        }
    }

    public async parseEvents(
        html: HTMLElement,
        date: ZonedDateTime,
        _config: unknown,
    ): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        const tz = date.zone();
        const text = collapseWhitespace(html.text);

        const fair = this.parseFairDates(text, tz);
        if ("type" in fair) {
            events.push(fair);
        } else {
            events.push(...fair);
        }

        if (/Prepress Launch Party/i.test(text)) {
            events.push(this.parseLaunchParty(text, tz));
        }

        return events;
    }

    parseFairDates(text: string, tz: ZoneId): RipperCalendarEvent[] | RipperError {
        // Match e.g. "May 9–10, 2026" or "May 9-10, 2026" (en-dash or hyphen)
        const m = text.match(
            /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*[–-]\s*(\d{1,2}),\s*(\d{4})/i,
        );
        if (!m) {
            // Fair not yet announced for the year; expectEmpty: true already signals this is normal
            return [];
        }

        const month = MONTHS[m[1].toLowerCase()];
        const startDay = parseInt(m[2], 10);
        const endDay = parseInt(m[3], 10);
        const year = parseInt(m[4], 10);

        if (endDay < startDay) {
            return {
                type: "ParseError",
                reason: `Fair end day ${endDay} is before start day ${startDay}`,
                context: m[0],
            };
        }

        const events: RipperCalendarEvent[] = [];
        for (let day = startDay; day <= endDay; day++) {
            const start = LocalDateTime.of(year, month, day, DEFAULT_FAIR_START_HOUR, 0).atZone(tz);
            events.push({
                id: `seattle-art-book-fair-${year}-${month}-${day}`,
                ripped: new Date(),
                date: start,
                duration: DEFAULT_FAIR_DURATION,
                summary: "Seattle Art Book Fair",
                description:
                    "Free festival celebrating independent publishing, book design, and artist books. 85+ exhibitors plus talks, activities, and art installations.",
                location: LOCATION,
                url: URL,
            });
        }
        return events;
    }

    parseLaunchParty(text: string, tz: ZoneId): RipperCalendarEvent | RipperError {
        // Caller has already verified that "Prepress Launch Party" is present in `text`.
        const idx = text.search(/Prepress Launch Party/i);
        const window = text.slice(idx, idx + 200);

        const dateMatch = window.match(
            /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/i,
        );
        if (!dateMatch) {
            return {
                type: "ParseError",
                reason: "Found Prepress Launch Party section but could not parse its date",
                context: window.slice(0, 120),
            };
        }

        const month = MONTHS[dateMatch[1].toLowerCase()];
        const day = parseInt(dateMatch[2], 10);
        const year = parseInt(dateMatch[3], 10);

        // Time range like "6–9pm" or "6-9 pm"
        const timeMatch = window.match(/(\d{1,2})\s*[–-]\s*(\d{1,2})\s*(am|pm)/i);
        let startHour = 18;
        let durationHours = 3;
        if (timeMatch) {
            const sh = parseInt(timeMatch[1], 10);
            const eh = parseInt(timeMatch[2], 10);
            const isPm = timeMatch[3].toLowerCase() === "pm";
            startHour = isPm ? (sh === 12 ? 12 : sh + 12) : (sh === 12 ? 0 : sh);
            const endHour = isPm ? (eh === 12 ? 12 : eh + 12) : (eh === 12 ? 0 : eh);
            const dh = endHour - startHour;
            if (dh > 0 && dh <= 12) durationHours = dh;
        }

        const start = LocalDateTime.of(year, month, day, startHour, 0).atZone(tz);
        return {
            id: `seattle-art-book-fair-prepress-${year}-${month}-${day}`,
            ripped: new Date(),
            date: start,
            duration: Duration.ofHours(durationHours),
            summary: "Seattle Art Book Fair: Prepress Launch Party",
            description: "Kickoff party for the Seattle Art Book Fair weekend.",
            location: LOCATION,
            url: URL,
        };
    }
}

function collapseWhitespace(s: string): string {
    return s.replace(/\s+/g, " ").trim();
}

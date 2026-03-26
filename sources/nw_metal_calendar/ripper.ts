import { Duration, LocalDateTime, ZoneRegion, ZonedDateTime, convert } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { Ripper, RipperCalendar, RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { parse, HTMLElement } from 'node-html-parser';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';


// Matches single-day events: "MAY 7 at Venue: Band Name"
// Also matches multi-day events like "MAY 7-9 at Venue: Band Name"
// Groups: [1]=month, [2]=startDay, [3]=endDay (optional), [4]=venue, [5]=name
const eventRegex = /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) (\d\d?)(?:-(\d\d?))? at (.*): (.*)/g

const MONTH_LOOKUP = "JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC";

export default class NWMetalRipper extends HTMLRipper {

    // nocleansinging.com returns 403 unless a browser User-Agent is sent.
    // Override rip() to fetch with the correct header before parsing.
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const url = ripper.config.url;
        const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const html = parse(await res.text());
        const now = ZonedDateTime.now(ZoneRegion.of("America/Los_Angeles"));
        const events = await this.parseEvents(html, now, ripper.config.calendars[0]?.config ?? {});
        const cal = ripper.config.calendars[0];
        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: events.filter(e => "date" in e) as RipperCalendarEvent[],
            errors: events.filter(e => "type" in e) as any[],
            parent: ripper.config,
            tags: cal.tags || [],
        }];
    }

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {

        const locationNodes = html.querySelectorAll(".entry p");

        const events: RipperCalendarEvent[] = locationNodes.flatMap(e => {
            const eventMatches = e.textContent.matchAll(eventRegex);

            // Why does typescript not know this cannot be null?
            const matches = Array.from(eventMatches!);
            if (matches[0] == undefined) {
                return [];
            }
            const monthStr = matches[0][1];
            const startDay = Number(matches[0][2]);
            const endDay = matches[0][3] !== undefined ? Number(matches[0][3]) : startDay;
            const venue = matches[0][4];
            const name = matches[0][5];

            // Yes, really
            const month = MONTH_LOOKUP.indexOf(monthStr) / 3 + 1;

            // Build the event datetime safely:
            // 1. withDayOfMonth(1) first to avoid invalid intermediate dates
            //    (e.g. today is Mar 31, switching to Feb would give Feb 31 → exception).
            // 2. Handle year rollover: if the event month is earlier in the year than
            //    the current month (e.g. JAN event parsed in DEC), use next year.
            // Use the `date` parameter so tests can control the reference time.
            let year = date.year();
            if (month < date.monthValue()) {
                year += 1;
            }

            // Generate one event per day in the range [startDay, endDay]
            const dayEvents: RipperCalendarEvent[] = [];
            for (let day = startDay; day <= endDay; day++) {
                const eventTime = date
                    .withDayOfMonth(1)
                    .withYear(year)
                    .withMonth(month)
                    .withDayOfMonth(day)
                    .withHour(19)
                    .withMinute(0)
                    .withSecond(0)
                    .withNano(0);

                dayEvents.push({
                    summary: `[NWMetal] ${name}`,
                    date: eventTime,
                    duration: Duration.ofHours(4),
                    ripped: convert(LocalDateTime.now()).toDate(),
                    location: venue
                });
            }
            return dayEvents;
        }).filter<RipperCalendarEvent>((e): e is RipperCalendarEvent => e != undefined && "summary" in e);
        return events;
    }
}

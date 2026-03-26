import { Duration, LocalDateTime, ZoneRegion, ZonedDateTime, convert } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from 'node-html-parser';


// Matches single-day events: "MAY 7 at Venue: Band Name"
// Also matches multi-day events like "MAY 7-9 at Venue: Band Name"
// Groups: [1]=month, [2]=startDay, [3]=endDay (optional), [4]=venue, [5]=name
const eventRegex = /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) (\d\d?)(?:-(\d\d?))? at (.*): (.*)/g

const MONTH_LOOKUP = "JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC";

export default class NWMetalRipper extends HTMLRipper {

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
            const now = ZonedDateTime.now(ZoneRegion.of("America/Los_Angeles"));
            let year = now.year();
            if (month < now.monthValue()) {
                year += 1;
            }

            // Generate one event per day in the range [startDay, endDay]
            const dayEvents: RipperCalendarEvent[] = [];
            for (let day = startDay; day <= endDay; day++) {
                const eventTime = now
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

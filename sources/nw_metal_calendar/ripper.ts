import { Duration, LocalDateTime, Period, ZoneRegion, ZonedDateTime, convert } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { decode } from 'html-entities';
import { HTMLElement } from 'node-html-parser';


const eventRegex = /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) (\d\d?) at (.*): (.*)/g

export default class NWMetalRipper extends HTMLRipper {

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {

        const locationNodes = html.querySelectorAll(".entry p");

        const events: RipperEvent[] = locationNodes.map(e => {
            const eventMatches = e.textContent.matchAll(eventRegex);


            // Why does typescript not know this cannot be null?
            const matches = Array.from(eventMatches!);
            if (matches[0] == undefined) {
                return undefined;
            }
            const all = matches[0][0];
            const monthStr = matches[0][1];
            const day = Number(matches[0][2]);
            const venue = matches[0][3]
            const name = matches[0][4]

            // Yes, really
            const month = "JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC".indexOf(monthStr) / 3 + 1;
            // We assume 7 PM
            const eventTime = ZonedDateTime.now(ZoneRegion.of("America/Los_Angeles")).withMonth(month).withDayOfMonth(day).withHour(19).withMinute(0).withSecond(0).withNano(0);

            const a: RipperCalendarEvent = {
                summary: `[NWMetal] ${name}`,
                date: eventTime,
                duration: Duration.ofHours(4),
                ripped: convert(LocalDateTime.now()).toDate(),
                location: venue
            };
            return a;
        }).filter<RipperCalendarEvent>((e): e is RipperCalendarEvent => e != undefined && "summary" in e );
        return events;
    }
}

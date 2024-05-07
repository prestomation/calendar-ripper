import { ChronoUnit, LocalDateTime, ZonedDateTime, convert, } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperEvent } from "./schema.js";
import { parse, HTMLElement } from "node-html-parser";
import { URLParser } from "./urlparse.js"
import '@js-joda/timezone'


export abstract class HTMLRipper implements IRipper {


    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {

        const urlParser = new URLParser(ripper.config.url);

        const now = LocalDateTime.now();
        const endOfPeriod = now.plus(ripper.config.lookahead)
        const days = now.until(endOfPeriod, ChronoUnit.DAYS);

        // Create an list of days starting from today and ending + lookahead days from now
        const daysToRip = Array.from({ length: days }, (_, i) => LocalDateTime.now().plusDays(i));

        // map of string to a list of RipperEvents
        const calendars: { [key: string]: RipperEvent[] } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = [];
        }

        for (const day of daysToRip) {
            const urlTemplate = urlParser.getTemplate();
            const url = urlTemplate.getURL(day);
            const res = await fetch(url);
            if (!res.ok) {
                throw Error(`${res.status} ${res.statusText}`)
            }

            const htmlString = await res.text();
            const html = parse(htmlString);
            for (const cal of ripper.config.calendars) {

                const events = await this.parseEvents(html, ZonedDateTime.of(day, cal.timezone), cal.config);
                calendars[cal.name] = calendars[cal.name].concat(events);
            };
        };


        return Object.keys(calendars).map(key => {
            return {
                name: key,
                events: calendars[key].filter(e => "date" in e).map(e => e as RipperCalendarEvent)
            }
        });


    }

    protected abstract parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]>

}



import { ChronoUnit, LocalDateTime, ZonedDateTime, convert, } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "./schema.js";
import { parse, HTMLElement } from "node-html-parser";
import { URLParser } from "./urlparse.js"
import '@js-joda/timezone'


export abstract class HTMLRipper implements IRipper {


    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {

        const urlParser = new URLParser(ripper.config.url);

        const now = LocalDateTime.now();
        const endOfPeriod = ripper.config.lookahead ?  now.plus(ripper.config.lookahead) : LocalDateTime.now().plusDays(1);
        const days = now.until(endOfPeriod, ChronoUnit.DAYS);

        // Create an list of days starting from today and ending + lookahead days from now
        const daysToRip = Array.from({ length: days }, (_, i) => LocalDateTime.now().plusDays(i));

        // map of string to a list of RipperEvents
        const calendars: { [key: string]: {events: RipperEvent[], friendlyName: string, tags: string[]} } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = {events: [], friendlyName: c.friendlyname, tags: c.tags || []};
        }

        for (const day of daysToRip) {
            const urlTemplate = urlParser.getTemplate();
            const url = urlTemplate.getURL(day);
            const res = await fetch(url);
            if (!res.ok) {
                throw Error(`${res.status} ${res.statusText}`)
            }

            const htmlString = await res.text();
            const processedHtml = this.preprocessHtml(htmlString);
            const html = parse(processedHtml);
            for (const cal of ripper.config.calendars) {

                const events = await this.parseEvents(html, ZonedDateTime.of(day, cal.timezone), cal.config);
                calendars[cal.name].events = calendars[cal.name].events.concat(events);
            };
        };


        return Object.keys(calendars).map(key => {
            return {
                name: key,
                friendlyname: calendars[key].friendlyName,
                events: calendars[key].events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
                errors: calendars[key].events.filter(e => "type" in e).map(e => e as RipperError),
                parent: ripper.config,
                tags: calendars[key].tags || []
            }
        });


    }

    protected preprocessHtml(html: string): string {
        return html;
    }

    protected abstract parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]>

}



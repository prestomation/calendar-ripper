import { DateTimeFormatter, Duration, LocalDateTime, Period, ZoneRegion, ZonedDateTime, convert } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { ParseError, RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from 'node-html-parser';
import { Locale } from "@js-joda/locale_en-us";


const timeRegex = /[a-zA-Z]{3}, ([a-zA-Z]{3}) ([0-9]{1,2}) (at|from) ([0-9]+)(am|pm)/g

export default class SAFRipper extends HTMLRipper {

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {

        const locationNodes = html.querySelectorAll(".calendar-info");

        const events: RipperEvent[] = locationNodes.map(e => {
            const titleElement = e.querySelector(".calendar-info-title")
            const title = titleElement?.innerText.trim();
            const link = titleElement?.querySelector("a")?.getAttribute("href");
            const id = link?.split("/")[4]; //ID is in the URL. we assume this form
            const timeStr = e.querySelector(".calendar-info-date")?.outerHTML.matchAll(timeRegex);

            if (timeStr === null) {
                const error: ParseError = {
                    type: "ParseError",
                    reason: `..calendar-info-date Selector found nothing: ${e.toString()}`,
                };
                console.error(error);
                return error;
            }
            // Why does typescript not know this cannot be null?
            const matches = Array.from(timeStr!);
            const all = matches[0][0];
            const monthStr = matches[0][1];
            const day = Number(matches[0][2]);
            const ampm = matches[0][5]
            const offset = ampm === "pm" ? 12 : 0
            const hour = Number(matches[0][4]) + offset;

            // Yes, really
            const month =  "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(monthStr) / 3 + 1;

            const eventTime = ZonedDateTime.now(ZoneRegion.of("America/Los_Angeles")).withMonth(month).withDayOfMonth(day).withHour(hour).withMinute(0).withSecond(0).withNano(0);

            const a: RipperCalendarEvent = {
                id,
                summary: `[SAF] ${title}`,
                date: eventTime,
                duration: Duration.ofHours(2),
                ripped: convert(LocalDateTime.now()).toDate(),
                url: link
            };
            return a;
        });
        return events;
    }
}

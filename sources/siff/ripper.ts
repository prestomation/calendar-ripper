import { DateTimeFormatter, Duration, LocalDateTime, ZonedDateTime, convert } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { ParseError, RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from 'node-html-parser';
import { Locale } from "@js-joda/locale_en-us";


const timeRegex = /(\d?\d):(\d\d) ([ap]m) \/ (\d+) minutes/g
const timeParser = DateTimeFormatter.ofPattern('hh:mm').withLocale(Locale.US);

export default class SIFFRipper extends HTMLRipper {

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {

        const locationNodes = html.querySelectorAll(config.cssSelector);

        const events: RipperEvent[] = locationNodes.map(e => {
            const title = e.querySelector(".title")?.innerText;
            const timeStr = e.querySelector(".time")?.outerHTML.matchAll(timeRegex)
            if (timeStr === null) {
                const error: ParseError = {
                    type: "ParseError",
                    reason: `.time Selector found nothing: ${e.toString()}`,
                };
                console.error(error);
                return error;
            }
            // Why does typescript not know this cannot be null?
            const matches = Array.from(timeStr!);
            if (matches.length != 1 && matches[0].length != 5) {
                let o = e.querySelector(".time")!.outerHTML;
                const error: ParseError = {
                    type: "ParseError",
                    reason: `Could not parse context using regex ${timeParser.toString()}: ${o}`
                };
                console.error(error);
                return error;
            }
            const all = matches[0][0];
            const hour = Number(matches[0][1]);
            const min = Number(matches[0][2]);
            const ampm = matches[0][3];
            const lengthMinutes = Number(matches[0][4]);

            const hourOffset = ampm.toLowerCase() == "am" || hour == 12 ? 0 : 12;

            const duration = Duration.ofMinutes(lengthMinutes);
            const movieTime = date.withHour(hourOffset + hour).withMinute(min);

            const a: RipperCalendarEvent = {
                description: "",
                summary: `[${config.name}] ${title}`,
                location: config.name,
                date: movieTime,
                duration,
                ripped: convert(LocalDateTime.now()).toDate()
            };
            return a;
        });
        return events;
    }
}

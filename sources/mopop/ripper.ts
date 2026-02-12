import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from "node-html-parser";

const MONTH_NAMES: Record<string, number> = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12
};

const LOCATION = "Museum of Pop Culture, 325 5th Ave N, Seattle, WA 98109";
const BASE_URL = "https://www.mopop.org";

export default class MopopRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        const items = html.querySelectorAll(".calendar-dot-item");
        if (items.length === 0) {
            return [{
                type: "ParseError",
                reason: "No .calendar-dot-item elements found on page",
                context: "HTML document"
            }];
        }

        for (const item of items) {
            try {
                const title = item.getAttribute("data-title");
                const dateStr = item.getAttribute("data-date");
                const link = item.querySelector('a[href^="/events/"]');
                const href = link ? link.getAttribute("href") : null;

                if (!title || !dateStr) {
                    continue;
                }

                const slug = href || title;
                if (this.seenEvents.has(slug)) {
                    continue;
                }
                this.seenEvents.add(slug);

                const eventDate = this.parseDate(dateStr, date.zone());
                if (!eventDate) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date: ${dateStr}`,
                        context: title
                    });
                    continue;
                }

                const url = href ? `${BASE_URL}${href}` : undefined;

                const event: RipperCalendarEvent = {
                    id: slug,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofHours(2),
                    summary: title,
                    location: LOCATION,
                    url: url,
                };

                events.push(event);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${error}`,
                    context: item.toString().substring(0, 100)
                });
            }
        }

        return events;
    }

    private parseDate(dateStr: string, zone: ZoneId): ZonedDateTime | null {
        // Format: "February 14, 2026"
        const parts = dateStr.match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);
        if (!parts) {
            return null;
        }

        const month = MONTH_NAMES[parts[1]];
        if (!month) {
            return null;
        }

        const day = parseInt(parts[2]);
        const year = parseInt(parts[3]);

        return ZonedDateTime.of(year, month, day, 10, 0, 0, 0, zone);
    }
}

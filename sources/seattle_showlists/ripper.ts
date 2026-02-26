import { ZonedDateTime, Duration, LocalDateTime, LocalDate } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

interface ShowlistEvent {
    date: string;    // YYYYMMDD
    title: string;
    id: number;
    venueName: string;
}

const DEFAULT_SHOW_HOUR = 20; // 8 PM
const DEFAULT_DURATION_HOURS = 3;

export default class SeattleShowlistsRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const url = ripper.config.url.toString();

        const res = await fetchFn(url);
        if (!res.ok) {
            throw Error(`${res.status} ${res.statusText}`);
        }

        const html = await res.text();
        const showData = this.extractShowData(html);

        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        for (const cal of ripper.config.calendars) {
            const events = this.parseEvents(showData, cal.timezone);
            calendars[cal.name].events = events;
        }

        return Object.keys(calendars).map(key => ({
            name: key,
            friendlyname: calendars[key].friendlyName,
            events: calendars[key].events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: calendars[key].events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: calendars[key].tags
        }));
    }

    public extractShowData(html: string): ShowlistEvent[] {
        const match = html.match(/window\.upcomingShows\s*=\s*(\[[\s\S]*?\]);?\s*<\/script>/);
        if (!match) {
            throw new Error("Could not find window.upcomingShows data in page");
        }

        return JSON.parse(match[1]);
    }

    public parseEvents(shows: ShowlistEvent[], timezone: any): RipperEvent[] {
        const events: RipperEvent[] = [];
        const today = LocalDate.now();

        for (const show of shows) {
            try {
                if (!show.date || !show.title) {
                    continue;
                }

                const year = parseInt(show.date.substring(0, 4));
                const month = parseInt(show.date.substring(4, 6));
                const day = parseInt(show.date.substring(6, 8));

                if (isNaN(year) || isNaN(month) || isNaN(day)) {
                    events.push({
                        type: "ParseError",
                        reason: `Invalid date format: ${show.date}`,
                        context: `id=${show.id}`
                    });
                    continue;
                }

                const eventDate = LocalDate.of(year, month, day);
                if (eventDate.isBefore(today)) {
                    continue;
                }

                const dateTime = ZonedDateTime.of(
                    LocalDateTime.of(year, month, day, DEFAULT_SHOW_HOUR, 0),
                    timezone
                );

                const event: RipperCalendarEvent = {
                    id: `showlist-${show.id}`,
                    ripped: new Date(),
                    date: dateTime,
                    duration: Duration.ofHours(DEFAULT_DURATION_HOURS),
                    summary: show.title,
                    location: show.venueName || undefined,
                    url: "https://seattle.showlists.net"
                };

                events.push(event);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse show: ${error}`,
                    context: JSON.stringify(show).substring(0, 100)
                });
            }
        }

        return events;
    }
}

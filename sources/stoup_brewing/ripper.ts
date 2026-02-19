import { ZonedDateTime, Duration, LocalDate, LocalTime, ZoneId, LocalDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

const BASE_URL = "https://www.stoupbrewing.com";
const API_PATH = "/templates/sections/google-upcoming-events.ajax.php";

/** Maps config location values to the location prefixes used in the API title field */
const LOCATION_PREFIXES: Record<string, string> = {
    "ballard": "Ballard",
    "capitol-hill": "Capitol Hill",
    "kenmore": "Kenmore",
};

const LOCATION_ADDRESSES: Record<string, string> = {
    "ballard": "Stoup Brewing Ballard, 1108 NW 52nd St, Seattle, WA 98107",
    "capitol-hill": "Stoup Brewing Capitol Hill, 1158 Broadway, Seattle, WA 98122",
    "kenmore": "Stoup Brewing Kenmore, 6901 NE 182nd St, Kenmore, WA 98028",
};

interface StoupApiResponse {
    location: string;
    total: string;
    offset: number;
    limit: number;
    html: string;
}

export interface ParsedEvent {
    eventId: string;
    url: string;
    dateStr: string;
    timeRange: string;
    startTime: string;
    title: string;
    locationPrefix: string;
}

export default class StoupBrewingRipper implements IRipper {
    private fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        // Fetch all events in one call
        const allEvents = await this.fetchEvents();

        for (const cal of ripper.config.calendars) {
            const locationKey = cal.config?.location as string | undefined;
            if (!locationKey) continue;

            const locationPrefix = LOCATION_PREFIXES[locationKey];
            if (!locationPrefix) continue;

            const locationAddress = LOCATION_ADDRESSES[locationKey] || "";

            // Filter events for this location
            const locationEvents = allEvents.filter(
                e => e.locationPrefix === locationPrefix
            );

            const parsed = this.parseEvents(locationEvents, locationAddress);
            calendars[cal.name].events = parsed;
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

    private async fetchEvents(): Promise<ParsedEvent[]> {
        const url = `${BASE_URL}${API_PATH}?location=all&start=0&limit=200`;
        const res = await this.fetchFn(url);
        if (!res.ok) {
            throw new Error(`Stoup API error: HTTP ${res.status}`);
        }

        const data: StoupApiResponse = await res.json();
        return this.extractEvents(data.html);
    }

    public extractEvents(html: string): ParsedEvent[] {
        const root = parse(`<div>${html}</div>`);
        const events: ParsedEvent[] = [];

        const anchors = root.querySelectorAll("a.event");
        for (const anchor of anchors) {
            const eventId = anchor.getAttribute("data-event-id") || "";
            const href = anchor.getAttribute("href") || "";

            const dateStr = anchor.querySelector(".date-date")?.text?.trim() || "";
            const timeRange = anchor.querySelector(".event-time")?.text?.trim() || "";
            const startTime = anchor.querySelector(".event-start-time")?.text?.trim() || "";
            const rawTitle = anchor.querySelector(".event-title")?.text?.trim() || "";

            // Title format is "Location: Event Name" or just "Event Name"
            const { locationPrefix, title } = this.splitTitle(rawTitle);

            if (eventId && dateStr && title) {
                events.push({
                    eventId,
                    url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
                    dateStr,
                    timeRange,
                    startTime,
                    title,
                    locationPrefix,
                });
            }
        }

        return events;
    }

    public splitTitle(rawTitle: string): { locationPrefix: string; title: string } {
        // Known location prefixes from the API
        const prefixes = ["Ballard", "Capitol Hill", "Kenmore", "Other"];
        for (const prefix of prefixes) {
            if (rawTitle.startsWith(`${prefix}: `)) {
                return {
                    locationPrefix: prefix === "Other" ? "" : prefix,
                    title: rawTitle.substring(prefix.length + 2),
                };
            }
        }
        return { locationPrefix: "", title: rawTitle };
    }

    public parseEvents(events: ParsedEvent[], location: string): RipperEvent[] {
        const results: RipperEvent[] = [];
        const seenIds = new Set<string>();

        for (const event of events) {
            try {
                if (seenIds.has(event.eventId)) continue;
                seenIds.add(event.eventId);

                const date = this.parseDateTime(event.dateStr, event.startTime, event.timeRange);
                if (!date) {
                    results.push({
                        type: "ParseError",
                        reason: `Could not parse date for event ${event.eventId}: ${event.title}`,
                        context: `${event.dateStr} ${event.startTime}`,
                    });
                    continue;
                }

                const duration = this.parseDuration(event.timeRange);

                const calEvent: RipperCalendarEvent = {
                    id: `stoup-${event.eventId}`,
                    ripped: new Date(),
                    date,
                    duration,
                    summary: event.title,
                    location,
                    url: event.url,
                };

                results.push(calEvent);
            } catch (error) {
                results.push({
                    type: "ParseError",
                    reason: `Failed to parse Stoup event: ${error}`,
                    context: JSON.stringify(event).substring(0, 200),
                });
            }
        }

        return results;
    }

    public parseDateTime(dateStr: string, startTime: string, timeRange: string): ZonedDateTime | null {
        // dateStr is "M/D" format e.g. "2/19", "3/1"
        const dateParts = dateStr.match(/^(\d{1,2})\/(\d{1,2})$/);
        if (!dateParts) return null;

        const month = parseInt(dateParts[1]);
        const day = parseInt(dateParts[2]);

        // Infer year: assume current year, but if the date is more than 2 months in the past, assume next year
        const now = LocalDate.now();
        let year = now.year();
        const candidateDate = LocalDate.of(year, month, day);
        if (candidateDate.isBefore(now.minusMonths(2))) {
            year += 1;
        }

        // Parse start time from startTime field (e.g., "5:00p", "11:45a", "7:30p")
        const time = this.parseTime(startTime) || this.parseTimeFromRange(timeRange);
        if (!time) return null;

        const localDateTime = LocalDateTime.of(year, month, day, time.hour, time.minute);
        return localDateTime.atZone(ZoneId.of("America/Los_Angeles"));
    }

    public parseTime(timeStr: string): { hour: number; minute: number } | null {
        // Formats: "5:00p", "11:45a", "7:30p", "12:00p"
        const match = timeStr.match(/^(\d{1,2}):(\d{2})(a|p)$/);
        if (!match) return null;

        let hour = parseInt(match[1]);
        const minute = parseInt(match[2]);
        const ampm = match[3];

        if (ampm === "p" && hour !== 12) hour += 12;
        if (ampm === "a" && hour === 12) hour = 0;

        return { hour, minute };
    }

    public parseTimeFromRange(timeRange: string): { hour: number; minute: number } | null {
        // Formats: "5 - 9pm", "11:45am - 1pm", "7:30 - 9pm", "6:30 - 9:30pm"
        const match = timeRange.match(/^(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*-\s*\d{1,2}(?::\d{2})?\s*(am|pm)$/);
        if (!match) return null;

        const startStr = match[1];
        const startAmPm = match[2] || match[3]; // If start has no am/pm, use end's
        const endAmPm = match[3];

        const timeParts = startStr.match(/^(\d{1,2})(?::(\d{2}))?$/);
        if (!timeParts) return null;

        let hour = parseInt(timeParts[1]);
        const minute = parseInt(timeParts[2] || "0");

        const effectiveAmPm = startAmPm || endAmPm;
        if (effectiveAmPm === "pm" && hour !== 12) hour += 12;
        if (effectiveAmPm === "am" && hour === 12) hour = 0;

        return { hour, minute };
    }

    public parseDuration(timeRange: string): Duration {
        // Try to parse start and end from the range
        const match = timeRange.match(
            /^(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*-\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)$/
        );
        if (!match) return Duration.ofHours(2); // default

        const [, startStr, startAmPm, endStr, endAmPm] = match;

        const startTime = this.parseRangeTime(startStr, startAmPm || endAmPm);
        const endTime = this.parseRangeTime(endStr, endAmPm);

        if (!startTime || !endTime) return Duration.ofHours(2);

        let durationMinutes = (endTime.hour * 60 + endTime.minute) - (startTime.hour * 60 + startTime.minute);
        if (durationMinutes <= 0) durationMinutes += 12 * 60; // handle overnight

        return Duration.ofMinutes(durationMinutes);
    }

    private parseRangeTime(timeStr: string, ampm: string): { hour: number; minute: number } | null {
        const parts = timeStr.match(/^(\d{1,2})(?::(\d{2}))?$/);
        if (!parts) return null;

        let hour = parseInt(parts[1]);
        const minute = parseInt(parts[2] || "0");

        if (ampm === "pm" && hour !== 12) hour += 12;
        if (ampm === "am" && hour === 12) hour = 0;

        return { hour, minute };
    }
}

import { ZonedDateTime, Duration, LocalDateTime, ZoneId, Period, ChronoUnit } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

interface TrumbaEvent {
    eventID: number;
    title: string;
    description?: string;
    location?: string;
    locationType?: string;
    startDateTime: string;
    endDateTime: string;
    startTimeZoneOffset?: string;
    endTimeZoneOffset?: string;
    canceled?: boolean;
    allDay?: boolean;
    permaLinkUrl?: string;
    eventImage?: { url: string; alt: string };
    customFields?: Array<{ fieldID: number; label: string; value: string; type: number }>;
}

export function extractBranchName(location: string): string {
    // Strip HTML tags to get plain text branch name
    const plain = location.replace(/<[^>]+>/g, "").trim();
    return plain;
}

export function stripHtml(html: string): string {
    return decode(html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());
}

export function parseTrumbaEvent(event: TrumbaEvent, timezone: ZoneId): RipperEvent {
    const title = decode(event.title);

    // Parse start/end datetimes - they're in local time (America/Los_Angeles)
    const startDt = LocalDateTime.parse(event.startDateTime);
    const endDt = LocalDateTime.parse(event.endDateTime);

    const startZoned = ZonedDateTime.of(startDt, timezone);
    const endZoned = ZonedDateTime.of(endDt, timezone);
    const durationMinutes = startZoned.until(endZoned, ChronoUnit.MINUTES);
    const duration = durationMinutes > 0 ? Duration.ofMinutes(durationMinutes) : Duration.ofHours(1);

    // Extract location address from the branch name
    const branchName = event.location ? extractBranchName(event.location) : undefined;
    const roomLocation = event.customFields?.find(cf => cf.label === "Room Location")?.value;
    const locationStr = roomLocation ? `${branchName}, ${roomLocation}` : branchName;

    // Clean up description
    let description: string | undefined;
    if (event.description) {
        description = stripHtml(event.description);
    }

    const image = event.eventImage?.url;

    return {
        id: `spl-${event.eventID}`,
        ripped: new Date(),
        date: startZoned,
        duration,
        summary: title,
        description,
        location: locationStr,
        url: event.permaLinkUrl || undefined,
        image,
    } as RipperCalendarEvent;
}

export default class SPLRipper implements IRipper {
    private fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        // Calculate weeks from lookahead period
        const weeks = this.getWeeksFromLookahead(ripper.config.lookahead);

        // Fetch all events from Trumba JSON API
        const url = new URL(ripper.config.url.toString());
        url.searchParams.set("weeks", String(weeks));
        const events = await this.fetchEvents(url.toString());

        // Initialize calendars map
        const calendars: { [key: string]: { events: RipperEvent[]; friendlyName: string; tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        // Build a map from branch name to calendar name for fast lookup
        const branchToCalendar = new Map<string, string>();
        for (const c of ripper.config.calendars) {
            const branch = (c.config as { branch: string })?.branch;
            if (branch) {
                branchToCalendar.set(branch, c.name);
            }
        }

        // Route each event to the correct calendar
        const timezone = ZoneId.of("America/Los_Angeles");
        for (const event of events) {
            // Skip cancelled events
            if (event.canceled) continue;

            const branchName = event.location ? extractBranchName(event.location) : "";
            const calendarName = branchToCalendar.get(branchName);

            if (!calendarName || !calendars[calendarName]) continue;

            try {
                const parsed = parseTrumbaEvent(event, timezone);
                calendars[calendarName].events.push(parsed);
            } catch (error) {
                calendars[calendarName].events.push({
                    type: "ParseError",
                    reason: `Failed to parse SPL event ${event.eventID}: ${error}`,
                    context: event.title?.substring(0, 200),
                });
            }
        }

        return Object.keys(calendars).map(key => ({
            name: key,
            friendlyname: calendars[key].friendlyName,
            events: calendars[key].events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: calendars[key].events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: calendars[key].tags,
        }));
    }

    private async fetchEvents(url: string): Promise<TrumbaEvent[]> {
        const res = await this.fetchFn(url);
        if (!res.ok) {
            throw new Error(`SPL Trumba API error: HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
            throw new Error("SPL Trumba API returned non-array response");
        }
        return data;
    }

    private getWeeksFromLookahead(lookahead?: Period): number {
        if (!lookahead) return 6;
        const days = lookahead.days() + lookahead.months() * 30 + lookahead.years() * 365;
        return Math.max(1, Math.ceil(days / 7));
    }
}

import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

const VENUE_ADDRESS = "Rainier Arts Center, 3515 S Alaska St, Seattle, WA 98118";
const TIMEZONE = ZoneId.of("America/Los_Angeles");

// Fetch the 30 most recently published event posts from the WordPress REST API.
// The MEC plugin does not include event dates in the REST response, so we fetch
// each event's individual page and extract the structured data there.
const REST_API_URL =
    "https://rainierartscenter.org/wp-json/wp/v2/mec-events?per_page=30&_fields=id,link&status=publish";

export default class RainierArtsCenterRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const calendars: { [key: string]: { events: RipperEvent[]; friendlyName: string; tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        // 1. Retrieve event page URLs from the WP REST API
        const res = await this.fetchFn(REST_API_URL);
        if (!res.ok) {
            throw new Error(`WP REST API error: ${res.status} ${res.statusText}`);
        }
        const apiData: { id: number; link: string }[] = await res.json();

        // 2. Fetch individual event pages concurrently and parse each one
        const today = LocalDate.now(TIMEZONE);
        const eventResults = await Promise.all(
            apiData.map(e => this.fetchAndParseEvent(e.link, today))
        );
        const allEvents = eventResults.flat();

        for (const cal of ripper.config.calendars) {
            calendars[cal.name].events = allEvents;
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

    private async fetchAndParseEvent(url: string, today: LocalDate): Promise<RipperEvent[]> {
        try {
            const res = await this.fetchFn(url);
            if (!res.ok) {
                return [{
                    type: "ParseError" as const,
                    reason: `HTTP ${res.status} fetching ${url}`,
                    context: url,
                }];
            }
            return this.parseEventPage(await res.text(), url, today);
        } catch (error) {
            return [{
                type: "ParseError" as const,
                reason: `Failed to fetch event page ${url}: ${error}`,
                context: url,
            }];
        }
    }

    /**
     * Parse a single event page and return a RipperCalendarEvent (or empty array
     * for past/cancelled events, or a RipperError on parse failure).
     *
     * Event pages embed schema.org Event JSON-LD with startDate, name, description,
     * and location. Start/end time is in the <abbr class="mec-events-abbr"> element
     * (e.g. "8:00 pm - 9:30 pm").
     */
    public parseEventPage(htmlText: string, url: string, today: LocalDate): RipperEvent[] {
        const html = parse(htmlText);

        // Skip expired events — MEC marks past events with a status div
        const statusEl = html.querySelector('div.mec-event-status');
        if (statusEl?.textContent?.trim().toLowerCase().includes('expired')) {
            return [];
        }

        // The page has two JSON-LD blocks: a Yoast WebPage graph and a MEC Event block.
        // Select the one whose @type is "Event".
        const ldScripts = html.querySelectorAll('script[type="application/ld+json"]');
        let eventData: Record<string, any> | null = null;
        for (const script of ldScripts) {
            if (script.getAttribute('class') === 'yoast-schema-graph') continue;
            try {
                const textContent = script.textContent;
                if (!textContent) continue;
                const parsed = JSON.parse(textContent);
                if (parsed['@type'] === 'Event') {
                    eventData = parsed;
                    break;
                }
            } catch {
                // skip malformed scripts
            }
        }

        if (!eventData) {
            return [{
                type: "ParseError" as const,
                reason: "No Event schema.org JSON-LD found",
                context: url,
            }];
        }

        // --- Date & Time ---
        const startDateStr = eventData['startDate'] as string | undefined;
        if (!startDateStr) {
            return [{
                type: "ParseError" as const,
                reason: "No startDate in schema.org Event data",
                context: url,
            }];
        }

        let eventDate: ZonedDateTime;
        let durationMinutes: number;
        const endDateStr = eventData['endDate'] as string | undefined;

        // ISO datetime format: "2026-04-04T13:00:00-07:00"
        const isoMatch = startDateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
        if (isoMatch) {
            const [, y, m, d, h, min] = isoMatch;
            const startDate = LocalDate.of(parseInt(y), parseInt(m), parseInt(d));

            if (startDate.isBefore(today)) {
                return [];
            }

            eventDate = ZonedDateTime.of(
                LocalDateTime.of(parseInt(y), parseInt(m), parseInt(d), parseInt(h), parseInt(min)),
                TIMEZONE
            );

            // Compute duration from endDate if available
            if (endDateStr) {
                const startMs = new Date(startDateStr).getTime();
                const endMs = new Date(endDateStr).getTime();
                const diff = Math.round((endMs - startMs) / 60000);
                durationMinutes = diff > 0 ? diff : 120;
            } else {
                durationMinutes = 120;
            }
        } else {
            // Date-only format: "2026-04-04"
            let startDate: LocalDate;
            try {
                startDate = LocalDate.parse(startDateStr);
            } catch (e) {
                return [{
                    type: "ParseError" as const,
                    reason: `Could not parse date "${startDateStr}": ${e}`,
                    context: url,
                }];
            }

            if (startDate.isBefore(today)) {
                return [];
            }

            // Fall back to MEC HTML time elements
            const timeEl = html.querySelector('div.mec-single-event-time abbr.mec-events-abbr');
            const timeText = timeEl?.textContent?.trim() || '';
            const parsed = this.parseTime(timeText);

            try {
                eventDate = ZonedDateTime.of(
                    LocalDateTime.of(startDate.year(), startDate.monthValue(), startDate.dayOfMonth(), parsed.hour, parsed.minute),
                    TIMEZONE
                );
            } catch (e) {
                return [{
                    type: "ParseError" as const,
                    reason: `Invalid datetime for event at ${url}: ${e}`,
                    context: startDateStr,
                }];
            }
            durationMinutes = parsed.durationMinutes;
        }

        // --- Title ---
        const title = (eventData['name'] as string | undefined)?.trim() || '';
        if (!title) {
            return [{
                type: "ParseError" as const,
                reason: "No event name in schema.org Event data",
                context: url,
            }];
        }

        // Skip cancelled events
        const titleLower = title.toLowerCase();
        if (titleLower.startsWith('cancelled:') || titleLower.startsWith('canceled:')) {
            return [];
        }

        // --- Description ---
        const rawDesc = (eventData['description'] as string | undefined) || '';
        const description = this.cleanDescription(rawDesc) || undefined;

        // --- Location ---
        // schema.org location.name is the room name (e.g. "Auditorium"); address is always empty.
        const roomName = (eventData['location']?.['name'] as string | undefined)?.trim() || '';
        const location = roomName ? `${roomName}, ${VENUE_ADDRESS}` : VENUE_ADDRESS;

        // --- ID ---
        const slugMatch = url.match(/\/events\/([^/]+)\/?$/);
        const id = slugMatch ? `rac-${slugMatch[1]}` : `rac-${startDateStr}`;

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(durationMinutes),
            summary: title,
            description,
            location,
            url: (eventData['url'] as string | undefined) || url,
        };

        return [event];
    }

    /** Strip WordPress shortcodes (e.g. [embed]…[/embed]) and normalise whitespace. */
    public cleanDescription(text: string): string {
        return text
            .replace(/\[\w+\].*?\[\/\w+\]/gs, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Parse a time range like "8:00 pm - 9:30 pm" into start hour/minute and duration.
     * Falls back to 7 pm / 2-hour duration when the format is unrecognised.
     */
    public parseTime(timeText: string): { hour: number; minute: number; durationMinutes: number } {
        // Range: "8:00 pm - 9:30 pm" or "11:00 am - 2:00 pm"
        const rangeMatch = timeText.match(
            /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i
        );
        if (rangeMatch) {
            const [, startHStr, startMStr, startPeriod, endHStr, endMStr, endPeriod] = rangeMatch;

            let startHour = parseInt(startHStr, 10);
            const startMin = startMStr ? parseInt(startMStr, 10) : 0;
            const sp = startPeriod.toLowerCase();
            if (sp === 'pm' && startHour !== 12) startHour += 12;
            if (sp === 'am' && startHour === 12) startHour = 0;

            let endHour = parseInt(endHStr, 10);
            const endMin = endMStr ? parseInt(endMStr, 10) : 0;
            const ep = endPeriod.toLowerCase();
            if (ep === 'pm' && endHour !== 12) endHour += 12;
            if (ep === 'am' && endHour === 12) endHour = 0;

            let durationMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
            if (durationMinutes < 0) durationMinutes += 24 * 60; // handle midnight-spanning events
            durationMinutes = Math.max(durationMinutes, 30);
            return { hour: startHour, minute: startMin, durationMinutes };
        }

        // Single time: "6:30 pm"
        const singleMatch = timeText.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
        if (singleMatch) {
            let hour = parseInt(singleMatch[1], 10);
            const minute = singleMatch[2] ? parseInt(singleMatch[2], 10) : 0;
            const period = singleMatch[3].toLowerCase();
            if (period === 'pm' && hour !== 12) hour += 12;
            if (period === 'am' && hour === 12) hour = 0;
            return { hour, minute, durationMinutes: 120 };
        }

        // Default for unparseable time: 7 pm, 2 hours
        return { hour: 19, minute: 0, durationMinutes: 120 };
    }
}

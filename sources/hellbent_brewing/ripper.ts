import { Instant, ZoneId, ZonedDateTime, Duration } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

const FOOD_TRUCKS_URL = "https://hellbentbrewingcompany.com/food-trucks/";
const LOCATION = "Hellbent Brewing Company, 13035 Lake City Way NE, Seattle, WA 98125";
const DEFAULT_DURATION_HOURS = 3;

/**
 * Hellbent Brewing food truck calendar ripper.
 *
 * The food trucks page embeds a Google Calendar via the WordPress Simple Calendar
 * plugin (google-calendar-events). Events are rendered server-side as a monthly
 * grid, so this ripper parses the current month's HTML directly.
 *
 * Each food truck event is a <li class="simcal-event"> element containing:
 *   - <span class="simcal-event-title"> with the food truck name
 *   - <span data-event-start="UNIX_SECONDS"> with the start timestamp
 */
export default class HellbentBrewingRipper implements IRipper {
    private fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        let html: string;
        try {
            const res = await this.fetchFn(FOOD_TRUCKS_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
            html = await res.text();
        } catch (error) {
            return ripper.config.calendars.map(c => ({
                name: c.name,
                friendlyname: c.friendlyname,
                events: [],
                errors: [{ type: "ParseError" as const, reason: `Failed to fetch page: ${error}`, context: FOOD_TRUCKS_URL }],
                parent: ripper.config,
                tags: c.tags || [],
            }));
        }

        const events = this.parseEvents(html, now, timezone);

        return ripper.config.calendars.map(c => ({
            name: c.name,
            friendlyname: c.friendlyname,
            events: events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: c.tags || [],
        }));
    }

    /**
     * Parse food truck events from the Simple Calendar HTML grid.
     * Each <li class="simcal-event"> contains the truck name and start timestamp.
     * Only events starting at or after `now` are returned.
     */
    public parseEvents(html: string, now: ZonedDateTime, timezone: ZoneId): RipperEvent[] {
        const root = parse(html);
        const events: RipperEvent[] = [];
        const seen = new Set<string>();

        const eventEls = root.querySelectorAll('li.simcal-event');

        for (const el of eventEls) {
            try {
                // First span.simcal-event-title is the visible truck name (outside tooltip)
                const titleEl = el.querySelector('span.simcal-event-title');
                const rawTitle = titleEl?.textContent?.trim();
                if (!rawTitle) continue;
                const title = rawTitle.replace(/&#0*39;/g, "'").replace(/&amp;/g, '&').trim();

                // data-event-start holds a Unix timestamp in seconds
                const startEl = el.querySelector('[data-event-start]');
                const startTs = startEl?.getAttribute('data-event-start');
                if (!startTs) continue;

                const startDate = ZonedDateTime.ofInstant(
                    Instant.ofEpochMilli(parseInt(startTs, 10) * 1000),
                    timezone
                );

                if (startDate.isBefore(now)) continue;

                const key = `${startTs}-${title}`;
                if (seen.has(key)) continue;
                seen.add(key);

                events.push({
                    id: `hellbent-${startTs}-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
                    ripped: new Date(),
                    date: startDate,
                    duration: Duration.ofHours(DEFAULT_DURATION_HOURS),
                    summary: `Food Truck: ${title}`,
                    location: LOCATION,
                    url: FOOD_TRUCKS_URL,
                });
            } catch (err) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse food truck event: ${err}`,
                    context: "simcal-event",
                });
            }
        }

        return events;
    }
}

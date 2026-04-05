import { ZonedDateTime, Duration, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const ALGOLIA_APP_ID = 'I80Y2BQLSL';
const ALGOLIA_API_KEY = 'e4226055c240f9e38e89794dcfb91766';
const ALGOLIA_INDEX = 'Fever-SEA';
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;

export default class CandlelightRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const hits = await this.fetchAllHits(fetchFn);
        const timezone = ripper.config.calendars[0].timezone;
        const events = this.parseEvents(hits, ZoneId.of(timezone.id()));

        return [{
            name: ripper.config.calendars[0].name,
            friendlyname: ripper.config.calendars[0].friendlyname,
            events: events.filter(e => "date" in e) as RipperCalendarEvent[],
            errors: events.filter(e => "type" in e) as RipperError[],
            parent: ripper.config,
            tags: ripper.config.calendars[0].tags || [],
        }];
    }

    private async fetchAllHits(fetchFn: FetchFn): Promise<any[]> {
        const hits: any[] = [];
        let page = 0;

        while (true) {
            const res = await fetchFn(ALGOLIA_URL, {
                method: 'POST',
                headers: {
                    'X-Algolia-Application-Id': ALGOLIA_APP_ID,
                    'X-Algolia-API-Key': ALGOLIA_API_KEY,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ params: `query=candlelight&hitsPerPage=50&page=${page}` }),
            });

            if (!res.ok) throw new Error(`Algolia returned ${res.status} ${res.statusText}`);

            const data = await res.json();
            hits.push(...data.hits);

            if (page >= data.nbPages - 1) break;
            page++;
        }

        return hits;
    }

    public parseEvents(hits: any[], timezone: ZoneId = ZoneId.of('America/Los_Angeles')): RipperEvent[] {
        const events: RipperEvent[] = [];
        const seenIds = new Set<string>();
        const now = new Date();

        for (const hit of hits) {
            if (hit.is_gift_card) continue;

            const planId = String(hit.id);
            const name = hit.name as string;
            const venue = hit.venues_coordinates?.[0];
            const venueName: string | undefined = venue?.venue_name;
            const lat: number | undefined = venue?.lat;
            const lng: number | undefined = venue?.lng;

            for (const session of (hit.sessions ?? [])) {
                try {
                    const startDate = new Date(session.startDateStr);
                    if (startDate < now) continue;

                    const eventId = `candlelight-${planId}-${session.startDateStr}`;
                    if (seenIds.has(eventId)) continue;
                    seenIds.add(eventId);

                    // Parse the UTC ISO string, then convert to local timezone
                    const utcZdt = ZonedDateTime.parse(session.startDateStr);
                    const localZdt = utcZdt.withZoneSameInstant(timezone);

                    const event: RipperCalendarEvent = {
                        id: eventId,
                        ripped: new Date(),
                        date: localZdt,
                        duration: Duration.ofMinutes(65),
                        summary: name,
                        location: venueName,
                        url: `https://feverup.com/m/${planId}`,
                        lat,
                        lng,
                    };

                    events.push(event);
                } catch (err) {
                    events.push({
                        type: "ParseError",
                        reason: `Failed to parse session: ${err}`,
                        context: `${planId} ${session.startDateStr}`,
                    });
                }
            }
        }

        return events;
    }
}

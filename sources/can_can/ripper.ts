import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

export const LOCATION = "Can Can Culinary Cabaret, 95 Pine St, Seattle, WA 98101";
export const TICKETS_URL = "https://www.cancanseattle.com/tickets";
const BASE_URL = "https://system.spektrix.com/cancan/api/v3";

export interface SpektrixEvent {
    id: string;
    name: string;
    duration: number; // minutes; 0 for ticket-tier variants (Celebration, Culinary, Flex)
    firstInstanceDateTime: string;
    lastInstanceDateTime: string;
}

export interface SpektrixInstance {
    id: string;
    event: { id: string };
    start: string; // local datetime, e.g. "2026-05-09T18:30:00"
    startUtc: string;
    cancelled: boolean;
    isOnSale: boolean;
}

/**
 * Convert Spektrix events + instances into calendar events.
 * Exported for unit testing.
 */
export function processData(
    allEvents: SpektrixEvent[],
    allInstances: SpektrixInstance[],
    now: ZonedDateTime,
    zone: ZoneId,
): { events: RipperCalendarEvent[]; errors: RipperError[] } {
    // Only keep main show records (duration > 0). Ticket-tier variants
    // (Celebration, Culinary, Flex) have duration === 0 and share the same
    // performance times as the main entry; we skip them to avoid duplicates.
    const mainEvents = new Map<string, SpektrixEvent>(
        allEvents
            .filter(e => e.duration > 0)
            .map(e => [e.id, e])
    );

    const errors: RipperError[] = [];
    const events: RipperCalendarEvent[] = [];
    // Deduplicate by (eventId, startTime) in case the same performance appears
    // across multiple plan variants with different Spektrix IDs.
    const seen = new Set<string>();

    for (const inst of allInstances) {
        const event = mainEvents.get(inst.event.id);
        if (!event) continue;
        if (inst.cancelled) continue;

        const dedupeKey = `${inst.event.id}|${inst.start}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        let eventDate: ZonedDateTime;
        try {
            eventDate = ZonedDateTime.of(LocalDateTime.parse(inst.start), zone);
        } catch {
            errors.push({
                type: 'ParseError',
                reason: `Invalid datetime: ${inst.start}`,
                context: event.name,
            });
            continue;
        }

        if (eventDate.isBefore(now)) continue;

        events.push({
            id: `can-can-${inst.id}`,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(event.duration),
            summary: event.name,
            location: LOCATION,
            url: TICKETS_URL,
        });
    }

    return { events, errors };
}

export default class CanCanRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const zone = ZoneId.of(calConfig.timezone.toString());
        const now = ZonedDateTime.now(zone);

        const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' };

        const [eventsRes, instancesRes] = await Promise.all([
            fetchFn(`${BASE_URL}/events`, { headers }),
            fetchFn(`${BASE_URL}/instances?cancelled=false`, { headers }),
        ]);

        if (!eventsRes.ok) throw new Error(`Spektrix events API returned ${eventsRes.status}`);
        if (!instancesRes.ok) throw new Error(`Spektrix instances API returned ${instancesRes.status}`);

        const allEvents: SpektrixEvent[] = await eventsRes.json();
        const allInstances: SpektrixInstance[] = await instancesRes.json();

        const { events, errors } = processData(allEvents, allInstances, now, zone);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}

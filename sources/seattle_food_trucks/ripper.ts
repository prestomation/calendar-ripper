import { ZonedDateTime, Duration, LocalDate, ChronoUnit } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import '@js-joda/timezone';

const BASE_URL = 'https://www.seattlefoodtruck.com';
const LOOKAHEAD_DAYS = 30;

// Neighborhood names considered "Seattle area" for the purposes of this ripper.
// Pods in these neighborhoods are included; pods in suburban neighborhoods (Bellevue,
// Bothell, Kirkland, etc.) are excluded.
const SEATTLE_NEIGHBORHOODS = new Set([
    'Ballard',
    'Beacon Hill',
    'Belltown',
    'Breweries',
    'Capitol Hill',
    'Central District',
    'Downtown',
    'Eastlake',
    'Fremont',
    'Georgetown',
    'Northgate',
    'Pioneer Square',
    'Queen Anne',
    'SoDo',
    'South Lake Union',
    'University Of Washington',
    'West Seattle',
]);

interface PodLocation {
    id: number;
    slug: string;
    name: string;
    neighborhood?: {
        name: string;
        id: number;
        slug: string;
    };
}

interface Pod {
    name: string;
    id: string;
    uid: number;
    location: PodLocation;
}

interface LocationDetails {
    id: number;
    name: string;
    address: string;
    filtered_address: string;
    slug: string;
}

interface SFTBooking {
    id: number;
    name: string | null;
    description: string | null;
    start_time: string;
    end_time: string;
    event_id: number;
    shift: string;
    display_name: string;
    title: string;
}

export default class SeattleFoodTruckRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const timezone = ripper.config.calendars[0].timezone;

        // 1. Fetch all public food truck pods
        const podsRes = await fetch(`${BASE_URL}/api/pods`);
        if (!podsRes.ok) {
            throw new Error(`Failed to fetch pods: ${podsRes.status} ${podsRes.statusText}`);
        }
        const podsData = await podsRes.json() as { pods: Pod[] };
        const allPods: Pod[] = podsData.pods || [];

        // Filter to Seattle-area pods only
        const seattlePods = allPods.filter(pod => {
            const nbName = pod.location?.neighborhood?.name;
            // Include pods with a recognized Seattle neighborhood, or with no neighborhood
            // but a Seattle-area address (identified by slug not containing suburban markers)
            if (!nbName) {
                // Check slug to exclude known suburban locations with null neighborhood
                const slug = pod.location?.slug || '';
                return !slug.includes('shoreline') && !slug.includes('canyon-park');
            }
            return SEATTLE_NEIGHBORHOODS.has(nbName);
        });

        // Build name-keyed map (lowercase) for O(1) lookup when filtering events
        const podByName = new Map<string, Pod>();
        for (const pod of seattlePods) {
            podByName.set(pod.name.toLowerCase(), pod);
        }

        // 2. Fetch address details for each Seattle pod location
        const locationDetails = new Map<number, LocationDetails>();
        await Promise.all(
            seattlePods.map(async pod => {
                const locId = pod.location?.id;
                if (!locId || locationDetails.has(locId)) return;
                try {
                    const locRes = await fetch(`${BASE_URL}/api/locations/${locId}`);
                    if (locRes.ok) {
                        const locData = await locRes.json() as LocationDetails;
                        locationDetails.set(locId, locData);
                    }
                } catch {
                    // Best-effort; address will be omitted if fetch fails
                }
            })
        );

        // 3. Fetch events page by page until we pass the lookahead window
        const endDate = LocalDate.now().plusDays(LOOKAHEAD_DAYS);
        const allPodEvents: SFTBooking[] = [];
        const seenSlots = new Set<string>();

        let page = 1;
        let stopFetching = false;

        while (!stopFetching) {
            const res = await fetch(`${BASE_URL}/api/events?page=${page}`);
            if (!res.ok) {
                throw new Error(`Failed to fetch events page ${page}: ${res.status} ${res.statusText}`);
            }
            const data = await res.json() as { pagination: { total_pages: number }, events: SFTBooking[] };
            const events: SFTBooking[] = data.events || [];

            if (events.length === 0) break;

            for (const ev of events) {
                // Parse start date to check lookahead window
                const startDate = this.parseLocalDate(ev.start_time);
                if (!startDate) continue;

                if (startDate.isAfter(endDate)) {
                    stopFetching = true;
                    break;
                }

                // Skip events not at a Seattle pod location
                const displayNameLower = (ev.display_name || '').toLowerCase();
                if (!podByName.has(displayNameLower)) continue;

                // Deduplicate: multiple trucks can be booked at the same location/time slot;
                // we represent each slot as a single "food trucks at X" calendar event.
                const slotKey = `${ev.display_name}|${ev.start_time}|${ev.end_time}`;
                if (seenSlots.has(slotKey)) continue;
                seenSlots.add(slotKey);

                allPodEvents.push(ev);
            }

            if (page >= data.pagination.total_pages) break;
            page++;
        }

        // 4. Build calendar events from filtered bookings
        const events: RipperEvent[] = [];
        for (const ev of allPodEvents) {
            try {
                const pod = podByName.get(ev.display_name.toLowerCase());
                if (!pod) continue;
                const locData = locationDetails.get(pod.location.id);

                const startDt = this.parseZonedDateTime(ev.start_time, timezone);
                const endDt = this.parseZonedDateTime(ev.end_time, timezone);
                if (!startDt || !endDt) continue;

                const durationMinutes = startDt.until(endDt, ChronoUnit.MINUTES);
                const duration = Duration.ofMinutes(Math.max(durationMinutes, 0));

                const address = locData?.filtered_address || locData?.address;
                const url = `${BASE_URL}/schedule/${pod.location.slug}`;

                const calEvent: RipperCalendarEvent = {
                    id: `sft-${ev.id}`,
                    ripped: new Date(),
                    date: startDt,
                    duration,
                    summary: `Food Trucks @ ${pod.name}`,
                    location: address || undefined,
                    url,
                };

                events.push(calEvent);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse SFT booking: ${error}`,
                    context: JSON.stringify(ev).substring(0, 200),
                } as RipperError);
            }
        }

        // Return one calendar per configured calendar entry
        return ripper.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: events.filter(e => 'date' in e) as RipperCalendarEvent[],
            errors: events.filter(e => 'type' in e) as RipperError[],
            parent: ripper.config,
            tags: cal.tags || [],
        }));
    }

    /**
     * Parse an SFT API timestamp (e.g. "2026-03-06T11:00:00.000-08:00") to a LocalDate.
     */
    public parseLocalDate(timeStr: string): LocalDate | null {
        if (!timeStr) return null;
        try {
            const datePart = timeStr.substring(0, 10); // "YYYY-MM-DD"
            return LocalDate.parse(datePart);
        } catch {
            return null;
        }
    }

    /**
     * Parse an SFT API timestamp into a ZonedDateTime in the given timezone.
     * The API returns ISO-8601 with milliseconds and a UTC offset, e.g.
     * "2026-03-06T11:00:00.000-08:00". We preserve the wall-clock time and
     * apply the calendar's timezone.
     */
    public parseZonedDateTime(timeStr: string, timezone: any): ZonedDateTime | null {
        if (!timeStr) return null;
        try {
            // Strip milliseconds: "2026-03-06T11:00:00.000-08:00" → "2026-03-06T11:00:00-08:00"
            const clean = timeStr.replace(/\.\d{3}/, '');
            return ZonedDateTime.parse(clean).withZoneSameInstant(timezone);
        } catch {
            return null;
        }
    }
}

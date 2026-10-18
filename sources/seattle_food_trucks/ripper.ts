import { ZonedDateTime, Duration, LocalDate, ChronoUnit } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const BASE_URL = 'https://www.seattlefoodtruck.com';
const LOOKAHEAD_DAYS = 30;

// The merged, city-wide calendar. Kept as an anchor so the source is never
// treated as "new" when pod calendars are added/renamed (the new-source
// 0-event gate is fatal and not exempted by expectEmpty), and so existing
// subscribers to seattle-food-trucks-seattle-food-trucks.ics keep their feed.
const MERGED_CALENDAR = 'seattle-food-trucks';

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

// Per-pod routing. Every Seattle-area pod the API returns should have an entry
// here: either `{ calendar }` (gets its own per-pod calendar, declared in
// ripper.yaml with a neighborhood tag + geo) or `{ skip }` (deliberately no
// calendar — suburban strays that slip the neighborhood filter, or breweries
// that warrant a dedicated ripper with richer per-truck data). A Seattle pod
// that is in NEITHER bucket surfaces a non-fatal "unknown pod" ParseError so
// the build-report skill can triage it (add a calendar or a skip). Keys are the
// pod's exact API `name` (which equals the booking `display_name`).
export const POD_CONFIG: Record<string, { calendar: string } | { skip: string }> = {
    "Westlake Center": { calendar: "westlake-center" },
    "Westlake Park": { calendar: "westlake-park" },
    "McGraw Square": { calendar: "mcgraw-square" },
    "1200 Fifth": { calendar: "1200-fifth" },
    "Starbucks Center": { calendar: "starbucks-center" },
    "Dexter Yard": { calendar: "dexter-yard" },
    "FOX 13 Seattle": { calendar: "fox-13-seattle" },
    "Fred Hutch Cancer Center": { calendar: "fred-hutch-cancer-center" },
    "West Lake Union Center": { calendar: "west-lake-union-center" },
    "1201 Eastlake": { calendar: "1201-eastlake" },
    "1551 Eastlake": { calendar: "1551-eastlake" },
    "Expedia Group Campus": { calendar: "expedia-group-campus" },
    "Bell Street Park": { calendar: "bell-street-park" },
    "Northedge": { calendar: "northedge" },
    // The trailing backtick is INTENTIONAL — it's part of the pod's actual name
    // in the SFT API (a typo on their side: `/api/pods` returns "Trupanion`").
    // Keys must match `display_name` exactly, so do NOT "fix" this; removing the
    // backtick would stop routing this pod and flag it as an unknown pod.
    "Trupanion`": { calendar: "trupanion" },
    "Kaiser Permanente : Northgate Medical Center": { calendar: "kaiser-permanente-northgate" },
    "The Polyclinic : Northgate Plaza": { calendar: "polyclinic-northgate" },
    "Occidental Park": { calendar: "occidental-park" },
    "Market at the Marquee": { calendar: "market-at-the-marquee" },
    // Known pods deliberately without their own calendar (no gap error):
    "Black Raven Brewing Company : Redmond": { skip: "Redmond — outside Seattle" },
    "Black Raven Brewing Company : Woodinville": { skip: "Woodinville — outside Seattle" },
    "Statsig": { skip: "Bellevue — outside Seattle" },
    "Sunset Corporate Campus": { skip: "Bellevue — outside Seattle" },
    "Broadview Tap House": { skip: "Seattle brewery — dedicated-ripper candidate" },
    "Figurehead Brewing": { skip: "Seattle brewery — dedicated-ripper candidate" },
    "Saleh's": { skip: "Seattle brewery/deli — dedicated-ripper candidate" },
};

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

export interface Pod {
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

export interface SFTBooking {
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
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const timezone = ripper.config.calendars[0].timezone;

        // 1. Fetch all public food truck pods
        const podsRes = await this.fetchFn(`${BASE_URL}/api/pods`);
        if (!podsRes.ok) {
            throw new Error(`Failed to fetch pods: ${podsRes.status} ${podsRes.statusText}`);
        }
        const podsData = await podsRes.json() as { pods: Pod[] };
        const allPods: Pod[] = podsData.pods || [];

        const seattlePods = allPods.filter(pod => this.isSeattlePod(pod));

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
                    const locRes = await this.fetchFn(`${BASE_URL}/api/locations/${locId}`);
                    if (locRes.ok) {
                        const locData = await locRes.json() as LocationDetails;
                        locationDetails.set(locId, locData);
                    }
                } catch {
                    // Best-effort; address will be omitted if fetch fails
                }
            })
        );

        // 3. Fetch events page by page until we pass the lookahead window,
        //    keeping one booking per (pod, time slot).
        const bookings = await this.collectSeattleBookings(podByName);

        // 4. Build the merged + per-pod calendars from the bookings.
        return this.buildCalendars(ripper.config, seattlePods, bookings, podByName, locationDetails, timezone);
    }

    /** Whether a pod is in the Seattle service area (matches SEATTLE_NEIGHBORHOODS,
     *  or has no neighborhood but a non-suburban slug). */
    public isSeattlePod(pod: Pod): boolean {
        const nbName = pod.location?.neighborhood?.name;
        if (!nbName) {
            const slug = pod.location?.slug || '';
            return !slug.includes('shoreline') && !slug.includes('canyon-park');
        }
        return SEATTLE_NEIGHBORHOODS.has(nbName);
    }

    /** Page through /api/events within the lookahead window, keeping Seattle-pod
     *  bookings deduplicated to one per (pod, start, end) slot. */
    public async collectSeattleBookings(podByName: Map<string, Pod>): Promise<SFTBooking[]> {
        const endDate = LocalDate.now().plusDays(LOOKAHEAD_DAYS);
        const out: SFTBooking[] = [];
        const seenSlots = new Set<string>();

        let page = 1;
        let stopFetching = false;
        while (!stopFetching) {
            const res = await this.fetchFn(`${BASE_URL}/api/events?page=${page}`);
            if (!res.ok) {
                throw new Error(`Failed to fetch events page ${page}: ${res.status} ${res.statusText}`);
            }
            const data = await res.json() as { pagination: { total_pages: number }, events: SFTBooking[] };
            const events: SFTBooking[] = data.events || [];
            if (events.length === 0) break;

            for (const ev of events) {
                const startDate = this.parseLocalDate(ev.start_time);
                if (!startDate) continue;
                if (startDate.isAfter(endDate)) { stopFetching = true; break; }

                // Only Seattle pods
                if (!podByName.has((ev.display_name || '').toLowerCase())) continue;

                // Deduplicate: multiple trucks can be booked at the same
                // location/time slot; represent each slot as a single event.
                const slotKey = `${ev.display_name}|${ev.start_time}|${ev.end_time}`;
                if (seenSlots.has(slotKey)) continue;
                seenSlots.add(slotKey);
                out.push(ev);
            }

            if (page >= data.pagination.total_pages) break;
            page++;
        }
        return out;
    }

    /** Build the merged city-wide calendar plus one calendar per configured pod,
     *  and attach any unknown-pod detection errors to the merged calendar. Pure
     *  (no network) so it can be unit-tested against sample data. */
    public buildCalendars(
        config: Ripper["config"],
        seattlePods: Pod[],
        bookings: SFTBooking[],
        podByName: Map<string, Pod>,
        locationDetails: Map<number, LocationDetails>,
        timezone: any,
    ): RipperCalendar[] {
        const calendars = config.calendars;
        // Group bookings by the calendar they belong to (via POD_CONFIG).
        // `mergedBookings` holds slots at pods WITHOUT their own per-pod calendar
        // (skipped breweries, suburban strays, or not-yet-configured pods). The
        // merged calendar is therefore DISJOINT from the per-pod calendars — no
        // event appears in two calendars, so the cross-source dedup never sees a
        // food-truck slot twice (mirrors seattle_showlists' catch-all, which
        // excludes venues that have their own calendar).
        const byCalendar = new Map<string, SFTBooking[]>();
        const mergedBookings: SFTBooking[] = [];
        for (const ev of bookings) {
            const route = POD_CONFIG[ev.display_name];
            if (route && 'calendar' in route) {
                const list = byCalendar.get(route.calendar) ?? [];
                list.push(ev);
                byCalendar.set(route.calendar, list);
            } else {
                mergedBookings.push(ev);   // skip/unknown pod → catch-all
            }
        }

        const unknownErrors = this.detectUnknownPods(seattlePods);

        return calendars.map(cal => {
            const forThisCalendar = cal.name === MERGED_CALENDAR
                ? mergedBookings                             // catch-all = pods without their own calendar
                : (byCalendar.get(cal.name) ?? []);          // per-pod = just this pod's slots

            const events: RipperCalendarEvent[] = [];
            const errors: RipperError[] = [];
            for (const ev of forThisCalendar) {
                const result = this.bookingToEvent(ev, podByName, locationDetails, timezone);
                if ('date' in result) events.push(result);
                else errors.push(result);
            }

            // Surface unknown-pod detection on the merged calendar only, so it's
            // reported once rather than per pod calendar.
            if (cal.name === MERGED_CALENDAR) errors.push(...unknownErrors);

            return {
                name: cal.name,
                friendlyname: cal.friendlyname,
                events,
                errors,
                // `parent` is REQUIRED downstream: the events-index builder
                // reconstructs each calendar's ICS URL from `parent.name`
                // (lib/calendar_ripper.ts) — without it, events are written to
                // ICS but silently dropped from events-index.json (and the site).
                // It also drives per-calendar geo/imageUrl lookup and venues.json.
                parent: config,
                tags: cal.tags || [],
            } as RipperCalendar;
        });
    }

    /** Seattle-area pods returned by the API that are absent from POD_CONFIG.
     *  Emitted as non-fatal ParseErrors so the build report can triage them. */
    public detectUnknownPods(seattlePods: Pod[]): RipperError[] {
        const errors: RipperError[] = [];
        const seen = new Set<string>();
        for (const pod of seattlePods) {
            if (POD_CONFIG[pod.name]) continue;
            if (seen.has(pod.name)) continue;
            seen.add(pod.name);
            const nb = pod.location?.neighborhood?.name ?? 'unknown';
            const slug = pod.location?.slug ?? 'unknown';
            errors.push({
                type: "ParseError",
                reason: `Unknown pod "${pod.name}" (neighborhood "${nb}", slug "${slug}") not in POD_CONFIG — add a calendar entry (with neighborhood tag + geo) or a skip`,
                context: `pod: ${pod.name}`,
            });
        }
        return errors;
    }

    /** Convert one SFT booking into a calendar event, or a ParseError if its
     *  timestamps don't parse. Never returns null (see AGENTS.md). */
    public bookingToEvent(
        ev: SFTBooking,
        podByName: Map<string, Pod>,
        locationDetails: Map<number, LocationDetails>,
        timezone: any,
    ): RipperCalendarEvent | RipperError {
        const pod = podByName.get((ev.display_name || '').toLowerCase());
        const startDt = this.parseZonedDateTime(ev.start_time, timezone);
        const endDt = this.parseZonedDateTime(ev.end_time, timezone);
        if (!pod || !startDt || !endDt) {
            return {
                type: "ParseError",
                reason: `Could not build event for booking: pod="${ev.display_name}" start="${ev.start_time}" end="${ev.end_time}"`,
                context: `sft-${ev.id}`,
            };
        }

        const durationMinutes = startDt.until(endDt, ChronoUnit.MINUTES);
        const duration = Duration.ofMinutes(Math.max(durationMinutes, 0));
        const locData = locationDetails.get(pod.location.id);
        const address = locData?.filtered_address || locData?.address;

        return {
            id: `sft-${ev.id}`,
            ripped: new Date(),
            date: startDt,
            duration,
            summary: `Food Trucks @ ${pod.name}`,
            location: address || undefined,
            url: `${BASE_URL}/schedule/${pod.location.slug}`,
            cost: { min: 0 },
        };
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

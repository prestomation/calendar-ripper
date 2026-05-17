import { Duration, Period, ZoneOffset, ZoneRegion, ZonedDateTime, convert } from "@js-joda/core";
import { z } from "zod";
import { promisify } from 'util';
import * as icsOriginal from 'ics';

import '@js-joda/timezone'

const createICSEvents = promisify(icsOriginal.createEvents);


export const geoSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    label: z.string().optional(),
    // OpenStreetMap feature identity. Both must be set together or neither —
    // consumers key off the (osmType, osmId) pair. Absent means "we positioned
    // this venue manually, no OSM join available."
    osmType: z.enum(["node", "way", "relation"]).optional(),
    osmId: z.number().int().positive().optional(),
    // ISO date (YYYY-MM-DD) recording the last time the OSM-resolver skill
    // looked at this venue and rejected every Nominatim candidate (a Tier D/F
    // verdict — wrong feature, or no feature at all). `buildOsmGaps` skips
    // venues whose `osmChecked` is within the last ~60 days so the same
    // wrong matches don't re-propose every day. After the cooldown, the
    // skill retries — OSM grows, and venues that weren't indexed last
    // quarter may be there now.
    osmChecked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict().refine(
    g => (g.osmId === undefined) === (g.osmType === undefined),
    { message: "osmId and osmType must be set together or both omitted" },
);

export type Geo = z.infer<typeof geoSchema>;

/**
 * How many days a Tier D/F rejection (recorded as `osmChecked`) silences a
 * venue from `osmGaps`. After the cooldown the venue surfaces again so the
 * skill can retry — OSM grows over time and a feature missing six months
 * ago may exist today.
 */
export const OSM_CHECKED_COOLDOWN_DAYS = 60;

export const calendarConfigSchema = z.object({
    name: z.string().regex(/^[a-zA-Z0-9.-]+$/),
    config: z.object({}).passthrough().optional(),
    timezone: z.string().transform(ZoneRegion.of),
    friendlyname: z.string(),
    tags: z.array(z.string()).optional(),
    expectEmpty: z.boolean().optional(),
    // Optional per-calendar override for multi-branch sources (e.g. SPL).
    // When present, this wins over ripper-level `geo`. When absent, the
    // calendar inherits `geo` from its parent ripper.
    geo: geoSchema.nullable().optional(),
});

export const externalCalendarSchema = z.object({
    name: z.string().regex(/^[a-zA-Z0-9.-]+$/),
    friendlyname: z.string(),
    icsUrl: z.string(),
    infoUrl: z.string().optional(),
    description: z.string().optional(),
    disabled: z.boolean().default(false),
    expectEmpty: z.boolean().default(false),
    tags: z.array(z.string()).optional(),
    // When set to "outofband", the ICS feed is fetched by the out-of-band
    // runner (home server with a residential IP) instead of GitHub Actions,
    // for feeds that block GHA IPs. The main build skips its live fetch and
    // picks up the pre-fetched .ics via the outofband report.
    proxy: z.enum(["outofband"]).or(z.literal(false)).default(false),
    // Required: every external calendar must explicitly state whether it is
    // a single-location venue (geo object) or not (null). Single-venue feeds
    // like a brewery's Google Calendar are venues; multi-location feeds
    // (aggregators, cross-city calendars) are not.
    geo: geoSchema.nullable(),
});

export const externalConfigSchema = z.array(externalCalendarSchema);

export const BUILTIN_RIPPER_TYPES = ["squarespace", "ticketmaster", "axs", "eventbrite", "dice", "styledcalendar", "spothopper"] as const;
export type BuiltinRipperType = typeof BUILTIN_RIPPER_TYPES[number];

export const configSchema = z.object({
    name: z.string(),
    friendlyname: z.string().optional(),
    description: z.string(),
    url: z.string().transform(u => new URL(u)),
    friendlyLink: z.string(),
    disabled: z.boolean().default(false),
    proxy: z.enum(["outofband"]).or(z.literal(false)).default(false),
    needsBrowser: z.boolean().default(false),
    expectEmpty: z.boolean().default(false),
    type: z.enum(BUILTIN_RIPPER_TYPES).optional(),
    tags: z.array(z.string()).optional(),
    calendars: z.array(calendarConfigSchema),
    // We use refine to provide our own error message
    // and Transform to parse it into a Period
    lookahead: z.string().refine(p => {
        try {
            Period.parse(p);
            return true;
        }
        catch (e) { return false; }
    }, { message: "Must parse as valid ISO-8601 period. e.g. P1M" }).transform(p => Period.parse(p)).optional(),
    // Required: every ripper must explicitly declare whether it is a
    // venue (single fixed location, `geo: {lat, lng, label}`) or not
    // (`geo: null`, e.g. community calendars / multi-location sources).
    // Multi-branch rippers like SPL can declare ripper-level `geo: null`
    // and set `geo` per calendar instead.
    geo: geoSchema.nullable(),
}).strict();


export type RipperConfig = z.infer<typeof configSchema>;

export type RipperError = FileParseError | InvalidDateError | ImportError | ParseError | GeocodeError | UncertaintyError;
type ErrorBase = { type: string, reason: string; };

export type FileParseError = ErrorBase & {
    type: "FileParseError",
    path: string
};

export type ParseError = ErrorBase & {
    type: "ParseError",
    context: string | undefined;
};

export type ImportError = ErrorBase & {
    type: "ImportError",
    error: any,
    path: string
};

export type InvalidDateError = ErrorBase & {
    type: "InvalidDateError",
};

export type GeocodeError = ErrorBase & {
    type: "GeocodeError";
    location: string;
    source: string;
    reason: string;
};

// Fields a ripper may declare uncertain. Keep this in sync with the
// resolver script's CLI choices (skills/event-uncertainty-resolver).
// When adding a new field, also teach `applyUncertaintyResolutions` how
// to apply it to a RipperCalendarEvent.
export type UncertaintyField = "startTime" | "duration" | "location" | "image";

// Signal from a ripper that it produced an event but isn't certain about
// one or more of its fields. The infrastructure layer merges these against
// `event-uncertainty-cache.json` between rip and ICS write — see
// docs/event-uncertainty.md and lib/uncertainty-merge.ts.
//
// The full event is embedded (not a flattened subset) so that adding new
// RipperCalendarEvent fields later automatically makes them available to
// the resolver agent without a schema change here.
export type UncertaintyError = ErrorBase & {
    type: "Uncertainty";
    source: string;              // ripper name, e.g. "events12"
    calendar?: string;           // calendar slug within the ripper
    unknownFields: UncertaintyField[];
    event: RipperCalendarEvent;  // the event the ripper produced (with placeholder values for unknown fields)
    // Optional hash of whatever the ripper *did* parse from the source.
    // When the source data later changes (e.g., upstream adds a start
    // time), the fingerprint changes and the cache entry is invalidated.
    partialFingerprint?: string;
};


export interface RipperCalendarEvent {
    // Do not add Type, type is how we guard against RipperError
    id?: string;
    ripped: Date;
    date: ZonedDateTime;
    duration: Duration,
    summary: string;
    description?: string;
    location?: string;
    url?: string;
    image?: string;  // URL to the event image
    rrule?: string;  // RFC 5545 RRULE for recurring events
    lat?: number;    // Latitude (resolved via geocoder or source-level geo)
    lng?: number;    // Longitude (resolved via geocoder or source-level geo)
    sourceCalendar?: string;      // Source calendar friendly name (set during aggregation)
    sourceCalendarName?: string;  // Source calendar slug (set during aggregation)
};

export type RipperEvent = RipperCalendarEvent | RipperError;


export interface RipperCalendar {
    name: string;
    friendlyname: string;
    events: RipperCalendarEvent[];
    errors: RipperError[];
    tags: string[];
    parent?: RipperConfig
};


export interface Ripper {
    config: RipperConfig;
    ripperImpl: IRipper;
};

export interface IRipper {
    rip(ripper: Ripper): Promise<RipperCalendar[]>
}


function safeUrl(raw: string): string | undefined {
    try {
        return new URL(raw).toString();
    } catch {
        return undefined;
    }
}

export const toICS = async (calendar: RipperCalendar): Promise<string> => {

    const mapped: icsOriginal.EventAttributes[] = calendar.events.map(e => {
        const utcDate = e.date.withZoneSameInstant(ZoneOffset.UTC);
        const m: icsOriginal.EventAttributes = {
            title: e.summary,
            startInputType: "utc",
            start: [utcDate.year(), utcDate.monthValue(), utcDate.dayOfMonth(), utcDate.hour(), utcDate.minute()],
            duration: { hours: e.duration.toHours(), minutes: e.duration.toMinutes() % 60 },
            description: (() => {
                let desc = e.url?.startsWith('http')
                    ? (e.description ? `${e.description}\n\n${e.url}` : e.url)
                    : e.description;
                if (e.sourceCalendar) {
                    const sourceInfo = `From ${e.sourceCalendar}`;
                    desc = desc ? `${desc}\n\n${sourceInfo}` : sourceInfo;
                }
                return desc;
            })(),
            location: e.location,
            productId: "206.events",
            transp: "TRANSPARENT",
            calName: calendar.friendlyname,
            url: e.url?.startsWith('http') ? safeUrl(e.url) : undefined,
            categories: e.sourceCalendar ? [e.sourceCalendar] : undefined,
        };
        
        // Add RRULE if present
        if (e.rrule) {
            m.recurrenceRule = e.rrule;
        }
        
        return m;
    });

    let ics = await createICSEvents(mapped) as string;

    // Post-process to add TZID for events with RRULE
    // The ics library outputs UTC times, but RRULE needs local time with TZID
    calendar.events.forEach(e => {
        if (e.rrule) {
            const tzid = e.date.zone().id();
            const localTime = `${e.date.year()}${String(e.date.monthValue()).padStart(2, '0')}${String(e.date.dayOfMonth()).padStart(2, '0')}T${String(e.date.hour()).padStart(2, '0')}${String(e.date.minute()).padStart(2, '0')}00`;
            // Replace UTC DTSTART with local time + TZID
            ics = ics.replace(
                /DTSTART:\d{8}T\d{6}Z/,
                `DTSTART;TZID=${tzid}:${localTime}`
            );
        }
    });

    // Post-process to add X-CALRIPPER-SOURCE for events with source tracking.
    // Match by CATEGORIES line (which we set to sourceCalendar) rather than
    // array index, so the mapping stays correct even if the ICS library
    // filters or reorders events.
    if (calendar.events.some(e => e.sourceCalendarName)) {
        const nameToSlug = new Map<string, string>();
        for (const e of calendar.events) {
            if (e.sourceCalendar && e.sourceCalendarName) {
                nameToSlug.set(e.sourceCalendar, e.sourceCalendarName);
            }
        }

        ics = ics.replace(
            /CATEGORIES:(.+)/g,
            (match, category) => {
                const slug = nameToSlug.get(category.trim());
                return slug
                    ? `X-CALRIPPER-SOURCE:${slug}\r\n${match}`
                    : match;
            }
        );
    }

    return ics;
}

export function isRipperEvent(item: unknown): item is RipperEvent {
    if (typeof item !== "object" || item === null) {
        return false;
    }

    const maybeError = item as Partial<ErrorBase>;
    if (typeof maybeError.type === "string" && typeof maybeError.reason === "string") {
        return true; // probably an error
    }
    const maybeEvent = item as Partial<RipperCalendarEvent>;
    return maybeEvent.ripped instanceof Date &&
        maybeEvent.date instanceof ZonedDateTime &&
        maybeEvent.duration instanceof Duration &&
        typeof maybeEvent.summary === "string" &&
        (maybeEvent.id === undefined || typeof maybeEvent.id === "string") &&
        (maybeEvent.description === undefined || typeof maybeEvent.description === "string") &&
        (maybeEvent.location === undefined || typeof maybeEvent.location === "string") &&
        (maybeEvent.url === undefined || typeof maybeEvent.url === "string");
}

export type ExternalCalendar = z.infer<typeof externalCalendarSchema>;
export type ExternalConfig = z.infer<typeof externalConfigSchema>;

// JSON-safe view of a RipperCalendarEvent. ZonedDateTime/Duration aren't
// natively serializable, so we project them into stable string/number forms
// for build-errors.json and per-calendar errors.txt files.
export interface SerializedRipperCalendarEvent {
    id?: string;
    rippedAt: string;            // ISO timestamp
    date: string;                // ISO offset date-time, e.g. 2026-02-14T12:00:00-08:00[America/Los_Angeles]
    durationSeconds: number;
    summary: string;
    description?: string;
    location?: string;
    url?: string;
    image?: string;
    rrule?: string;
    lat?: number;
    lng?: number;
    sourceCalendar?: string;
    sourceCalendarName?: string;
}

export function serializeRipperCalendarEvent(e: RipperCalendarEvent): SerializedRipperCalendarEvent {
    return {
        id: e.id,
        rippedAt: e.ripped.toISOString(),
        date: e.date.toString(),
        durationSeconds: e.duration.seconds(),
        summary: e.summary,
        description: e.description,
        location: e.location,
        url: e.url,
        image: e.image,
        rrule: e.rrule,
        lat: e.lat,
        lng: e.lng,
        sourceCalendar: e.sourceCalendar,
        sourceCalendarName: e.sourceCalendarName,
    };
}

// Produces a structuredClone-safe view of a RipperError for JSON output.
// Most error types are already plain objects; UncertaintyError contains
// a RipperCalendarEvent that needs its js-joda fields projected.
export function serializeRipperError(e: RipperError): Record<string, unknown> {
    if (e.type === "Uncertainty") {
        return {
            type: e.type,
            reason: e.reason,
            source: e.source,
            calendar: e.calendar,
            unknownFields: e.unknownFields,
            event: serializeRipperCalendarEvent(e.event),
            partialFingerprint: e.partialFingerprint,
        };
    }
    return { ...e };
}

export function serializeRipperErrors(errors: RipperError[]): Record<string, unknown>[] {
    return errors.map(serializeRipperError);
}
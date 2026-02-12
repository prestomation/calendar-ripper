import { Duration, Period, ZoneOffset, ZoneRegion, ZonedDateTime, convert } from "@js-joda/core";
import { z } from "zod";
import { promisify } from 'util';
import * as icsOriginal from 'ics';

import '@js-joda/timezone'

const createICSEvents = promisify(icsOriginal.createEvents);


export const calendarConfigSchema = z.object({
    name: z.string().regex(/^[a-zA-Z0-9.-]+$/),
    config: z.object({}).passthrough().optional(),
    timezone: z.string().transform(ZoneRegion.of),
    friendlyname: z.string(),
    tags: z.array(z.string()).optional()
});

export const externalCalendarSchema = z.object({
    name: z.string().regex(/^[a-zA-Z0-9.-]+$/),
    friendlyname: z.string(),
    icsUrl: z.string(),
    infoUrl: z.string().optional(),
    description: z.string().optional(),
    disabled: z.boolean().default(false),
    tags: z.array(z.string()).optional()
});

export const externalConfigSchema = z.array(externalCalendarSchema);

export const BUILTIN_RIPPER_TYPES = ["squarespace", "ticketmaster"] as const;
export type BuiltinRipperType = typeof BUILTIN_RIPPER_TYPES[number];

export const configSchema = z.object({
    name: z.string(),
    description: z.string(),
    url: z.string().transform(u => new URL(u)),
    friendlyLink: z.string(),
    disabled: z.boolean().default(false),
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
}).strict();


export type RipperConfig = z.infer<typeof configSchema>;

export type RipperError = FileParseError | InvalidDateError | ImportError | ParseError;
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


export const toICS = async (calendar: RipperCalendar): Promise<string> => {

    const mapped: icsOriginal.EventAttributes[] = calendar.events.map(e => {
        const utcDate = e.date.withZoneSameInstant(ZoneOffset.UTC);
        const m: icsOriginal.EventAttributes = {
            title: e.summary,
            startInputType: "utc",
            start: [utcDate.year(), utcDate.monthValue(), utcDate.dayOfMonth(), utcDate.hour(), utcDate.minute()],
            duration: { hours: e.duration.toHours(), minutes: e.duration.toMinutes() % 60 },
            description: e.description,
            location: e.location,
            productId: "CalendarRipper",
            transp: "TRANSPARENT",
            calName: calendar.friendlyname,
            url: e.url?.startsWith('http') ? e.url : undefined,
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
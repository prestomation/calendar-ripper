import { Duration, Period, ZoneRegion, ZonedDateTime, convert } from "@js-joda/core";
import { z } from "zod";
import {promisify} from 'util';
import * as icsOriginal from 'ics';

import '@js-joda/timezone'

const createICSEvents = promisify(icsOriginal.createEvents);


export const calendarConfigSchema = z.object({
    name: z.string().regex(/^[a-zA-Z0-9.-]+$/),
    config: z.object({}).passthrough().optional(),
    timezone: z.string().transform(ZoneRegion.of),
    friendlyname: z.string()
});

export const configSchema = z.object({
    name: z.string(),
    description: z.string(),
    url: z.string().transform(u => new URL(u)),
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
};

export type RipperEvent = RipperCalendarEvent | RipperError;


export interface RipperCalendar {
    name: string;
    friendlyname: string;
    events: RipperCalendarEvent[];
    errors: RipperError[];
};


export interface Ripper {
    config: RipperConfig;
    ripperImpl: IRipper;
};

export interface IRipper {
    rip(ripper: Ripper): Promise<RipperCalendar[]>
}


export const toICS = async(calendar: RipperCalendar): Promise<string> => {

    const mapped: icsOriginal.EventAttributes[] = calendar.events.map(e => {
        const utcDate = convert(e.date).toDate();
        const m: icsOriginal.EventAttributes = {
            title: e.summary,
            startInputType: "utc",
            start: utcDate.getTime(),
            duration: { hours: e.duration.toHours(), minutes: e.duration.toMinutes() % 60},
            description: e.description,
            location: e.location,
            productId: "CalendarRipper",
            transp: "TRANSPARENT",
            calName: calendar.friendlyname,
            url: e.url
            
        };
        return m;
    });

    const ics = await createICSEvents(mapped) as string;

    return ics;
}
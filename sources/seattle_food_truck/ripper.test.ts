import { describe, it, expect } from 'vitest';
import SeattleFoodTruckRipper, { SFTLocation, SFTEvent } from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any {
    const jsonPath = path.join(__dirname, 'sample-data.json');
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

const SAMPLE_LOCATION: SFTLocation = {
    uid: 1,
    name: "Westlake Park",
    address: "400 Pine St, Seattle, WA 98101",
    latitude: 47.6124,
    longitude: -122.337,
    slug: "westlake-park",
    neighborhood: "Downtown",
};

const SAMPLE_EVENTS: SFTEvent[] = [
    {
        id: 101,
        start_time: "2026-03-10T11:00:00-08:00",
        end_time: "2026-03-10T14:00:00-08:00",
        bookings: [
            {
                id: 1001,
                truck: { id: 11, name: "Nosh Truck", slug: "nosh-truck", food_categories: ["American"] },
            },
        ],
    },
    {
        id: 102,
        start_time: "2026-03-11T11:00:00-08:00",
        end_time: "2026-03-11T14:00:00-08:00",
        bookings: [
            {
                id: 1002,
                truck: { id: 12, name: "Skillet Street Food", slug: "skillet-street-food", food_categories: ["American", "Burgers"] },
            },
            {
                id: 1003,
                truck: { id: 13, name: "Raney Brothers BBQ", slug: "raney-brothers-bbq", food_categories: ["BBQ"] },
            },
        ],
    },
];

describe('SeattleFoodTruckRipper', () => {
    describe('parseLocationEvents', () => {
        it('creates one event per booking', () => {
            const ripper = new SeattleFoodTruckRipper();
            const events = ripper.parseLocationEvents(SAMPLE_LOCATION, SAMPLE_EVENTS);
            const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            // 1 booking in event 101 + 2 bookings in event 102 = 3 events
            expect(valid.length).toBe(3);
        });

        it('sets summary to truck name', () => {
            const ripper = new SeattleFoodTruckRipper();
            const events = ripper.parseLocationEvents(SAMPLE_LOCATION, SAMPLE_EVENTS);
            const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(valid[0].summary).toBe('Nosh Truck');
            expect(valid[1].summary).toBe('Skillet Street Food');
            expect(valid[2].summary).toBe('Raney Brothers BBQ');
        });

        it('sets location to location name and address', () => {
            const ripper = new SeattleFoodTruckRipper();
            const events = ripper.parseLocationEvents(SAMPLE_LOCATION, SAMPLE_EVENTS);
            const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(valid[0].location).toBe('Westlake Park, 400 Pine St, Seattle, WA 98101');
        });

        it('sets URL to location schedule page when slug is present', () => {
            const ripper = new SeattleFoodTruckRipper();
            const events = ripper.parseLocationEvents(SAMPLE_LOCATION, SAMPLE_EVENTS);
            const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(valid[0].url).toBe('https://www.seattlefoodtruck.com/schedule/westlake-park');
        });

        it('sets URL to site base when no slug', () => {
            const ripper = new SeattleFoodTruckRipper();
            const noSlugLocation = { ...SAMPLE_LOCATION, slug: undefined };
            const events = ripper.parseLocationEvents(noSlugLocation, SAMPLE_EVENTS);
            const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(valid[0].url).toBe('https://www.seattlefoodtruck.com');
        });

        it('sets event id with sft prefix', () => {
            const ripper = new SeattleFoodTruckRipper();
            const events = ripper.parseLocationEvents(SAMPLE_LOCATION, SAMPLE_EVENTS);
            const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(valid[0].id).toBe('sft-101-1001');
        });

        it('correctly computes duration from start and end times', () => {
            const ripper = new SeattleFoodTruckRipper();
            const events = ripper.parseLocationEvents(SAMPLE_LOCATION, SAMPLE_EVENTS);
            const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            // 11:00 - 14:00 = 3 hours = 180 minutes
            expect(valid[0].duration.toMinutes()).toBe(180);
        });

        it('deduplicates events with same booking id', () => {
            const ripper = new SeattleFoodTruckRipper();
            const doubled = [...SAMPLE_EVENTS, ...SAMPLE_EVENTS];
            const events = ripper.parseLocationEvents(SAMPLE_LOCATION, doubled);
            const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(valid.length).toBe(3);
        });

        it('returns no errors for valid data', () => {
            const ripper = new SeattleFoodTruckRipper();
            const events = ripper.parseLocationEvents(SAMPLE_LOCATION, SAMPLE_EVENTS);
            const errors = events.filter(e => 'type' in e) as RipperError[];

            expect(errors.length).toBe(0);
        });

        it('handles events with empty bookings array', () => {
            const ripper = new SeattleFoodTruckRipper();
            const emptyBookingsEvents: SFTEvent[] = [
                { id: 999, start_time: "2026-03-10T11:00:00-08:00", end_time: "2026-03-10T14:00:00-08:00", bookings: [] }
            ];
            const events = ripper.parseLocationEvents(SAMPLE_LOCATION, emptyBookingsEvents);
            expect(events.length).toBe(0);
        });

        it('returns a ParseError for invalid start_time', () => {
            const ripper = new SeattleFoodTruckRipper();
            const badEvents: SFTEvent[] = [
                {
                    id: 500, start_time: "not-a-date", end_time: "2026-03-10T14:00:00-08:00",
                    bookings: [{ id: 5001, truck: { id: 50, name: "Bad Truck" } }]
                }
            ];
            const events = ripper.parseLocationEvents(SAMPLE_LOCATION, badEvents);
            const errors = events.filter(e => 'type' in e) as RipperError[];
            expect(errors.length).toBe(1);
            expect(errors[0].type).toBe('ParseError');
        });

        it('handles empty events array', () => {
            const ripper = new SeattleFoodTruckRipper();
            const events = ripper.parseLocationEvents(SAMPLE_LOCATION, []);
            expect(events.length).toBe(0);
        });
    });

    describe('parseISO8601', () => {
        it('parses ISO 8601 datetime with negative offset', () => {
            const ripper = new SeattleFoodTruckRipper();
            const result = ripper.parseISO8601("2026-03-10T11:00:00-08:00");

            expect(result).not.toBeNull();
            expect(result!.year()).toBe(2026);
            expect(result!.monthValue()).toBe(3);
            expect(result!.dayOfMonth()).toBe(10);
            // 11:00 PST = 19:00 UTC; in America/Los_Angeles that is 11:00
            expect(result!.hour()).toBe(11);
            expect(result!.minute()).toBe(0);
        });

        it('parses ISO 8601 datetime with positive offset', () => {
            const ripper = new SeattleFoodTruckRipper();
            const result = ripper.parseISO8601("2026-07-04T12:00:00-07:00");

            expect(result).not.toBeNull();
            expect(result!.hour()).toBe(12);
        });

        it('returns null for empty string', () => {
            const ripper = new SeattleFoodTruckRipper();
            expect(ripper.parseISO8601("")).toBeNull();
        });

        it('returns null for invalid string', () => {
            const ripper = new SeattleFoodTruckRipper();
            expect(ripper.parseISO8601("not-a-date")).toBeNull();
        });
    });

    describe('sample data integration', () => {
        it('parses all events from sample data', () => {
            const data = loadSampleData();
            const ripper = new SeattleFoodTruckRipper();

            const locations: SFTLocation[] = data.locations.locations;
            let totalEvents = 0;
            for (const loc of locations) {
                const eventsData = data.events[String(loc.uid)];
                if (eventsData) {
                    const parsed = ripper.parseLocationEvents(loc, eventsData.events);
                    totalEvents += parsed.filter(e => 'date' in e).length;
                }
            }

            // 1 booking at loc 1 (event 101) + 2 at loc 1 (event 102) + 1 at loc 2 = 4 total
            expect(totalEvents).toBe(4);
        });
    });
});

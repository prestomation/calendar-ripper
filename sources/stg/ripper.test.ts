import { describe, it, expect } from 'vitest';
import STGRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import { ZoneRegion } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any[] {
    const jsonPath = path.join(__dirname, 'sample-data.json');
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

const timezone = ZoneRegion.of('America/Los_Angeles');

const config = {
    venueId: 'KovZpZAFkvEA',
    venueName: 'Paramount Theatre',
    venueAddress: '911 Pine St, Seattle, WA 98101'
};

describe('STGRipper', () => {
    it('parses events from sample data, skipping cancelled events', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // 7 total events, 1 cancelled = 6 valid
        expect(valid).toHaveLength(6);
    });

    it('parses event title correctly', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const lionKing = valid.find(e => e.id === 'tm-vvG1HZ9pCgODPp');
        expect(lionKing).toBeDefined();
        expect(lionKing!.summary).toBe("Disney's The Lion King");
    });

    it('parses localDate + localTime correctly', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const lionKing = valid.find(e => e.id === 'tm-vvG1HZ9pCgODPp')!;
        expect(lionKing.date.year()).toBe(2026);
        expect(lionKing.date.monthValue()).toBe(2);
        expect(lionKing.date.dayOfMonth()).toBe(13);
        expect(lionKing.date.hour()).toBe(19);
        expect(lionKing.date.minute()).toBe(30);
    });

    it('defaults to 7:30 PM when only localDate is available', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const dateOnly = valid.find(e => e.id === 'tm-vvG1HZDateOnly')!;
        expect(dateOnly).toBeDefined();
        expect(dateOnly.date.hour()).toBe(19);
        expect(dateOnly.date.minute()).toBe(30);
        expect(dateOnly.date.dayOfMonth()).toBe(15);
        expect(dateOnly.date.monthValue()).toBe(3);
    });

    it('parses UTC dateTime and converts to local timezone', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // 2026-04-01T02:00:00Z = 2026-03-31T19:00:00 PDT (UTC-7 in April)
        const utcOnly = valid.find(e => e.id === 'tm-vvG1HZUtcOnly')!;
        expect(utcOnly).toBeDefined();
        expect(utcOnly.date.monthValue()).toBe(3);
        expect(utcOnly.date.dayOfMonth()).toBe(31);
        expect(utcOnly.date.hour()).toBe(19);
    });

    it('sets default duration of 2 hours', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid[0].duration.toHours()).toBe(2);
    });

    it('builds location from venue data', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const lionKing = valid.find(e => e.id === 'tm-vvG1HZ9pCgODPp')!;
        expect(lionKing.location).toBe('Paramount Theatre, 911 Pine St, Seattle, WA');
    });

    it('falls back to config venue info when venue has no address', () => {
        const ripper = new STGRipper();

        const events = ripper.parseEvents([{
            name: "Test Event",
            id: "test-fallback-1",
            dates: {
                start: { localDate: "2026-03-01", localTime: "20:00:00" },
                status: { code: "onsale" }
            },
            images: [],
            _embedded: {
                venues: [{ name: "Paramount Theatre", id: "KovZpZAFkvEA" }]
            }
        }], timezone, config);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].location).toBe('Paramount Theatre, 911 Pine St, Seattle, WA 98101');
    });

    it('includes info and pleaseNote in description', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const lionKing = valid.find(e => e.id === 'tm-vvG1HZ9pCgODPp')!;
        expect(lionKing.description).toContain('Ages 6+');
        expect(lionKing.description).toContain('No cameras');
    });

    it('includes price range in description', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const lionKing = valid.find(e => e.id === 'tm-vvG1HZ9pCgODPp')!;
        expect(lionKing.description).toContain('Price: $35 - $175');
    });

    it('marks postponed events in description', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const postponed = valid.find(e => e.id === 'tm-vvG1HZPostponed')!;
        expect(postponed).toBeDefined();
        expect(postponed.description).toContain('POSTPONED');
    });

    it('filters out cancelled events', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const cancelled = valid.find(e => e.id === 'tm-vvG1HZCancel');
        expect(cancelled).toBeUndefined();
    });

    it('selects best image (16_9 ratio with width >= 640)', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const lionKing = valid.find(e => e.id === 'tm-vvG1HZ9pCgODPp')!;
        expect(lionKing.image).toBe('https://s1.ticketm.net/dam/a/abc/lion-king-16_9.jpg');
    });

    it('falls back to first image when no 16_9 preferred image', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const utcOnly = valid.find(e => e.id === 'tm-vvG1HZUtcOnly')!;
        expect(utcOnly.image).toBe('https://s1.ticketm.net/dam/a/utc/utc-4_3.jpg');
    });

    it('sets image to undefined when images array is empty', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const yang = valid.find(e => e.id === 'tm-vvG1HZbqNQyEPp')!;
        expect(yang.image).toBeUndefined();
    });

    it('includes Ticketmaster URL', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const lionKing = valid.find(e => e.id === 'tm-vvG1HZ9pCgODPp')!;
        expect(lionKing.url).toBe('https://www.ticketmaster.com/disneys-the-lion-king-seattle/event/vvG1HZ9pCgODPp');
    });

    it('prefixes event IDs with tm-', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const event of valid) {
            expect(event.id).toMatch(/^tm-/);
        }
    });

    it('deduplicates events across multiple parseEvents calls', () => {
        const ripper = new STGRipper();
        const sampleData = loadSampleData();

        const events1 = ripper.parseEvents(sampleData, timezone, config);
        const events2 = ripper.parseEvents(sampleData, timezone, config);

        const valid1 = events1.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const valid2 = events2.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid1).toHaveLength(6);
        expect(valid2).toHaveLength(0);
    });

    it('sets description to undefined when no info fields present', () => {
        const ripper = new STGRipper();

        const events = ripper.parseEvents([{
            name: "Minimal Event",
            id: "test-minimal-1",
            dates: {
                start: { localDate: "2026-03-01", localTime: "20:00:00" },
                status: { code: "onsale" }
            },
            images: [],
            _embedded: { venues: [{ name: "Test Venue" }] }
        }], timezone, config);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].description).toBeUndefined();
    });

    it('skips events with missing id', () => {
        const ripper = new STGRipper();

        const events = ripper.parseEvents([{
            name: "No ID Event",
            dates: {
                start: { localDate: "2026-03-01", localTime: "20:00:00" },
                status: { code: "onsale" }
            },
            images: []
        }], timezone, config);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid).toHaveLength(0);
    });

    it('skips events with missing name', () => {
        const ripper = new STGRipper();

        const events = ripper.parseEvents([{
            id: "test-no-name",
            dates: {
                start: { localDate: "2026-03-01", localTime: "20:00:00" },
                status: { code: "onsale" }
            },
            images: []
        }], timezone, config);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid).toHaveLength(0);
    });

    it('returns parse error for events with no date info', () => {
        const ripper = new STGRipper();

        const events = ripper.parseEvents([{
            name: "No Date Event",
            id: "test-no-date",
            dates: { start: {}, status: { code: "onsale" } },
            images: []
        }], timezone, config);

        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        expect(errors[0].reason).toContain('Could not parse date');
    });

    it('handles events with no embedded venues gracefully', () => {
        const ripper = new STGRipper();

        const events = ripper.parseEvents([{
            name: "No Venue Event",
            id: "test-no-venue",
            dates: {
                start: { localDate: "2026-03-01", localTime: "20:00:00" },
                status: { code: "onsale" }
            },
            images: []
        }], timezone, config);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid).toHaveLength(1);
        expect(valid[0].location).toBe('Paramount Theatre, 911 Pine St, Seattle, WA 98101');
    });
});

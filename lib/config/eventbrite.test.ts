import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import { EventbriteRipper } from './eventbrite.js';
import { RipperCalendarEvent, RipperError } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const tz = ZoneId.of('America/Los_Angeles');

function loadSample(source: string): any {
    const raw = readFileSync(join(__dirname, `../../sources/${source}/sample-data.json`), 'utf-8');
    return JSON.parse(raw);
}

// Synthetic fixtures for edge-case tests
const SYNTHETIC_EVENTS = {
    noName: { id: 'syn-1', name: null, start: { timezone: 'America/Los_Angeles', local: '2026-03-10T19:00:00' }, end: null, venue: null, url: null, description: null },
    noStart: { id: 'syn-2', name: { text: 'Show Without Dates' }, start: null, end: null, venue: null, url: null, description: null },
    noId: { id: undefined, name: null, start: { local: '2026-03-10T19:00:00', timezone: 'America/Los_Angeles' }, end: null, venue: null, url: null, description: null },
    noVenue: { id: 'syn-3', name: { text: 'Online Event' }, description: null, url: 'https://eventbrite.com/e/syn-3', start: { timezone: 'America/Los_Angeles', local: '2026-03-01T18:00:00' }, end: { timezone: 'America/Los_Angeles', local: '2026-03-01T20:00:00' }, venue: null },
    noEnd: { id: 'syn-4', name: { text: 'Open-Ended Event' }, description: null, url: 'https://eventbrite.com/e/syn-4', start: { timezone: 'America/Los_Angeles', local: '2026-03-01T18:00:00' }, end: null, venue: null },
};

describe('EventbriteRipper', () => {
    describe('parsing — Elliott Bay sample (38 events, daytime shows)', () => {
        it('extracts all events with no errors', () => {
            const ripper = new EventbriteRipper();
            const data = loadSample('elliott-bay');
            const events = ripper.parseEvents(data.events, tz, '1521 10th Ave, Seattle, WA 98122');

            const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            const errors = events.filter(e => 'type' in e) as RipperError[];
            expect(valid.length).toBe(38);
            expect(errors.length).toBe(0);
        });

        it('parses summary, date, and time', () => {
            const ripper = new EventbriteRipper();
            const [first] = ripper.parseEvents(loadSample('elliott-bay').events, tz, '') as RipperCalendarEvent[];
            expect(first.summary).toBe('[SOLD OUT] B.K. Borison, AND NOW, BACK TO YOU');
            expect(first.date.year()).toBe(2026);
            expect(first.date.monthValue()).toBe(2);
            expect(first.date.dayOfMonth()).toBe(27);
            expect(first.date.hour()).toBe(19);
        });

        it('calculates duration from end time (1 hour show)', () => {
            const ripper = new EventbriteRipper();
            const [first] = ripper.parseEvents(loadSample('elliott-bay').events, tz, '') as RipperCalendarEvent[];
            expect(first.duration.toHours()).toBe(1);
        });

        it('uses venue name and address from API response', () => {
            const ripper = new EventbriteRipper();
            const [first] = ripper.parseEvents(loadSample('elliott-bay').events, tz, '') as RipperCalendarEvent[];
            expect(first.location).toContain('Elliott Bay Book Company');
            expect(first.location).toContain('1521 10th Avenue');
            expect(first.location).toContain('Seattle');
        });

        it('sets description and URL', () => {
            const ripper = new EventbriteRipper();
            const [first] = ripper.parseEvents(loadSample('elliott-bay').events, tz, '') as RipperCalendarEvent[];
            expect(first.description).toContain('meteorologists');
            expect(first.url).toContain('eventbrite.com');
        });
    });

    describe('parsing — Substation sample (5 events, late-night shows)', () => {
        const DEFAULT_LOCATION = '645 NW 45th St, Seattle, WA 98107';

        it('extracts all events with no errors', () => {
            const ripper = new EventbriteRipper();
            const data = loadSample('substation');
            const events = ripper.parseEvents(data.events, tz, DEFAULT_LOCATION, 3);

            const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            const errors = events.filter(e => 'type' in e) as RipperError[];
            expect(valid.length).toBe(5);
            expect(errors.length).toBe(0);
        });

        it('calculates duration spanning midnight (5-hour show, 21:00–02:00)', () => {
            const ripper = new EventbriteRipper();
            const [first] = ripper.parseEvents(loadSample('substation').events, tz, DEFAULT_LOCATION, 3) as RipperCalendarEvent[];
            expect(first.summary).toBe('Dark Entries: Industrial Night');
            expect(first.date.hour()).toBe(21);
            expect(first.duration.toHours()).toBe(5);
        });

        it('uses defaultDurationHours (3) when end time is absent', () => {
            const ripper = new EventbriteRipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noEnd], tz, DEFAULT_LOCATION, 3);
            const [e] = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            expect(e.duration.toHours()).toBe(3);
        });

        it('falls back to defaultLocation when venue is null', () => {
            const ripper = new EventbriteRipper();
            const data = loadSample('substation');
            const events = ripper.parseEvents(data.events, tz, DEFAULT_LOCATION, 3) as RipperCalendarEvent[];
            const last = events[events.length - 1];
            expect(last.location).toBe(DEFAULT_LOCATION);
        });

        it('assigns the correct event ID', () => {
            const ripper = new EventbriteRipper();
            const [first] = ripper.parseEvents(loadSample('substation').events, tz, DEFAULT_LOCATION, 3) as RipperCalendarEvent[];
            expect(first.id).toBe('1100000001');
        });
    });

    describe('deduplication', () => {
        it('ignores duplicate IDs across calls', () => {
            const ripper = new EventbriteRipper();
            const data = loadSample('substation');
            const doubled = [...data.events, ...data.events];
            const events = ripper.parseEvents(doubled, tz, '', 3);
            expect(events.filter(e => 'summary' in e).length).toBe(5);
        });

        it('deduplicates across a larger dataset (Elliott Bay)', () => {
            const ripper = new EventbriteRipper();
            const data = loadSample('elliott-bay');
            const doubled = [...data.events, ...data.events];
            const events = ripper.parseEvents(doubled, tz, '');
            expect(events.filter(e => 'summary' in e).length).toBe(38);
        });
    });

    describe('error handling', () => {
        it('returns ParseError for event with no name', () => {
            const ripper = new EventbriteRipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noName], tz, '');
            const [e] = events.filter(e => 'type' in e) as RipperError[];
            expect(e.type).toBe('ParseError');
            expect(e.reason).toContain('no name');
        });

        it('returns ParseError for event with no start time', () => {
            const ripper = new EventbriteRipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noStart], tz, '');
            const [e] = events.filter(e => 'type' in e) as RipperError[];
            expect(e.type).toBe('ParseError');
        });

        it('uses "unknown" as context when event has no ID', () => {
            const ripper = new EventbriteRipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noId], tz, '');
            const [e] = events.filter(e => 'type' in e) as RipperError[];
            expect(e.context).toBe('unknown');
        });
    });

    describe('defaults', () => {
        it('falls back to defaultLocation when venue is null', () => {
            const ripper = new EventbriteRipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noVenue], tz, 'Fallback Location');
            const [e] = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            expect(e.location).toBe('Fallback Location');
        });

        it('defaults to 2-hour duration when defaultDurationHours is not specified', () => {
            const ripper = new EventbriteRipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noEnd], tz, '');
            const [e] = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            expect(e.duration.toHours()).toBe(2);
        });

        it('uses event timezone from API response, not fallback tz', () => {
            const ripper = new EventbriteRipper();
            const [first] = ripper.parseEvents(loadSample('elliott-bay').events, tz, '') as RipperCalendarEvent[];
            expect(first.date.zone().id()).toBe('America/Los_Angeles');
        });
    });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import { EventbriteRipper } from '../../lib/config/eventbrite.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any {
    const raw = readFileSync(join(__dirname, 'sample-data.json'), 'utf-8');
    return JSON.parse(raw);
}

const tz = ZoneId.of('America/Los_Angeles');
const DEFAULT_LOCATION = '645 NW 45th St, Seattle, WA 98107';
const DEFAULT_DURATION_HOURS = 3;

describe('EventbriteRipper (Substation)', () => {
    it('parses all events from sample data', () => {
        const ripper = new EventbriteRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz, DEFAULT_LOCATION, DEFAULT_DURATION_HOURS);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(valid.length).toBe(5);
        expect(errors.length).toBe(0);
    });

    it('parses event summary correctly', () => {
        const ripper = new EventbriteRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz, DEFAULT_LOCATION, DEFAULT_DURATION_HOURS);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].summary).toBe('Dark Entries: Industrial Night');
    });

    it('parses start date and time correctly', () => {
        const ripper = new EventbriteRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz, DEFAULT_LOCATION, DEFAULT_DURATION_HOURS);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const first = valid[0];

        expect(first.date.year()).toBe(2026);
        expect(first.date.monthValue()).toBe(3);
        expect(first.date.dayOfMonth()).toBe(7);
        expect(first.date.hour()).toBe(21);
        expect(first.date.minute()).toBe(0);
    });

    it('calculates duration from start and end times', () => {
        const ripper = new EventbriteRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz, DEFAULT_LOCATION, DEFAULT_DURATION_HOURS);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        // First event: 21:00 - 02:00 = 5 hours
        expect(valid[0].duration.toHours()).toBe(5);
    });

    it('uses defaultDurationHours when end time is missing', () => {
        const ripper = new EventbriteRipper();
        const noEndEvents = [
            {
                id: 'test-no-end',
                name: { text: 'No End Time Show' },
                description: null,
                url: 'https://eventbrite.com/e/test',
                start: { timezone: 'America/Los_Angeles', local: '2026-03-15T20:00:00' },
                end: null,
                venue: null
            }
        ];
        const events = ripper.parseEvents(noEndEvents, tz, DEFAULT_LOCATION, DEFAULT_DURATION_HOURS);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].duration.toHours()).toBe(3);
    });

    it('uses venue address when available', () => {
        const ripper = new EventbriteRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz, DEFAULT_LOCATION, DEFAULT_DURATION_HOURS);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].location).toContain('Substation');
        expect(valid[0].location).toContain('645 NW 45th St');
        expect(valid[0].location).toContain('Seattle');
    });

    it('falls back to defaultLocation when venue is null', () => {
        const ripper = new EventbriteRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz, DEFAULT_LOCATION, DEFAULT_DURATION_HOURS);

        // Last event in sample data has venue: null
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const last = valid[valid.length - 1];
        expect(last.location).toBe(DEFAULT_LOCATION);
    });

    it('sets description when available', () => {
        const ripper = new EventbriteRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz, DEFAULT_LOCATION, DEFAULT_DURATION_HOURS);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].description).toContain('industrial');
    });

    it('handles null description gracefully', () => {
        const ripper = new EventbriteRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz, DEFAULT_LOCATION, DEFAULT_DURATION_HOURS);

        // Last event has description: null
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const last = valid[valid.length - 1];
        expect(last.description).toBeUndefined();
    });

    it('sets event URL', () => {
        const ripper = new EventbriteRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz, DEFAULT_LOCATION, DEFAULT_DURATION_HOURS);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].url).toContain('eventbrite.com');
    });

    it('deduplicates events with the same ID', () => {
        const ripper = new EventbriteRipper();
        const data = loadSampleData();
        const doubled = [...data.events, ...data.events];
        const events = ripper.parseEvents(doubled, tz, DEFAULT_LOCATION, DEFAULT_DURATION_HOURS);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid.length).toBe(5);
    });

    it('handles malformed events gracefully', () => {
        const ripper = new EventbriteRipper();
        const malformed = [
            { id: 'bad1', name: null, start: { local: '2026-03-10T21:00:00', timezone: 'America/Los_Angeles' }, end: null, venue: null, url: null, description: null },
            { id: 'bad2', name: { text: 'Valid Event Name' }, start: null, end: null, venue: null, url: null, description: null }
        ];
        const events = ripper.parseEvents(malformed, tz, DEFAULT_LOCATION, DEFAULT_DURATION_HOURS);

        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(errors.length).toBe(2);
    });

    it('assigns event IDs', () => {
        const ripper = new EventbriteRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz, DEFAULT_LOCATION, DEFAULT_DURATION_HOURS);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].id).toBe('1100000001');
    });

    it('uses event timezone from API response', () => {
        const ripper = new EventbriteRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz, DEFAULT_LOCATION, DEFAULT_DURATION_HOURS);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].date.zone().id()).toBe('America/Los_Angeles');
    });
});

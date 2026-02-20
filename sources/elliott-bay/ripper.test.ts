import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import ElliottBayRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any {
    const raw = readFileSync(join(__dirname, 'sample-data.json'), 'utf-8');
    return JSON.parse(raw);
}

const tz = ZoneId.of('America/Los_Angeles');

describe('ElliottBayRipper', () => {
    it('parses all events from sample data', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(valid.length).toBe(38);
        expect(errors.length).toBe(0);
    });

    it('parses event summary correctly', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].summary).toBe('[SOLD OUT] B.K. Borison, AND NOW, BACK TO YOU');
    });

    it('parses start date and time correctly', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const first = valid[0];

        expect(first.date.year()).toBe(2026);
        expect(first.date.monthValue()).toBe(2);
        expect(first.date.dayOfMonth()).toBe(27);
        expect(first.date.hour()).toBe(19);
        expect(first.date.minute()).toBe(0);
    });

    it('calculates duration from start and end times', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        // First event: 19:00 - 20:00 = 1 hour
        expect(valid[0].duration.toHours()).toBe(1);
    });

    it('uses venue address when available', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].location).toContain('Elliott Bay Book Company');
        expect(valid[0].location).toContain('1521 10th Avenue');
        expect(valid[0].location).toContain('Seattle');
    });

    it('falls back to store address when venue is null', () => {
        const ripper = new ElliottBayRipper();
        const noVenueEvents = [
            {
                id: 'test-no-venue',
                name: { text: 'Test Event' },
                description: { text: null },
                url: 'https://eventbrite.com/e/test',
                start: { timezone: 'America/Los_Angeles', local: '2026-03-01T18:00:00' },
                end: { timezone: 'America/Los_Angeles', local: '2026-03-01T20:00:00' },
                venue: null
            }
        ];
        const events = ripper.parseEvents(noVenueEvents, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].location).toBe('1521 10th Ave, Seattle, WA 98122');
    });

    it('sets description when available', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].description).toContain('meteorologists');
    });

    it('sets event URL', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].url).toContain('eventbrite.com');
    });

    it('deduplicates events with the same ID', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        // Pass the same events twice
        const doubled = [...data.events, ...data.events];
        const events = ripper.parseEvents(doubled, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid.length).toBe(38);
    });

    it('handles malformed event gracefully', () => {
        const ripper = new ElliottBayRipper();
        const malformed = [
            { id: 'bad1', name: null, start: { local: '2026-03-10T19:00:00', timezone: 'America/Los_Angeles' }, end: null, venue: null, url: null, description: null },
            { id: 'bad2', name: { text: 'Valid Event' }, start: null, end: null, venue: null, url: null, description: null }
        ];
        const events = ripper.parseEvents(malformed, tz);

        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(errors.length).toBe(2);
    });

    it('assigns event IDs', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].id).toBeDefined();
        expect(typeof valid[0].id).toBe('string');
    });

    it('uses event timezone from API response', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].date.zone().id()).toBe('America/Los_Angeles');
    });
});

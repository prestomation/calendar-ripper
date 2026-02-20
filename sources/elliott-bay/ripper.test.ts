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

        expect(valid.length).toBe(3);
        expect(errors.length).toBe(0);
    });

    it('parses event summary correctly', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].summary).toBe('Rebecca Makkai: The God of the Woods');
        expect(valid[1].summary).toBe('Luis Alberto Urrea: Good Night, Irene');
        expect(valid[2].summary).toBe('Poetry Reading: New Voices in Pacific Northwest Poetry');
    });

    it('parses start date and time correctly', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const first = valid[0];

        expect(first.date.year()).toBe(2026);
        expect(first.date.monthValue()).toBe(3);
        expect(first.date.dayOfMonth()).toBe(10);
        expect(first.date.hour()).toBe(19);
        expect(first.date.minute()).toBe(0);
    });

    it('calculates duration from start and end times', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // First event: 19:00 - 21:00 = 2 hours
        expect(valid[0].duration.toHours()).toBe(2);

        // Second event: 19:00 - 20:30 = 1.5 hours = 90 minutes
        expect(valid[1].duration.toMinutes()).toBe(90);
    });

    it('uses venue address when available', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].location).toContain('Elliott Bay Book Company');
        expect(valid[0].location).toContain('1521 10th Ave');
        expect(valid[0].location).toContain('Seattle');
    });

    it('falls back to store address when venue is null', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        // Third event has venue: null
        expect(valid[2].location).toBe('1521 10th Ave, Seattle, WA 98122');
    });

    it('sets description when available', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].description).toContain('Rebecca Makkai');
        // Third event has null description
        expect(valid[2].description).toBeUndefined();
    });

    it('sets event URL', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        const events = ripper.parseEvents(data.events, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].url).toContain('eventbrite.com');
        expect(valid[0].url).toContain('987654321001');
    });

    it('deduplicates events with the same ID', () => {
        const ripper = new ElliottBayRipper();
        const data = loadSampleData();
        // Pass the same events twice
        const doubled = [...data.events, ...data.events];
        const events = ripper.parseEvents(doubled, tz);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid.length).toBe(3);
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
        expect(valid[0].id).toBe('987654321001');
        expect(valid[1].id).toBe('987654321002');
        expect(valid[2].id).toBe('987654321003');
    });
});

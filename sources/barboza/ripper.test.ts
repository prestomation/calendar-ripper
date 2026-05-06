import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZoneId } from '@js-joda/core';
import { parseAXSSkinEvents } from '../../lib/config/axsskin.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSample(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

const ZONE = ZoneId.of('America/Los_Angeles');
const LOCATION = "Barboza, 925 E Pike St, Seattle, WA 98122";

describe('Barboza parseEvents', () => {
    it('parses every event listed on the page', () => {
        const results = parseAXSSkinEvents(loadSample(), ZONE, 'barboza', LOCATION);
        const events = results.filter(r => 'date' in r) as RipperCalendarEvent[];
        expect(events.length).toBeGreaterThanOrEqual(10);
    });

    it('parses the ADULT. show with date, time, and venue', () => {
        const results = parseAXSSkinEvents(loadSample(), ZONE, 'barboza', LOCATION);
        const events = results.filter(r => 'date' in r) as RipperCalendarEvent[];
        const adult = events.find(e => e.summary.startsWith('ADULT'));
        expect(adult).toBeDefined();
        expect(adult!.date.year()).toBe(2026);
        expect(adult!.date.monthValue()).toBe(5);
        expect(adult!.location).toBe(LOCATION);
    });

    it('parses event URL from title link', () => {
        const results = parseAXSSkinEvents(loadSample(), ZONE, 'barboza', LOCATION);
        const events = results.filter(r => 'date' in r) as RipperCalendarEvent[];
        const event = events.find(e => e.url);
        expect(event).toBeDefined();
        expect(event!.url).toContain('thebarboza.com/events/detail/');
    });

    it('extracts doors time from time element', () => {
        const results = parseAXSSkinEvents(loadSample(), ZONE, 'barboza', LOCATION);
        const events = results.filter(r => 'date' in r) as RipperCalendarEvent[];
        // Most Barboza events should have doors in the evening (7-10 PM)
        const eveningEvents = events.filter(e => e.date.hour() >= 19);
        expect(eveningEvents.length).toBeGreaterThan(0);
    });

    it('includes location in description', () => {
        const results = parseAXSSkinEvents(loadSample(), ZONE, 'barboza', LOCATION);
        const events = results.filter(r => 'date' in r) as RipperCalendarEvent[];
        for (const event of events) {
            expect(event.location).toBe(LOCATION);
            expect(event.description).toContain('Barboza');
        }
    });

    it('produces no ParseErrors for sample data', () => {
        const results = parseAXSSkinEvents(loadSample(), ZONE, 'barboza', LOCATION);
        const errors = results.filter(r => 'type' in r);
        if (errors.length > 0) {
            console.log('ParseErrors:', errors);
        }
        const nonCanceledErrors = errors.filter(e => (e as any).reason !== 'Event marked canceled');
        expect(nonCanceledErrors.length).toBe(0);
    });
});
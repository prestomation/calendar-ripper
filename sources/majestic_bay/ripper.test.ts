import { describe, it, expect } from 'vitest';
import MajesticBayRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import { Duration } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('MajesticBayRipper', () => {
    it('extracts JSON-LD events from sample HTML', () => {
        const ripper = new MajesticBayRipper();
        const html = loadSampleHtml();

        const events = ripper.extractEvents(html);
        expect(events.length).toBeGreaterThan(0);
        expect(events[0]).toHaveProperty('name');
        expect(events[0]).toHaveProperty('startDate');
        expect(events[0]).toHaveProperty('duration');
    });

    it('parses all events from sample data', () => {
        const ripper = new MajesticBayRipper();
        const html = loadSampleHtml();
        const veeziEvents = ripper.extractEvents(html);

        const events = ripper.parseEvents(veeziEvents);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid.length).toBe(55);
    });

    it('parses event title correctly', () => {
        const ripper = new MajesticBayRipper();
        const html = loadSampleHtml();
        const veeziEvents = ripper.extractEvents(html);

        const events = ripper.parseEvents(veeziEvents);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const hamnet = valid.find(e => e.summary === 'Hamnet');
        expect(hamnet).toBeDefined();
    });

    it('parses date and time correctly', () => {
        const ripper = new MajesticBayRipper();
        const html = loadSampleHtml();
        const veeziEvents = ripper.extractEvents(html);

        const events = ripper.parseEvents(veeziEvents);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const hamnet = valid.find(e => e.id === 'veezi-34125')!;
        expect(hamnet).toBeDefined();
        expect(hamnet.date.year()).toBe(2026);
        expect(hamnet.date.monthValue()).toBe(2);
        expect(hamnet.date.dayOfMonth()).toBe(15);
        expect(hamnet.date.hour()).toBe(12);
        expect(hamnet.date.minute()).toBe(30);
    });

    it('parses duration from ISO 8601 format', () => {
        const ripper = new MajesticBayRipper();
        const html = loadSampleHtml();
        const veeziEvents = ripper.extractEvents(html);

        const events = ripper.parseEvents(veeziEvents);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Hamnet: PT2H6M = 126 minutes
        const hamnet = valid.find(e => e.id === 'veezi-34125')!;
        expect(hamnet.duration.toMinutes()).toBe(126);

        // GOAT: PT1H40M = 100 minutes
        const goat = valid.find(e => e.id === 'veezi-34122')!;
        expect(goat.duration.toMinutes()).toBe(100);
    });

    it('sets location from JSON-LD data', () => {
        const ripper = new MajesticBayRipper();
        const html = loadSampleHtml();
        const veeziEvents = ripper.extractEvents(html);

        const events = ripper.parseEvents(veeziEvents);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid[0].location).toBe('Majestic Bay Theatres, 2044 NW Market St., Seattle, WA, 98107, USA');
    });

    it('sets purchase URL from JSON-LD data', () => {
        const ripper = new MajesticBayRipper();
        const html = loadSampleHtml();
        const veeziEvents = ripper.extractEvents(html);

        const events = ripper.parseEvents(veeziEvents);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const hamnet = valid.find(e => e.id === 'veezi-34125')!;
        expect(hamnet.url).toContain('ticketing.useast.veezi.com/purchase/34125');
    });

    it('prefixes event IDs with veezi-', () => {
        const ripper = new MajesticBayRipper();
        const html = loadSampleHtml();
        const veeziEvents = ripper.extractEvents(html);

        const events = ripper.parseEvents(veeziEvents);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const event of valid) {
            expect(event.id).toMatch(/^veezi-/);
        }
    });

    it('deduplicates events with the same purchase ID', () => {
        const ripper = new MajesticBayRipper();
        const html = loadSampleHtml();
        const veeziEvents = ripper.extractEvents(html);

        // Double the events to simulate duplicates
        const duplicated = [...veeziEvents, ...veeziEvents];
        const events = ripper.parseEvents(duplicated);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid.length).toBe(55);
    });

    it('returns no errors for valid sample data', () => {
        const ripper = new MajesticBayRipper();
        const html = loadSampleHtml();
        const veeziEvents = ripper.extractEvents(html);

        const events = ripper.parseEvents(veeziEvents);
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(0);
    });

    it('returns empty array for HTML with no JSON-LD', () => {
        const ripper = new MajesticBayRipper();
        const events = ripper.extractEvents('<html><body>No data</body></html>');
        expect(events).toHaveLength(0);
    });

    it('handles event with malformed date gracefully', () => {
        const ripper = new MajesticBayRipper();

        const events = ripper.parseEvents([{
            "@type": "VisualArtsEvent",
            startDate: "not-a-date",
            duration: "PT2H",
            name: "Bad Date Movie",
            url: "https://example.com/purchase/99999"
        }]);

        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        expect(errors[0].reason).toContain('Could not parse date');
    });

    it('defaults to 2 hours when duration is missing', () => {
        const ripper = new MajesticBayRipper();

        const events = ripper.parseEvents([{
            "@type": "VisualArtsEvent",
            startDate: "2026-02-15T12:30:00-08:00",
            duration: undefined as any,
            name: "No Duration Movie",
            url: "https://example.com/purchase/88888"
        }]);

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid).toHaveLength(1);
        expect(valid[0].duration).toEqual(Duration.ofHours(2));
    });

    it('includes multiple distinct films', () => {
        const ripper = new MajesticBayRipper();
        const html = loadSampleHtml();
        const veeziEvents = ripper.extractEvents(html);

        const events = ripper.parseEvents(veeziEvents);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const titles = new Set(valid.map(e => e.summary));
        expect(titles.size).toBeGreaterThanOrEqual(5);
    });
});

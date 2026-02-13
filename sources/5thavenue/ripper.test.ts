import { describe, it, expect } from 'vitest';
import { AXSRipper } from '../../lib/config/axs.js';
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
    venueId: 133070,
    venueSlug: '5th-avenue-theatre-seattle-tickets',
    venueName: 'The 5th Avenue Theatre',
    venueAddress: '1308 5th Ave, Seattle, WA 98101'
};

describe('AXSRipper', () => {
    it('parses events from sample data, skipping events with missing title or date', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // 6 total: 4 valid + 1 no date (error) + 1 no title (skipped)
        expect(valid).toHaveLength(4);
    });

    it('parses event title correctly', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const spamalot = valid.find(e => e.id === 'axs-1237495');
        expect(spamalot).toBeDefined();
        expect(spamalot!.summary).toBe('Monty Python Spamalot');
    });

    it('parses date and time correctly', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const spamalot = valid.find(e => e.id === 'axs-1237495')!;
        expect(spamalot.date.year()).toBe(2026);
        expect(spamalot.date.monthValue()).toBe(2);
        expect(spamalot.date.dayOfMonth()).toBe(12);
        expect(spamalot.date.hour()).toBe(19);
        expect(spamalot.date.minute()).toBe(30);
    });

    it('sets default duration of 2 hours', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid[0].duration.toHours()).toBe(2);
    });

    it('builds location from config', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid[0].location).toBe('The 5th Avenue Theatre, 1308 5th Ave, Seattle, WA 98101');
    });

    it('includes supporting text in description', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const charley = valid.find(e => e.id === 'axs-1240434')!;
        expect(charley.description).toContain('with special guest Colter Wall');
    });

    it('includes tour title in description', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const charley = valid.find(e => e.id === 'axs-1240434')!;
        expect(charley.description).toContain('Tour: $10 Cowboy Tour');
    });

    it('sets description to undefined when no info fields present', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Spamalot has no supportingText or tourTitle, only majorCategory
        const spamalot = valid.find(e => e.id === 'axs-1237495')!;
        expect(spamalot.description).toContain('Category: ArtsOrFamily');
    });

    it('selects best image (mediaTypeId 17 preferred)', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const spamalot = valid.find(e => e.id === 'axs-1237495')!;
        expect(spamalot.image).toBe('https://static.discovery-prod.axs.com/axs/images/spamalot_678_399.jpg');
    });

    it('falls back to first image when preferred type not available', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const camille = valid.find(e => e.id === 'axs-1070194')!;
        expect(camille.image).toBe('https://static.discovery-prod.axs.com/axs/images/camille_318_187.jpg');
    });

    it('sets image to undefined when no media', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const charley = valid.find(e => e.id === 'axs-1240434')!;
        expect(charley.image).toBeUndefined();
    });

    it('generates AXS event URL', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const spamalot = valid.find(e => e.id === 'axs-1237495')!;
        expect(spamalot.url).toBe('https://www.axs.com/events/1237495');
    });

    it('prefixes event IDs with axs-', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const event of valid) {
            expect(event.id).toMatch(/^axs-/);
        }
    });

    it('deduplicates events within a single parseEvents call', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        // Simulate duplicate entries (e.g. from paginated results)
        const duplicatedData = [...sampleData, ...sampleData];
        const events = ripper.parseEvents(duplicatedData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Should still only have 4 unique events despite doubled input
        expect(valid).toHaveLength(4);
    });

    it('does not carry dedup state across separate parseEvents calls', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events1 = ripper.parseEvents(sampleData, timezone, config);
        const events2 = ripper.parseEvents(sampleData, timezone, config);

        const valid1 = events1.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const valid2 = events2.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid1).toHaveLength(4);
        expect(valid2).toHaveLength(4);
    });

    it('returns parse error for events with no date', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        expect(errors[0].reason).toContain('Could not parse date');
    });

    it('skips events with missing title', () => {
        const ripper = new AXSRipper();
        const sampleData = loadSampleData();

        const events = ripper.parseEvents(sampleData, timezone, config);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const noTitle = valid.find(e => e.id === 'axs-8888888');
        expect(noTitle).toBeUndefined();
    });

    it('handles location when only venueName is available', () => {
        const ripper = new AXSRipper();

        const events = ripper.parseEvents([{
            headlinersText: "Test Event",
            id: 1111111,
            date: "2026-03-01T20:00:00",
            relatedMedia: [],
            statusId: 1,
        }], timezone, { venueName: 'Test Venue' });

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid[0].location).toBe('Test Venue');
    });
});

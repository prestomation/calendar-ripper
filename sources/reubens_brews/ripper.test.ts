import { describe, it, expect } from 'vitest';
import ReubensBrewsRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import { parse } from 'node-html-parser';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    const htmlPath = path.join(__dirname, 'sample-data.html');
    return fs.readFileSync(htmlPath, 'utf8');
}

describe('ReubensBrewsRipper', () => {
    describe('extractEvents', () => {
        it('extracts Taproom events from sample HTML', () => {
            const ripper = new ReubensBrewsRipper();
            const root = parse(loadSampleHtml());
            const events = ripper.extractEvents(root, 'The Taproom');

            expect(events.length).toBeGreaterThan(0);
            expect(events[0]).toHaveProperty('url');
            expect(events[0]).toHaveProperty('month');
            expect(events[0]).toHaveProperty('day');
            expect(events[0]).toHaveProperty('title');
        });

        it('extracts Downtown events from sample HTML', () => {
            const ripper = new ReubensBrewsRipper();
            const root = parse(loadSampleHtml());
            const events = ripper.extractEvents(root, 'Downtown Seattle');

            expect(events.length).toBeGreaterThan(0);
        });

        it('returns empty for non-existent location', () => {
            const ripper = new ReubensBrewsRipper();
            const root = parse(loadSampleHtml());
            const events = ripper.extractEvents(root, 'Nonexistent');

            expect(events).toHaveLength(0);
        });

        it('extracts URLs from event links', () => {
            const ripper = new ReubensBrewsRipper();
            const root = parse(loadSampleHtml());
            const events = ripper.extractEvents(root, 'The Taproom');

            for (const event of events) {
                expect(event.url).toContain('reubensbrews.com/event/');
            }
        });

        it('extracts month and day correctly', () => {
            const ripper = new ReubensBrewsRipper();
            const root = parse(loadSampleHtml());
            const events = ripper.extractEvents(root, 'The Taproom');

            const first = events[0];
            expect(first.month).toMatch(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/);
            expect(parseInt(first.day)).toBeGreaterThan(0);
            expect(parseInt(first.day)).toBeLessThanOrEqual(31);
        });
    });

    describe('parseDate', () => {
        it('parses Feb date', () => {
            const ripper = new ReubensBrewsRipper();
            const date = ripper.parseDate('Feb', '18');

            expect(date).not.toBeNull();
            expect(date!.monthValue()).toBe(2);
            expect(date!.dayOfMonth()).toBe(18);
            expect(date!.hour()).toBe(18); // default 6 PM
        });

        it('parses Mar date', () => {
            const ripper = new ReubensBrewsRipper();
            const date = ripper.parseDate('Mar', '4');

            expect(date).not.toBeNull();
            expect(date!.monthValue()).toBe(3);
            expect(date!.dayOfMonth()).toBe(4);
        });

        it('returns null for invalid month', () => {
            const ripper = new ReubensBrewsRipper();
            expect(ripper.parseDate('Invalid', '18')).toBeNull();
        });

        it('returns null for invalid day', () => {
            const ripper = new ReubensBrewsRipper();
            expect(ripper.parseDate('Feb', 'abc')).toBeNull();
        });

        it('returns null for out-of-range day', () => {
            const ripper = new ReubensBrewsRipper();
            expect(ripper.parseDate('Feb', '0')).toBeNull();
            expect(ripper.parseDate('Feb', '32')).toBeNull();
        });
    });

    describe('parseEvents', () => {
        it('creates calendar events from Taproom data', () => {
            const ripper = new ReubensBrewsRipper();
            const root = parse(loadSampleHtml());
            const extracted = ripper.extractEvents(root, 'The Taproom');
            const events = ripper.parseEvents(extracted, "Reuben's Brews Taproom");
            const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

            expect(valid.length).toBeGreaterThan(0);
            expect(valid[0].location).toBe("Reuben's Brews Taproom");
            expect(valid[0].id).toMatch(/^reubens-/);
            expect(valid[0].duration.toHours()).toBe(2);
        });

        it('deduplicates events by URL', () => {
            const ripper = new ReubensBrewsRipper();
            const root = parse(loadSampleHtml());
            const extracted = ripper.extractEvents(root, 'The Taproom');
            const doubled = [...extracted, ...extracted];
            const events = ripper.parseEvents(doubled, "Reuben's Brews Taproom");
            const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

            const singlePass = ripper.parseEvents(extracted, "Reuben's Brews Taproom");
            const singleValid = singlePass.filter(e => 'summary' in e) as RipperCalendarEvent[];

            expect(valid.length).toBe(singleValid.length);
        });

        it('returns no errors for valid sample data', () => {
            const ripper = new ReubensBrewsRipper();
            const root = parse(loadSampleHtml());
            const extracted = ripper.extractEvents(root, 'The Taproom');
            const events = ripper.parseEvents(extracted, "Reuben's Brews Taproom");
            const errors = events.filter(e => 'type' in e) as RipperError[];

            expect(errors).toHaveLength(0);
        });

        it('generates stable IDs from URL slugs', () => {
            const ripper = new ReubensBrewsRipper();
            const root = parse(loadSampleHtml());
            const extracted = ripper.extractEvents(root, 'The Taproom');
            const events = ripper.parseEvents(extracted, "Reuben's Brews Taproom");
            const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

            for (const event of valid) {
                expect(event.id).toMatch(/^reubens-[a-z0-9-]+/);
            }
        });

        it('sets event URLs', () => {
            const ripper = new ReubensBrewsRipper();
            const root = parse(loadSampleHtml());
            const extracted = ripper.extractEvents(root, 'The Taproom');
            const events = ripper.parseEvents(extracted, "Reuben's Brews Taproom");
            const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

            for (const event of valid) {
                expect(event.url).toContain('reubensbrews.com/event/');
            }
        });

        it('handles empty input', () => {
            const ripper = new ReubensBrewsRipper();
            const events = ripper.parseEvents([], 'Test Location');
            expect(events).toHaveLength(0);
        });
    });
});

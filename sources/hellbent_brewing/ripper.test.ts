import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import HellbentBrewingRipper from './ripper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleHtml = readFileSync(join(__dirname, 'sample-data.html'), 'utf-8');

const TZ = ZoneId.of('America/Los_Angeles');

// Set "now" to just before the month starts so all April 2026 events are future
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 4, 1, 0, 0, 0), TZ);

describe('HellbentBrewingRipper', () => {
    const ripper = new HellbentBrewingRipper();

    it('parses food truck events from sample HTML', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBeGreaterThan(10);
    });

    it('returns event summaries prefixed with "Food Truck:"', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        for (const e of calEvents) {
            expect(e.summary).toMatch(/^Food Truck: /);
        }
    });

    it('sets the correct location on all events', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        for (const e of calEvents) {
            expect(e.location).toContain('13035 Lake City Way NE');
        }
    });

    it('filters out past events', () => {
        // Set now to end of April — all events should be gone
        const endOfApril = ZonedDateTime.of(LocalDateTime.of(2026, 5, 1, 0, 0, 0), TZ);
        const events = ripper.parseEvents(sampleHtml, endOfApril, TZ);
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBe(0);
    });

    it('deduplicates events with the same timestamp and name', () => {
        // Feed the same HTML twice (simulates duplicate entries in the grid)
        const doubled = sampleHtml + sampleHtml;
        const single = ripper.parseEvents(sampleHtml, NOW, TZ);
        const deduped = ripper.parseEvents(doubled, NOW, TZ);
        const singleCount = single.filter(e => 'date' in e).length;
        const dedupedCount = deduped.filter(e => 'date' in e).length;
        expect(dedupedCount).toBe(singleCount);
    });

    it('all events fall in April 2026', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ) as any[];
        const calEvents = events.filter(e => 'date' in e);
        for (const e of calEvents) {
            expect(e.date.year()).toBe(2026);
            expect(e.date.monthValue()).toBe(4);
        }
    });

    it('events have 3-hour duration', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ) as any[];
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBeGreaterThan(0);
        for (const e of calEvents) {
            expect(e.duration.toHours()).toBe(3);
        }
    });
});

import { describe, expect, test } from 'vitest';
import SeattleConventionCenterRipper from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'node-html-parser';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml() {
    const htmlPath = path.join(__dirname, 'sample-data.html');
    return parse(fs.readFileSync(htmlPath, 'utf8'));
}

const testDate = ZonedDateTime.parse('2026-02-15T00:00:00-08:00[America/Los_Angeles]');

describe('Seattle Convention Center Ripper', () => {
    test('parses events from sample data', async () => {
        const ripper = new SeattleConventionCenterRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        // 13 rows total, but 2 are "(Begins ...)" continuations that get deduped
        // 11 unique events remain
        expect(validEvents.length).toBe(11);
    });

    test('parses multi-day event correctly', async () => {
        const ripper = new SeattleConventionCenterRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // NW Flower & Garden Festival: Wed 18 - Sun 22 February 2026
        const flower = validEvents.find(e => e.summary.includes('NW Flower'));
        expect(flower).toBeDefined();
        expect(flower!.id).toBe('scc-1118');
        expect(flower!.date.year()).toBe(2026);
        expect(flower!.date.monthValue()).toBe(2);
        expect(flower!.date.dayOfMonth()).toBe(18);
        expect(flower!.date.hour()).toBe(9);
        // 5 days: (5-1)*24 + 8 = 104 hours
        expect(flower!.duration.toHours()).toBe(104);
    });

    test('parses single-day event correctly', async () => {
        const ripper = new SeattleConventionCenterRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // WMFHA EdCon 2026: Thu 12 March 2026
        const edcon = validEvents.find(e => e.summary.includes('WMFHA EdCon'));
        expect(edcon).toBeDefined();
        expect(edcon!.date.year()).toBe(2026);
        expect(edcon!.date.monthValue()).toBe(3);
        expect(edcon!.date.dayOfMonth()).toBe(12);
        expect(edcon!.date.hour()).toBe(9);
        expect(edcon!.duration.toHours()).toBe(8);
    });

    test('handles cross-month events with "(Ends ...)" annotation', async () => {
        const ripper = new SeattleConventionCenterRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // ASBrS 2026 Annual Meeting: Apr 29 - May 3 (cross-month)
        const asbrs = validEvents.find(e => e.summary.includes('ASBrS'));
        expect(asbrs).toBeDefined();
        expect(asbrs!.id).toBe('scc-34055');
        expect(asbrs!.date.monthValue()).toBe(4);
        expect(asbrs!.date.dayOfMonth()).toBe(29);
        // Apr 29 to May 3 = 5 days: (5-1)*24 + 8 = 104 hours
        expect(asbrs!.duration.toHours()).toBe(104);
    });

    test('handles single-day entry with "(Ends ...)" for cross-month event', async () => {
        const ripper = new SeattleConventionCenterRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // AAOMS 2026 Annual Meeting: Sep 30 with "(Ends Oct 3)"
        const aaoms = validEvents.find(e => e.summary.includes('AAOMS'));
        expect(aaoms).toBeDefined();
        expect(aaoms!.id).toBe('scc-32022');
        expect(aaoms!.date.monthValue()).toBe(9);
        expect(aaoms!.date.dayOfMonth()).toBe(30);
        // Sep 30 to Oct 3 = 4 days: (4-1)*24 + 8 = 80 hours
        expect(aaoms!.duration.toHours()).toBe(80);
    });

    test('skips "(Begins ...)" continuation entries', async () => {
        const ripper = new SeattleConventionCenterRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // ASBrS appears once (from April), not twice
        const asbrsEvents = validEvents.filter(e => e.summary.includes('ASBrS'));
        expect(asbrsEvents.length).toBe(1);
        expect(asbrsEvents[0].date.monthValue()).toBe(4); // April occurrence

        // AAOMS appears once (from September), not twice
        const aaomsEvents = validEvents.filter(e => e.summary.includes('AAOMS'));
        expect(aaomsEvents.length).toBe(1);
        expect(aaomsEvents[0].date.monthValue()).toBe(9); // September occurrence
    });

    test('decodes HTML entities in event names', async () => {
        const ripper = new SeattleConventionCenterRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // "NW Flower &amp; Garden Festival 2026" should decode to "&"
        const flower = validEvents.find(e => e.summary.includes('NW Flower'));
        expect(flower).toBeDefined();
        expect(flower!.summary).toContain('&');
        expect(flower!.summary).not.toContain('&amp;');
    });

    test('deduplicates events across multiple parseEvents calls', async () => {
        const ripper = new SeattleConventionCenterRipper();
        const html = loadSampleHtml();

        const firstCall = await ripper.parseEvents(html, testDate, {});
        const secondCall = await ripper.parseEvents(html, testDate, {});

        const firstEvents = firstCall.filter(e => 'summary' in e);
        const secondEvents = secondCall.filter(e => 'summary' in e);

        expect(firstEvents.length).toBe(11);
        expect(secondEvents.length).toBe(0);
    });

    test('all events have required fields', async () => {
        const ripper = new SeattleConventionCenterRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const event of validEvents) {
            expect(event.ripped).toBeInstanceOf(Date);
            expect(event.date).toBeDefined();
            expect(event.duration).toBeDefined();
            expect(event.summary).toBeTruthy();
            expect(event.id).toBeTruthy();
            expect(event.id).toMatch(/^scc-\d+$/);
            expect(event.location).toContain('Seattle Convention Center');
            expect(event.url).toBe('https://seattlecc.com/upcoming-events/');
            expect(event.description).toBeTruthy();
        }
    });

    test('parses events across multiple months', async () => {
        const ripper = new SeattleConventionCenterRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const months = new Set(validEvents.map(e => e.date.monthValue()));
        // Events span Feb, Mar, Apr, May, Sep, Oct
        expect(months.size).toBeGreaterThanOrEqual(5);
    });

    test('handles empty HTML gracefully', async () => {
        const ripper = new SeattleConventionCenterRipper();
        const html = parse('<html><body></body></html>');

        const events = await ripper.parseEvents(html, testDate, {});
        expect(events.length).toBe(0);
    });
});

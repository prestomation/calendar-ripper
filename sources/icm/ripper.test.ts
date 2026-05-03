import { describe, expect, test } from 'vitest';
import ICMRipper from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'node-html-parser';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml() {
    return parse(fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8'));
}

// Test date: May 3, 2026 (today per project context)
const testDate = ZonedDateTime.parse('2026-05-03T00:00:00-07:00[America/Los_Angeles]');

describe('ICM Ripper', () => {
    test('excludes COMPLETED events', async () => {
        const ripper = new ICMRipper();
        const events = await ripper.parseEvents(loadSampleHtml(), testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const e of calEvents) {
            expect(e.summary).not.toMatch(/COMPLETED/i);
        }
    });

    test('returns only upcoming events', async () => {
        const ripper = new ICMRipper();
        const events = await ripper.parseEvents(loadSampleHtml(), testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // June 20 and June 5 events are upcoming; April 18 is past
        const titles = calEvents.map(e => e.summary);
        expect(titles).toContain('Pacific Commodore Expo Northwest 2026');
        expect(titles).toContain('Northwest Pinball & Arcade Show 2026');
        expect(titles).not.toContain('PiDP Build Workshop'); // April 18, 2026 is past
    });

    test('parses event with time range correctly', async () => {
        const html = parse(`
            <div class="event-entry">
                <h2>Workshop With Times</h2>
                <p class="date">June 10th, 2026 10am to 4pm</p>
                <p>Location: Interim Computer Museum</p>
            </div>
        `);
        const ripper = new ICMRipper();
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].date.hour()).toBe(10);
        expect(calEvents[0].duration.toMinutes()).toBe(360); // 6 hours
    });

    test('resolves museum location to known address', async () => {
        const html = parse(`
            <div class="event-entry">
                <h2>Museum Event</h2>
                <p class="date">July 1st, 2026</p>
                <p>Location: Interim Computer Museum</p>
            </div>
        `);
        const ripper = new ICMRipper();
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents[0].location).toContain('998 Industry Dr');
    });

    test('keeps external venue location as-is', async () => {
        const html = parse(`
            <div class="event-entry">
                <h2>External Venue Event</h2>
                <p class="date">August 5th, 2026</p>
                <p>Location: Greater Tacoma Convention Center</p>
                <p><a href="https://example.com">More info</a></p>
            </div>
        `);
        const ripper = new ICMRipper();
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents[0].location).toBe('Greater Tacoma Convention Center');
    });

    test('strips strikethrough text from titles', async () => {
        const ripper = new ICMRipper();
        const events = await ripper.parseEvents(loadSampleHtml(), testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const vcfEvent = calEvents.find(e => e.summary.includes('Vintage Computer Festival'));
        expect(vcfEvent?.summary).toBe('Vintage Computer Festival Pacific Northwest  2026!'.replace(/\s+/g, ' ').trim());
        expect(vcfEvent?.summary).not.toContain('2020');
    });

    test('deduplicates events across multiple parseEvents calls', async () => {
        const ripper = new ICMRipper();
        const html = loadSampleHtml();
        const first = await ripper.parseEvents(html, testDate, {});
        const second = await ripper.parseEvents(html, testDate, {});

        const firstCount = first.filter(e => 'summary' in e).length;
        const secondCount = second.filter(e => 'summary' in e).length;
        expect(secondCount).toBe(0); // all seen already
        expect(firstCount).toBeGreaterThan(0);
    });
});

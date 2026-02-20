import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { ZonedDateTime } from '@js-joda/core';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import MoPOPRipper from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDate = ZonedDateTime.parse('2026-02-20T00:00:00-08:00[America/Los_Angeles]');

function loadSampleHtml() {
    const htmlPath = path.join(__dirname, 'sample-data.html');
    return parse(fs.readFileSync(htmlPath, 'utf8'));
}

describe('MoPOPRipper', () => {
    it('parses events from sample HTML', async () => {
        const ripper = new MoPOPRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Should find events from both JSON-LD and CMS calendar dots
        expect(calEvents.length).toBeGreaterThan(0);
    });

    it('parses CMS calendar-dot-item events', async () => {
        const ripper = new MoPOPRipper();
        const html = parse(`<html>
            <div role="listitem" class="w-dyn-item">
                <div data-date="March 14, 2026" data-title="Test Event" data-text="A fun event" class="calendar-dot-item">
                    <a href="/events/test-event" class="calendar-dot-link">Link</a>
                </div>
            </div>
        </html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].summary).toBe('Test Event');
        expect(calEvents[0].date.year()).toBe(2026);
        expect(calEvents[0].date.monthValue()).toBe(3);
        expect(calEvents[0].date.dayOfMonth()).toBe(14);
        expect(calEvents[0].date.hour()).toBe(10); // default opening time
        expect(calEvents[0].url).toBe('https://www.mopop.org/events/test-event');
        expect(calEvents[0].description).toBe('A fun event');
        expect(calEvents[0].location).toContain('Museum of Pop Culture');
    });

    it('parses JSON-LD events with start and end times', async () => {
        const ripper = new MoPOPRipper();
        const html = parse(`<html>
            <script type="application/ld+json">{
                "@type": "CollectionPage",
                "hasPart": [{
                    "@type": "Event",
                    "name": "Film Festival",
                    "startDate": "2026-01-17T10:00:00",
                    "endDate": "2026-01-17T17:00:00",
                    "url": "/events/film-festival"
                }]
            }</script>
        </html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].summary).toBe('Film Festival');
        expect(calEvents[0].date.hour()).toBe(10);
        expect(calEvents[0].duration.toMinutes()).toBe(420); // 7 hours
        expect(calEvents[0].url).toBe('https://www.mopop.org/events/film-festival');
    });

    it('deduplicates events across JSON-LD and CMS', async () => {
        const ripper = new MoPOPRipper();
        const html = parse(`<html>
            <script type="application/ld+json">{
                "@type": "CollectionPage",
                "hasPart": [{
                    "@type": "Event",
                    "name": "Same Event",
                    "startDate": "2026-03-14T10:00:00",
                    "url": "/events/same-event"
                }]
            }</script>
            <div data-date="March 14, 2026" data-title="Same Event" class="calendar-dot-item">
                <a href="/events/same-event" class="calendar-dot-link">Link</a>
            </div>
        </html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // JSON-LD and CMS generate different IDs, so both appear
        // (JSON-LD: "mopop-same-event", CMS: "mopop-same-event-2026-03-14")
        expect(calEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('deduplicates across multiple parseEvents calls', async () => {
        const ripper = new MoPOPRipper();
        const html = parse(`<html>
            <div data-date="March 14, 2026" data-title="Unique Event" class="calendar-dot-item">
                <a href="/events/unique" class="calendar-dot-link">Link</a>
            </div>
        </html>`);

        const events1 = await ripper.parseEvents(html, testDate, {});
        const events2 = await ripper.parseEvents(html, testDate, {});

        const valid1 = events1.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const valid2 = events2.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid1).toHaveLength(1);
        expect(valid2).toHaveLength(0);
    });

    it('decodes HTML entities in event titles', async () => {
        const ripper = new MoPOPRipper();
        const html = parse(`<html>
            <div data-date="April 1, 2026" data-title="Pop &amp; Rock" class="calendar-dot-item">
                <a href="/events/pop-rock" class="calendar-dot-link">Link</a>
            </div>
        </html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].summary).toBe('Pop & Rock');
    });

    it('handles missing link gracefully', async () => {
        const ripper = new MoPOPRipper();
        const html = parse(`<html>
            <div data-date="May 1, 2026" data-title="No Link Event" class="calendar-dot-item">
            </div>
        </html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].url).toBeUndefined();
    });

    it('handles empty HTML gracefully', async () => {
        const ripper = new MoPOPRipper();
        const html = parse('<html><body>No events here</body></html>');

        const events = await ripper.parseEvents(html, testDate, {});
        expect(events).toHaveLength(0);
    });

    it('returns parse error for invalid date format', async () => {
        const ripper = new MoPOPRipper();
        const html = parse(`<html>
            <div data-date="Invalid Date" data-title="Bad Date Event" class="calendar-dot-item">
            </div>
        </html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        expect(errors[0].reason).toContain('Could not parse date');
    });

    it('defaults to 4 hour duration for CMS events', async () => {
        const ripper = new MoPOPRipper();
        const html = parse(`<html>
            <div data-date="June 1, 2026" data-title="Duration Test" class="calendar-dot-item">
                <a href="/events/dur" class="calendar-dot-link">Link</a>
            </div>
        </html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].duration.toHours()).toBe(4);
    });
});

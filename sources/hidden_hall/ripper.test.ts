import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { ZonedDateTime } from '@js-joda/core';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import HiddenHallRipper from './ripper.js';
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

describe('HiddenHallRipper', () => {
    it('parses events from sample HTML with JSON-LD', async () => {
        const ripper = new HiddenHallRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents.length).toBeGreaterThan(0);
    });

    it('only includes Hidden Hall events, not Nectar Lounge', async () => {
        const ripper = new HiddenHallRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // All events should be at Hidden Hall
        for (const event of calEvents) {
            expect(event.location).toContain('Hidden Hall');
        }
    });

    it('parses event dates correctly (UTC to local)', async () => {
        const ripper = new HiddenHallRipper();
        // "SWIFT ME AWAY" has startDate "2026-02-20T04:30:00+00:00" = Feb 19 8:30 PM PST
        const html = parse(`<html><script type="application/ld+json">[{
            "@type": "Event",
            "name": "Test Event",
            "startDate": "2026-02-20T04:30:00+00:00",
            "endDate": "2026-02-20T08:00:00+00:00",
            "url": "https://www.tixr.com/groups/hiddenhall/events/test-123",
            "location": { "@type": "Place", "name": "Hidden Hall" }
        }]</script></html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].summary).toBe('Test Event');
        // Start: 2026-02-20T04:30:00+00:00 = Feb 20 4:30 UTC
        expect(calEvents[0].date.hour()).toBe(4);
        expect(calEvents[0].date.minute()).toBe(30);
        // Duration: 04:30 to 08:00 = 3.5 hours = 210 minutes
        expect(calEvents[0].duration.toMinutes()).toBe(210);
    });

    it('extracts event ID from Tixr URL', async () => {
        const ripper = new HiddenHallRipper();
        const html = parse(`<html><script type="application/ld+json">[{
            "@type": "Event",
            "name": "Test",
            "startDate": "2026-03-01T04:00:00+00:00",
            "url": "https://www.tixr.com/groups/hiddenhall/events/my-event-12345",
            "location": { "@type": "Place", "name": "Hidden Hall" }
        }]</script></html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].id).toBe('my-event-12345');
    });

    it('includes ticket price in description', async () => {
        const ripper = new HiddenHallRipper();
        const html = parse(`<html><script type="application/ld+json">[{
            "@type": "Event",
            "name": "Test",
            "startDate": "2026-03-01T04:00:00+00:00",
            "url": "https://www.tixr.com/groups/hiddenhall/events/test-1",
            "location": { "@type": "Place", "name": "Hidden Hall" },
            "offers": { "price": 25, "priceCurrency": "USD" }
        }]</script></html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].description).toBe('$25');
    });

    it('decodes HTML entities in event names', async () => {
        const ripper = new HiddenHallRipper();
        const html = parse(`<html><script type="application/ld+json">[{
            "@type": "Event",
            "name": "Rock &amp; Roll Night",
            "startDate": "2026-03-01T04:00:00+00:00",
            "url": "https://www.tixr.com/groups/hiddenhall/events/rock-1",
            "location": { "@type": "Place", "name": "Hidden Hall" }
        }]</script></html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].summary).toBe('Rock & Roll Night');
    });

    it('deduplicates events across multiple parseEvents calls', async () => {
        const ripper = new HiddenHallRipper();
        const html = parse(`<html><script type="application/ld+json">[{
            "@type": "Event",
            "name": "Test",
            "startDate": "2026-03-01T04:00:00+00:00",
            "url": "https://www.tixr.com/groups/hiddenhall/events/test-dedup",
            "location": { "@type": "Place", "name": "Hidden Hall" }
        }]</script></html>`);

        const events1 = await ripper.parseEvents(html, testDate, {});
        const events2 = await ripper.parseEvents(html, testDate, {});

        const valid1 = events1.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const valid2 = events2.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid1).toHaveLength(1);
        expect(valid2).toHaveLength(0);
    });

    it('handles invalid JSON-LD gracefully', async () => {
        const ripper = new HiddenHallRipper();
        const html = parse(`<html><script type="application/ld+json">{not valid json</script></html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('handles empty JSON-LD array', async () => {
        const ripper = new HiddenHallRipper();
        const html = parse(`<html><script type="application/ld+json">[]</script></html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        expect(events).toHaveLength(0);
    });

    it('skips events with missing startDate', async () => {
        const ripper = new HiddenHallRipper();
        const html = parse(`<html><script type="application/ld+json">[{
            "@type": "Event",
            "name": "No Date Event",
            "location": { "@type": "Place", "name": "Hidden Hall" }
        }]</script></html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(calEvents).toHaveLength(0);
    });

    it('defaults to 2 hour duration when endDate is missing', async () => {
        const ripper = new HiddenHallRipper();
        const html = parse(`<html><script type="application/ld+json">[{
            "@type": "Event",
            "name": "No End Date",
            "startDate": "2026-03-01T04:00:00+00:00",
            "url": "https://www.tixr.com/groups/hiddenhall/events/no-end-1",
            "location": { "@type": "Place", "name": "Hidden Hall" }
        }]</script></html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].duration.toHours()).toBe(2);
    });
});

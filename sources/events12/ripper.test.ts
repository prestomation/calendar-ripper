import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parse } from 'node-html-parser';
import { ZonedDateTime } from '@js-joda/core';
import { ZoneId } from '@js-joda/core';
import Events12Ripper from './ripper.js';

describe('Events12Ripper', () => {
    const timezone = ZoneId.of('America/Los_Angeles');
    const testDate = ZonedDateTime.of(2026, 2, 21, 12, 0, 0, 0, timezone);

    it('should parse events from sample HTML data', async () => {
        const ripper = new Events12Ripper();
        const htmlContent = readFileSync('sources/events12/sample-data.html', 'utf-8');
        // Simulate the preprocessHtml -> parse -> parseEvents flow
        (ripper as any).rawHtml = htmlContent;
        const html = parse(htmlContent);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e);

        // Should find many events (the live page has 100+)
        expect(calEvents.length).toBeGreaterThan(80);
    });

    it('should parse event with valid date and title', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="test123">
                <h3>Family Christmas event &nbsp;<span class="free">FREE</span></h3>
                <p class="date icon">December 1, 2025 <span class="nobreak">(4 to 7 p.m.)</span>
                <p class="miles">Downtown (0.1 miles N)
                <p class="event">
                Vote for your favorite of 12 designer-decorated Christmas trees at <a href="https://example.com">Family Preview</a>, with Santa, festive entertainment, and free arts & crafts for kids in the ballroom of The Westin Seattle, 1900 5th Ave. in Seattle.
                <a class="b1" href="https://www.google.com/maps/search/?api=1&query=Test%20Location" rel="nofollow">map</a>
            </article>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        expect(events.length).toBe(1);
        expect(events[0]).toHaveProperty('summary', 'Family Christmas event');
        expect(events[0]).toHaveProperty('date');
        expect(events[0]).toHaveProperty('location');
        expect((events[0] as any).description).toContain('Downtown (0.1 miles N)');

        // Should parse time range correctly: 4 to 7 p.m. = 16:00 start, 3h duration
        const event = events[0] as any;
        expect(event.date.hour()).toBe(16);
        expect(event.duration.toMinutes()).toBe(180);
    });

    it('should parse date ranges', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="range1">
                <h3>Multi-day Festival</h3>
                <p class="date">January 1 - 11, 2026</p>
                <p class="miles">Shoreline (11 miles N)</p>
                <p class="event">A multi-day event <a href="https://example.com/festival">details</a></p>
            </article>
            <article id="range2">
                <h3>Cross-month Event</h3>
                <p class="date">January 1 - Dec. 31, 2026 (4:30 to 10 p.m.)</p>
                <p class="miles">Tacoma</p>
                <p class="event">Year-round event <a href="https://example.com/yearround">details</a></p>
            </article>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        expect(events.length).toBe(2);

        // Date range should use the start date
        const event1 = events[0] as any;
        expect(event1.summary).toBe('Multi-day Festival');
        expect(event1.date.monthValue()).toBe(1);
        expect(event1.date.dayOfMonth()).toBe(1);
        expect(event1.date.year()).toBe(2026);

        // Cross-month range with time
        const event2 = events[1] as any;
        expect(event2.summary).toBe('Cross-month Event');
        expect(event2.date.hour()).toBe(16);
        expect(event2.date.minute()).toBe(30);
        expect(event2.duration.toMinutes()).toBe(330); // 4:30pm to 10pm = 5.5 hours
    });

    it('should parse various time formats', async () => {
        const ripper = new Events12Ripper();
        const cases = [
            { time: '(7 p.m.)', expectedHour: 19, expectedMin: 0, expectedDuration: 120 },
            { time: '(9 a.m. to 2 p.m.)', expectedHour: 9, expectedMin: 0, expectedDuration: 300 },
            { time: '(9:30 a.m. to 12 p.m.)', expectedHour: 9, expectedMin: 30, expectedDuration: 150 },
            { time: '(10 a.m.)', expectedHour: 10, expectedMin: 0, expectedDuration: 120 },
        ];

        for (let i = 0; i < cases.length; i++) {
            const c = cases[i];
            const sampleHtml = `
                <article id="time${i}">
                    <h3>Event ${i}</h3>
                    <p class="date">January 15, 2026 ${c.time}</p>
                    <p class="event">Desc <a href="https://example.com/${i}">link</a></p>
                </article>
            `;
            const html = parse(sampleHtml);
            const events = await ripper.parseEvents(html, testDate, {});
            expect(events.length).toBe(1);
            const event = events[0] as any;
            expect(event.date.hour()).toBe(c.expectedHour);
            expect(event.date.minute()).toBe(c.expectedMin);
            expect(event.duration.toMinutes()).toBe(c.expectedDuration);
        }
    });

    it('should handle parse errors gracefully', async () => {
        const ripper = new Events12Ripper();
        const malformedHtml = `
            <h3>Malformed Event</h3>
            <p>Invalid date format</p>
        `;

        const html = parse(malformedHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        // Should not crash and may return empty or error events
        expect(Array.isArray(events)).toBe(true);
    });

    it('should extract event URLs correctly', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="test456">
                <h3>Test Event</h3>
                <p class="date">December 15, 2025 (7 p.m.)</p>
                <p class="miles">Downtown (0.1 miles N)</p>
                <p class="event">Description with <a href="https://example.com/event">event link</a> and <a href="https://www.google.com/maps">map link</a></p>
            </article>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        expect(events.length).toBe(1);
        expect(events[0]).toHaveProperty('url', 'https://example.com/event');
    });

    it('should parse ampersand date format', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="118800">
                <h3>New musicians</h3>
                <p class="date">February 21 & 28, 2026 <span class="nobreak">(8 to 10 p.m.)</span></p>
                <p class="miles">University District (5 miles NE)</p>
                <p class="event">Live music <a href="https://example.com/music">details</a></p>
            </article>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        expect(events.length).toBe(1);
        const event = events[0] as any;
        expect(event.summary).toBe('New musicians');
        expect(event.date.monthValue()).toBe(2);
        expect(event.date.dayOfMonth()).toBe(21);
        expect(event.date.hour()).toBe(20);
        expect(event.duration.toMinutes()).toBe(120);
    });

    it('should handle noon time format', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="noon1">
                <h3>Noon Event</h3>
                <p class="date">February 15, 2026 (noon)</p>
                <p class="miles">Downtown</p>
                <p class="event">Event at noon <a href="https://example.com/noon">details</a></p>
            </article>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        expect(events.length).toBe(1);
        const event = events[0] as any;
        expect(event.date.hour()).toBe(12);
        expect(event.date.minute()).toBe(0);
    });

    it('should deduplicate events', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="dup1">
                <h3>Same Event</h3>
                <p class="date">February 14, 2026 (8 p.m.)</p>
                <p class="event">First instance <a href="https://example.com/1">link</a></p>
            </article>
            <article id="dup2">
                <h3>Same Event</h3>
                <p class="date">February 14, 2026 (8 p.m.)</p>
                <p class="event">Second instance <a href="https://example.com/2">link</a></p>
            </article>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e);

        expect(calEvents.length).toBe(1);
    });
});

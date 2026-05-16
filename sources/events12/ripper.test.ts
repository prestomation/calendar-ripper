import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parse } from 'node-html-parser';
import { ZonedDateTime } from '@js-joda/core';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import Events12Ripper from './ripper.js';

describe('Events12Ripper', () => {
    const timezone = ZoneId.of('America/Los_Angeles');
    const testDate = ZonedDateTime.of(2026, 2, 21, 12, 0, 0, 0, timezone);

    it('should parse events from sample HTML data', { timeout: 60000 }, async () => {
        const ripper = new Events12Ripper();
        const htmlContent = readFileSync('sources/events12/sample-data.html', 'utf-8');
        // Exercise the actual preprocessHtml -> parse -> parseEvents flow
        const processedHtml = (ripper as any).preprocessHtml(htmlContent);
        const html = parse(processedHtml);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e);

        // With date-range expansion, the rip yields several hundred events.
        expect(calEvents.length).toBeGreaterThan(200);
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
        const calEvents = events.filter(e => 'date' in e);

        expect(calEvents.length).toBe(1);
        expect(calEvents[0]).toHaveProperty('summary', 'Family Christmas event');
        expect(calEvents[0]).toHaveProperty('date');
        expect(calEvents[0]).toHaveProperty('location');
        expect((calEvents[0] as any).description).toContain('Downtown (0.1 miles N)');

        // 4 to 7 p.m. = 16:00 start, 3h duration
        const event = calEvents[0] as any;
        expect(event.date.hour()).toBe(16);
        expect(event.duration.toMinutes()).toBe(180);

        // Explicit time present → no UncertaintyError emitted.
        const uncertainty = events.filter(e => (e as any).type === 'Uncertainty');
        expect(uncertainty.length).toBe(0);
    });

    it('expands date ranges into one event per day', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="range1">
                <h3>Multi-day Festival</h3>
                <p class="date">February 2 - 7, 2026 <span class="nobreak">(10 a.m. to 8 p.m.)</span></p>
                <p class="miles">Shoreline (11 miles N)</p>
                <p class="event">A multi-day event <a href="https://example.com/festival">details</a></p>
            </article>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];

        // 6 days (Feb 2-7 inclusive) × 1 time slot
        expect(calEvents.length).toBe(6);
        expect(calEvents[0].date.dayOfMonth()).toBe(2);
        expect(calEvents[5].date.dayOfMonth()).toBe(7);
        // Each occurrence carries the parsed time
        for (const e of calEvents) {
            expect(e.date.hour()).toBe(10);
            expect(e.duration.toMinutes()).toBe(600);
        }
    });

    it('handles cross-month ranges (same year)', async () => {
        const ripper = new Events12Ripper();
        // Real format from sample-data.html — "January 1 - Dec. 31, 2026 (4:30 to 10 p.m.)"
        const sampleHtml = `
            <article id="cm1">
                <h3>Year-round Event</h3>
                <p class="date">January 1 - Feb. 5, 2026 <span class="nobreak">(4:30 to 10 p.m.)</span></p>
                <p class="event">Spans Jan into Feb <a href="https://example.com/yr">details</a></p>
            </article>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];

        // Jan 1 - Feb 5 = 36 days
        expect(calEvents.length).toBe(36);
        expect(calEvents[0].date.monthValue()).toBe(1);
        expect(calEvents[0].date.dayOfMonth()).toBe(1);
        expect(calEvents[calEvents.length - 1].date.monthValue()).toBe(2);
        expect(calEvents[calEvents.length - 1].date.dayOfMonth()).toBe(5);
    });

    it('emits an UncertaintyError when no time is provided', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="untimed1">
                <h3>Time-less Event</h3>
                <p class="date">February 14, 2026</p>
                <p class="event">No time provided <a href="https://example.com/untimed">details</a></p>
            </article>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];
        const uncertainty = events.filter((e: any) => e.type === 'Uncertainty') as any[];

        // Still emitted with a placeholder so the calendar isn't empty
        expect(calEvents.length).toBe(1);
        expect(calEvents[0].date.hour()).toBe(12);
        expect(calEvents[0].date.minute()).toBe(0);

        // Paired UncertaintyError carrying the event
        expect(uncertainty.length).toBe(1);
        expect(uncertainty[0].source).toBe('events12');
        expect(uncertainty[0].unknownFields).toEqual(['startTime', 'duration']);
        expect(uncertainty[0].event.id).toBe(calEvents[0].id);
        expect(uncertainty[0].event.summary).toBe('Time-less Event');
        expect(uncertainty[0].partialFingerprint).toBeTruthy();
    });

    it('untimed date ranges emit one UncertaintyError per day', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="untimed-range">
                <h3>Untimed Run</h3>
                <p class="date">February 6 - 7, 2026</p>
                <p class="event">No time given <a href="https://example.com/r">details</a></p>
            </article>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];
        const uncertainty = events.filter((e: any) => e.type === 'Uncertainty') as any[];

        expect(calEvents.length).toBe(2);
        expect(uncertainty.length).toBe(2);
        // Per-day fingerprints share the same value because the source
        // listing produced the same parsed data for both days.
        expect(uncertainty[0].partialFingerprint).toBe(uncertainty[1].partialFingerprint);
    });

    it('parses (5 & 8 p.m.) as two showings per day', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="multi-time">
                <h3>Two Showings</h3>
                <p class="date">February 12 - 15, 2026 <span class="nobreak">(5 & 8 p.m.)</span></p>
                <p class="event">Daily showings <a href="https://example.com/ms">details</a></p>
            </article>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];
        const uncertainty = events.filter((e: any) => e.type === 'Uncertainty');

        // 4 days × 2 slots = 8 events. No uncertainty (times are known).
        expect(calEvents.length).toBe(8);
        expect(uncertainty.length).toBe(0);

        // First day: 5pm and 8pm slots produce distinct IDs
        const feb12 = calEvents.filter((e: any) => e.date.dayOfMonth() === 12);
        expect(feb12.length).toBe(2);
        const ids = feb12.map((e: any) => e.id).sort();
        expect(ids[0]).not.toBe(ids[1]);
        expect(feb12.find((e: any) => e.date.hour() === 17)).toBeTruthy();
        expect(feb12.find((e: any) => e.date.hour() === 20)).toBeTruthy();
    });

    it('parses ampersand date format as two separate events', async () => {
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
        const calEvents = events.filter(e => 'date' in e) as any[];

        expect(calEvents.length).toBe(2);

        expect(calEvents[0].summary).toBe('New musicians');
        expect(calEvents[0].date.dayOfMonth()).toBe(21);
        expect(calEvents[0].date.hour()).toBe(20);
        expect(calEvents[0].duration.toMinutes()).toBe(120);

        expect(calEvents[1].date.dayOfMonth()).toBe(28);
        expect(calEvents[1].date.hour()).toBe(20);
    });

    it('handles noon time format', async () => {
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
        const calEvents = events.filter(e => 'date' in e) as any[];

        expect(calEvents.length).toBe(1);
        expect(calEvents[0].date.hour()).toBe(12);
        expect(calEvents[0].date.minute()).toBe(0);

        // (noon) is an explicit time — no uncertainty
        const uncertainty = events.filter((e: any) => e.type === 'Uncertainty');
        expect(uncertainty.length).toBe(0);
    });

    it('parses various single-day time formats', async () => {
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
            const calEvents = events.filter(e => 'date' in e) as any[];
            expect(calEvents.length).toBe(1);
            expect(calEvents[0].date.hour()).toBe(c.expectedHour);
            expect(calEvents[0].date.minute()).toBe(c.expectedMin);
            expect(calEvents[0].duration.toMinutes()).toBe(c.expectedDuration);
        }
    });

    it('reports a ParseError for unparseable dates', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="bad1">
                <h3>Bad Date Event</h3>
                <p class="date">Unparseable date string</p>
                <p class="event">Desc <a href="https://example.com/bad">link</a></p>
            </article>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const parseErrors = events.filter((e: any) => e.type === 'ParseError');
        expect(parseErrors.length).toBe(1);
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
        const calEvents = events.filter(e => 'date' in e) as any[];

        expect(calEvents.length).toBe(1);
        expect(calEvents[0]).toHaveProperty('url', 'https://example.com/event');
    });

    it('deduplicates identical (title, date, slot) tuples', async () => {
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

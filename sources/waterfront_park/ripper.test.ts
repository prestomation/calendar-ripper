import { describe, expect, test } from 'vitest';
import { parseDatetime, parseDuration, parseEventsFromHtml } from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'node-html-parser';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml() {
    const htmlPath = path.join(__dirname, 'sample-data.html');
    return parse(fs.readFileSync(htmlPath, 'utf8'));
}

// ── parseDatetime ────────────────────────────────────────────────────────────

describe('parseDatetime', () => {
    test('parses YYYYMMDDHHMM correctly', () => {
        const dt = parseDatetime('202605241100');
        expect(dt).not.toBeNull();
        expect(dt!.year()).toBe(2026);
        expect(dt!.monthValue()).toBe(5);
        expect(dt!.dayOfMonth()).toBe(24);
        expect(dt!.hour()).toBe(11);
        expect(dt!.minute()).toBe(0);
    });

    test('returns null for malformed input', () => {
        expect(parseDatetime('bad')).toBeNull();
        expect(parseDatetime('')).toBeNull();
        expect(parseDatetime('20260524')).toBeNull();
    });

    test('parses midnight correctly', () => {
        const dt = parseDatetime('202606010000');
        expect(dt).not.toBeNull();
        expect(dt!.hour()).toBe(0);
        expect(dt!.minute()).toBe(0);
    });
});

// ── parseDuration ────────────────────────────────────────────────────────────

describe('parseDuration', () => {
    test('single time with am/pm → default 2 hours', () => {
        expect(parseDuration('10 am').toMinutes()).toBe(120);
        expect(parseDuration('12 pm').toMinutes()).toBe(120);
        expect(parseDuration('3 pm').toMinutes()).toBe(120);
    });

    test('explicit start and end meridiem: "10 am‑12 pm" → 2h', () => {
        expect(parseDuration('10 am\u201112 pm').toMinutes()).toBe(120);
    });

    test('explicit start and end: "10 am‑8 pm" → 10h', () => {
        expect(parseDuration('10 am\u20118 pm').toMinutes()).toBe(600);
    });

    test('explicit start and end: "11 am‑2 pm" → 3h', () => {
        expect(parseDuration('11 am\u20112 pm').toMinutes()).toBe(180);
    });

    test('explicit start and end with minutes: "11:30 am‑3:30 pm" → 4h', () => {
        expect(parseDuration('11:30 am\u20113:30 pm').toMinutes()).toBe(240);
    });

    test('implicit start meridiem same as end: "1‑8 pm" → 7h', () => {
        expect(parseDuration('1\u20118 pm').toMinutes()).toBe(420);
    });

    test('implicit start meridiem same as end: "2‑8 pm" → 6h', () => {
        expect(parseDuration('2\u20118 pm').toMinutes()).toBe(360);
    });

    test('implicit start meridiem same as end: "3‑7 pm" → 4h', () => {
        expect(parseDuration('3\u20117 pm').toMinutes()).toBe(240);
    });

    test('implicit start meridiem same as end: "9‑11:30 am" → 2.5h', () => {
        expect(parseDuration('9\u201111:30 am').toMinutes()).toBe(150);
    });

    test('"5:30‑7 pm" → 1.5h (90 min)', () => {
        expect(parseDuration('5:30\u20117 pm').toMinutes()).toBe(90);
    });

    test('"6:30‑10 pm" → 3.5h (210 min)', () => {
        expect(parseDuration('6:30\u201110 pm').toMinutes()).toBe(210);
    });

    test('"6‑7:30 pm" → 1.5h (90 min)', () => {
        expect(parseDuration('6\u20117:30 pm').toMinutes()).toBe(90);
    });

    test('"7:30‑10:30 pm" → 3h', () => {
        expect(parseDuration('7:30\u201110:30 pm').toMinutes()).toBe(180);
    });

    test('"9 am‑6 pm" → 9h', () => {
        expect(parseDuration('9 am\u20116 pm').toMinutes()).toBe(540);
    });
});

// ── parseEventsFromHtml ──────────────────────────────────────────────────────

describe('parseEventsFromHtml (sample data)', () => {
    test('parses a non-zero number of events from sample HTML', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents);

        const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];
        expect(valid.length).toBeGreaterThan(50);
    });

    test('first event: Bookending Summer Pop-Ups on May 24 2026 at 11:00', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents);

        const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];
        const first = valid[0];
        expect(first.summary).toContain('Bookending Summer');
        expect(first.date.year()).toBe(2026);
        expect(first.date.monthValue()).toBe(5);
        expect(first.date.dayOfMonth()).toBe(24);
        expect(first.date.hour()).toBe(11);
        expect(first.date.minute()).toBe(0);
    });

    test('first event duration: "11 am‑2 pm" → 180 min', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents);
        const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];
        expect(valid[0].duration.toMinutes()).toBe(180);
    });

    test('venue is cleaned and includes Waterfront Park suffix', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents);
        const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        // First event venue is "Overlook Walk"
        expect(valid[0].location).toBe('Overlook Walk, Waterfront Park, Seattle, WA');
    });

    test('venue strips "|" and ticketed/free label', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents);
        const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        // Seafair Summer Kickoff: venue is "Pier 62 | Free" → should be cleaned
        const seafair = valid.find(e => e.summary.includes('Seafair Summer Kickoff'));
        expect(seafair).toBeDefined();
        expect(seafair!.location).toBe('Pier 62, Waterfront Park, Seattle, WA');
    });

    test('same event ID on different dates → both appear (not deduped)', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents);
        const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        // Event ID 6875 (Bookending Summer) appears on May 24 and Sep 6
        const bookending = valid.filter(e => e.summary.includes('Bookending Summer'));
        expect(bookending.length).toBeGreaterThanOrEqual(2);
    });

    test('deduplicates identical event+datetime across repeated calls', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();

        const events1 = parseEventsFromHtml(html, seenEvents);
        const events2 = parseEventsFromHtml(html, seenEvents);

        const valid1 = events1.filter(e => 'date' in e) as RipperCalendarEvent[];
        const valid2 = events2.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(valid1.length).toBeGreaterThan(0);
        expect(valid2.length).toBe(0); // All deduped on second pass
    });

    test('event IDs are unique within a single parse', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents);
        const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        const ids = valid.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('events include URL from anchor', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents);
        const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        const withUrl = valid.filter(e => e.url);
        expect(withUrl.length).toBeGreaterThan(0);
        expect(valid[0].url).toContain('http');
    });

    test('events include description from p.brief when present', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents);
        const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        const first = valid[0];
        expect(first.description).toBeDefined();
        expect(first.description).toContain('Seattle Public Library');
    });

    test('produces no errors for well-formed sample data', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents);
        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(errors.length).toBe(0);
    });
});

describe('parseEventsFromHtml (synthetic HTML)', () => {
    test('handles empty grid gracefully', () => {
        const html = parse('<div class="events-grid"></div>');
        const events = parseEventsFromHtml(html, new Set());
        expect(events.length).toBe(0);
    });

    test('returns ParseError for missing data-datetime', () => {
        const html = parse('<div class="grid-item" data-id="123"><h4>Test</h4></div>');
        const events = parseEventsFromHtml(html, new Set());
        // No data-datetime attribute → no selector match → 0 events
        expect(events.length).toBe(0);
    });

    test('returns ParseError for unparseable data-datetime', () => {
        const html = parse('<div class="grid-item" data-datetime="bad" data-id="123"><h4>Test</h4></div>');
        const events = parseEventsFromHtml(html, new Set());
        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(errors.length).toBe(1);
        expect(errors[0].type).toBe('ParseError');
    });

    test('uses "11:30 am‑3:30 pm" time range for duration', () => {
        const html = parse(`
            <div class="grid-item" data-datetime="202606011130" data-id="9999">
                <a href="https://example.com">
                    <div class="inner-wrap match-height">
                        <h3 class="widont ">Monday Jun 1</h3>
                        <h3 class="widont date-time">11:30 am\u20113:30 pm</h3>
                        <h3 class="widont ">Pier 62</h3>
                        <h4 class="widont ">Sea You at the Waterfront</h4>
                        <p class="brief">A fun aquarium event.</p>
                    </div>
                </a>
            </div>
        `);
        const events = parseEventsFromHtml(html, new Set());
        const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];
        expect(valid.length).toBe(1);
        expect(valid[0].summary).toBe('Sea You at the Waterfront');
        expect(valid[0].date.hour()).toBe(11);
        expect(valid[0].date.minute()).toBe(30);
        expect(valid[0].duration.toMinutes()).toBe(240); // 4 hours
        expect(valid[0].location).toBe('Pier 62, Waterfront Park, Seattle, WA');
    });

    test('venue with pipe label is cleaned correctly', () => {
        const html = parse(`
            <div class="grid-item" data-datetime="202606150900" data-id="8888">
                <a href="https://example.com">
                    <div class="inner-wrap match-height">
                        <h3 class="widont ">Monday Jun 15</h3>
                        <h3 class="widont date-time">9 am\u201111:30 am</h3>
                        <h3 class="widont ">Overlook Walk <span>|</span><span class="nbsp">&nbsp;</span>Free</h3>
                        <h4 class="widont ">Walk for Kids</h4>
                        <p class="brief">A great walk.</p>
                    </div>
                </a>
            </div>
        `);
        const events = parseEventsFromHtml(html, new Set());
        const valid = events.filter(e => 'date' in e) as RipperCalendarEvent[];
        expect(valid.length).toBe(1);
        expect(valid[0].location).toBe('Overlook Walk, Waterfront Park, Seattle, WA');
        expect(valid[0].duration.toMinutes()).toBe(150); // 2.5 hours
    });
});

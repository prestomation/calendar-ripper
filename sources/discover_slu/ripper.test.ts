import { describe, expect, test } from 'vitest';
import { parseEventsFromHtml } from './ripper.js';
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

function loadSampleAjaxResponse() {
    const jsonPath = path.join(__dirname, 'sample-ajax-response.json');
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    return parse(data.events_html);
}

describe('Discover SLU Ripper', () => {
    test('parses events from sample HTML', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(validEvents.length).toBe(6);
    });

    test('parses event titles correctly', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const titles = validEvents.map(e => e.summary);
        expect(titles).toContain('Seattle REI Run Club - Party Pace');
        expect(titles).toContain('Trivia Nights at King Leroy');
        expect(titles).toContain('Guest Chef Night at FareStart');
        expect(titles).toContain('Seattle JazzED Downbeat');
        expect(titles).toContain('Bloodworks NW Blood Drive');
        expect(titles).toContain('History Café: Seattle Mystic');
    });

    test('parses dates and times correctly', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const reiRun = validEvents.find(e => e.summary.includes('REI Run'));
        expect(reiRun).toBeDefined();
        expect(reiRun!.date.year()).toBe(2026);
        expect(reiRun!.date.monthValue()).toBe(3);
        expect(reiRun!.date.dayOfMonth()).toBe(15);
        expect(reiRun!.date.hour()).toBe(10);
        expect(reiRun!.date.minute()).toBe(0);

        const trivia = validEvents.find(e => e.summary.includes('Trivia'));
        expect(trivia).toBeDefined();
        expect(trivia!.date.dayOfMonth()).toBe(16);
        expect(trivia!.date.hour()).toBe(18); // 6:30 PM
        expect(trivia!.date.minute()).toBe(30);

        const guestChef = validEvents.find(e => e.summary.includes('FareStart'));
        expect(guestChef).toBeDefined();
        expect(guestChef!.date.dayOfMonth()).toBe(18);
        expect(guestChef!.date.hour()).toBe(17); // 5:00 PM
    });

    test('parses locations with venue name', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const reiRun = validEvents.find(e => e.summary.includes('REI Run'));
        expect(reiRun!.location).toBe('REI, South Lake Union, Seattle, WA');

        const mohai = validEvents.find(e => e.summary.includes('History Café'));
        expect(mohai!.location).toBe('MOHAI, South Lake Union, Seattle, WA');
    });

    test('parses descriptions', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const reiRun = validEvents.find(e => e.summary.includes('REI Run'));
        expect(reiRun!.description).toContain('run with friends');
    });

    test('parses event URLs correctly', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const reiRun = validEvents.find(e => e.summary.includes('REI Run'));
        expect(reiRun!.url).toBe('https://www.discoverslu.com/events/rei-run-2026/');

        // Relative URL should be resolved to absolute
        const historyCafe = validEvents.find(e => e.summary.includes('History Café'));
        expect(historyCafe!.url).toBe('https://www.discoverslu.com/events/history-cafe-seattle/');
    });

    test('parses images when present', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const reiRun = validEvents.find(e => e.summary.includes('REI Run'));
        expect(reiRun!.image).toContain('Run_Thumb');

        // Events without images should have undefined image
        const historyCafe = validEvents.find(e => e.summary.includes('History Café'));
        expect(historyCafe!.image).toBeUndefined();
    });

    test('deduplicates events across multiple parseEvents calls', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();

        const events1 = parseEventsFromHtml(html, seenEvents, 2026);
        const events2 = parseEventsFromHtml(html, seenEvents, 2026);

        const valid1 = events1.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const valid2 = events2.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid1.length).toBe(6);
        expect(valid2.length).toBe(0); // All should be deduped
    });

    test('parses AJAX response HTML', () => {
        const html = loadSampleAjaxResponse();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(2);
        const titles = validEvents.map(e => e.summary);
        expect(titles).toContain('Paint Night: Crescent Beach');
        expect(titles).toContain('EASE Pop-Up');
    });

    test('combines initial page and AJAX events without duplicates', () => {
        const seenEvents = new Set<string>();

        const pageHtml = loadSampleHtml();
        const pageEvents = parseEventsFromHtml(pageHtml, seenEvents, 2026);

        const ajaxHtml = loadSampleAjaxResponse();
        const ajaxEvents = parseEventsFromHtml(ajaxHtml, seenEvents, 2026);

        const allValid = [
            ...pageEvents.filter(e => 'summary' in e),
            ...ajaxEvents.filter(e => 'summary' in e),
        ] as RipperCalendarEvent[];

        expect(allValid.length).toBe(8); // 6 from page + 2 from AJAX

        // Verify no duplicate IDs
        const ids = allValid.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('default duration is 2 hours', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const event of validEvents) {
            expect(event.duration.toHours()).toBe(2);
        }
    });

    test('handles HTML with no events gracefully', () => {
        const html = parse('<div id="calendar-events-container"></div>');
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);

        expect(events.length).toBe(0);
    });

    test('parses date-only format without time (e.g. "April 5")', () => {
        const html = parse(`
            <div class="feature full">
                <div class="text">
                    <h3><a href="https://www.discoverslu.com/events/easter-2026/">Easter Cruises</a></h3>
                    <p class="feature__location">@ Waterways Cruises</p>
                    <p>Celebrate Easter on the water with a special brunch cruise.</p>
                </div>
                <div class="feature__image">
                    <a href="https://www.discoverslu.com/events/easter-2026/">
                        <span class="feature__tag">April 5</span>
                    </a>
                </div>
            </div>
        `);
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(1);
        expect(validEvents[0].summary).toBe('Easter Cruises');
        expect(validEvents[0].date.monthValue()).toBe(4);
        expect(validEvents[0].date.dayOfMonth()).toBe(5);
        expect(validEvents[0].date.hour()).toBe(10); // default time
    });

    test('parses date range format (e.g. "April 24-25"), uses first day', () => {
        const html = parse(`
            <div class="feature full">
                <div class="text">
                    <h3><a href="https://www.discoverslu.com/events/terpsichore-2026/">Terpsichore's Landing 2026</a></h3>
                    <p class="feature__location">@ MOHAI</p>
                    <p>A two-day dance festival on the shores of Lake Union.</p>
                </div>
                <div class="feature__image">
                    <a href="https://www.discoverslu.com/events/terpsichore-2026/">
                        <span class="feature__tag">April 24-25</span>
                    </a>
                </div>
            </div>
        `);
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(1);
        expect(validEvents[0].summary).toBe("Terpsichore's Landing 2026");
        expect(validEvents[0].date.monthValue()).toBe(4);
        expect(validEvents[0].date.dayOfMonth()).toBe(24);
        expect(validEvents[0].date.hour()).toBe(10); // default time
    });

    test('parses another date range format (e.g. "May 9-10")', () => {
        const html = parse(`
            <div class="feature full">
                <div class="text">
                    <h3><a href="https://www.discoverslu.com/events/mothers-day-cruises/">Mother's Day Cruises</a></h3>
                    <p class="feature__location">@ Waterways Cruises</p>
                </div>
                <div class="feature__image">
                    <a href="https://www.discoverslu.com/events/mothers-day-cruises/">
                        <span class="feature__tag">May 9-10</span>
                    </a>
                </div>
            </div>
        `);
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(1);
        expect(validEvents[0].summary).toBe("Mother's Day Cruises");
        expect(validEvents[0].date.monthValue()).toBe(5);
        expect(validEvents[0].date.dayOfMonth()).toBe(9);
    });

    test('parses cross-month date range (e.g. "March 30 - April 3"), uses first day', () => {
        const html = parse(`
            <div class="feature full">
                <div class="text">
                    <h3><a href="https://www.discoverslu.com/events/egg-hunt/">The Market Hall Egg Hunt</a></h3>
                    <p class="feature__location">@ Market Hall</p>
                    <p>Annual egg hunt event.</p>
                </div>
                <div class="feature__image">
                    <a href="https://www.discoverslu.com/events/egg-hunt/">
                        <span class="feature__tag">March 30 - April 3</span>
                    </a>
                </div>
            </div>
        `);
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(1);
        expect(validEvents[0].summary).toBe('The Market Hall Egg Hunt');
        expect(validEvents[0].date.monthValue()).toBe(3);
        expect(validEvents[0].date.dayOfMonth()).toBe(30);
        expect(validEvents[0].date.hour()).toBe(10); // default time
    });

    test('parses cross-month date range with year (e.g. "March 30 - April 3, 2026")', () => {
        const html = parse(`
            <div class="feature full">
                <div class="text">
                    <h3><a href="https://www.discoverslu.com/events/spring-fest/">Spring Fest</a></h3>
                    <p class="feature__location">@ SLU Park</p>
                </div>
                <div class="feature__image">
                    <a href="https://www.discoverslu.com/events/spring-fest/">
                        <span class="feature__tag">March 30 - April 3, 2026</span>
                    </a>
                </div>
            </div>
        `);
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(1);
        expect(validEvents[0].summary).toBe('Spring Fest');
        expect(validEvents[0].date.monthValue()).toBe(3);
        expect(validEvents[0].date.dayOfMonth()).toBe(30);
    });

    test('parses same-month date range with year (e.g. "March 30-31, 2026")', () => {
        const html = parse(`
            <div class="feature full">
                <div class="text">
                    <h3><a href="https://www.discoverslu.com/events/weekend-market/">Weekend Market</a></h3>
                    <p class="feature__location">@ SLU Saturday Market</p>
                </div>
                <div class="feature__image">
                    <a href="https://www.discoverslu.com/events/weekend-market/">
                        <span class="feature__tag">March 30-31, 2026</span>
                    </a>
                </div>
            </div>
        `);
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(1);
        expect(validEvents[0].summary).toBe('Weekend Market');
        expect(validEvents[0].date.monthValue()).toBe(3);
        expect(validEvents[0].date.dayOfMonth()).toBe(30);
    });

    test('handles malformed event cards gracefully', () => {
        const html = parse(`
            <div class="feature full">
                <div class="text"><h3><a href="/events/test/">Test Event</a></h3></div>
            </div>
        `);
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);

        // Should produce a parse error for missing date tag
        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(errors.length).toBe(1);
        expect(errors[0].type).toBe('ParseError');
    });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'node-html-parser';
import { LocalDate, ZoneRegion } from '@js-joda/core';
import '@js-joda/timezone';
import TCCRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const timezone = ZoneRegion.of('America/Los_Angeles');

function loadSampleHtml() {
    const html = readFileSync(join(__dirname, 'sample-data.html'), 'utf-8');
    return parse(html);
}

describe('TCCRipper', () => {
    const ripper = new TCCRipper();

    describe('parseUpcomingEvents', () => {
        it('parses the three upcoming events from sample data', () => {
            const html = loadSampleHtml();
            const section = html.querySelector('#tcc-events');
            const events = ripper.parseUpcomingEvents(section, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents).toHaveLength(3);
        });

        it('does not parse events from the past-events section', () => {
            const html = loadSampleHtml();
            // The past events section uses a second #tcc-events inside #past-events.
            // querySelector returns only the first match, so past events are excluded.
            const section = html.querySelector('#tcc-events');
            const events = ripper.parseUpcomingEvents(section, timezone);
            const titles = events
                .filter(e => 'date' in e)
                .map(e => (e as RipperCalendarEvent).summary);

            expect(titles.some(t => t.includes('Pierce County'))).toBe(false);
        });

        it('parses event titles correctly', () => {
            const html = loadSampleHtml();
            const section = html.querySelector('#tcc-events');
            const events = ripper.parseUpcomingEvents(section, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents[0].summary).toBe('Transit Town Hall: The Future of Light Rail in Seattle');
            expect(calEvents[1].summary).toBe('Transit Town Hall: The Future of Sound Transit 3 Projects in South King County');
            expect(calEvents[2].summary).toBe('Join TCC for a Rural Transportation Advocacy 101 Workshop in Snoqualmie Valley!');
        });

        it('parses event URLs correctly', () => {
            const html = loadSampleHtml();
            const section = html.querySelector('#tcc-events');
            const events = ripper.parseUpcomingEvents(section, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents[0].url).toContain('transportationchoices.org');
            expect(calEvents[0].id).toBe('tcc-11510');
        });

        it('parses event dates with correct year', () => {
            const html = loadSampleHtml();
            const section = html.querySelector('#tcc-events');
            const events = ripper.parseUpcomingEvents(section, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            // All sample events are in May which is after April 29, 2026
            expect(calEvents[0].date.monthValue()).toBe(5);
            expect(calEvents[0].date.dayOfMonth()).toBe(5);
            expect(calEvents[1].date.monthValue()).toBe(5);
            expect(calEvents[1].date.dayOfMonth()).toBe(13);
            expect(calEvents[2].date.monthValue()).toBe(5);
            expect(calEvents[2].date.dayOfMonth()).toBe(21);
        });

        it('parses event start times correctly', () => {
            const html = loadSampleHtml();
            const section = html.querySelector('#tcc-events');
            const events = ripper.parseUpcomingEvents(section, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            // "6:00pm to 7:30pm" -> 18:00
            expect(calEvents[0].date.hour()).toBe(18);
            expect(calEvents[0].date.minute()).toBe(0);
            // "5:00pm to 8:30pm" -> 17:00
            expect(calEvents[2].date.hour()).toBe(17);
            expect(calEvents[2].date.minute()).toBe(0);
        });

        it('parses event durations correctly', () => {
            const html = loadSampleHtml();
            const section = html.querySelector('#tcc-events');
            const events = ripper.parseUpcomingEvents(section, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            // "6:00pm to 7:30pm" -> 90 minutes
            expect(calEvents[0].duration.toMinutes()).toBe(90);
            // "5:00pm to 8:30pm" -> 210 minutes
            expect(calEvents[2].duration.toMinutes()).toBe(210);
        });

        it('uses full address when location includes state and zip', () => {
            const html = loadSampleHtml();
            const section = html.querySelector('#tcc-events');
            const events = ripper.parseUpcomingEvents(section, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            // Full address includes "WA 98104" so city is not appended again
            expect(calEvents[0].location).toBe(
                'Bertha Knight Landes Room, on Floor 1 of Seattle City Hall, 600 4th Ave, Seattle, WA 98104'
            );
        });

        it('appends city when location is only a venue name', () => {
            const html = loadSampleHtml();
            const section = html.querySelector('#tcc-events');
            const events = ripper.parseUpcomingEvents(section, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents[1].location).toBe('Highline College - Building 2, Des Moines');
            expect(calEvents[2].location).toBe('North Bend City Hall, North Bend, WA');
        });

        it('returns empty array when section is null', () => {
            const events = ripper.parseUpcomingEvents(null, timezone);
            expect(events).toHaveLength(0);
        });
    });

    describe('parseDate', () => {
        const today = LocalDate.of(2026, 4, 29);

        it('parses future dates in the current year', () => {
            const result = ripper.parseDate('May 05', today);
            expect(result?.year()).toBe(2026);
            expect(result?.monthValue()).toBe(5);
            expect(result?.dayOfMonth()).toBe(5);
        });

        it('advances to next year for past month/day', () => {
            const result = ripper.parseDate('Jan 15', today);
            expect(result?.year()).toBe(2027);
            expect(result?.monthValue()).toBe(1);
        });

        it('keeps current year when date is today', () => {
            const result = ripper.parseDate('Apr 29', today);
            expect(result?.year()).toBe(2026);
            expect(result?.monthValue()).toBe(4);
            expect(result?.dayOfMonth()).toBe(29);
        });

        it('returns null for unparseable text', () => {
            expect(ripper.parseDate('TBD', today)).toBeNull();
            expect(ripper.parseDate('', today)).toBeNull();
        });
    });

    describe('parseTime', () => {
        it('parses "6:00pm to 7:30pm"', () => {
            const result = ripper.parseTime('Tuesday, 6:00pm to 7:30pm');
            expect(result.startHour).toBe(18);
            expect(result.startMinute).toBe(0);
            expect(result.durationMinutes).toBe(90);
        });

        it('parses "5:00pm to 8:30pm"', () => {
            const result = ripper.parseTime('Thursday, 5:00pm to 8:30pm');
            expect(result.startHour).toBe(17);
            expect(result.startMinute).toBe(0);
            expect(result.durationMinutes).toBe(210);
        });

        it('parses "6:30pm to 8:00pm"', () => {
            const result = ripper.parseTime('Monday, 6:30pm to 8:00pm');
            expect(result.startHour).toBe(18);
            expect(result.startMinute).toBe(30);
            expect(result.durationMinutes).toBe(90);
        });

        it('parses am/pm correctly', () => {
            const result = ripper.parseTime('Saturday, 9:00am to 12:00pm');
            expect(result.startHour).toBe(9);
            expect(result.durationMinutes).toBe(180);
        });

        it('returns defaults for unparseable text', () => {
            const result = ripper.parseTime('');
            expect(result.startHour).toBe(18);
            expect(result.durationMinutes).toBe(120);
        });
    });
});

import { describe, it, expect } from 'vitest';
import SeattleShowlistsRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import { ZoneRegion } from '@js-joda/core';
import '@js-joda/timezone';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const timezone = ZoneRegion.of('America/Los_Angeles');

function makeFutureDate(daysFromNow: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
}

function makeShow(overrides: Record<string, any> = {}): any {
    return {
        date: makeFutureDate(5),
        title: "Test Band with Opening Act",
        id: 100001,
        venueName: "Test Venue",
        ...overrides
    };
}

describe('SeattleShowlistsRipper', () => {
    const ripper = new SeattleShowlistsRipper();

    describe('extractShowData', () => {
        it('should extract show data from HTML with window.upcomingShows', () => {
            const html = `<html><head><script>
    window.upcomingShows = [{"date":"20260301","title":"Test Show","id":1,"venueName":"Test Venue"}];
  </script></head><body></body></html>`;

            const shows = ripper.extractShowData(html);
            expect(shows).toHaveLength(1);
            expect(shows[0].title).toBe('Test Show');
            expect(shows[0].id).toBe(1);
            expect(shows[0].venueName).toBe('Test Venue');
            expect(shows[0].date).toBe('20260301');
        });

        it('should handle multiple shows with special characters', () => {
            const html = `<html><head><script>
    window.upcomingShows = [{"date":"20260301","title":"Band A \\"Live\\"","id":1,"venueName":"Venue 1"},{"date":"20260302","title":"Band B w/ Band C","id":2,"venueName":"Venue 2"}];
  </script></head><body></body></html>`;

            const shows = ripper.extractShowData(html);
            expect(shows).toHaveLength(2);
            expect(shows[0].title).toBe('Band A "Live"');
            expect(shows[1].title).toBe('Band B w/ Band C');
        });

        it('should throw if upcomingShows is not found', () => {
            const html = '<html><body>No data here</body></html>';
            expect(() => ripper.extractShowData(html)).toThrow('Could not find window.upcomingShows');
        });
    });

    describe('parseEvents', () => {
        it('should parse shows into calendar events', () => {
            const shows = [
                makeShow({ id: 1, title: 'Band A', venueName: 'Neumos' }),
                makeShow({ id: 2, title: 'Band B', venueName: 'The Crocodile', date: makeFutureDate(10) }),
            ];

            const events = ripper.parseEvents(shows, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents).toHaveLength(2);
            expect(calEvents[0].summary).toBe('Band A');
            expect(calEvents[0].location).toBe('Neumos');
            expect(calEvents[0].id).toBe('showlist-1');
            expect(calEvents[0].url).toBe('https://seattle.showlists.net');
            expect(calEvents[0].duration.toHours()).toBe(3);
            expect(calEvents[1].summary).toBe('Band B');
            expect(calEvents[1].location).toBe('The Crocodile');
        });

        it('should set time to 8 PM in the configured timezone', () => {
            const shows = [makeShow()];

            const events = ripper.parseEvents(shows, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents).toHaveLength(1);
            expect(calEvents[0].date.hour()).toBe(20);
            expect(calEvents[0].date.minute()).toBe(0);
        });

        it('should skip past events', () => {
            const shows = [
                makeShow({ id: 1, date: '20200101' }), // past
                makeShow({ id: 2, date: makeFutureDate(3) }), // future
            ];

            const events = ripper.parseEvents(shows, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents).toHaveLength(1);
            expect(calEvents[0].id).toBe('showlist-2');
        });

        it('should skip shows with missing title', () => {
            const shows = [
                makeShow({ id: 1, title: '' }),
                makeShow({ id: 2, title: 'Valid Show' }),
            ];

            const events = ripper.parseEvents(shows, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents).toHaveLength(1);
            expect(calEvents[0].summary).toBe('Valid Show');
        });

        it('should handle empty venue name', () => {
            const shows = [makeShow({ venueName: '' })];

            const events = ripper.parseEvents(shows, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents).toHaveLength(1);
            expect(calEvents[0].location).toBeUndefined();
        });

        it('should return ParseError for invalid date format', () => {
            const shows = [makeShow({ date: 'baddate' })];

            const events = ripper.parseEvents(shows, timezone);
            const errors = events.filter(e => 'type' in e) as RipperError[];

            expect(errors).toHaveLength(1);
            expect(errors[0].type).toBe('ParseError');
            expect(errors[0].reason).toContain('Invalid date');
        });

        it('should handle special characters in titles', () => {
            const shows = [
                makeShow({ id: 1, title: '10th Annual "Dead Of Winter" featuring ANDY COE BAND' }),
                makeShow({ id: 2, title: 'Band A w/ Band B & Band C' }),
                makeShow({ id: 3, title: '\u2019s Night' }),
            ];

            const events = ripper.parseEvents(shows, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents).toHaveLength(3);
            expect(calEvents[0].summary).toContain('Dead Of Winter');
            expect(calEvents[1].summary).toContain('&');
            expect(calEvents[2].summary).toContain('\u2019');
        });

        it('should handle empty show list', () => {
            const events = ripper.parseEvents([], timezone);
            expect(events).toHaveLength(0);
        });

        it('should parse sample data file', () => {
            const sampleData = JSON.parse(
                readFileSync(join(__dirname, 'sample-data.json'), 'utf-8')
            );

            const events = ripper.parseEvents(sampleData, timezone);
            // Some events in sample data may be in the past, so just check we get events and no unexpected errors
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
            const errors = events.filter(e => 'type' in e) as RipperError[];

            // Should have parsed at least some events (the future ones)
            expect(calEvents.length + errors.length).toBeGreaterThan(0);

            // All valid events should have required fields
            for (const event of calEvents) {
                expect(event.summary).toBeTruthy();
                expect(event.date).toBeDefined();
                expect(event.duration).toBeDefined();
                expect(event.id).toMatch(/^showlist-/);
                expect(event.ripped).toBeInstanceOf(Date);
            }
        });
    });
});

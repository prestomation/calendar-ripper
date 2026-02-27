import { describe, it, expect } from 'vitest';
import SeattleShowlistsRipper, { VENUE_CONFIG, ShowlistEvent } from './ripper.js';
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

function makeShow(overrides: Record<string, any> = {}): ShowlistEvent {
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
                makeShow({ id: 1, title: 'Band A', venueName: 'Nectar Lounge' }),
                makeShow({ id: 2, title: 'Band B', venueName: 'Baba Yaga', date: makeFutureDate(10) }),
            ];

            const events = ripper.parseEvents(shows, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents).toHaveLength(2);
            expect(calEvents[0].summary).toBe('Band A');
            expect(calEvents[0].location).toBe('Nectar Lounge');
            expect(calEvents[0].id).toBe('showlist-1');
            expect(calEvents[0].url).toBe('https://seattle.showlists.net');
            expect(calEvents[0].duration.toHours()).toBe(3);
            expect(calEvents[1].summary).toBe('Band B');
            expect(calEvents[1].location).toBe('Baba Yaga');
        });

        it('should include address in location when provided', () => {
            const shows = [makeShow({ venueName: 'Baba Yaga' })];
            const address = '124 S Washington St, Seattle, WA 98104';

            const events = ripper.parseEvents(shows, timezone, address);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents).toHaveLength(1);
            expect(calEvents[0].location).toBe('Baba Yaga, 124 S Washington St, Seattle, WA 98104');
        });

        it('should use venue name only when no address provided', () => {
            const shows = [makeShow({ venueName: 'Unknown Venue' })];

            const events = ripper.parseEvents(shows, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents).toHaveLength(1);
            expect(calEvents[0].location).toBe('Unknown Venue');
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

    describe('detectUnknownVenues', () => {
        it('should return errors for venues not in VENUE_CONFIG', () => {
            const shows = [
                makeShow({ venueName: 'Baba Yaga' }),           // known
                makeShow({ venueName: 'Brand New Venue' }),      // unknown
                makeShow({ venueName: 'Another Unknown' }),      // unknown
                makeShow({ venueName: 'The Crocodile' }),        // known (skipped)
            ];

            const errors = ripper.detectUnknownVenues(shows);
            expect(errors).toHaveLength(2);
            expect(errors[0].reason).toContain('Brand New Venue');
            expect(errors[1].reason).toContain('Another Unknown');
        });

        it('should not report empty venue names', () => {
            const shows = [makeShow({ venueName: '' })];
            const errors = ripper.detectUnknownVenues(shows);
            expect(errors).toHaveLength(0);
        });

        it('should deduplicate unknown venues', () => {
            const shows = [
                makeShow({ id: 1, venueName: 'New Place' }),
                makeShow({ id: 2, venueName: 'New Place' }),
                makeShow({ id: 3, venueName: 'New Place' }),
            ];

            const errors = ripper.detectUnknownVenues(shows);
            expect(errors).toHaveLength(1);
            expect(errors[0].reason).toContain('New Place');
        });

        it('should return empty array when all venues are known', () => {
            const shows = [
                makeShow({ venueName: 'Baba Yaga' }),
                makeShow({ venueName: 'The Crocodile' }),
                makeShow({ venueName: 'Nectar Lounge' }),
            ];

            const errors = ripper.detectUnknownVenues(shows);
            expect(errors).toHaveLength(0);
        });
    });

    describe('VENUE_CONFIG', () => {
        it('should have skip=true for venues with active dedicated rippers', () => {
            const skippedVenues = [
                'Showbox Market', 'Showbox Sodo', 'Neumos', 'The Crocodile',
                'Neptune Theater', 'The Moore Theater', 'The Paramount Theater',
                'WAMU Theater', 'The Vera Project', 'The Sunset Tavern',
                'Tractor Tavern', 'Substation', 'Chop Suey'
            ];
            for (const venue of skippedVenues) {
                expect(VENUE_CONFIG[venue]?.skip, `${venue} should be skipped`).toBe(true);
            }
        });

        it('should not have skip for included venues', () => {
            const includedVenues = [
                'Baba Yaga', 'Bad Bar', 'Barboza', 'Belltown Yacht Club',
                'Black &amp; Tan Hall', 'Black Lodge', 'Blue Moon Tavern',
                'Central Saloon', 'Clock-Out Lounge', 'Conor Byrne Pub',
                "Darrell's Tavern", 'Hotel Crocodile', 'Nectar Lounge',
                'Skylark', 'The Rabbit Box', 'The Royal Room',
                "Tim's Tavern", 'Vermillion'
            ];
            for (const venue of includedVenues) {
                expect(VENUE_CONFIG[venue], `${venue} should be in VENUE_CONFIG`).toBeDefined();
                expect(VENUE_CONFIG[venue]?.skip, `${venue} should not be skipped`).toBeFalsy();
            }
        });

        it('should have addresses for all venues', () => {
            for (const [name, info] of Object.entries(VENUE_CONFIG)) {
                expect(info.address, `${name} should have an address`).toBeTruthy();
            }
        });
    });

    describe('per-venue filtering', () => {
        const futureDate = makeFutureDate(5);

        it('should filter events by venue when config.venue is set', () => {
            const allShows: ShowlistEvent[] = [
                makeShow({ id: 1, title: 'Show A', venueName: 'Baba Yaga', date: futureDate }),
                makeShow({ id: 2, title: 'Show B', venueName: 'Nectar Lounge', date: futureDate }),
                makeShow({ id: 3, title: 'Show C', venueName: 'Baba Yaga', date: futureDate }),
            ];

            // Simulate what rip() does: filter by venue
            const babaYagaShows = allShows.filter(s => s.venueName === 'Baba Yaga');
            const events = ripper.parseEvents(babaYagaShows, timezone, VENUE_CONFIG['Baba Yaga']?.address);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents).toHaveLength(2);
            expect(calEvents.every(e => e.location?.includes('Baba Yaga'))).toBe(true);
            expect(calEvents.every(e => e.location?.includes('124 S Washington St'))).toBe(true);
        });

        it('should exclude skipped venues when no venue filter is set', () => {
            const allShows: ShowlistEvent[] = [
                makeShow({ id: 1, title: 'Included Show', venueName: 'Baba Yaga', date: futureDate }),
                makeShow({ id: 2, title: 'Skipped Show', venueName: 'The Crocodile', date: futureDate }),
                makeShow({ id: 3, title: 'Also Included', venueName: 'Nectar Lounge', date: futureDate }),
            ];

            // Simulate unfiltered calendar behavior
            const filtered = allShows.filter(s => {
                const info = VENUE_CONFIG[s.venueName];
                return !info?.skip;
            });

            expect(filtered).toHaveLength(2);
            expect(filtered.map(s => s.title)).toEqual(['Included Show', 'Also Included']);
        });
    });
});

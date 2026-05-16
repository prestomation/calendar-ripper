import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import NationalNordicMuseumRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('NationalNordicMuseumRipper', () => {
    describe('parseEventCards', () => {
        it('extracts event cards from the calendar page', () => {
            const ripper = new NationalNordicMuseumRipper();
            const html = parse(loadSampleHtml());
            const cards = ripper.parseEventCards(html);

            expect(cards.length).toBeGreaterThan(0);
            expect(cards[0]).toHaveProperty('href');
            expect(cards[0]).toHaveProperty('title');
            expect(cards[0]).toHaveProperty('dateText');
            expect(cards[0]).toHaveProperty('timeText');
        });

        it('skips Ticketure events that have no static dates', () => {
            const ripper = new NationalNordicMuseumRipper();
            const html = parse(`
                <html><body>
                <div class="card-event js-event-card-ticketure" data-id="abc-123">
                  <a class="card-title-link" href="https://nordicmuseum.org/events/ticketure-event">Ticketure Event</a>
                  <div class="subheading"><p class="js-tickecture-heading"></p></div>
                </div>
                <div class="card-event">
                  <a class="card-title-link" href="https://nordicmuseum.org/events/regular-event">Regular Event</a>
                  <div class="subheading"><p>May 17, 2026</p></div>
                  <p class="content-text">2:00 - 4:00pm</p>
                </div>
                </body></html>
            `);
            const cards = ripper.parseEventCards(html);

            expect(cards).toHaveLength(1);
            expect(cards[0].title).toBe('Regular Event');
        });

        it('extracts href, title, dateText, and timeText from each card', () => {
            const ripper = new NationalNordicMuseumRipper();
            const html = parse(`
                <html><body>
                <div class="card-event">
                  <a class="card-title-link" href="https://nordicmuseum.org/events/test-event">Test Event</a>
                  <div class="subheading"><p>June 4, 2026</p></div>
                  <p class="content-text">10:00 am - 8:00 pm</p>
                </div>
                </body></html>
            `);
            const cards = ripper.parseEventCards(html);

            expect(cards).toHaveLength(1);
            expect(cards[0].href).toBe('https://nordicmuseum.org/events/test-event');
            expect(cards[0].title).toBe('Test Event');
            expect(cards[0].dateText).toBe('June 4, 2026');
            expect(cards[0].timeText).toBe('10:00 am - 8:00 pm');
        });

        it('extracts expected events from sample HTML', () => {
            const ripper = new NationalNordicMuseumRipper();
            const html = parse(loadSampleHtml());
            const cards = ripper.parseEventCards(html);

            const titles = cards.map(c => c.title);
            expect(titles).toContain('17th of May in Ballard');
            expect(titles).toContain('Moomin Movie Night: Moomins on the Riviera');
        });
    });

    describe('parseEvent', () => {
        it('parses a standard dated event', () => {
            const ripper = new NationalNordicMuseumRipper();
            const card = {
                href: 'https://nordicmuseum.org/events/17th-of-may',
                title: '17th of May in Ballard',
                dateText: 'May 17, 2026',
                timeText: 'Museum Hours: 10:00am - 5:00pm; Parade: 6:00 - 8:00pm',
            };

            const result = ripper.parseEvent(card);
            expect('date' in result).toBe(true);
            const event = result as RipperCalendarEvent;
            expect(event.summary).toBe('17th of May in Ballard');
            expect(event.date.monthValue()).toBe(5);
            expect(event.date.dayOfMonth()).toBe(17);
            expect(event.date.year()).toBe(2026);
        });

        it('parses abbreviated month dates', () => {
            const ripper = new NationalNordicMuseumRipper();
            const card = {
                href: 'https://nordicmuseum.org/events/yoga',
                title: 'Community Yoga with Flood Yoga',
                dateText: 'Jun 14, 2026',
                timeText: '8:45 am - 9:45 am',
            };

            const result = ripper.parseEvent(card);
            expect('date' in result).toBe(true);
            const event = result as RipperCalendarEvent;
            expect(event.date.monthValue()).toBe(6);
            expect(event.date.dayOfMonth()).toBe(14);
        });

        it('parses start date from date range', () => {
            const ripper = new NationalNordicMuseumRipper();
            const card = {
                href: 'https://nordicmuseum.org/events/summer-camp',
                title: 'Art Adventures Summer Camp',
                dateText: 'July 13-17, 2026',
                timeText: '9:00am - 3:00pm',
            };

            const result = ripper.parseEvent(card);
            expect('date' in result).toBe(true);
            const event = result as RipperCalendarEvent;
            expect(event.date.monthValue()).toBe(7);
            expect(event.date.dayOfMonth()).toBe(13);
        });

        it('parses start date from cross-month date range', () => {
            const ripper = new NationalNordicMuseumRipper();
            const card = {
                href: 'https://nordicmuseum.org/events/rosemaling',
                title: 'Rosemaling with Marilyn Hansen',
                dateText: 'May 29 - June 13, 2026',
                timeText: '10:00 am - 4:00 pm',
            };

            const result = ripper.parseEvent(card);
            expect('date' in result).toBe(true);
            const event = result as RipperCalendarEvent;
            expect(event.date.monthValue()).toBe(5);
            expect(event.date.dayOfMonth()).toBe(29);
        });

        it('parses start date from complex camp description', () => {
            const ripper = new NationalNordicMuseumRipper();
            const card = {
                href: 'https://nordicmuseum.org/events/drama-quest',
                title: 'Drama Quest - Viking Seafarers',
                dateText: 'Three week-long camps from July 27 - August 14, 2026',
                timeText: '9:00am - 3:00pm',
            };

            const result = ripper.parseEvent(card);
            expect('date' in result).toBe(true);
            const event = result as RipperCalendarEvent;
            expect(event.date.monthValue()).toBe(7);
            expect(event.date.dayOfMonth()).toBe(27);
        });

        it('returns ParseError for unparseable dates', () => {
            const ripper = new NationalNordicMuseumRipper();
            const card = {
                href: 'https://nordicmuseum.org/events/unknown',
                title: 'Unknown Event',
                dateText: 'TBA',
                timeText: '',
            };

            const result = ripper.parseEvent(card);
            expect('type' in result).toBe(true);
            expect((result as RipperError).type).toBe('ParseError');
        });

        it('sets museum address on events', () => {
            const ripper = new NationalNordicMuseumRipper();
            const card = {
                href: 'https://nordicmuseum.org/events/test',
                title: 'Test Event',
                dateText: 'June 4, 2026',
                timeText: '10:00 am - 8:00 pm',
            };

            const result = ripper.parseEvent(card);
            const event = result as RipperCalendarEvent;
            expect(event.location).toContain('National Nordic Museum');
            expect(event.location).toContain('2655 NW Market St');
        });

        it('sets the event URL', () => {
            const ripper = new NationalNordicMuseumRipper();
            const card = {
                href: 'https://nordicmuseum.org/events/17th-of-may',
                title: '17th of May',
                dateText: 'May 17, 2026',
                timeText: '10:00am - 5:00pm',
            };

            const result = ripper.parseEvent(card);
            const event = result as RipperCalendarEvent;
            expect(event.url).toBe('https://nordicmuseum.org/events/17th-of-may');
        });
    });

    describe('isRecurringPattern', () => {
        it('detects "Every Friday" as recurring', () => {
            const ripper = new NationalNordicMuseumRipper();
            expect(ripper.isRecurringPattern('Every Friday')).toBe(true);
        });

        it('detects "First and third Wednesday of every month" as recurring', () => {
            const ripper = new NationalNordicMuseumRipper();
            expect(ripper.isRecurringPattern('First and third Wednesday of every month')).toBe(true);
        });

        it('detects "Every Thursday, April 2 - May 28" as recurring', () => {
            const ripper = new NationalNordicMuseumRipper();
            expect(ripper.isRecurringPattern('Every Thursday, April 2 - May 28')).toBe(true);
        });

        it('does not flag concrete dates as recurring', () => {
            const ripper = new NationalNordicMuseumRipper();
            expect(ripper.isRecurringPattern('May 17, 2026')).toBe(false);
            expect(ripper.isRecurringPattern('Jun 14, 2026')).toBe(false);
            expect(ripper.isRecurringPattern('July 13-17, 2026')).toBe(false);
            expect(ripper.isRecurringPattern('Three week-long camps from July 27 - August 14, 2026')).toBe(false);
        });
    });

    describe('parseDate', () => {
        it('parses standard date with year', () => {
            const ripper = new NationalNordicMuseumRipper();
            expect(ripper.parseDate('May 17, 2026')).toEqual({ year: 2026, month: 5, day: 17 });
        });

        it('parses abbreviated month with year', () => {
            const ripper = new NationalNordicMuseumRipper();
            expect(ripper.parseDate('Jun 14, 2026')).toEqual({ year: 2026, month: 6, day: 14 });
            expect(ripper.parseDate('Jul 12, 2026')).toEqual({ year: 2026, month: 7, day: 12 });
            expect(ripper.parseDate('Aug 16, 2026')).toEqual({ year: 2026, month: 8, day: 16 });
        });

        it('parses start of date range', () => {
            const ripper = new NationalNordicMuseumRipper();
            const result = ripper.parseDate('July 13-17, 2026');
            expect(result).toEqual({ year: 2026, month: 7, day: 13 });
        });

        it('parses start of cross-month range', () => {
            const ripper = new NationalNordicMuseumRipper();
            const result = ripper.parseDate('May 29 - June 13, 2026');
            expect(result).toEqual({ year: 2026, month: 5, day: 29 });
        });

        it('extracts date from complex camp description', () => {
            const ripper = new NationalNordicMuseumRipper();
            const result = ripper.parseDate('Three week-long camps from July 27 - August 14, 2026');
            expect(result).toEqual({ year: 2026, month: 7, day: 27 });
        });

        it('returns null for unparseable text', () => {
            const ripper = new NationalNordicMuseumRipper();
            expect(ripper.parseDate('TBA')).toBeNull();
            expect(ripper.parseDate('')).toBeNull();
            expect(ripper.parseDate('Every Friday')).toBeNull();
        });
    });

    describe('parseTime', () => {
        it('parses time range with am/pm on end only', () => {
            const ripper = new NationalNordicMuseumRipper();
            const result = ripper.parseTime('6:30 - 8:00 pm');
            expect(result.hour).toBe(18);
            expect(result.minute).toBe(30);
            expect(result.durationMinutes).toBe(90);
        });

        it('parses time range with explicit am/pm on both', () => {
            const ripper = new NationalNordicMuseumRipper();
            const result = ripper.parseTime('10:00 am - 8:00 pm');
            expect(result.hour).toBe(10);
            expect(result.minute).toBe(0);
            expect(result.durationMinutes).toBe(600);
        });

        it('parses same-period morning range', () => {
            const ripper = new NationalNordicMuseumRipper();
            const result = ripper.parseTime('8:45 am - 9:45 am');
            expect(result.hour).toBe(8);
            expect(result.minute).toBe(45);
            expect(result.durationMinutes).toBe(60);
        });

        it('parses condensed format "10:00am - 5:00pm"', () => {
            const ripper = new NationalNordicMuseumRipper();
            const result = ripper.parseTime('10:00am - 5:00pm');
            expect(result.hour).toBe(10);
            expect(result.minute).toBe(0);
            expect(result.durationMinutes).toBe(420);
        });

        it('parses single time "7:00pm"', () => {
            const ripper = new NationalNordicMuseumRipper();
            const result = ripper.parseTime('7:00pm');
            expect(result.hour).toBe(19);
            expect(result.minute).toBe(0);
            expect(result.durationMinutes).toBe(120);
        });

        it('uses first time range when text has multiple ranges', () => {
            const ripper = new NationalNordicMuseumRipper();
            // "Museum Hours: 10:00am - 5:00pm; Parade: 6:00 - 8:00pm"
            const result = ripper.parseTime('Museum Hours: 10:00am - 5:00pm; Parade: 6:00 - 8:00pm');
            expect(result.hour).toBe(10);
            expect(result.minute).toBe(0);
        });

        it('returns default for empty string', () => {
            const ripper = new NationalNordicMuseumRipper();
            const result = ripper.parseTime('');
            expect(result.hour).toBe(10);
            expect(result.durationMinutes).toBe(120);
        });
    });
});

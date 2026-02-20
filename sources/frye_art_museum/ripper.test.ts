import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import FryeArtMuseumRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadCalendarSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

function loadEventSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-event.html'), 'utf8');
}

describe('FryeArtMuseumRipper', () => {
    describe('parseEventCards', () => {
        it('extracts event cards from calendar listing page', () => {
            const ripper = new FryeArtMuseumRipper();
            const html = parse(loadCalendarSampleHtml());
            const cards = ripper.parseEventCards(html);

            expect(cards.length).toBeGreaterThan(0);
            expect(cards[0]).toHaveProperty('href');
            expect(cards[0]).toHaveProperty('title');
            expect(cards[0]).toHaveProperty('dateText');
        });

        it('excludes exhibitions (dates starting with "Through")', () => {
            const ripper = new FryeArtMuseumRipper();
            const html = parse(loadCalendarSampleHtml());
            const cards = ripper.parseEventCards(html);

            for (const card of cards) {
                expect(card.dateText).not.toMatch(/^Through/);
            }
        });

        it('only includes cards with day-of-week dates', () => {
            const ripper = new FryeArtMuseumRipper();
            const html = parse(loadCalendarSampleHtml());
            const cards = ripper.parseEventCards(html);

            const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            for (const card of cards) {
                const startsWithDay = daysOfWeek.some(d => card.dateText.startsWith(d));
                expect(startsWithDay).toBe(true);
            }
        });

        it('extracts valid href links for each card', () => {
            const ripper = new FryeArtMuseumRipper();
            const html = parse(loadCalendarSampleHtml());
            const cards = ripper.parseEventCards(html);

            for (const card of cards) {
                expect(card.href).toMatch(/^\/node\/\d+$/);
            }
        });

        it('extracts event titles', () => {
            const ripper = new FryeArtMuseumRipper();
            const html = parse(loadCalendarSampleHtml());
            const cards = ripper.parseEventCards(html);

            const jazzevent = cards.find(c => c.href === '/node/3806');
            expect(jazzevent).toBeDefined();
            expect(jazzevent?.title).toContain('Jazz in the City');
        });
    });

    describe('parseEventDetail', () => {
        it('parses date, time, and location from event page', () => {
            const ripper = new FryeArtMuseumRipper();
            const html = parse(loadEventSampleHtml());
            const card = { href: '/node/3806', title: 'Jazz in the City | Darrius Willrich and Gretchen Yanover', dateText: 'Sunday, February 22' };

            const events = ripper.parseEventDetail(card, html, 'https://fryemuseum.org/calendar/event/jazz-city-darrius-willrich-and-gretchen-yanover');

            expect(events).toHaveLength(1);
            const event = events[0] as RipperCalendarEvent;
            expect('date' in event).toBe(true);
            expect(event.summary).toBe('Jazz in the City | Darrius Willrich and Gretchen Yanover');
        });

        it('parses date correctly from event page', () => {
            const ripper = new FryeArtMuseumRipper();
            const html = parse(loadEventSampleHtml());
            const card = { href: '/node/3806', title: 'Jazz in the City', dateText: 'Sunday, February 22' };

            const events = ripper.parseEventDetail(card, html, 'https://fryemuseum.org/calendar/event/test');
            const event = events[0] as RipperCalendarEvent;

            expect(event.date.monthValue()).toBe(2);
            expect(event.date.dayOfMonth()).toBe(22);
            expect(event.date.year()).toBe(2026);
        });

        it('parses time range correctly', () => {
            const ripper = new FryeArtMuseumRipper();
            const html = parse(loadEventSampleHtml());
            const card = { href: '/node/3806', title: 'Jazz in the City', dateText: 'Sunday, February 22' };

            const events = ripper.parseEventDetail(card, html, 'https://fryemuseum.org/calendar/event/test');
            const event = events[0] as RipperCalendarEvent;

            // "2–4 pm" → 2pm start, 2 hours duration
            expect(event.date.hour()).toBe(14);
            expect(event.date.minute()).toBe(0);
            expect(event.duration.toMinutes()).toBe(120);
        });

        it('uses museum address when address element is populated', () => {
            const ripper = new FryeArtMuseumRipper();
            const html = parse(loadEventSampleHtml());
            const card = { href: '/node/3806', title: 'Jazz in the City', dateText: 'Sunday, February 22' };

            const events = ripper.parseEventDetail(card, html, 'https://fryemuseum.org/calendar/event/test');
            const event = events[0] as RipperCalendarEvent;

            expect(event.location).toContain('Frye Art Museum');
        });

        it('sets the canonical URL on the event', () => {
            const ripper = new FryeArtMuseumRipper();
            const html = parse(loadEventSampleHtml());
            const card = { href: '/node/3806', title: 'Jazz in the City', dateText: 'Sunday, February 22' };
            const canonicalUrl = 'https://fryemuseum.org/calendar/event/jazz-city';

            const events = ripper.parseEventDetail(card, html, canonicalUrl);
            const event = events[0] as RipperCalendarEvent;

            expect(event.url).toBe(canonicalUrl);
        });

        it('returns ParseError when no date element found', () => {
            const ripper = new FryeArtMuseumRipper();
            const html = parse('<html><body><p>No date here</p></body></html>');
            const card = { href: '/node/9999', title: 'Test Event', dateText: 'Thursday, February 19' };

            const events = ripper.parseEventDetail(card, html, 'https://fryemuseum.org/');
            expect(events).toHaveLength(1);
            expect('type' in events[0]).toBe(true);
            expect((events[0] as RipperError).type).toBe('ParseError');
        });

        it('uses museum default address when address element is empty', () => {
            const ripper = new FryeArtMuseumRipper();
            const html = parse(`
                <html><body>
                <p class="event-single__display-date">February 19, 2026</p>
                <p class="event-single__display-time">2:30–4 pm</p>
                <div class="event-single__address"><address></address></div>
                </body></html>
            `);
            const card = { href: '/node/3761', title: 'Alzheimer\'s Café', dateText: 'Thursday, February 19' };

            const events = ripper.parseEventDetail(card, html, 'https://fryemuseum.org/calendar/event/test');
            const event = events[0] as RipperCalendarEvent;

            expect(event.location).toContain('Frye Art Museum');
        });
    });

    describe('parseDate', () => {
        it('parses date with year', () => {
            const ripper = new FryeArtMuseumRipper();
            const result = ripper.parseDate('February 22, 2026');
            expect(result).toEqual({ year: 2026, month: 2, day: 22 });
        });

        it('parses date without year (infers current or next year)', () => {
            const ripper = new FryeArtMuseumRipper();
            const result = ripper.parseDate('December 31');
            expect(result).not.toBeNull();
            expect(result?.month).toBe(12);
            expect(result?.day).toBe(31);
            expect(result?.year).toBeGreaterThan(2024);
        });

        it('returns null for invalid date text', () => {
            const ripper = new FryeArtMuseumRipper();
            expect(ripper.parseDate('Through April 12, 2026')).toBeNull();
            expect(ripper.parseDate('')).toBeNull();
            expect(ripper.parseDate('invalid')).toBeNull();
        });

        it('parses all months correctly', () => {
            const ripper = new FryeArtMuseumRipper();
            const months = [
                ['January', 1], ['February', 2], ['March', 3], ['April', 4],
                ['May', 5], ['June', 6], ['July', 7], ['August', 8],
                ['September', 9], ['October', 10], ['November', 11], ['December', 12],
            ];
            for (const [name, num] of months) {
                const result = ripper.parseDate(`${name} 15, 2026`);
                expect(result?.month).toBe(num);
            }
        });
    });

    describe('parseTime', () => {
        it('parses en-dash range "2–4 pm"', () => {
            const ripper = new FryeArtMuseumRipper();
            const result = ripper.parseTime('2\u20134 pm');
            expect(result.hour).toBe(14);
            expect(result.minute).toBe(0);
            expect(result.durationMinutes).toBe(120);
        });

        it('parses range with minutes "2:30–4 pm"', () => {
            const ripper = new FryeArtMuseumRipper();
            const result = ripper.parseTime('2:30\u20134 pm');
            expect(result.hour).toBe(14);
            expect(result.minute).toBe(30);
            expect(result.durationMinutes).toBe(90);
        });

        it('parses cross-period range "10 am–12 pm"', () => {
            const ripper = new FryeArtMuseumRipper();
            const result = ripper.parseTime('10 am\u201312 pm');
            expect(result.hour).toBe(10);
            expect(result.minute).toBe(0);
            expect(result.durationMinutes).toBe(120);
        });

        it('parses single time "6:30 pm"', () => {
            const ripper = new FryeArtMuseumRipper();
            const result = ripper.parseTime('6:30 pm');
            expect(result.hour).toBe(18);
            expect(result.minute).toBe(30);
            expect(result.durationMinutes).toBe(120);
        });

        it('returns default for empty string', () => {
            const ripper = new FryeArtMuseumRipper();
            const result = ripper.parseTime('');
            expect(result.hour).toBe(10);
            expect(result.durationMinutes).toBe(120);
        });

        it('parses morning range correctly', () => {
            const ripper = new FryeArtMuseumRipper();
            const result = ripper.parseTime('11 am\u20131 pm');
            expect(result.hour).toBe(11);
            expect(result.minute).toBe(0);
            expect(result.durationMinutes).toBe(120);
        });
    });
});

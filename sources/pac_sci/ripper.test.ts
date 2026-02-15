import { describe, it, expect } from 'vitest';
import PacificScienceCenterRipper from './ripper.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';
import { ZoneRegion, LocalDate } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const timezone = ZoneRegion.of('America/Los_Angeles');

describe('PacificScienceCenterRipper', () => {
    const ripper = new PacificScienceCenterRipper();

    describe('extractHeroDate', () => {
        it('extracts date with start and end time', () => {
            const html = `<div class="hero-event__description">
                February 14, 7:00 p.m.                              <span> - </span>
                      10:00 p.m.
                                </div>`;
            expect(ripper.extractHeroDate(html)).toBe('February 14, 7:00 p.m. - 10:00 p.m.');
        });

        it('extracts date with start time only', () => {
            const html = `<div class="hero-event__description">
                February 27, 7:30 p.m.                                </div>`;
            expect(ripper.extractHeroDate(html)).toBe('February 27, 7:30 p.m.');
        });

        it('extracts multi-day date range', () => {
            const html = `<div class="hero-event__description">
                March 12                   <span> - </span>
                    March 15
                        </div>`;
            expect(ripper.extractHeroDate(html)).toBe('March 12 - March 15');
        });

        it('extracts date only (no time)', () => {
            const html = `<div class="hero-event__description">
                May 15                                </div>`;
            expect(ripper.extractHeroDate(html)).toBe('May 15');
        });

        it('returns null when hero-event__description is missing', () => {
            const html = `<div class="some-other-class">No date here</div>`;
            expect(ripper.extractHeroDate(html)).toBeNull();
        });

        it('extracts date from full event page HTML', () => {
            const html = fs.readFileSync(path.join(__dirname, 'sample-event-page.html'), 'utf8');
            const result = ripper.extractHeroDate(html);
            expect(result).toBe('February 14, 7:00 p.m. - 10:00 p.m.');
        });
    });

    describe('parseHeroDate', () => {
        it('parses single day with start and end time', () => {
            const result = ripper.parseHeroDate('February 14, 7:00 p.m. - 10:00 p.m.', timezone);
            expect(result).not.toBeNull();
            expect(result!.startDate.monthValue()).toBe(2);
            expect(result!.startDate.dayOfMonth()).toBe(14);
            expect(result!.startDate.hour()).toBe(19);
            expect(result!.startDate.minute()).toBe(0);
            expect(result!.duration.toMinutes()).toBe(180); // 3 hours
        });

        it('parses morning event with AM/PM times', () => {
            const result = ripper.parseHeroDate('March 21, 10:00 a.m. - 5:00 p.m.', timezone);
            expect(result).not.toBeNull();
            expect(result!.startDate.monthValue()).toBe(3);
            expect(result!.startDate.dayOfMonth()).toBe(21);
            expect(result!.startDate.hour()).toBe(10);
            expect(result!.startDate.minute()).toBe(0);
            expect(result!.duration.toMinutes()).toBe(420); // 7 hours
        });

        it('parses single day with start time only (defaults to 2hr duration)', () => {
            const result = ripper.parseHeroDate('February 27, 7:30 p.m.', timezone);
            expect(result).not.toBeNull();
            expect(result!.startDate.monthValue()).toBe(2);
            expect(result!.startDate.dayOfMonth()).toBe(27);
            expect(result!.startDate.hour()).toBe(19);
            expect(result!.startDate.minute()).toBe(30);
            expect(result!.duration.toHours()).toBe(2);
        });

        it('parses multi-day date range', () => {
            const result = ripper.parseHeroDate('March 12 - March 15', timezone);
            expect(result).not.toBeNull();
            expect(result!.startDate.monthValue()).toBe(3);
            expect(result!.startDate.dayOfMonth()).toBe(12);
            expect(result!.startDate.hour()).toBe(0);
            // Duration should span from Mar 12 00:00 to Mar 15 23:59
            const durationDays = result!.duration.toMinutes() / 60 / 24;
            expect(durationDays).toBeCloseTo(4, 0);
        });

        it('parses date-only format', () => {
            const result = ripper.parseHeroDate('May 15', timezone);
            expect(result).not.toBeNull();
            expect(result!.startDate.monthValue()).toBe(5);
            expect(result!.startDate.dayOfMonth()).toBe(15);
            expect(result!.startDate.hour()).toBe(0);
            expect(result!.duration.toHours()).toBe(24);
        });

        it('parses date with explicit year', () => {
            const result = ripper.parseHeroDate('May 15, 2026', timezone);
            expect(result).not.toBeNull();
            expect(result!.startDate.year()).toBe(2026);
            expect(result!.startDate.monthValue()).toBe(5);
            expect(result!.startDate.dayOfMonth()).toBe(15);
        });

        it('parses date with "from" prefix', () => {
            const result = ripper.parseHeroDate('May 15, 2026, from 10:45 a.m. - 1 p.m.', timezone);
            expect(result).not.toBeNull();
            expect(result!.startDate.monthValue()).toBe(5);
            expect(result!.startDate.dayOfMonth()).toBe(15);
            expect(result!.startDate.hour()).toBe(10);
            expect(result!.startDate.minute()).toBe(45);
            expect(result!.duration.toMinutes()).toBe(135); // 2hr 15min
        });

        it('handles noon correctly', () => {
            const result = ripper.parseHeroDate('March 1, 12:00 p.m. - 2:00 p.m.', timezone);
            expect(result).not.toBeNull();
            expect(result!.startDate.hour()).toBe(12);
            expect(result!.duration.toMinutes()).toBe(120);
        });

        it('handles midnight correctly', () => {
            const result = ripper.parseHeroDate('March 1, 12:00 a.m.', timezone);
            expect(result).not.toBeNull();
            expect(result!.startDate.hour()).toBe(0);
        });

        it('returns null for unrecognized format', () => {
            const result = ripper.parseHeroDate('Some random text', timezone);
            expect(result).toBeNull();
        });
    });

    describe('parseEvents', () => {
        it('parses events from API data with hero HTML', () => {
            const sampleHtml = fs.readFileSync(path.join(__dirname, 'sample-event-page.html'), 'utf8');

            const eventPages = [{
                event: {
                    id: 450353,
                    title: { rendered: 'Science After Dark' },
                    excerpt: { rendered: '<p>Step into PacSci after hours for an unforgettable evening.</p>' },
                    link: 'https://pacificsciencecenter.org/events/science-after-dark/',
                    yoast_head_json: {
                        og_image: [{ url: 'https://pacificsciencecenter.org/wp-content/uploads/2026/01/sad-vday-web.jpg' }]
                    }
                },
                heroHtml: sampleHtml
            }];

            const events = ripper.parseEvents(eventPages, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents).toHaveLength(1);
            expect(calEvents[0].summary).toBe('Science After Dark');
            expect(calEvents[0].date.monthValue()).toBe(2);
            expect(calEvents[0].date.dayOfMonth()).toBe(14);
            expect(calEvents[0].date.hour()).toBe(19);
            expect(calEvents[0].duration.toMinutes()).toBe(180);
            expect(calEvents[0].location).toContain('Pacific Science Center');
            expect(calEvents[0].url).toBe('https://pacificsciencecenter.org/events/science-after-dark/');
            expect(calEvents[0].image).toBe('https://pacificsciencecenter.org/wp-content/uploads/2026/01/sad-vday-web.jpg');
            expect(calEvents[0].description).toBe('Step into PacSci after hours for an unforgettable evening.');
        });

        it('returns parse error when hero HTML is null', () => {
            const eventPages = [{
                event: {
                    id: 1,
                    title: { rendered: 'Test Event' },
                    link: 'https://example.com'
                },
                heroHtml: null
            }];

            const events = ripper.parseEvents(eventPages, timezone);
            expect(events).toHaveLength(1);
            expect('type' in events[0] && events[0].type).toBe('ParseError');
        });

        it('returns parse error when hero date cannot be found', () => {
            const eventPages = [{
                event: {
                    id: 1,
                    title: { rendered: 'Test Event' },
                    link: 'https://example.com'
                },
                heroHtml: '<html><body>No hero section</body></html>'
            }];

            const events = ripper.parseEvents(eventPages, timezone);
            expect(events).toHaveLength(1);
            expect('type' in events[0] && events[0].type).toBe('ParseError');
        });

        it('decodes HTML entities in titles', () => {
            const eventPages = [{
                event: {
                    id: 1,
                    title: { rendered: 'PacSci&#8217;s Science &amp; Fun' },
                    excerpt: { rendered: '<p>Test</p>' },
                    link: 'https://example.com'
                },
                heroHtml: `<div class="hero-event__description">March 1, 7:00 p.m.</div>`
            }];

            const events = ripper.parseEvents(eventPages, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents).toHaveLength(1);
            expect(calEvents[0].summary).toBe('PacSci\u2019s Science & Fun');
        });

        it('handles multiple events', () => {
            const eventPages = [
                {
                    event: {
                        id: 1,
                        title: { rendered: 'Event One' },
                        link: 'https://example.com/1'
                    },
                    heroHtml: `<div class="hero-event__description">March 1, 7:00 p.m.</div>`
                },
                {
                    event: {
                        id: 2,
                        title: { rendered: 'Event Two' },
                        link: 'https://example.com/2'
                    },
                    heroHtml: `<div class="hero-event__description">March 5, 10:00 a.m. <span> - </span> 2:00 p.m.</div>`
                }
            ];

            const events = ripper.parseEvents(eventPages, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents).toHaveLength(2);
            expect(calEvents[0].summary).toBe('Event One');
            expect(calEvents[1].summary).toBe('Event Two');
        });

        it('handles events without excerpt or image', () => {
            const eventPages = [{
                event: {
                    id: 1,
                    title: { rendered: 'Simple Event' },
                    link: 'https://example.com'
                },
                heroHtml: `<div class="hero-event__description">March 1, 7:00 p.m.</div>`
            }];

            const events = ripper.parseEvents(eventPages, timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents).toHaveLength(1);
            expect(calEvents[0].description).toBeUndefined();
            expect(calEvents[0].image).toBeUndefined();
        });
    });
});

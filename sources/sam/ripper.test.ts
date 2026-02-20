import { describe, it, expect } from 'vitest';
import SAMRipper, { parseTime, parseTimeRange, parseArticle, articleToEvent } from './ripper.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';
import { ZoneRegion, Duration } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'node-html-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneRegion.of("America/Los_Angeles");

function loadSampleData(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('SAMRipper', () => {
    describe('parseTime', () => {
        it('parses "10 am"', () => {
            expect(parseTime('10 am')).toEqual({ hour: 10, minute: 0 });
        });

        it('parses "5 pm"', () => {
            expect(parseTime('5 pm')).toEqual({ hour: 17, minute: 0 });
        });

        it('parses "1:30 pm"', () => {
            expect(parseTime('1:30 pm')).toEqual({ hour: 13, minute: 30 });
        });

        it('parses "12 pm" as noon', () => {
            expect(parseTime('12 pm')).toEqual({ hour: 12, minute: 0 });
        });

        it('parses "12 am" as midnight', () => {
            expect(parseTime('12 am')).toEqual({ hour: 0, minute: 0 });
        });

        it('parses "11:30 am"', () => {
            expect(parseTime('11:30 am')).toEqual({ hour: 11, minute: 30 });
        });

        it('returns null for invalid input', () => {
            expect(parseTime('invalid')).toBeNull();
        });
    });

    describe('parseTimeRange', () => {
        it('parses "10 am\u20135 pm"', () => {
            const result = parseTimeRange('10 am\u20135 pm');
            expect(result).toEqual({
                start: { hour: 10, minute: 0 },
                end: { hour: 17, minute: 0 }
            });
        });

        it('parses "1:30\u20134 pm" (start inherits pm)', () => {
            const result = parseTimeRange('1:30\u20134 pm');
            expect(result).toEqual({
                start: { hour: 13, minute: 30 },
                end: { hour: 16, minute: 0 }
            });
        });

        it('parses "3\u20134 pm" (start inherits pm)', () => {
            const result = parseTimeRange('3\u20134 pm');
            expect(result).toEqual({
                start: { hour: 15, minute: 0 },
                end: { hour: 16, minute: 0 }
            });
        });

        it('parses "5\u20138 pm"', () => {
            const result = parseTimeRange('5\u20138 pm');
            expect(result).toEqual({
                start: { hour: 17, minute: 0 },
                end: { hour: 20, minute: 0 }
            });
        });

        it('parses "9 am\u20132 pm"', () => {
            const result = parseTimeRange('9 am\u20132 pm');
            expect(result).toEqual({
                start: { hour: 9, minute: 0 },
                end: { hour: 14, minute: 0 }
            });
        });

        it('parses "11:30 am\u201312:30 pm"', () => {
            const result = parseTimeRange('11:30 am\u201312:30 pm');
            expect(result).toEqual({
                start: { hour: 11, minute: 30 },
                end: { hour: 12, minute: 30 }
            });
        });

        it('parses "12\u20138 pm" correctly', () => {
            const result = parseTimeRange('12\u20138 pm');
            expect(result).toEqual({
                start: { hour: 12, minute: 0 },
                end: { hour: 20, minute: 0 }
            });
        });

        it('parses "11 am\u20132 pm"', () => {
            const result = parseTimeRange('11 am\u20132 pm');
            expect(result).toEqual({
                start: { hour: 11, minute: 0 },
                end: { hour: 14, minute: 0 }
            });
        });

        it('returns null for invalid input', () => {
            expect(parseTimeRange('invalid time')).toBeNull();
        });
    });

    describe('parseArticle', () => {
        it('parses a basic SAM event', () => {
            const html = loadSampleData();
            const root = parse(html);
            const articles = root.querySelectorAll('article[data-start-date]');

            const first = parseArticle(articles[0]);
            expect(first).not.toBeNull();
            expect(first!.title).toBe('SAM Gallery Presents: Wax On');
            expect(first!.startDate).toBe('2026-02-04');
            expect(first!.endDate).toBe('2026-03-01');
            expect(first!.location).toBe('Seattle Art Museum');
            expect(first!.timeText).toContain('10 am');
            expect(first!.timeText).toContain('5 pm');
            expect(first!.canceled).toBe(false);
        });

        it('parses a Seattle Asian Art Museum event', () => {
            const html = loadSampleData();
            const root = parse(html);
            const articles = root.querySelectorAll('article[data-start-date]');

            const lunarNewYear = parseArticle(articles[2]);
            expect(lunarNewYear).not.toBeNull();
            expect(lunarNewYear!.title).toBe('Lunar New Year Family Festival');
            expect(lunarNewYear!.location).toBe('Seattle Asian Art Museum');
            expect(lunarNewYear!.startDate).toBe('2026-02-21');
        });

        it('detects cancelled events', () => {
            const html = loadSampleData();
            const root = parse(html);
            const articles = root.querySelectorAll('article[data-start-date]');

            const canceled = parseArticle(articles[3]);
            expect(canceled).not.toBeNull();
            expect(canceled!.title).toBe('Public Tour: Journeys Through Time and Space');
            expect(canceled!.canceled).toBe(true);
        });

        it('parses Olympic Sculpture Park event', () => {
            const html = loadSampleData();
            const root = parse(html);
            const articles = root.querySelectorAll('article[data-start-date]');

            const ospEvent = parseArticle(articles[7]);
            expect(ospEvent).not.toBeNull();
            expect(ospEvent!.title).toBe('SAM Body + Mind | Activity Days');
            expect(ospEvent!.location).toBe('Olympic Sculpture Park');
            expect(ospEvent!.timeText).toContain('9 am');
        });

        it('parses event with categories', () => {
            const html = loadSampleData();
            const root = parse(html);
            const articles = root.querySelectorAll('article[data-start-date]');

            const figureDrawing = parseArticle(articles[1]);
            expect(figureDrawing).not.toBeNull();
            expect(figureDrawing!.category).toBe('art making,workshops');
        });

        it('decodes HTML entities in titles', () => {
            const html = loadSampleData();
            const root = parse(html);
            const articles = root.querySelectorAll('article[data-start-date]');

            const film = parseArticle(articles[8]);
            expect(film).not.toBeNull();
            expect(film!.title).toBe('SAM Films | BLKNWS: Terms & Conditions');
        });

        it('extracts image URLs', () => {
            const html = loadSampleData();
            const root = parse(html);
            const articles = root.querySelectorAll('article[data-start-date]');

            const first = parseArticle(articles[0]);
            expect(first).not.toBeNull();
            expect(first!.imageUrl).toContain('sam.canto.com');
        });
    });

    describe('articleToEvent', () => {
        it('converts a parsed article to a calendar event', () => {
            const article = {
                title: 'SAM Happy Hour',
                startDate: '2026-02-26',
                endDate: '2026-02-26',
                location: 'Seattle Art Museum',
                category: '',
                audiences: 'For Everyone',
                url: 'https://www.seattleartmuseum.org/whats-on/events/sam-happy-hour-feb-26-26',
                timeText: '5\u20138 pm',
                dateText: 'Thu Feb 26 2026',
                canceled: false,
            };

            const event = articleToEvent(article, TIMEZONE);
            expect(event).not.toBeNull();
            expect(event!.summary).toBe('SAM Happy Hour');
            expect(event!.date.hour()).toBe(17);
            expect(event!.date.minute()).toBe(0);
            expect(event!.duration).toEqual(Duration.ofHours(3));
            expect(event!.location).toBe('Seattle Art Museum, 1300 First Avenue, Seattle, WA 98101');
            expect(event!.id).toBe('sam-happy-hour-feb-26-26');
        });

        it('handles morning time ranges', () => {
            const article = {
                title: 'SAM Body + Mind',
                startDate: '2026-02-28',
                endDate: '2026-02-28',
                location: 'Olympic Sculpture Park',
                category: '',
                audiences: 'For Everyone',
                url: 'https://www.seattleartmuseum.org/whats-on/events/sam-body-mind-activity-days-feb-28',
                timeText: '9 am\u20132 pm',
                dateText: 'Sat Feb 28 2026',
                canceled: false,
            };

            const event = articleToEvent(article, TIMEZONE);
            expect(event).not.toBeNull();
            expect(event!.date.hour()).toBe(9);
            expect(event!.duration).toEqual(Duration.ofHours(5));
            expect(event!.location).toBe('Olympic Sculpture Park, 2901 Western Ave, Seattle, WA 98121');
        });

        it('sets correct date from data-start-date', () => {
            const article = {
                title: 'Test Event',
                startDate: '2026-03-15',
                endDate: '2026-03-15',
                location: 'Seattle Art Museum',
                category: 'tours',
                audiences: '',
                url: 'https://www.seattleartmuseum.org/whats-on/events/test-event',
                timeText: '1:30\u20132:30 pm',
                dateText: 'Sun Mar 15 2026',
                canceled: false,
            };

            const event = articleToEvent(article, TIMEZONE);
            expect(event).not.toBeNull();
            expect(event!.date.year()).toBe(2026);
            expect(event!.date.monthValue()).toBe(3);
            expect(event!.date.dayOfMonth()).toBe(15);
            expect(event!.date.hour()).toBe(13);
            expect(event!.date.minute()).toBe(30);
            expect(event!.duration.toMinutes()).toBe(60);
        });

        it('uses default time when time text is empty', () => {
            const article = {
                title: 'No Time Event',
                startDate: '2026-04-01',
                endDate: '2026-04-01',
                location: 'Seattle Art Museum',
                category: '',
                audiences: '',
                url: 'https://www.seattleartmuseum.org/whats-on/events/no-time',
                timeText: '',
                dateText: 'Wed Apr 1 2026',
                canceled: false,
            };

            const event = articleToEvent(article, TIMEZONE);
            expect(event).not.toBeNull();
            expect(event!.date.hour()).toBe(10); // default
            expect(event!.duration.toMinutes()).toBe(120); // default 2 hours
        });

        it('includes category as description', () => {
            const article = {
                title: 'Art Workshop',
                startDate: '2026-03-01',
                endDate: '2026-03-01',
                location: 'Seattle Art Museum',
                category: 'art making,workshops',
                audiences: '',
                url: 'https://www.seattleartmuseum.org/whats-on/events/art-workshop',
                timeText: '2\u20134 pm',
                dateText: 'Sun Mar 1 2026',
                canceled: false,
            };

            const event = articleToEvent(article, TIMEZONE);
            expect(event).not.toBeNull();
            expect(event!.description).toBe('art making, workshops');
        });

        it('maps Seattle Asian Art Museum address', () => {
            const article = {
                title: 'SAAM Event',
                startDate: '2026-02-21',
                endDate: '2026-02-21',
                location: 'Seattle Asian Art Museum',
                category: '',
                audiences: '',
                url: 'https://www.seattleartmuseum.org/whats-on/events/saam-event',
                timeText: '11 am\u20132 pm',
                dateText: 'Sat Feb 21 2026',
                canceled: false,
            };

            const event = articleToEvent(article, TIMEZONE);
            expect(event!.location).toBe('Seattle Asian Art Museum, 1400 E Prospect St, Seattle, WA 98112');
        });
    });

    describe('parseHtml (sample data)', () => {
        it('parses all articles from sample data', () => {
            const html = loadSampleData();
            const ripper = new SAMRipper();
            const articles = ripper.parseHtml(html);

            // 11 articles in sample, but one is a duplicate (SAM Gallery Presents: Wax On appears twice)
            // and one is a duplicate of SAM Creates: Figure Drawing
            expect(articles.length).toBeGreaterThanOrEqual(9);
            expect(articles.length).toBeLessThanOrEqual(11);
        });

        it('deduplicates events by URL', () => {
            const html = loadSampleData();
            const ripper = new SAMRipper();
            const articles = ripper.parseHtml(html);

            const urls = articles.map(a => a.url);
            const uniqueUrls = new Set(urls);
            expect(urls.length).toBe(uniqueUrls.size);
        });

        it('includes events from all three locations', () => {
            const html = loadSampleData();
            const ripper = new SAMRipper();
            const articles = ripper.parseHtml(html);

            const locations = new Set(articles.map(a => a.location));
            expect(locations.has('Seattle Art Museum')).toBe(true);
            expect(locations.has('Seattle Asian Art Museum')).toBe(true);
            expect(locations.has('Olympic Sculpture Park')).toBe(true);
        });

        it('identifies the cancelled event', () => {
            const html = loadSampleData();
            const ripper = new SAMRipper();
            const articles = ripper.parseHtml(html);

            const canceled = articles.filter(a => a.canceled);
            expect(canceled.length).toBe(1);
            expect(canceled[0].title).toBe('Public Tour: Journeys Through Time and Space');
        });

        it('converts all non-cancelled events to calendar events', () => {
            const html = loadSampleData();
            const ripper = new SAMRipper();
            const articles = ripper.parseHtml(html);

            const nonCanceled = articles.filter(a => !a.canceled);
            for (const article of nonCanceled) {
                const event = articleToEvent(article, TIMEZONE);
                expect(event).not.toBeNull();
                expect(event!.summary).toBeTruthy();
                expect(event!.date).toBeDefined();
                expect(event!.duration.toMinutes()).toBeGreaterThan(0);
            }
        });
    });
});

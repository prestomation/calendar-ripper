import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import { stripHtml, decodeTitle, parseDateFromText, parsePost } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACIFIC = ZoneId.of('America/Los_Angeles');

function loadSampleData() {
    const raw = fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8');
    return JSON.parse(raw);
}

// A fixed "now" in the future relative to past events but before upcoming ones
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 4, 30, 12, 0), PACIFIC);

describe('stripHtml', () => {
    it('removes HTML tags', () => {
        expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
    });

    it('removes WordPress block comments', () => {
        const html = '<!-- wp:paragraph -->\n<p>Text</p>\n<!-- /wp:paragraph -->';
        expect(stripHtml(html)).toBe('Text');
    });

    it('converts <br> to space', () => {
        expect(stripHtml('Line 1<br>Line 2')).toBe('Line 1 Line 2');
        expect(stripHtml('Line 1<br/>Line 2')).toBe('Line 1 Line 2');
    });

    it('decodes common HTML entities', () => {
        expect(stripHtml('7:00 PM &#8211; 9:00 PM')).toBe('7:00 PM – 9:00 PM');
        expect(stripHtml('Rock &amp; Roll')).toBe('Rock & Roll');
    });

    it('collapses whitespace', () => {
        expect(stripHtml('  lots   of   space  ')).toBe('lots of space');
    });
});

describe('decodeTitle', () => {
    it('decodes numeric HTML entities', () => {
        expect(decodeTitle('Caf&#233; Night')).toBe('Café Night');
    });

    it('decodes &amp;', () => {
        expect(decodeTitle('Music &amp; Dance')).toBe('Music & Dance');
    });

    it('passes through plain text unchanged', () => {
        expect(decodeTitle('Simple Title')).toBe('Simple Title');
    });
});

describe('parseDateFromText', () => {
    it('parses "Month DD, YYYY" with start and end time', () => {
        const text = 'Date: Saturday, May 10, 2026 Time: 7:00 PM – 9:00 PM';
        const result = parseDateFromText(text);
        expect(result).not.toBeNull();
        expect(result!.year).toBe(2026);
        expect(result!.month).toBe(5);
        expect(result!.day).toBe(10);
        expect(result!.hour).toBe(19);
        expect(result!.minute).toBe(0);
        expect(result!.endHour).toBe(21);
        expect(result!.endMinute).toBe(0);
    });

    it('parses "Month DD, YYYY at H:MM PM" with single time', () => {
        const text = 'June 5, 2026 at 6:00 PM';
        const result = parseDateFromText(text);
        expect(result).not.toBeNull();
        expect(result!.year).toBe(2026);
        expect(result!.month).toBe(6);
        expect(result!.day).toBe(5);
        expect(result!.hour).toBe(18);
        expect(result!.minute).toBe(0);
        expect(result!.endHour).toBeUndefined();
    });

    it('parses "Month DD, YYYY | H:MM PM" pipe-separated format', () => {
        const text = 'July 12, 2026 | 2:00 PM – 8:00 PM';
        const result = parseDateFromText(text);
        expect(result).not.toBeNull();
        expect(result!.month).toBe(7);
        expect(result!.day).toBe(12);
        expect(result!.hour).toBe(14);
        expect(result!.endHour).toBe(20);
    });

    it('defaults to 7 PM when no time found', () => {
        const text = 'Join us on May 20, 2026 for a great show.';
        const result = parseDateFromText(text);
        expect(result).not.toBeNull();
        expect(result!.hour).toBe(19);
        expect(result!.minute).toBe(0);
    });

    it('returns null when no date found', () => {
        expect(parseDateFromText('Details coming soon. Stay tuned!')).toBeNull();
    });

    it('handles case-insensitive month names', () => {
        const result = parseDateFromText('DECEMBER 31, 2026 at 11:00 PM');
        expect(result).not.toBeNull();
        expect(result!.month).toBe(12);
        expect(result!.day).toBe(31);
    });

    it('handles midnight correctly (12:00 AM)', () => {
        const result = parseDateFromText('May 15, 2026 at 12:00 AM');
        expect(result).not.toBeNull();
        expect(result!.hour).toBe(0);
    });

    it('handles noon correctly (12:00 PM)', () => {
        const result = parseDateFromText('May 15, 2026 at 12:00 PM');
        expect(result).not.toBeNull();
        expect(result!.hour).toBe(12);
    });
});

describe('parsePost', () => {
    it('returns a future event from a well-formed post', () => {
        const post = {
            id: 1001,
            slug: 'experimental-movement-showcase',
            link: 'https://cannonballarts.com/cba-events/experimental-movement-showcase/',
            title: { rendered: 'Experimental Movement Showcase' },
            content: {
                rendered: '<p><strong>Date:</strong> Saturday, May 10, 2026<br><strong>Time:</strong> 7:00 PM &#8211; 9:00 PM</p>',
            },
        };
        const result = parsePost(post, NOW, PACIFIC);
        expect(result).not.toBeNull();
        expect('type' in result!).toBe(false);
        if (result && 'date' in result) {
            expect(result.summary).toBe('Experimental Movement Showcase');
            expect(result.id).toBe('cannonball-arts-experimental-movement-showcase');
            expect(result.url).toBe('https://cannonballarts.com/cba-events/experimental-movement-showcase/');
            expect(result.duration.toMinutes()).toBe(120);
            expect(result.date.monthValue()).toBe(5);
            expect(result.date.dayOfMonth()).toBe(10);
            expect(result.date.hour()).toBe(19);
        }
    });

    it('returns null for a past event', () => {
        const post = {
            id: 1003,
            slug: 'past-performance',
            link: 'https://cannonballarts.com/cba-events/past-performance/',
            title: { rendered: 'Past Performance' },
            content: {
                rendered: '<p>Date: March 1, 2026 Time: 8:00 PM</p>',
            },
        };
        const result = parsePost(post, NOW, PACIFIC);
        expect(result).toBeNull();
    });

    it('returns null when no date found in content (stub/placeholder event)', () => {
        const post = {
            id: 1004,
            slug: 'event-without-date',
            link: 'https://cannonballarts.com/cba-events/event-without-date/',
            title: { rendered: 'Event Without Date' },
            content: { rendered: '<p>Details coming soon.</p>' },
        };
        const result = parsePost(post, NOW, PACIFIC);
        expect(result).toBeNull();
    });

    it('decodes HTML entities in title', () => {
        const post = {
            id: 1010,
            slug: 'music-dance',
            link: 'https://cannonballarts.com/cba-events/music-dance/',
            title: { rendered: 'Music &amp; Dance Night' },
            content: { rendered: '<p>June 20, 2026 at 8:00 PM</p>' },
        };
        const result = parsePost(post, NOW, PACIFIC);
        expect(result && 'date' in result ? result.summary : null).toBe('Music & Dance Night');
    });

    it('computes duration from start and end time', () => {
        const post = {
            id: 1005,
            slug: 'summer-arts-festival',
            link: 'https://cannonballarts.com/cba-events/summer-arts-festival/',
            title: { rendered: 'Summer Arts Festival' },
            content: { rendered: '<p>July 12, 2026 | 2:00 PM &#8211; 8:00 PM</p>' },
        };
        const result = parsePost(post, NOW, PACIFIC);
        expect(result && 'date' in result ? result.duration.toMinutes() : null).toBe(360);
    });

    it('processes sample-data.json: 3 events, 1 error, 1 past skip', () => {
        const posts = loadSampleData();
        const events = [];
        const errors = [];
        for (const post of posts) {
            const r = parsePost(post, NOW, PACIFIC);
            if (r === null) continue;
            if ('date' in r) events.push(r);
            else errors.push(r);
        }
        // Posts: 2 future events + 1 past (null) + 1 no-date (null) + 1 future event = 3 events, 0 errors
        expect(events.length).toBe(3);
        expect(errors.length).toBe(0);
    });
});

import { describe, expect, test } from 'vitest';
import CobysCafeRipper from './ripper.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
}

function makeProductHtml(title: string, description: string): string {
    return `<html><head><title>${title}</title><meta name="description" content="${description}"></head><body></body></html>`;
}

describe('CobysCafeRipper - extractFeaturedEventIds', () => {
    test('extracts ids from embedded siteData JSON', () => {
        const ripper = new CobysCafeRipper();
        const html = `<script>{"siteData":{"page":{"properties":{"contentAreas":{"userContent":{"content":{"cells":[{"content":{"properties":{"featuredEventIds":["466","464","6UQ32TZ436WW72ECIMTYYUMP"]}}}]}}}}}}}</script>`;
        const ids = ripper.extractFeaturedEventIds(html);
        expect(ids).toEqual(['466', '464', '6UQ32TZ436WW72ECIMTYYUMP']);
    });

    test('returns empty array when no featuredEventIds found', () => {
        const ripper = new CobysCafeRipper();
        expect(ripper.extractFeaturedEventIds('<html><body>no events</body></html>')).toEqual([]);
    });
});

describe('CobysCafeRipper - parseDateTimeFromText', () => {
    const ripper = new CobysCafeRipper();

    test('parses "Month Day from H-Hpm" format', () => {
        const result = ripper.parseDateTimeFromText('Join us on May 1 from 6–8pm for a festive evening');
        expect(result).not.toBeNull();
        expect(result!.month).toBe(5);
        expect(result!.day).toBe(1);
        expect(result!.startHour).toBe(18);
        expect(result!.startMinute).toBe(0);
        expect(result!.endHour).toBe(20);
        expect(result!.endMinute).toBe(0);
    });

    test('parses "Weekday, Month Day from H:MM-H:MMpm" format', () => {
        const result = ripper.parseDateTimeFromText("Join us at Coby's Café on Friday, April 24 from 5-6:30pm for a Small Dog Meetup");
        expect(result).not.toBeNull();
        expect(result!.month).toBe(4);
        expect(result!.day).toBe(24);
        expect(result!.startHour).toBe(17);
        expect(result!.startMinute).toBe(0);
        expect(result!.endHour).toBe(18);
        expect(result!.endMinute).toBe(30);
    });

    test('parses "Weekday, Month Day from H-H:MMpm" with Saturday', () => {
        const result = ripper.parseDateTimeFromText("on Saturday, May 2 from 5-6:30pm for a Retriever Meetup");
        expect(result).not.toBeNull();
        expect(result!.month).toBe(5);
        expect(result!.day).toBe(2);
        expect(result!.startHour).toBe(17);
        expect(result!.endHour).toBe(18);
        expect(result!.endMinute).toBe(30);
    });

    test('handles en-dash time separator', () => {
        const result = ripper.parseDateTimeFromText('May 1 from 6–8pm');
        expect(result).not.toBeNull();
        expect(result!.startHour).toBe(18);
        expect(result!.endHour).toBe(20);
    });

    test('does not convert 11am to 11pm for "11-1pm" style events', () => {
        const result = ripper.parseDateTimeFromText('Saturday, November 1 from 11-1pm');
        expect(result).not.toBeNull();
        expect(result!.startHour).toBe(11); // 11am, not 23pm
        expect(result!.endHour).toBe(13);   // 1pm
    });

    test('returns null for text without a date pattern', () => {
        expect(ripper.parseDateTimeFromText("Get ready for Mother's Day with our hands-on bouquet workshop")).toBeNull();
        expect(ripper.parseDateTimeFromText("This is the Members Free RSVP Link")).toBeNull();
        expect(ripper.parseDateTimeFromText('')).toBeNull();
    });
});

describe('CobysCafeRipper - parseProductHtml', () => {
    const ripper = new CobysCafeRipper();

    // Note: parseProductHtml never returns null — it returns RipperCalendarEvent or RipperError.
    // Pre-parse filters (dedup, content exclusions, non-event pages) are handled in the caller.

    test('parses Small Dog Meetup event correctly', () => {
        const data = loadSampleData();
        const product = data.products['466'];
        const html = makeProductHtml(product.title, product.description);
        const result = ripper.parseProductHtml(html, 'https://www.cobyscafe.com/product/x/466');

        expect('date' in result).toBe(true);
        if ('date' in result) {
            expect(result.summary).toBe('Small Dog Meetup - General Ticket');
            expect(result.date.monthValue()).toBe(4);
            expect(result.date.dayOfMonth()).toBe(24);
            expect(result.date.hour()).toBe(17);
            expect(result.date.minute()).toBe(0);
            expect(result.duration.toMinutes()).toBe(90);
            expect(result.location).toContain('101 Nickerson St');
            expect(result.url).toBe('https://www.cobyscafe.com/product/x/466');
        }
    });

    test('parses Cinco de Mayo Fiesta event correctly', () => {
        const data = loadSampleData();
        const product = data.products['464'];
        const html = makeProductHtml(product.title, product.description);
        const result = ripper.parseProductHtml(html, 'https://www.cobyscafe.com/product/x/464');

        expect('date' in result).toBe(true);
        if ('date' in result) {
            expect(result.summary).toBe('Cinco de Mayo Fiesta for One Human + One Dog');
            expect(result.date.monthValue()).toBe(5);
            expect(result.date.dayOfMonth()).toBe(1);
            expect(result.date.hour()).toBe(18);
            expect(result.duration.toHours()).toBe(2);
        }
    });

    test('reports ParseError for events with no parseable date in description', () => {
        const html = makeProductHtml("Mother's Day Bouquet Workshop | Coby's Cafe",
            "Get ready for Mother's Day with our hands-on bouquet workshop");
        const result = ripper.parseProductHtml(html, 'https://www.cobyscafe.com/product/x/470');
        expect('type' in result).toBe(true);
        expect((result as any).type).toBe('ParseError');
        expect((result as any).reason).toContain('No parseable date');
    });

    test('reports ParseError for events where end time is before start time (invalid range)', () => {
        // "9pm-6pm" → 21:00 start, 18:00 end → negative duration
        const html = makeProductHtml('Bad Time Event | Coby\'s Cafe',
            'Join us on May 15 from 9pm-6pm for an event');
        const result = ripper.parseProductHtml(html, 'https://www.cobyscafe.com/product/x/999');
        expect('type' in result).toBe(true);
        expect((result as any).type).toBe('ParseError');
        expect((result as any).reason).toContain('duration');
    });

    test('reports ParseError for empty HTML (no title)', () => {
        const result = ripper.parseProductHtml('', 'https://example.com');
        expect('type' in result).toBe(true);
        expect((result as any).type).toBe('ParseError');
        expect((result as any).reason).toContain('No <title>');
    });

    // Dedup is handled in the caller (fetchAndParseEvents), not in parseProductHtml.
    // When two events parse to the same date+time, the second is skipped by the caller's
    // dedup set — parseProductHtml always returns a RipperCalendarEvent for valid events.

    // Pre-parse content filters (Members Free RSVP, bare site name) are also handled
    // in the caller — parseProductHtml is never called for filtered items.
    // If called with a "Members Free RSVP" title, it will attempt to parse it
    // and either return an event or a ParseError depending on the description.
});
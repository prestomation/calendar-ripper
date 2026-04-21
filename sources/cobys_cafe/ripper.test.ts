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

    test('parses Small Dog Meetup event correctly', () => {
        const data = loadSampleData();
        const product = data.products['466'];
        const html = makeProductHtml(product.title, product.description);
        const event = ripper.parseProductHtml(html, 'https://www.cobyscafe.com/product/x/466', new Set());

        expect(event).not.toBeNull();
        expect(event!.summary).toBe('Small Dog Meetup - General Ticket');
        expect(event!.date.monthValue()).toBe(4);
        expect(event!.date.dayOfMonth()).toBe(24);
        expect(event!.date.hour()).toBe(17);
        expect(event!.date.minute()).toBe(0);
        expect(event!.duration.toMinutes()).toBe(90);
        expect(event!.location).toContain('101 Nickerson St');
        expect(event!.url).toBe('https://www.cobyscafe.com/product/x/466');
    });

    test('parses Cinco de Mayo Fiesta event correctly', () => {
        const data = loadSampleData();
        const product = data.products['464'];
        const html = makeProductHtml(product.title, product.description);
        const event = ripper.parseProductHtml(html, 'https://www.cobyscafe.com/product/x/464', new Set());

        expect(event).not.toBeNull();
        expect(event!.summary).toBe('Cinco de Mayo Fiesta for One Human + One Dog');
        expect(event!.date.monthValue()).toBe(5);
        expect(event!.date.dayOfMonth()).toBe(1);
        expect(event!.date.hour()).toBe(18);
        expect(event!.duration.toHours()).toBe(2);
    });

    test('skips Members Free RSVP events', () => {
        const data = loadSampleData();
        const product = data.products['467'];
        const html = makeProductHtml(product.title, product.description);
        const event = ripper.parseProductHtml(html, 'https://www.cobyscafe.com/product/x/467', new Set());
        expect(event).toBeNull();
    });

    test('skips events with no title (bare site name)', () => {
        const data = loadSampleData();
        const product = data.products['UXI3YOKPLBJDGEX2ROHQU2IR'];
        const html = makeProductHtml(product.title, product.description);
        const event = ripper.parseProductHtml(html, 'https://www.cobyscafe.com/product/x/UXI3YOKPLBJDGEX2ROHQU2IR', new Set());
        expect(event).toBeNull();
    });

    test('skips events with no parseable date in description', () => {
        const html = makeProductHtml("Mother's Day Bouquet Workshop | Coby's Cafe",
            "Get ready for Mother's Day with our hands-on bouquet workshop");
        const event = ripper.parseProductHtml(html, 'https://www.cobyscafe.com/product/x/470', new Set());
        expect(event).toBeNull();
    });

    test('skips events where end time is before start time (invalid range)', () => {
        // "9pm-6pm" → 21:00 start, 18:00 end → negative duration
        const html = makeProductHtml('Bad Time Event | Coby\'s Cafe',
            'Join us on May 15 from 9pm-6pm for an event');
        const event = ripper.parseProductHtml(html, 'https://www.cobyscafe.com/product/x/999', new Set());
        expect(event).toBeNull();
    });

    test('deduplicates events at same date+time', () => {
        const data = loadSampleData();
        const seen = new Set<string>();

        // Cinco de Mayo: two ticket types for the same May 1, 6pm event
        const html464 = makeProductHtml(data.products['464'].title, data.products['464'].description);
        const html465 = makeProductHtml(data.products['465'].title, data.products['465'].description);

        const event1 = ripper.parseProductHtml(html464, 'https://www.cobyscafe.com/product/x/464', seen);
        const event2 = ripper.parseProductHtml(html465, 'https://www.cobyscafe.com/product/x/465', seen);

        expect(event1).not.toBeNull();
        expect(event2).toBeNull();
    });

    test('returns null for empty HTML', () => {
        const event = ripper.parseProductHtml('', 'https://example.com', new Set());
        expect(event).toBeNull();
    });
});

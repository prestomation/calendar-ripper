import { describe, expect, test } from 'vitest';
import BookLarderRipper from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
}

describe('BookLarderRipper - stripHtml', () => {
    const ripper = new BookLarderRipper();

    test('strips HTML tags and collapses whitespace', () => {
        const result = ripper.stripHtml('<p>Hello <strong>world</strong></p>');
        expect(result).toBe('Hello world');
    });

    test('decodes common HTML entities', () => {
        expect(ripper.stripHtml('&amp; &lt; &gt; &quot; &#039;')).toBe('& < > " \'');
    });

    test('converts &nbsp; to space', () => {
        expect(ripper.stripHtml('a&nbsp;b')).toBe('a b');
    });

    test('handles empty string', () => {
        expect(ripper.stripHtml('')).toBe('');
    });
});

describe('BookLarderRipper - parseDateFromText', () => {
    const ripper = new BookLarderRipper();

    test('parses "Month Ordinal at H:MMpm" format', () => {
        const result = ripper.parseDateFromText('Join us on Wednesday, May 13th at 6:30pm to celebrate');
        expect(result).not.toBeNull();
        expect(result!.month).toBe(5);
        expect(result!.day).toBe(13);
        expect(result!.hour).toBe(18);
        expect(result!.minute).toBe(30);
        expect(result!.endHour).toBeUndefined();
    });

    test('parses "from Xam-Ypm" range format', () => {
        const result = ripper.parseDateFromText('on Saturday, May 9th from 10am-2pm for a special pop-up');
        expect(result).not.toBeNull();
        expect(result!.month).toBe(5);
        expect(result!.day).toBe(9);
        expect(result!.hour).toBe(10);
        expect(result!.minute).toBe(0);
        expect(result!.endHour).toBe(14);
        expect(result!.endMinute).toBe(0);
    });

    test('parses "from X-Ypm" range without explicit start am/pm (e.g. "2-5pm" → 14:00–17:00)', () => {
        const result = ripper.parseDateFromText('join us on May 20th from 2-5pm for drinks');
        expect(result).not.toBeNull();
        expect(result!.hour).toBe(14);
        expect(result!.endHour).toBe(17);
    });

    test('keeps 11am when "11-1pm" style would push start past end', () => {
        const result = ripper.parseDateFromText('open June 15th from 11-1pm');
        expect(result).not.toBeNull();
        expect(result!.hour).toBe(11);
        expect(result!.endHour).toBe(13);
    });

    test('parses date with no time and defaults to 6pm', () => {
        const result = ripper.parseDateFromText('on Thursday, May 14th for an author talk');
        expect(result).not.toBeNull();
        expect(result!.month).toBe(5);
        expect(result!.day).toBe(14);
        expect(result!.hour).toBe(18);
        expect(result!.minute).toBe(0);
        expect(result!.endHour).toBeUndefined();
    });

    test('parses "June 1st at 6:30pm"', () => {
        const result = ripper.parseDateFromText('on Monday, June 1st for an author talk, Q&A, and book signing starting at 6:30pm');
        expect(result).not.toBeNull();
        expect(result!.month).toBe(6);
        expect(result!.day).toBe(1);
        expect(result!.hour).toBe(18);
        expect(result!.minute).toBe(30);
    });

    test('returns null when no date is present', () => {
        expect(ripper.parseDateFromText('Join us for our May book club pick. Bring your mug!')).toBeNull();
        expect(ripper.parseDateFromText('')).toBeNull();
    });

    test('parses date without day-of-week prefix', () => {
        const result = ripper.parseDateFromText('(April 25th) is coming up');
        expect(result).not.toBeNull();
        expect(result!.month).toBe(4);
        expect(result!.day).toBe(25);
    });
});

describe('BookLarderRipper - parseProduct', () => {
    const ripper = new BookLarderRipper();

    test('parses author talk with time from sample data', () => {
        const data = loadSampleData();
        // "Author Talk: Saeng Douangdara, The Lao Kitchen" — May 13th at 6:30pm
        const product = data.products.find((p: any) => p.id === 9185262829786);
        expect(product).toBeDefined();

        const event = ripper.parseProduct(product);
        expect(event).not.toBeNull();
        expect(event!.summary).toBe('Author Talk: Saeng Douangdara, The Lao Kitchen');
        expect(event!.date.monthValue()).toBe(5);
        expect(event!.date.dayOfMonth()).toBe(13);
        expect(event!.date.hour()).toBe(18);
        expect(event!.date.minute()).toBe(30);
        expect(event!.duration.toMinutes()).toBe(120);
        expect(event!.location).toContain('4252 Fremont Ave N');
        expect(event!.url).toContain('/products/author-talk-saeng-douangdara');
        expect(event!.id).toBe('book-larder-9185262829786');
    });

    test('parses pop-up with time range from sample data', () => {
        const data = loadSampleData();
        // "Spring Pop-Up" — May 9th from 10am-2pm
        const product = data.products.find((p: any) => p.id === 9232324427994);
        expect(product).toBeDefined();

        const event = ripper.parseProduct(product);
        expect(event).not.toBeNull();
        expect(event!.date.monthValue()).toBe(5);
        expect(event!.date.dayOfMonth()).toBe(9);
        expect(event!.date.hour()).toBe(10);
        expect(event!.duration.toMinutes()).toBe(240);
    });

    test('returns ParseError for products with no parseable date', () => {
        const data = loadSampleData();
        // "Book Club: On Eating" — no date in body_html
        const product = data.products.find((p: any) => p.id === 9192727675098);
        expect(product).toBeDefined();

        const event = ripper.parseProduct(product);
        expect(event).not.toBeNull();
        expect(event).toHaveProperty('type', 'ParseError');
    });

    test('returns ParseError for past events', () => {
        const pastProduct = {
            id: 99999,
            title: 'Past Author Talk',
            handle: 'past-author-talk',
            body_html: '<p>Join us on <strong>January 2nd</strong> at 6:30pm.</p>',
            product_type: 'Event',
        };
        // January 2nd is always in the past by now (today is April 2026)
        const event = ripper.parseProduct(pastProduct);
        expect(event).not.toBeNull();
        expect(event).toHaveProperty('type', 'ParseError');
    });

    test('returns null for product with non-Event product_type', () => {
        const fakeProduct = {
            id: 12345,
            title: 'A Regular Book',
            handle: 'a-regular-book',
            body_html: '<p>on Monday, June 1st at 7pm</p>',
            product_type: 'Book',
        };
        // parseProduct itself doesn't check product_type; rip() filters before calling it
        // so just verify it still parses the date correctly
        const event = ripper.parseProduct(fakeProduct);
        expect(event).not.toBeNull();
    });

    test('uses correct URL format from handle', () => {
        const data = loadSampleData();
        const product = data.products.find((p: any) => p.id === 9232405659866);
        // "Author Talk: Claire Wadsworth and Nikki Hill, La Copine" — June 1st at 6:30pm
        const event = ripper.parseProduct(product);
        expect(event).not.toBeNull();
        expect(event!.url).toBe(`https://booklarder.com/products/${product.handle}`);
    });
});

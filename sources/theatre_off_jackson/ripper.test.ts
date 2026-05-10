import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LocalDateTime, ZoneId, ZonedDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import { parseEventDate, parseHomepage, parseShowPage, LOCATION } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSample(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

const PACIFIC = ZoneId.of('America/Los_Angeles');
// Fixed "now": May 28, 2026 noon PT — before all Sally Ride shows (May 29+)
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 5, 28, 12, 0), PACIFIC);

describe('parseEventDate', () => {
    it('parses a standard PM date-time string', () => {
        const dt = parseEventDate('Friday, May 29, 2026, 7:30PM');
        expect(dt).not.toBeNull();
        expect(dt!.year()).toBe(2026);
        expect(dt!.monthValue()).toBe(5);
        expect(dt!.dayOfMonth()).toBe(29);
        expect(dt!.hour()).toBe(19);
        expect(dt!.minute()).toBe(30);
    });

    it('parses a noon PM date-time correctly (12 PM = 12:00)', () => {
        const dt = parseEventDate('Saturday, June 1, 2026, 12:00PM');
        expect(dt).not.toBeNull();
        expect(dt!.hour()).toBe(12);
    });

    it('parses a midnight AM date-time correctly (12 AM = 0:00)', () => {
        const dt = parseEventDate('Sunday, June 7, 2026, 12:00AM');
        expect(dt).not.toBeNull();
        expect(dt!.hour()).toBe(0);
    });

    it('returns null for a malformed string', () => {
        expect(parseEventDate('not a date')).toBeNull();
        expect(parseEventDate('')).toBeNull();
    });
});

describe('parseHomepage', () => {
    const html = loadSample('sample-homepage.html');

    it('extracts unique show URLs', () => {
        const urls = parseHomepage(html);
        expect(urls.length).toBeGreaterThan(0);
        expect(urls.every(u => u.includes('/event/'))).toBe(true);
    });

    it('deduplicates links that appear in both listings', () => {
        const urls = parseHomepage(html);
        const unique = new Set(urls);
        expect(urls.length).toBe(unique.size);
    });

    it('includes all three shows from sample', () => {
        const urls = parseHomepage(html);
        expect(urls.some(u => u.includes('orlando'))).toBe(true);
        expect(urls.some(u => u.includes('sally-ride'))).toBe(true);
        expect(urls.some(u => u.includes('salon-of-shame'))).toBe(true);
    });
});

describe('parseShowPage', () => {
    const html = loadSample('sample-show.html');

    it('extracts the show title', () => {
        const { title } = parseShowPage(html, 'https://theatreoffjackson.org/event/sally-ride/');
        expect(title).toBe('Sally Ride');
    });

    it('extracts all 8 performance dates', () => {
        const { dates } = parseShowPage(html, 'https://theatreoffjackson.org/event/sally-ride/');
        expect(dates).toHaveLength(8);
    });

    it('returns ParseError for malformed date elements', () => {
        const badHtml = `
            <div class="vem-single-event-title">Bad Show</div>
            <div class="vem-single-event-date-start">not a valid date</div>
        `;
        const { errors, dates } = parseShowPage(badHtml, 'https://theatreoffjackson.org/event/bad/');
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        expect(dates).toHaveLength(0);
    });

    it('returns null title when title element is missing', () => {
        const html = '<div class="vem-single-event-date-start">Friday, May 29, 2026, 7:30PM</div>';
        const { title } = parseShowPage(html, 'https://theatreoffjackson.org/event/unknown/');
        expect(title).toBeNull();
    });
});

describe('LOCATION', () => {
    it('includes the correct address', () => {
        expect(LOCATION).toContain('409 7th Ave S');
        expect(LOCATION).toContain('Seattle');
    });
});

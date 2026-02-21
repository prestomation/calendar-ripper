import { describe, expect, test } from 'vitest';
import BurkeMuseumRipper from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'node-html-parser';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml() {
    const htmlPath = path.join(__dirname, 'sample-data.html');
    return parse(fs.readFileSync(htmlPath, 'utf8'));
}

const testDate = ZonedDateTime.parse('2026-02-21T00:00:00-08:00[America/Los_Angeles]');

describe('Burke Museum Ripper', () => {
    test('parses events from sample data', async () => {
        const ripper = new BurkeMuseumRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        // 11 total cards, minus "Fossil Finders" (monthly, vague)
        // "Free First Thursday" is synthesized into 2 concrete events (Mar 5, Apr 2 — Feb 5 is before test date)
        expect(validEvents.length).toBe(11);
    });

    test('parses event with specific date and time range', async () => {
        const ripper = new BurkeMuseumRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const quiocho = validEvents.find(e => e.summary.includes('Trenton Quiocho'));
        expect(quiocho).toBeDefined();
        expect(quiocho!.date.year()).toBe(2026);
        expect(quiocho!.date.monthValue()).toBe(2);
        expect(quiocho!.date.dayOfMonth()).toBe(23);
        expect(quiocho!.date.hour()).toBe(17); // 5 p.m.
        expect(quiocho!.duration.toHours()).toBe(3); // 5–8 p.m. = 3 hours
    });

    test('parses event with single time (no end time)', async () => {
        const ripper = new BurkeMuseumRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const authorTalk = validEvents.find(e => e.summary.includes('Street Trees'));
        expect(authorTalk).toBeDefined();
        expect(authorTalk!.date.year()).toBe(2026);
        expect(authorTalk!.date.monthValue()).toBe(5);
        expect(authorTalk!.date.dayOfMonth()).toBe(14);
        expect(authorTalk!.date.hour()).toBe(18); // 6 p.m.
        expect(authorTalk!.duration.toHours()).toBe(2); // default duration
    });

    test('parses event with AM time range', async () => {
        const ripper = new BurkeMuseumRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const microfossil = validEvents.find(e => e.summary.includes('Microfossil'));
        expect(microfossil).toBeDefined();
        expect(microfossil!.date.hour()).toBe(10); // 10 a.m.
        expect(microfossil!.duration.toMinutes()).toBe(45); // 10–10:45 a.m.
    });

    test('parses full-day event with AM–PM time range', async () => {
        const ripper = new BurkeMuseumRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const dinoFest = validEvents.find(e => e.summary.includes('Dino Fest'));
        expect(dinoFest).toBeDefined();
        expect(dinoFest!.date.year()).toBe(2026);
        expect(dinoFest!.date.monthValue()).toBe(4);
        expect(dinoFest!.date.dayOfMonth()).toBe(26);
        expect(dinoFest!.date.hour()).toBe(10); // 10 a.m.
        expect(dinoFest!.duration.toHours()).toBe(7); // 10 a.m. – 5 p.m.
    });

    test('parses date range events using start date', async () => {
        const ripper = new BurkeMuseumRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const shapes = validEvents.find(e => e.summary.includes('Shapes and Patterns'));
        expect(shapes).toBeDefined();
        expect(shapes!.date.year()).toBe(2026);
        expect(shapes!.date.monthValue()).toBe(1);
        expect(shapes!.date.dayOfMonth()).toBe(6);
    });

    test('skips vague recurring date events but synthesizes Free First Thursday', async () => {
        const ripper = new BurkeMuseumRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // "Fossil Finders" has "Monthly event — see each listing for specific date" — truly vague, skipped
        const fossil = validEvents.find(e => e.summary === 'Fossil Finders');
        expect(fossil).toBeUndefined();

        // "Free First Thursday" is synthesized into concrete dated events
        const fftEvents = validEvents.filter(e => e.summary === 'Free First Thursday');
        expect(fftEvents.length).toBe(2); // Mar 5 and Apr 2 (Feb 5 is before test date of Feb 21)

        // First Thursday of March 2026 is March 5
        const marchFft = fftEvents.find(e => e.date.monthValue() === 3);
        expect(marchFft).toBeDefined();
        expect(marchFft!.date.dayOfMonth()).toBe(5);
        expect(marchFft!.date.hour()).toBe(10); // 10 a.m.
        expect(marchFft!.duration.toHours()).toBe(10); // 10 a.m. – 8 p.m.
        expect(marchFft!.description).toContain('FREE ADMISSION');
    });

    test('all events have required fields', async () => {
        const ripper = new BurkeMuseumRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const event of validEvents) {
            expect(event.ripped).toBeInstanceOf(Date);
            expect(event.date).toBeDefined();
            expect(event.duration).toBeDefined();
            expect(event.summary).toBeTruthy();
            expect(event.id).toBeTruthy();
            expect(event.id).toMatch(/^burke-/);
            expect(event.url).toContain('burkemuseum.org');
            expect(event.location).toContain('Burke Museum');
        }
    });

    test('extracts category badge into description', async () => {
        const ripper = new BurkeMuseumRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const burkeOlogy = validEvents.find(e => e.summary === 'Burke-ology');
        expect(burkeOlogy).toBeDefined();
        expect(burkeOlogy!.description).toContain('Fundraising event');
    });

    test('deduplicates events across multiple parseEvents calls', async () => {
        const ripper = new BurkeMuseumRipper();
        const html = loadSampleHtml();

        const firstCall = await ripper.parseEvents(html, testDate, {});
        const secondCall = await ripper.parseEvents(html, testDate, {});

        const firstEvents = firstCall.filter(e => 'summary' in e);
        const secondEvents = secondCall.filter(e => 'summary' in e);

        expect(firstEvents.length).toBeGreaterThan(0);
        expect(secondEvents.length).toBe(0);
    });

    test('extracts image URLs', async () => {
        const ripper = new BurkeMuseumRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const dinoFest = validEvents.find(e => e.summary.includes('Dino Fest'));
        expect(dinoFest).toBeDefined();
        expect(dinoFest!.image).toContain('burkemuseum.org');
        expect(dinoFest!.image).toContain('dinofest');
    });

    test('handles empty HTML gracefully', async () => {
        const ripper = new BurkeMuseumRipper();
        const html = parse('<html><body></body></html>');

        const events = await ripper.parseEvents(html, testDate, {});
        expect(events.length).toBe(0);
    });
});

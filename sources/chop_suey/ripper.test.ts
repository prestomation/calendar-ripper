import { describe, expect, test } from 'vitest';
import ChopSueyRipper from './ripper.js';
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

const testDate = ZonedDateTime.parse('2026-02-12T00:00:00-08:00[America/Los_Angeles]');

describe('Chop Suey Ripper', () => {
    test('parses events from sample data', async () => {
        const ripper = new ChopSueyRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(validEvents.length).toBe(5);
    });

    test('parses event with doors time correctly', async () => {
        const ripper = new ChopSueyRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // First event: Sunbather Die - has doors time
        const sunbather = validEvents.find(e => e.summary.includes('Sunbather Die'));
        expect(sunbather).toBeDefined();
        expect(sunbather!.id).toBe('chopsuey-15782');
        expect(sunbather!.date.year()).toBe(2026);
        expect(sunbather!.date.monthValue()).toBe(2);
        expect(sunbather!.date.dayOfMonth()).toBe(12);
        expect(sunbather!.date.hour()).toBe(20); // Show: 8:00 PM
        expect(sunbather!.date.minute()).toBe(0);
        expect(sunbather!.description).toContain('Doors: 7:00 PM');
        expect(sunbather!.location).toContain('Chop Suey');
        expect(sunbather!.url).toBe('https://chopsuey.com/tm-event/sunbather-die-tiger-penis-bhodie-boys/');
    });

    test('parses event without doors time', async () => {
        const ripper = new ChopSueyRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Second event: Sorry For Party Rocking - no doors time
        const partyRocking = validEvents.find(e => e.summary.includes('Sorry For Party Rocking'));
        expect(partyRocking).toBeDefined();
        expect(partyRocking!.date.hour()).toBe(21); // Show: 9:00 PM
        expect(partyRocking!.description).not.toContain('Doors');
    });

    test('decodes HTML entities in titles', async () => {
        const ripper = new ChopSueyRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // "Sorry For Party Rocking (2010 &#8211; 2015 Pop &amp; EDM Bangers All Night Long)"
        const partyRocking = validEvents.find(e => e.summary.includes('Sorry For Party Rocking'));
        expect(partyRocking).toBeDefined();
        expect(partyRocking!.summary).toContain('\u2013'); // decoded &#8211; (en-dash)
        expect(partyRocking!.summary).toContain('&'); // decoded &amp;
        expect(partyRocking!.summary).not.toContain('&amp;');
    });

    test('handles multiple events on same date', async () => {
        const ripper = new ChopSueyRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Feb 14 has two events: Love Shack and KILL CUPID
        const feb14Events = validEvents.filter(e => e.date.dayOfMonth() === 14);
        expect(feb14Events.length).toBe(2);

        const loveShack = feb14Events.find(e => e.summary === 'Love Shack');
        expect(loveShack).toBeDefined();
        expect(loveShack!.date.hour()).toBe(16); // Show: 4:00 PM

        const killCupid = feb14Events.find(e => e.summary.includes('KILL CUPID'));
        expect(killCupid).toBeDefined();
        expect(killCupid!.date.hour()).toBe(21); // Show: 9:00 PM
    });

    test('deduplicates events across multiple parseEvents calls', async () => {
        const ripper = new ChopSueyRipper();
        const html = loadSampleHtml();

        const firstCall = await ripper.parseEvents(html, testDate, {});
        const secondCall = await ripper.parseEvents(html, testDate, {});

        const firstEvents = firstCall.filter(e => 'summary' in e);
        const secondEvents = secondCall.filter(e => 'summary' in e);

        expect(firstEvents.length).toBe(5);
        expect(secondEvents.length).toBe(0);
    });

    test('all events have required fields', async () => {
        const ripper = new ChopSueyRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const event of validEvents) {
            expect(event.ripped).toBeInstanceOf(Date);
            expect(event.date).toBeDefined();
            expect(event.duration).toBeDefined();
            expect(event.summary).toBeTruthy();
            expect(event.id).toBeTruthy();
            expect(event.id).toMatch(/^chopsuey-\d+$/);
            expect(event.url).toBeTruthy();
            expect(event.location).toContain('Chop Suey');
            expect(event.duration.toHours()).toBe(3);
        }
    });

    test('extracts ticket URLs from dialog divs', async () => {
        const ripper = new ChopSueyRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const sunbather = validEvents.find(e => e.summary.includes('Sunbather Die'));
        expect(sunbather).toBeDefined();
        expect(sunbather!.description).toContain('ticketweb.com');
    });

    test('handles empty HTML gracefully', async () => {
        const ripper = new ChopSueyRipper();
        const html = parse('<html><body></body></html>');

        const events = await ripper.parseEvents(html, testDate, {});
        expect(events.length).toBe(0);
    });
});

import { describe, expect, test } from 'vitest';
import Hz19Ripper, { parseTimeCell } from './ripper.js';
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

const testDate = ZonedDateTime.parse('2026-02-19T00:00:00-08:00[America/Los_Angeles]');

describe('parseTimeCell', () => {
    test('parses simple pm time with no end', () => {
        const result = parseTimeCell('Thu: Feb 19 (8pm)');
        expect(result.hour).toBe(20);
        expect(result.minute).toBe(0);
        expect(result.durationMinutes).toBe(180);
    });

    test('parses range with no minutes', () => {
        const result = parseTimeCell('Thu: Feb 19 (6pm-10pm)');
        expect(result.hour).toBe(18);
        expect(result.minute).toBe(0);
        expect(result.durationMinutes).toBe(240);
    });

    test('parses range with minutes', () => {
        const result = parseTimeCell('Thu: Feb 19 (6:30pm-9:30pm)');
        expect(result.hour).toBe(18);
        expect(result.minute).toBe(30);
        expect(result.durationMinutes).toBe(180);
    });

    test('parses range crossing midnight', () => {
        const result = parseTimeCell('Fri: Feb 20 (10pm-2am)');
        expect(result.hour).toBe(22);
        expect(result.minute).toBe(0);
        expect(result.durationMinutes).toBe(240);
    });

    test('parses am start time', () => {
        const result = parseTimeCell('Sat: Feb 21 (10am-2pm)');
        expect(result.hour).toBe(10);
        expect(result.minute).toBe(0);
        expect(result.durationMinutes).toBe(240);
    });
});

describe('19hz Ripper', () => {
    test('parses events from sample HTML', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(6);
    });

    test('parses event title and URL', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const sempa = validEvents.find(e => e.summary.includes('SEMPA'));
        expect(sempa).toBeDefined();
        expect(sempa!.summary).toBe('SEMPA: Clayton the Chemist');
        expect(sempa!.url).toContain('facebook.com');
    });

    test('parses date correctly', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const sempa = validEvents.find(e => e.summary.includes('SEMPA'));
        expect(sempa!.date.year()).toBe(2026);
        expect(sempa!.date.monthValue()).toBe(2);
        expect(sempa!.date.dayOfMonth()).toBe(19);
    });

    test('parses time range without minutes correctly', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Otoconia: (6pm-10pm)
        const otoconia = validEvents.find(e => e.summary.includes('Otoconia'));
        expect(otoconia).toBeDefined();
        expect(otoconia!.date.hour()).toBe(18);
        expect(otoconia!.date.minute()).toBe(0);
        expect(otoconia!.duration.toMinutes()).toBe(240);
    });

    test('parses time range with minutes correctly', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // SEMPA: (6:30pm-9:30pm) = 3 hours
        const sempa = validEvents.find(e => e.summary.includes('SEMPA'));
        expect(sempa!.date.hour()).toBe(18);
        expect(sempa!.date.minute()).toBe(30);
        expect(sempa!.duration.toMinutes()).toBe(180);
    });

    test('parses event with no end time using default 3h duration', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Magic City Hippies: (8pm) — no end time, default 3h
        const magicCity = validEvents.find(e => e.summary.includes('Magic City Hippies'));
        expect(magicCity).toBeDefined();
        expect(magicCity!.date.hour()).toBe(20);
        expect(magicCity!.duration.toMinutes()).toBe(180);
    });

    test('extracts venue from event cell', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const heatwav = validEvents.find(e => e.summary === 'HEAT.WAV');
        expect(heatwav).toBeDefined();
        expect(heatwav!.location).toBe('Substation');
    });

    test('returns events across multiple dates', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const feb19 = validEvents.filter(e => e.date.dayOfMonth() === 19);
        const feb20 = validEvents.filter(e => e.date.dayOfMonth() === 20);

        expect(feb19.length).toBe(4);
        expect(feb20.length).toBe(2);
    });

    test('deduplicates events across multiple parseEvents calls', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const firstCall = await ripper.parseEvents(html, testDate, {});
        const secondCall = await ripper.parseEvents(html, testDate, {});

        const firstEvents = firstCall.filter(e => 'summary' in e);
        const secondEvents = secondCall.filter(e => 'summary' in e);

        expect(firstEvents.length).toBe(6);
        expect(secondEvents.length).toBe(0);
    });

    test('all events have required fields', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const event of validEvents) {
            expect(event.ripped).toBeInstanceOf(Date);
            expect(event.date).toBeDefined();
            expect(event.duration).toBeDefined();
            expect(event.summary).toBeTruthy();
            expect(event.id).toMatch(/^19hz-\d{4}\/\d{2}\/\d{2}-.+/);
        }
    });

    test('handles empty HTML gracefully', async () => {
        const ripper = new Hz19Ripper();
        const html = parse('<html><body><table></table></body></html>');

        const events = await ripper.parseEvents(html, testDate, {});
        expect(events.length).toBe(0);
    });

    test('skips rows without machine-readable date', async () => {
        const ripper = new Hz19Ripper();
        const html = parse(`<html><body><table>
            <tr><th>Date</th><th>Event</th><th>Genre</th><th>Price</th><th>Promoter</th><th>Links</th><th>Sort</th></tr>
        </table></body></html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        expect(events.length).toBe(0);
    });
});

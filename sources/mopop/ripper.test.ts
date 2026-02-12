import { describe, expect, test } from 'vitest';
import { readFile } from 'fs/promises';
import { parse } from 'node-html-parser';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import { RipperCalendarEvent } from '../../lib/config/schema.js';
import MopopRipper from './ripper.js';

describe('MopopRipper', () => {
    test('should extract events from sample HTML', async () => {
        const htmlData = await readFile('sources/mopop/sample-data.html');
        const htmlDoc = parse(htmlData.toString());

        const testDate = ZonedDateTime.of(2026, 2, 12, 12, 0, 0, 0, ZoneId.of('America/Los_Angeles'));

        const ripper = new MopopRipper();
        const events = await ripper.parseEvents(htmlDoc, testDate, {});

        const calendarEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(calendarEvents.length).toBeGreaterThan(0);
        expect(calendarEvents.length).toBe(19);
    });

    test('should parse event titles correctly', async () => {
        const htmlData = await readFile('sources/mopop/sample-data.html');
        const htmlDoc = parse(htmlData.toString());

        const testDate = ZonedDateTime.of(2026, 2, 12, 12, 0, 0, 0, ZoneId.of('America/Los_Angeles'));

        const ripper = new MopopRipper();
        const events = await ripper.parseEvents(htmlDoc, testDate, {});

        const calendarEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const titles = calendarEvents.map(e => e.summary);
        expect(titles).toContain('Sound Off! - Showcase #1');
        expect(titles).toContain('Icons of Pop Culture Gala');
        expect(titles).toContain('Stardew Valley Supper Fan Club');
    });

    test('should parse dates correctly', async () => {
        const htmlData = await readFile('sources/mopop/sample-data.html');
        const htmlDoc = parse(htmlData.toString());

        const testDate = ZonedDateTime.of(2026, 2, 12, 12, 0, 0, 0, ZoneId.of('America/Los_Angeles'));

        const ripper = new MopopRipper();
        const events = await ripper.parseEvents(htmlDoc, testDate, {});

        const calendarEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const soundOff = calendarEvents.find(e => e.summary === 'Sound Off! - Showcase #1');
        expect(soundOff).toBeDefined();
        expect(soundOff!.date.year()).toBe(2026);
        expect(soundOff!.date.monthValue()).toBe(2);
        expect(soundOff!.date.dayOfMonth()).toBe(14);
    });

    test('should set location to Museum of Pop Culture', async () => {
        const htmlData = await readFile('sources/mopop/sample-data.html');
        const htmlDoc = parse(htmlData.toString());

        const testDate = ZonedDateTime.of(2026, 2, 12, 12, 0, 0, 0, ZoneId.of('America/Los_Angeles'));

        const ripper = new MopopRipper();
        const events = await ripper.parseEvents(htmlDoc, testDate, {});

        const calendarEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        for (const event of calendarEvents) {
            expect(event.location).toContain('Museum of Pop Culture');
            expect(event.location).toContain('325 5th Ave N');
        }
    });

    test('should generate correct URLs', async () => {
        const htmlData = await readFile('sources/mopop/sample-data.html');
        const htmlDoc = parse(htmlData.toString());

        const testDate = ZonedDateTime.of(2026, 2, 12, 12, 0, 0, 0, ZoneId.of('America/Los_Angeles'));

        const ripper = new MopopRipper();
        const events = await ripper.parseEvents(htmlDoc, testDate, {});

        const calendarEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const soundOff = calendarEvents.find(e => e.summary === 'Sound Off! - Showcase #1');
        expect(soundOff).toBeDefined();
        expect(soundOff!.url).toBe('https://www.mopop.org/events/sound-off-showcase-1');
    });

    test('should deduplicate events across multiple parseEvents calls', async () => {
        const htmlData = await readFile('sources/mopop/sample-data.html');
        const htmlDoc = parse(htmlData.toString());

        const testDate = ZonedDateTime.of(2026, 2, 12, 12, 0, 0, 0, ZoneId.of('America/Los_Angeles'));

        const ripper = new MopopRipper();

        const firstEvents = await ripper.parseEvents(htmlDoc, testDate, {});
        const firstCalendarEvents = firstEvents.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(firstCalendarEvents.length).toBe(19);

        const secondEvents = await ripper.parseEvents(htmlDoc, testDate, {});
        const secondCalendarEvents = secondEvents.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(secondCalendarEvents.length).toBe(0);
    });

    test('should handle empty HTML gracefully', async () => {
        const htmlDoc = parse('<html><body></body></html>');

        const testDate = ZonedDateTime.of(2026, 2, 12, 12, 0, 0, 0, ZoneId.of('America/Los_Angeles'));

        const ripper = new MopopRipper();
        const events = await ripper.parseEvents(htmlDoc, testDate, {});

        expect(events.length).toBe(1);
        expect('type' in events[0]).toBe(true);
        if ('type' in events[0]) {
            expect(events[0].type).toBe('ParseError');
        }
    });

    test('should handle items with missing data attributes', async () => {
        const htmlDoc = parse(`
            <html><body>
                <div class="calendar-dot-item" data-title="Test Event" data-date="February 14, 2026">
                    <a href="/events/test-event">Link</a>
                </div>
                <div class="calendar-dot-item">
                </div>
                <div class="calendar-dot-item" data-title="Bad Date Event" data-date="NotADate 99, 9999">
                    <a href="/events/bad-date">Link</a>
                </div>
            </body></html>
        `);

        const testDate = ZonedDateTime.of(2026, 2, 12, 12, 0, 0, 0, ZoneId.of('America/Los_Angeles'));

        const ripper = new MopopRipper();
        const events = await ripper.parseEvents(htmlDoc, testDate, {});

        const calendarEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(calendarEvents.length).toBe(1);
        expect(calendarEvents[0].summary).toBe('Test Event');

        const errors = events.filter(e => 'type' in e);
        expect(errors.length).toBe(1);
    });

    test('should set a 2-hour default duration', async () => {
        const htmlData = await readFile('sources/mopop/sample-data.html');
        const htmlDoc = parse(htmlData.toString());

        const testDate = ZonedDateTime.of(2026, 2, 12, 12, 0, 0, 0, ZoneId.of('America/Los_Angeles'));

        const ripper = new MopopRipper();
        const events = await ripper.parseEvents(htmlDoc, testDate, {});

        const calendarEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        for (const event of calendarEvents) {
            expect(event.duration.toHours()).toBe(2);
        }
    });
});

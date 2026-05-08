import { describe, expect, test } from 'vitest';
import SeattleFwc26Ripper, { parseDateRange, parseTimeRange } from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSample(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

describe('parseDateRange', () => {
    test('single date', () => {
        expect(parseDateRange('May 12')).toEqual({ startMonth: 5, startDay: 12, endMonth: undefined, endDay: undefined });
    });

    test('same start and end date', () => {
        expect(parseDateRange('May 16 - May 16')).toEqual({ startMonth: 5, startDay: 16, endMonth: 5, endDay: 16 });
    });

    test('cross-month date range', () => {
        expect(parseDateRange('May 23 - Sep 7')).toEqual({ startMonth: 5, startDay: 23, endMonth: 9, endDay: 7 });
    });

    test('returns null for empty input', () => {
        expect(parseDateRange('')).toBeNull();
    });
});

describe('parseTimeRange', () => {
    test('AM-AM range', () => {
        expect(parseTimeRange('9:00 AM - 11:30 AM')).toEqual({ startHour: 9, startMinute: 0, endHour: 11, endMinute: 30 });
    });

    test('AM-PM range', () => {
        expect(parseTimeRange('10:00 AM - 5:00 PM')).toEqual({ startHour: 10, startMinute: 0, endHour: 17, endMinute: 0 });
    });

    test('PM-PM range', () => {
        expect(parseTimeRange('7:30 PM - 9:30 PM')).toEqual({ startHour: 19, startMinute: 30, endHour: 21, endMinute: 30 });
    });

    test('lowercase am/pm', () => {
        expect(parseTimeRange('10:00 am - 4:00 pm')).toEqual({ startHour: 10, startMinute: 0, endHour: 16, endMinute: 0 });
    });

    test('returns null with single time', () => {
        expect(parseTimeRange('9:00 AM')).toBeNull();
    });

    test('returns null for empty input', () => {
        expect(parseTimeRange('')).toBeNull();
    });
});

describe('SeattleFwc26Ripper - resolveYear', () => {
    const ripper = new SeattleFwc26Ripper();

    test('matches Saturday May 16 to 2026', () => {
        // May 16, 2026 was a Saturday
        expect(ripper.resolveYear(5, 16, 'Sat')).toBe(2026);
    });

    test('matches Friday May 1 to 2026', () => {
        expect(ripper.resolveYear(5, 1, 'Fri')).toBe(2026);
    });

    test('matches Monday Mar 23 to 2026', () => {
        expect(ripper.resolveYear(3, 23, 'Mon')).toBe(2026);
    });

    test('returns null for invalid dayOfWeek', () => {
        expect(ripper.resolveYear(5, 16, 'Xyz')).toBeNull();
    });
});

describe('SeattleFwc26Ripper - parseListEntries', () => {
    const ripper = new SeattleFwc26Ripper();

    test('extracts slug + day-of-week + month/day from list page', () => {
        const html = loadSample('sample-list.html');
        const entries = ripper.parseListEntries(html);
        expect(entries.length).toBeGreaterThan(0);
        const unityLoop = entries.find(e => e.slug === 'unity-loop-5k');
        expect(unityLoop).toBeDefined();
        expect(unityLoop!.month).toBe(5);
        expect(unityLoop!.day).toBe(16);
        expect(unityLoop!.dayOfWeek).toBe('Sat');
    });
});

describe('SeattleFwc26Ripper - parseEventHtml', () => {
    const ripper = new SeattleFwc26Ripper();

    test('parses single-day event with time range (Unity Loop 5K)', () => {
        const html = loadSample('sample-event-unity-loop.html');
        const result = ripper.parseEventHtml(html, 'https://example.com/unity-loop-5k', {
            slug: 'unity-loop-5k', dayOfWeek: 'Sat', month: 5, day: 16,
        });
        expect('date' in result).toBe(true);
        const ev = result as RipperCalendarEvent;
        expect(ev.summary).toBe('Unity Loop 5K');
        expect(ev.date.year()).toBe(2026);
        expect(ev.date.monthValue()).toBe(5);
        expect(ev.date.dayOfMonth()).toBe(16);
        expect(ev.date.hour()).toBe(9);
        expect(ev.date.minute()).toBe(0);
        // 9:00 AM - 11:30 AM = 2.5 hours
        expect(ev.duration.toMinutes()).toBe(150);
        expect(ev.location).toBe('800 Occidental Ave S');
        expect(ev.description).toMatch(/Hosted by Seattle Sports Commission/);
        expect(ev.image).toMatch(/^https:\/\/cdn\.prod\.website-files\.com\//);
    });

    test('parses event with date range and time range (multiday-with-time)', () => {
        const html = loadSample('sample-event-multiday-with-time.html');
        const result = ripper.parseEventHtml(html, 'https://example.com/the-beautiful-game', {
            slug: 'the-beautiful-game', dayOfWeek: 'Sat', month: 5, day: 23,
        });
        expect('date' in result).toBe(true);
        const ev = result as RipperCalendarEvent;
        expect(ev.summary).toContain('The Beautiful Game');
        expect(ev.date.year()).toBe(2026);
        expect(ev.date.monthValue()).toBe(5);
        expect(ev.date.dayOfMonth()).toBe(23);
        expect(ev.date.hour()).toBe(10);
        // Time range "10am - 5pm" treated as opening-day hours (7h), not full
        // span — a 6-month duration would mark the event as "happening" every
        // day of the run, which is wrong.
        expect(ev.duration.toMinutes()).toBe(7 * 60);
    });

    test('parses event with date range but no time (Ignite)', () => {
        const html = loadSample('sample-event-no-time.html');
        const result = ripper.parseEventHtml(html, 'https://example.com/ignite', {
            slug: 'ignite', dayOfWeek: 'Mon', month: 6, day: 1,
        });
        expect('date' in result).toBe(true);
        const ev = result as RipperCalendarEvent;
        expect(ev.summary).toContain('Ignite Your Team Spirit');
        expect(ev.date.monthValue()).toBe(6);
        expect(ev.date.dayOfMonth()).toBe(1);
        // Default start hour is noon
        expect(ev.date.hour()).toBe(12);
        // Jun 1 – Jul 31 is > 7 days, so duration falls back to the 1h default
        expect(ev.duration.toHours()).toBe(1);
    });

    test('parses event with single date and time range (Ballard FC)', () => {
        const html = loadSample('sample-event-singletime.html');
        const result = ripper.parseEventHtml(html, 'https://example.com/ballard-fc', {
            slug: 'ballard-fc-home-games', dayOfWeek: 'Fri', month: 5, day: 15,
        });
        expect('date' in result).toBe(true);
        const ev = result as RipperCalendarEvent;
        expect(ev.summary).toBe('Ballard FC Home Game');
        expect(ev.date.year()).toBe(2026);
        expect(ev.date.monthValue()).toBe(5);
        expect(ev.date.dayOfMonth()).toBe(15);
        expect(ev.date.hour()).toBe(19);
        expect(ev.date.minute()).toBe(30);
        // 7:30 PM - 9:30 PM = 2 hours
        expect(ev.duration.toMinutes()).toBe(120);
    });
});

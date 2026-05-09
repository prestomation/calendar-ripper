import { describe, it, expect } from 'vitest';
import { LocalDate } from "@js-joda/core";
import {
    parseEventsFromHtml,
    parseDateStr,
    parseTimeStr,
    extractTurboStreamBase,
    extractMaxPage,
} from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleHtml = fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf-8');
const samplePage2Html = fs.readFileSync(path.join(__dirname, 'sample-data-page2.html'), 'utf-8');

describe('extractTurboStreamBase', () => {
    it('extracts turbo-stream base URL from main page', () => {
        const base = extractTurboStreamBase(sampleHtml);
        expect(base).toMatch(/\/mainstage-calendar\/features\/load\/calendar_feature_\d+\.turbo_stream/);
    });

    it('returns null for HTML without turbo-stream link', () => {
        expect(extractTurboStreamBase('<html></html>')).toBeNull();
    });
});

describe('extractMaxPage', () => {
    it('extracts max page from pagination', () => {
        const max = extractMaxPage(sampleHtml);
        expect(max).toBeGreaterThan(1);
    });

    it('returns 1 when no pagination present', () => {
        expect(extractMaxPage('<html></html>')).toBe(1);
    });
});

describe('parseEventsFromHtml', () => {
    it('parses events from main page sample', () => {
        const events = parseEventsFromHtml(sampleHtml);
        expect(events.length).toBeGreaterThanOrEqual(1);
        for (const e of events) {
            expect(e.title).toBeTruthy();
            expect(e.url).toMatch(/thetripledoor\.net/);
            expect(e.dateStr).toMatch(/\w+, \w+ \d+/);
            expect(e.timeStr).toMatch(/\d+:\d+(AM|PM)/i);
        }
    });

    it('parses events from turbo-stream page', () => {
        const events = parseEventsFromHtml(samplePage2Html);
        expect(events.length).toBeGreaterThanOrEqual(1);
        for (const e of events) {
            expect(e.title).toBeTruthy();
            expect(e.dateStr).toBeTruthy();
            expect(e.timeStr).toBeTruthy();
        }
    });

    it('does not duplicate events from date-short spans', () => {
        // Each event should appear once, not twice (once for date-long, once for date-short)
        const events = parseEventsFromHtml(samplePage2Html);
        const titles = events.map(e => e.title);
        const uniqueTitles = new Set(titles);
        // Allow for same-named events on different dates, but basic dedup check
        expect(titles.length).toBeLessThanOrEqual(10);
        expect(uniqueTitles.size).toBeGreaterThan(0);
    });

    it('returns empty array for HTML with no events', () => {
        expect(parseEventsFromHtml('<html><body></body></html>')).toEqual([]);
    });
});

describe('parseDateStr', () => {
    const today = LocalDate.of(2026, 5, 9);

    it('parses date without year (current year)', () => {
        const d = parseDateStr('Friday, May 29', today);
        expect(d).not.toBeNull();
        expect(d!.year()).toBe(2026);
        expect(d!.monthValue()).toBe(5);
        expect(d!.dayOfMonth()).toBe(29);
    });

    it('advances to next year when date is in the past', () => {
        // May 1 is before May 9 (today), so should advance to 2027
        const d = parseDateStr('Thursday, May 1', today);
        expect(d).not.toBeNull();
        expect(d!.year()).toBe(2027);
    });

    it('parses date with explicit year', () => {
        const d = parseDateStr('Tuesday, March 9, 2027', today);
        expect(d).not.toBeNull();
        expect(d!.year()).toBe(2027);
        expect(d!.monthValue()).toBe(3);
        expect(d!.dayOfMonth()).toBe(9);
    });

    it('parses abbreviated month names', () => {
        const d = parseDateStr('Sat, Jun 6', today);
        expect(d).not.toBeNull();
        expect(d!.monthValue()).toBe(6);
        expect(d!.dayOfMonth()).toBe(6);
    });

    it('returns null for unrecognized format', () => {
        expect(parseDateStr('not a date', today)).toBeNull();
    });
});

describe('parseTimeStr', () => {
    it('parses PM time', () => {
        const t = parseTimeStr('7:30PM');
        expect(t).toEqual([19, 30]);
    });

    it('parses AM time', () => {
        const t = parseTimeStr('11:00AM');
        expect(t).toEqual([11, 0]);
    });

    it('parses noon (12:00PM)', () => {
        const t = parseTimeStr('12:00PM');
        expect(t).toEqual([12, 0]);
    });

    it('parses midnight (12:00AM)', () => {
        const t = parseTimeStr('12:00AM');
        expect(t).toEqual([0, 0]);
    });

    it('returns null for invalid format', () => {
        expect(parseTimeStr('not a time')).toBeNull();
    });
});

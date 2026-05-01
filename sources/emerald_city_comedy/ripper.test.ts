import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZoneId } from "@js-joda/core";
import '@js-joda/timezone';
import { parseEventsFromHtml, parseStartDate, parseDurationMinutes } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACIFIC = ZoneId.of('America/Los_Angeles');

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-events.html'), 'utf8');
}

describe('parseEventsFromHtml', () => {
    it('extracts Event JSON-LD blocks from the listing page', () => {
        const results = parseEventsFromHtml(loadSampleHtml());
        const events = results.filter(r => !('type' in r));
        expect(events.length).toBeGreaterThanOrEqual(3);
    });

    it('skips non-Event JSON-LD types like Organization', () => {
        const results = parseEventsFromHtml(loadSampleHtml());
        const events = results.filter(r => !('type' in r));
        expect(events.every(e => !('type' in e) && (e as any)['@type'] === 'Event')).toBe(true);
    });

    it('extracts event name and startDate', () => {
        const results = parseEventsFromHtml(loadSampleHtml());
        const events = results.filter(r => !('type' in r)) as any[];
        const tosh = events.find(e => e.name.includes('Daniel Tosh'));
        expect(tosh).toBeDefined();
        expect(tosh.startDate).toBe('2026-05-15T19:30:00-07:00');
    });

    it('extracts optional fields: url, image, endDate, eventStatus', () => {
        const results = parseEventsFromHtml(loadSampleHtml());
        const events = results.filter(r => !('type' in r)) as any[];
        const tosh = events.find(e => e.name.includes('Daniel Tosh'));
        expect(tosh.url).toContain('seatengine.com');
        expect(tosh.image).toContain('cdn.seatengine.com');
        expect(tosh.endDate).toBe('2026-05-15T21:30:00-07:00');
        expect(tosh.eventStatus).toBe('https://schema.org/EventScheduled');
    });

    it('returns ParseError for malformed JSON-LD', () => {
        const html = '<script type="application/ld+json">{bad json}</script>';
        const results = parseEventsFromHtml(html);
        expect(results.length).toBe(1);
        expect('type' in results[0]).toBe(true);
        expect((results[0] as any).type).toBe('ParseError');
        expect((results[0] as any).reason).toContain('Malformed JSON-LD');
    });

    it('returns ParseError for Event missing name', () => {
        const html = '<script type="application/ld+json">{"@type":"Event","startDate":"2026-05-01T19:00:00-07:00"}</script>';
        const results = parseEventsFromHtml(html);
        expect(results.length).toBe(1);
        expect((results[0] as any).reason).toContain('missing name');
    });

    it('returns ParseError for Event missing startDate', () => {
        const html = '<script type="application/ld+json">{"@type":"Event","name":"Test Show"}</script>';
        const results = parseEventsFromHtml(html);
        expect(results.length).toBe(1);
        expect((results[0] as any).reason).toContain('missing startDate');
    });

    it('returns empty array for page with no JSON-LD', () => {
        expect(parseEventsFromHtml('<html><body>No events</body></html>')).toEqual([]);
    });

    it('includes the cancelled show in raw parsed results', () => {
        const results = parseEventsFromHtml(loadSampleHtml());
        const events = results.filter(r => !('type' in r)) as any[];
        const cancelled = events.find(e => e.name === 'Cancelled Show');
        expect(cancelled).toBeDefined();
        expect(cancelled.eventStatus).toBe('https://schema.org/EventCancelled');
    });
});

describe('parseStartDate', () => {
    it('parses ISO 8601 datetime with offset', () => {
        const result = parseStartDate('2026-05-15T19:30:00-07:00', 'Test Show', PACIFIC);
        expect('type' in result).toBe(false);
        if (!('type' in result)) {
            expect(result.year()).toBe(2026);
            expect(result.monthValue()).toBe(5);
            expect(result.dayOfMonth()).toBe(15);
            expect(result.hour()).toBe(19);
            expect(result.minute()).toBe(30);
        }
    });

    it('parses ISO 8601 datetime with Z offset', () => {
        const result = parseStartDate('2026-06-01T20:00:00Z', 'Test Show', PACIFIC);
        expect('type' in result).toBe(false);
        if (!('type' in result)) {
            expect(result.hour()).toBe(20);
        }
    });

    it('returns ParseError for missing time component', () => {
        const result = parseStartDate('2026-05-15', 'Test Show', PACIFIC);
        expect('type' in result).toBe(true);
        expect((result as any).reason).toContain('Unparseable');
    });

    it('returns ParseError for empty string', () => {
        const result = parseStartDate('', 'Test Show', PACIFIC);
        expect('type' in result).toBe(true);
    });

    it('returns ParseError for invalid date (Feb 30)', () => {
        const result = parseStartDate('2026-02-30T19:00:00-08:00', 'Test Show', PACIFIC);
        expect('type' in result).toBe(true);
        expect((result as any).type).toBe('ParseError');
    });
});

describe('parseDurationMinutes', () => {
    it('computes duration from start and end date strings', () => {
        const duration = parseDurationMinutes(
            '2026-05-15T19:30:00-07:00',
            '2026-05-15T21:30:00-07:00'
        );
        expect(duration).toBe(120);
    });

    it('returns default when endDate is undefined', () => {
        expect(parseDurationMinutes('2026-05-15T19:30:00-07:00', undefined)).toBe(120);
    });

    it('returns default when endDate is before startDate', () => {
        expect(parseDurationMinutes(
            '2026-05-15T21:30:00-07:00',
            '2026-05-15T19:30:00-07:00'
        )).toBe(120);
    });

    it('handles 90-minute shows', () => {
        const duration = parseDurationMinutes(
            '2026-05-15T19:30:00-07:00',
            '2026-05-15T21:00:00-07:00'
        );
        expect(duration).toBe(90);
    });
});

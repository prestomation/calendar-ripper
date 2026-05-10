import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
    stripHtml,
    extractExhibitionName,
    parseTimeRange,
    parseLine,
    parseBodyForEvents,
} from './ripper.js';
import type { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleData = JSON.parse(
    readFileSync(join(__dirname, 'sample-data.json'), 'utf-8')
);

describe('stripHtml', () => {
    it('converts br tags to newlines', () => {
        const result = stripHtml('<p>Line 1<br>Line 2</p>');
        expect(result).toContain('Line 1');
        expect(result).toContain('Line 2');
    });

    it('decodes HTML entities', () => {
        expect(stripHtml('Rock &amp; Roll')).toBe('Rock & Roll');
    });
});

describe('extractExhibitionName', () => {
    it('strips month-year prefix', () => {
        expect(extractExhibitionName('May 2026: SKRIMSLI - Leah Fadness')).toBe('SKRIMSLI - Leah Fadness');
        expect(extractExhibitionName('March 2026: Mark Mueller - Color Blocks')).toBe('Mark Mueller - Color Blocks');
    });

    it('returns title unchanged if no prefix', () => {
        expect(extractExhibitionName('Some Exhibition')).toBe('Some Exhibition');
    });
});

describe('parseTimeRange', () => {
    it('parses simple pm time', () => {
        const result = parseTimeRange('5pm');
        expect(result?.hour).toBe(17);
        expect(result?.minute).toBe(0);
    });

    it('parses time range', () => {
        const result = parseTimeRange('5-9pm');
        expect(result?.hour).toBe(17);
        expect(result?.endHour).toBe(21);
    });

    it('parses time with minutes', () => {
        const result = parseTimeRange('6:30pm');
        expect(result?.hour).toBe(18);
        expect(result?.minute).toBe(30);
    });

    it('returns null for unparseable string', () => {
        expect(parseTimeRange('noon')).toBeNull();
    });
});

describe('parseLine', () => {
    it('parses a full opening date line', () => {
        const result = parseLine('Opening Thursday, May 7, 2026 5-8pm', 2026);
        expect(result).not.toBeNull();
        expect(result?.month).toBe(5);
        expect(result?.day).toBe(7);
        expect(result?.year).toBe(2026);
        expect(result?.hour).toBe(17);
        expect(result?.endHour).toBe(20);
    });

    it('parses an artwalk line without year', () => {
        const result = parseLine('Capitol Hill Artwalk Thursday, March 12, 5-9pm', 2026);
        expect(result).not.toBeNull();
        expect(result?.month).toBe(3);
        expect(result?.day).toBe(12);
        expect(result?.year).toBe(2026);
    });

    it('parses a figure drawing line', () => {
        const result = parseLine('Figure it Out! Queer Figure Drawing, May 12, 6-10pm', 2026);
        expect(result).not.toBeNull();
        expect(result?.month).toBe(5);
        expect(result?.day).toBe(12);
        expect(result?.hour).toBe(18);
    });

    it('returns null for a line with no date', () => {
        expect(parseLine('Show runs through May 30, 2026', 2026)).toBeNull();
        expect(parseLine('Dance Performance at 5pm', 2026)).toBeNull();
    });
});

describe('parseBodyForEvents', () => {
    it('extracts events from May 2026 exhibition body', () => {
        const item = sampleData.items[0]; // SKRIMSLI - May 2026
        const exhibitionName = extractExhibitionName(item.title);
        // Pass a past context year so all events appear "future" in test
        const events = parseBodyForEvents(item.body, exhibitionName, 2026)
            .filter(e => 'date' in e);
        expect(events.length).toBeGreaterThanOrEqual(2);
        // Should include opening and artwalk
        const summaries = (events as RipperCalendarEvent[]).map(e => e.summary);
        expect(summaries.some(s => s.includes('Opening'))).toBe(true);
        expect(summaries.some(s => s.includes('Artwalk'))).toBe(true);
    });

    it('extracts events from March 2026 exhibition body', () => {
        const item = sampleData.items[2]; // Mark Mueller - March 2026
        const exhibitionName = extractExhibitionName(item.title);
        const events = parseBodyForEvents(item.body, exhibitionName, 2026)
            .filter(e => 'date' in e);
        expect(events.length).toBeGreaterThanOrEqual(2);
    });

    it('deduplicates events at same date/time', () => {
        const body = '<p>Opening May 7, 2026 5-8pm</p><p>Opening May 7, 2026 5-8pm</p>';
        const events = parseBodyForEvents(body, 'Test Show', 2026).filter(e => 'date' in e);
        expect(events.length).toBe(1);
    });

    it('returns ParseError for invalid dates', () => {
        const body = '<p>Opening February 30, 2026 5-9pm</p>';
        const results = parseBodyForEvents(body, 'Test Show', 2026);
        const errors = results.filter(e => !('date' in e));
        expect(errors.length).toBe(1);
    });

    it('parses homepage-style HTML with h4 and paragraphs', () => {
        const html = `
            <h4>SKRIMSLI - Leah Fadness</h4>
            <p>Opening Thursday, May 7, 2026 5-8pm</p>
            <p>Figure it Out! Queer Figure Drawing, May 12, 6-10pm</p>
            <p>Capitol Hill Artwalk Thursday, May 14, 2026, 5-9pm</p>
            <h4>Having a party?</h4>
            <p>Rent our space via Peerspace.</p>
        `;
        const events = parseBodyForEvents(html, 'SKRIMSLI - Leah Fadness', 2026)
            .filter(e => 'date' in e) as RipperCalendarEvent[];
        expect(events.length).toBe(3);
        expect(events.some(e => e.summary.includes('Opening'))).toBe(true);
        expect(events.some(e => e.summary.includes('Artwalk'))).toBe(true);
        // May 12 "Figure it Out!" event
        const queer = events.find(e => e.date.monthValue() === 5 && e.date.dayOfMonth() === 12);
        expect(queer).toBeDefined();
        expect(queer?.date.hour()).toBe(18);
    });
});

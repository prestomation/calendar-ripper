import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import EgansBallardJamHouseRipper from './ripper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of('America/Los_Angeles');

function nowAt(year: number, month: number, day: number): ZonedDateTime {
    return ZonedDateTime.of(LocalDateTime.of(year, month, day, 12, 0), TIMEZONE);
}

describe('EgansBallardJamHouseRipper', () => {
    const ripper = new EgansBallardJamHouseRipper();

    describe('parseDt', () => {
        it('parses day-of-week + month + day format', () => {
            expect(ripper.parseDt('Fri May 1')).toEqual({ month: 5, day: 1 });
            expect(ripper.parseDt('Sat May 2')).toEqual({ month: 5, day: 2 });
            expect(ripper.parseDt('Thu Jun 25')).toEqual({ month: 6, day: 25 });
        });

        it('returns null for non-date text', () => {
            expect(ripper.parseDt('Our Reservation Policy')).toBeNull();
            expect(ripper.parseDt('Performance Schedule')).toBeNull();
        });
    });

    describe('parseShow', () => {
        it('parses simple 7pm show', () => {
            const result = ripper.parseShow('7pm - Nancy K Dillon');
            expect(result).not.toBeNull();
            expect(result!.hour).toBe(19);
            expect(result!.minute).toBe(0);
            expect(result!.summary).toBe('Nancy K Dillon');
        });

        it('parses 9:30pm show', () => {
            const result = ripper.parseShow('9:30pm - Ian Hughes Quartet');
            expect(result).not.toBeNull();
            expect(result!.hour).toBe(21);
            expect(result!.minute).toBe(30);
            expect(result!.summary).toBe('Ian Hughes Quartet');
        });

        it('returns null for non-show text', () => {
            expect(ripper.parseShow('Our main room seats up to 46 people.')).toBeNull();
            expect(ripper.parseShow('Reserved seats are held until the show starts.')).toBeNull();
            expect(ripper.parseShow('')).toBeNull();
        });

        it('strips cover charge from summary', () => {
            const result = ripper.parseShow('7pm - Greta Matassa Quintet ($20 cover)');
            expect(result).not.toBeNull();
            expect(result!.summary).toBe('Greta Matassa Quintet');
        });

        it('strips website link label from summary', () => {
            const result = ripper.parseShow('7pm - Jump Ensemble [Website] ($15 cover)');
            expect(result).not.toBeNull();
            expect(result!.summary).toBe('Jump Ensemble');
        });
    });

    describe('cleanSummary', () => {
        it('removes [Website] labels', () => {
            expect(ripper.cleanSummary('Nancy K Dillon [Website] and Ghost Tree')).toBe('Nancy K Dillon and Ghost Tree');
        });

        it('removes cover charge amounts', () => {
            expect(ripper.cleanSummary('Melissa Brewer Quintet ($20 cover)')).toBe('Melissa Brewer Quintet');
            expect(ripper.cleanSummary('West Woodland Elementary Open Mic (no cover)')).toBe('West Woodland Elementary Open Mic');
        });

        it('removes Purchase tickets text', () => {
            expect(ripper.cleanSummary('Kiela Mellott / Art Anderson. Purchase tickets [ HERE ]')).toBe('Kiela Mellott / Art Anderson');
            expect(ripper.cleanSummary('Craig Pomranz / Cornish Cabaret with Rich Gray. Purchase tickets')).toBe('Craig Pomranz / Cornish Cabaret with Rich Gray');
        });
    });

    describe('parseSchedule with sample data', () => {
        const html = readFileSync(join(__dirname, 'sample-data.html'), 'utf-8');
        const now = nowAt(2026, 5, 10);  // May 10, 2026

        it('extracts events from sample HTML', () => {
            const events = ripper.parseSchedule(html, now);
            const calEvents = events.filter(e => 'date' in e);
            expect(calEvents.length).toBeGreaterThan(10);
        });

        it('all extracted events are in 2026 or 2027', () => {
            const events = ripper.parseSchedule(html, now);
            const calEvents = events.filter(e => 'date' in e) as import('../../lib/config/schema.js').RipperCalendarEvent[];
            for (const e of calEvents) {
                expect([2026, 2027]).toContain(e.date.year());
            }
        });

        it('all events are in the future relative to now', () => {
            const events = ripper.parseSchedule(html, now);
            const calEvents = events.filter(e => 'date' in e) as import('../../lib/config/schema.js').RipperCalendarEvent[];
            for (const e of calEvents) {
                expect(e.date.isAfter(now)).toBe(true);
            }
        });

        it('events have Music tags location', () => {
            const events = ripper.parseSchedule(html, now);
            const calEvents = events.filter(e => 'date' in e) as import('../../lib/config/schema.js').RipperCalendarEvent[];
            expect(calEvents.length).toBeGreaterThan(0);
            expect(calEvents[0].location).toContain("Egan's");
        });

        it('no errors from valid sample data', () => {
            const events = ripper.parseSchedule(html, now);
            const errors = events.filter(e => 'type' in e);
            // Most entries should be valid; allow some failures for non-event sections
            expect(errors.length).toBeLessThan(5);
        });
    });
});

import { describe, it, expect } from 'vitest';
import StoupBrewingRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any {
    const jsonPath = path.join(__dirname, 'sample-data.json');
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

describe('StoupBrewingRipper', () => {
    describe('extractEvents', () => {
        it('extracts events from sample HTML', () => {
            const ripper = new StoupBrewingRipper();
            const data = loadSampleData();
            const events = ripper.extractEvents(data.html);

            expect(events.length).toBe(15);
            expect(events[0]).toHaveProperty('eventId');
            expect(events[0]).toHaveProperty('title');
            expect(events[0]).toHaveProperty('dateStr');
            expect(events[0]).toHaveProperty('timeRange');
        });

        it('extracts event IDs from data attributes', () => {
            const ripper = new StoupBrewingRipper();
            const data = loadSampleData();
            const events = ripper.extractEvents(data.html);

            expect(events[0].eventId).toBe('6919');
            expect(events[1].eventId).toBe('6781');
        });

        it('extracts URLs from href attributes', () => {
            const ripper = new StoupBrewingRipper();
            const data = loadSampleData();
            const events = ripper.extractEvents(data.html);

            expect(events[0].url).toContain('stoup-event/brewing-hope-technology-access-fund-6919.html');
        });

        it('extracts date, time, and title fields', () => {
            const ripper = new StoupBrewingRipper();
            const data = loadSampleData();
            const events = ripper.extractEvents(data.html);

            // First event: Brewing Hope
            expect(events[0].dateStr).toBe('2/19');
            expect(events[0].timeRange).toBe('5 - 9pm');
            expect(events[0].startTime).toBe('5:00p');
        });
    });

    describe('splitTitle', () => {
        it('splits location prefix from title', () => {
            const ripper = new StoupBrewingRipper();

            const result = ripper.splitTitle('Ballard: Trivia at Stoup Brewing Ballard');
            expect(result.locationPrefix).toBe('Ballard');
            expect(result.title).toBe('Trivia at Stoup Brewing Ballard');
        });

        it('handles Capitol Hill prefix', () => {
            const ripper = new StoupBrewingRipper();

            const result = ripper.splitTitle('Capitol Hill: Board Gayme Night');
            expect(result.locationPrefix).toBe('Capitol Hill');
            expect(result.title).toBe('Board Gayme Night');
        });

        it('handles Kenmore prefix', () => {
            const ripper = new StoupBrewingRipper();

            const result = ripper.splitTitle('Kenmore: #StoupKenmoreBeerRunners');
            expect(result.locationPrefix).toBe('Kenmore');
            expect(result.title).toBe('#StoupKenmoreBeerRunners');
        });

        it('handles Other prefix by returning empty location', () => {
            const ripper = new StoupBrewingRipper();

            const result = ripper.splitTitle('Other: Brewing Hope: Technology Access Fund');
            expect(result.locationPrefix).toBe('');
            expect(result.title).toBe('Brewing Hope: Technology Access Fund');
        });

        it('handles title with no prefix', () => {
            const ripper = new StoupBrewingRipper();

            const result = ripper.splitTitle('Some Event Without Prefix');
            expect(result.locationPrefix).toBe('');
            expect(result.title).toBe('Some Event Without Prefix');
        });
    });

    describe('parseTime', () => {
        it('parses afternoon time', () => {
            const ripper = new StoupBrewingRipper();
            expect(ripper.parseTime('5:00p')).toEqual({ hour: 17, minute: 0 });
        });

        it('parses morning time', () => {
            const ripper = new StoupBrewingRipper();
            expect(ripper.parseTime('11:45a')).toEqual({ hour: 11, minute: 45 });
        });

        it('parses 12pm as noon', () => {
            const ripper = new StoupBrewingRipper();
            expect(ripper.parseTime('12:00p')).toEqual({ hour: 12, minute: 0 });
        });

        it('parses 12am as midnight', () => {
            const ripper = new StoupBrewingRipper();
            expect(ripper.parseTime('12:00a')).toEqual({ hour: 0, minute: 0 });
        });

        it('parses time with minutes', () => {
            const ripper = new StoupBrewingRipper();
            expect(ripper.parseTime('7:30p')).toEqual({ hour: 19, minute: 30 });
        });

        it('returns null for invalid format', () => {
            const ripper = new StoupBrewingRipper();
            expect(ripper.parseTime('invalid')).toBeNull();
        });
    });

    describe('parseTimeRange', () => {
        it('parses range with pm only on end', () => {
            const ripper = new StoupBrewingRipper();
            const result = ripper.parseTimeRange('5 - 9pm');
            expect(result).toEqual({
                start: { hour: 17, minute: 0 },
                end: { hour: 21, minute: 0 },
            });
        });

        it('parses range with am on start and pm on end', () => {
            const ripper = new StoupBrewingRipper();
            const result = ripper.parseTimeRange('11:45am - 1pm');
            expect(result).toEqual({
                start: { hour: 11, minute: 45 },
                end: { hour: 13, minute: 0 },
            });
        });

        it('parses range with minutes on both sides', () => {
            const ripper = new StoupBrewingRipper();
            const result = ripper.parseTimeRange('6:30 - 9:30pm');
            expect(result).toEqual({
                start: { hour: 18, minute: 30 },
                end: { hour: 21, minute: 30 },
            });
        });

        it('infers am for start when inheriting pm would make start > end', () => {
            const ripper = new StoupBrewingRipper();
            // "11 - 1pm": 11pm > 1pm, so start must be 11am
            const result = ripper.parseTimeRange('11 - 1pm');
            expect(result).toEqual({
                start: { hour: 11, minute: 0 },
                end: { hour: 13, minute: 0 },
            });
        });

        it('inherits pm when start < end in same period', () => {
            const ripper = new StoupBrewingRipper();
            // "7:30 - 9pm": 7:30pm < 9pm, so pm is correct
            const result = ripper.parseTimeRange('7:30 - 9pm');
            expect(result).toEqual({
                start: { hour: 19, minute: 30 },
                end: { hour: 21, minute: 0 },
            });
        });

        it('returns null for unparseable range', () => {
            const ripper = new StoupBrewingRipper();
            expect(ripper.parseTimeRange('TBD')).toBeNull();
        });
    });

    describe('parseTimeFromRange', () => {
        it('parses range with pm only on end', () => {
            const ripper = new StoupBrewingRipper();
            expect(ripper.parseTimeFromRange('5 - 9pm')).toEqual({ hour: 17, minute: 0 });
        });

        it('parses range with am on start and pm on end', () => {
            const ripper = new StoupBrewingRipper();
            expect(ripper.parseTimeFromRange('11:45am - 1pm')).toEqual({ hour: 11, minute: 45 });
        });

        it('parses range with minutes', () => {
            const ripper = new StoupBrewingRipper();
            expect(ripper.parseTimeFromRange('6:30 - 9:30pm')).toEqual({ hour: 18, minute: 30 });
        });

        it('parses simple evening range', () => {
            const ripper = new StoupBrewingRipper();
            expect(ripper.parseTimeFromRange('7:30 - 9pm')).toEqual({ hour: 19, minute: 30 });
        });

        it('handles ambiguous cross-period range', () => {
            const ripper = new StoupBrewingRipper();
            // "11 - 1pm" should be 11am, not 11pm
            expect(ripper.parseTimeFromRange('11 - 1pm')).toEqual({ hour: 11, minute: 0 });
        });
    });

    describe('parseDuration', () => {
        it('parses 4-hour range', () => {
            const ripper = new StoupBrewingRipper();
            const duration = ripper.parseDuration('5 - 9pm');
            expect(duration.toMinutes()).toBe(240);
        });

        it('parses range crossing am/pm', () => {
            const ripper = new StoupBrewingRipper();
            const duration = ripper.parseDuration('11:45am - 1pm');
            expect(duration.toMinutes()).toBe(75);
        });

        it('parses 3-hour range', () => {
            const ripper = new StoupBrewingRipper();
            const duration = ripper.parseDuration('6:30 - 9:30pm');
            expect(duration.toMinutes()).toBe(180);
        });

        it('returns 2 hours for unparseable range', () => {
            const ripper = new StoupBrewingRipper();
            const duration = ripper.parseDuration('TBD');
            expect(duration.toMinutes()).toBe(120);
        });

        it('correctly computes duration for ambiguous cross-period range', () => {
            const ripper = new StoupBrewingRipper();
            // "11 - 1pm" = 11am to 1pm = 2 hours (not 11pm to 1pm)
            const duration = ripper.parseDuration('11 - 1pm');
            expect(duration.toMinutes()).toBe(120);
        });
    });

    describe('parseEvents', () => {
        it('creates calendar events from parsed data', () => {
            const ripper = new StoupBrewingRipper();
            const data = loadSampleData();
            const extracted = ripper.extractEvents(data.html);

            // Filter for Ballard events
            const ballardEvents = extracted.filter(e => e.locationPrefix === 'Ballard');
            const events = ripper.parseEvents(ballardEvents, 'Stoup Brewing Ballard');
            const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

            expect(valid.length).toBeGreaterThan(0);
            expect(valid[0].location).toBe('Stoup Brewing Ballard');
            expect(valid[0].id).toMatch(/^stoup-/);
        });

        it('creates events for Capitol Hill location', () => {
            const ripper = new StoupBrewingRipper();
            const data = loadSampleData();
            const extracted = ripper.extractEvents(data.html);

            const chEvents = extracted.filter(e => e.locationPrefix === 'Capitol Hill');
            const events = ripper.parseEvents(chEvents, 'Stoup Brewing Capitol Hill');
            const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

            expect(valid.length).toBeGreaterThan(0);
            // Verify Mahjong night is in Capitol Hill
            const mahjong = valid.find(e => e.summary.includes('Mahjong'));
            expect(mahjong).toBeDefined();
        });

        it('deduplicates events by ID', () => {
            const ripper = new StoupBrewingRipper();
            const data = loadSampleData();
            const extracted = ripper.extractEvents(data.html);

            const ballardEvents = extracted.filter(e => e.locationPrefix === 'Ballard');
            const doubled = [...ballardEvents, ...ballardEvents];
            const events = ripper.parseEvents(doubled, 'Stoup Brewing Ballard');
            const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

            // Should be same count as single pass
            const singlePass = ripper.parseEvents(ballardEvents, 'Stoup Brewing Ballard');
            const singleValid = singlePass.filter(e => 'summary' in e) as RipperCalendarEvent[];

            expect(valid.length).toBe(singleValid.length);
        });

        it('sets URL for each event', () => {
            const ripper = new StoupBrewingRipper();
            const data = loadSampleData();
            const extracted = ripper.extractEvents(data.html);

            const ballardEvents = extracted.filter(e => e.locationPrefix === 'Ballard');
            const events = ripper.parseEvents(ballardEvents, 'Stoup Brewing Ballard');
            const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

            for (const event of valid) {
                expect(event.url).toContain('stoupbrewing.com/stoup-event/');
            }
        });

        it('returns no errors for valid sample data', () => {
            const ripper = new StoupBrewingRipper();
            const data = loadSampleData();
            const extracted = ripper.extractEvents(data.html);

            const ballardEvents = extracted.filter(e => e.locationPrefix === 'Ballard');
            const events = ripper.parseEvents(ballardEvents, 'Stoup Brewing Ballard');
            const errors = events.filter(e => 'type' in e) as RipperError[];

            expect(errors).toHaveLength(0);
        });

        it('handles empty event list', () => {
            const ripper = new StoupBrewingRipper();
            const events = ripper.parseEvents([], 'Test Location');
            expect(events).toHaveLength(0);
        });
    });

    describe('parseDateTime', () => {
        it('parses date and start time', () => {
            const ripper = new StoupBrewingRipper();
            const date = ripper.parseDateTime('2/19', '5:00p', '5 - 9pm');

            expect(date).not.toBeNull();
            expect(date!.monthValue()).toBe(2);
            expect(date!.dayOfMonth()).toBe(19);
            expect(date!.hour()).toBe(17);
            expect(date!.minute()).toBe(0);
        });

        it('parses morning event', () => {
            const ripper = new StoupBrewingRipper();
            const date = ripper.parseDateTime('2/22', '11:45a', '11:45am - 1pm');

            expect(date).not.toBeNull();
            expect(date!.hour()).toBe(11);
            expect(date!.minute()).toBe(45);
        });

        it('falls back to time range when start time is empty', () => {
            const ripper = new StoupBrewingRipper();
            const date = ripper.parseDateTime('3/2', '', '7:30 - 9pm');

            expect(date).not.toBeNull();
            expect(date!.hour()).toBe(19);
            expect(date!.minute()).toBe(30);
        });

        it('returns null for invalid date', () => {
            const ripper = new StoupBrewingRipper();
            expect(ripper.parseDateTime('invalid', '5:00p', '5 - 9pm')).toBeNull();
        });

        it('returns null when no time can be parsed', () => {
            const ripper = new StoupBrewingRipper();
            expect(ripper.parseDateTime('2/19', '', 'TBD')).toBeNull();
        });
    });
});

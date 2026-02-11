import { describe, expect, test } from 'vitest';
import SeattleRepRipper from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any {
    const jsonPath = path.join(__dirname, 'sample-data.json');
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

const testDate = ZonedDateTime.parse('2026-02-11T00:00:00-08:00[America/Los_Angeles]');

describe('SeattleRepRipper', () => {
    test('parses performances from sample data', async () => {
        const ripper = new SeattleRepRipper();
        const jsonData = loadSampleData();

        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // 4 visible performances (the hidden one with show_in_listings=false is skipped)
        expect(valid).toHaveLength(4);
    });

    test('parses title with prefix correctly', async () => {
        const ripper = new SeattleRepRipper();
        const jsonData = loadSampleData();

        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const blueberries = valid.find(e => e.id === '10484');
        expect(blueberries).toBeDefined();
        expect(blueberries!.summary).toBe("Tectonic Theater Project's Here There Are Blueberries");
    });

    test('parses title without prefix correctly', async () => {
        const ripper = new SeattleRepRipper();
        const jsonData = loadSampleData();

        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const maryJane = valid.find(e => e.id === '10419');
        expect(maryJane).toBeDefined();
        expect(maryJane!.summary).toBe('Mary Jane');
    });

    test('parses date and time correctly', async () => {
        const ripper = new SeattleRepRipper();
        const jsonData = loadSampleData();

        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const blueberries = valid.find(e => e.id === '10484')!;
        expect(blueberries.date.year()).toBe(2026);
        expect(blueberries.date.monthValue()).toBe(2);
        expect(blueberries.date.dayOfMonth()).toBe(13);
        expect(blueberries.date.hour()).toBe(19);
        expect(blueberries.date.minute()).toBe(30);

        // Matinee performance
        const matinee = valid.find(e => e.id === '10493')!;
        expect(matinee.date.hour()).toBe(14);
        expect(matinee.date.minute()).toBe(0);
    });

    test('sets duration to 2.5 hours', async () => {
        const ripper = new SeattleRepRipper();
        const jsonData = loadSampleData();

        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid[0].duration.toMinutes()).toBe(150);
    });

    test('includes facility in location', async () => {
        const ripper = new SeattleRepRipper();
        const jsonData = loadSampleData();

        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const blueberries = valid.find(e => e.id === '10484')!;
        expect(blueberries.location).toBe('Bagley Wright Theater, Seattle Center');

        const maryJane = valid.find(e => e.id === '10419')!;
        expect(maryJane.location).toBe('Leo K. Theater, Seattle Center');
    });

    test('includes event URL and image', async () => {
        const ripper = new SeattleRepRipper();
        const jsonData = loadSampleData();

        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const blueberries = valid.find(e => e.id === '10484')!;
        expect(blueberries.url).toBe('https://www.seattlerep.org/plays/202526-season/here-there-are-blueberries');
        expect(blueberries.image).toContain('cloudinary.com/seattlerep');
    });

    test('includes price range in description', async () => {
        const ripper = new SeattleRepRipper();
        const jsonData = loadSampleData();

        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const blueberries = valid.find(e => e.id === '10484')!;
        expect(blueberries.description).toContain('$43');
        expect(blueberries.description).toContain('$105');
    });

    test('includes accessibility info in description', async () => {
        const ripper = new SeattleRepRipper();
        const jsonData = loadSampleData();

        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const accessible = valid.find(e => e.id === '10493')!;
        expect(accessible.description).toContain('ASL Interpreted');
        expect(accessible.description).toContain('Audio Described');
    });

    test('skips performances with show_in_listings=false', async () => {
        const ripper = new SeattleRepRipper();
        const jsonData = loadSampleData();

        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const hidden = valid.find(e => e.id === '10500');
        expect(hidden).toBeUndefined();
    });

    test('deduplicates performances across multiple calls', async () => {
        const ripper = new SeattleRepRipper();
        const jsonData = loadSampleData();

        const events1 = await ripper.parseEvents(jsonData, testDate, {});
        const events2 = await ripper.parseEvents(jsonData, testDate, {});

        const valid1 = events1.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const valid2 = events2.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Verifies that the same ripper instance deduplicates across multiple calls
        // (the base class reuses one instance for all days in the lookahead window)
        expect(valid1).toHaveLength(4);
        expect(valid2).toHaveLength(0);
    });

    test('returns error for non-array JSON', async () => {
        const ripper = new SeattleRepRipper();

        const events = await ripper.parseEvents({ error: "not found" }, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        expect(errors[0].reason).toContain('expected an array');
    });

    test('handles invalid date gracefully', async () => {
        const ripper = new SeattleRepRipper();
        const badData = [{
            perf_no: 99999,
            title: "Bad Date Show",
            show_in_listings: true,
            perf_date: "not-a-date",
            facility: "Test Theater"
        }];

        const events = await ripper.parseEvents(badData, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        expect(errors[0].reason).toContain('Could not parse perf_date');
    });

    test('parses space-separated date format without offset', async () => {
        const ripper = new SeattleRepRipper();
        const jsonData = loadSampleData();

        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const spaceDate = valid.find(e => e.id === '1887')!;
        expect(spaceDate).toBeDefined();
        expect(spaceDate.summary).toBe('Space Date Show');
        expect(spaceDate.date.year()).toBe(2025);
        expect(spaceDate.date.monthValue()).toBe(8);
        expect(spaceDate.date.dayOfMonth()).toBe(28);
        expect(spaceDate.date.hour()).toBe(18);
        expect(spaceDate.date.minute()).toBe(0);
    });

    test('skips entries missing required fields', async () => {
        const ripper = new SeattleRepRipper();
        const incompleteData = [
            { perf_no: 1 },
            { title: "No ID" },
            { perf_no: 2, title: "No Date", show_in_listings: true },
            { perf_no: 3, perf_date: "2026-02-13T19:30:00-08:00" }
        ];

        const events = await ripper.parseEvents(incompleteData, testDate, {});
        expect(events).toHaveLength(0);
    });
});

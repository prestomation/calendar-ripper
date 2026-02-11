import { describe, expect, test } from 'vitest';
import WingLukeRipper from './ripper.js';
import { ZoneId, ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';
import { SquarespaceEvent } from '../../lib/config/squarespace.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Expose mapEvent for testing
class TestableWingLukeRipper extends WingLukeRipper {
    public testMapEvent(sqEvent: SquarespaceEvent, timezone: ZoneId, baseUrl: URL) {
        return this.mapEvent(sqEvent, timezone, baseUrl);
    }
}

describe('Wing Luke Museum Ripper', () => {
    const ripper = new TestableWingLukeRipper();
    const timezone = ZoneId.of('America/Los_Angeles');
    const baseUrl = new URL('https://www.wingluke.org/eventscalendar');

    test('parses events from sample data', () => {
        const jsonPath = path.join(__dirname, 'sample-data.json');
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        const events = data.upcoming.map((e: SquarespaceEvent) =>
            ripper.testMapEvent(e, timezone, baseUrl)
        ).filter(Boolean) as RipperCalendarEvent[];

        expect(events).toHaveLength(3);
    });

    test('parses event with full location', () => {
        const jsonPath = path.join(__dirname, 'sample-data.json');
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        const event = ripper.testMapEvent(
            data.upcoming[0], timezone, baseUrl
        ) as RipperCalendarEvent;

        expect(event.summary).toBe('Roots and Branches: Community Exhibit Opening');
        expect(event.location).toBe('Wing Luke Museum, 719 S King St, Seattle, WA 98104');
        expect(event.url).toBe('https://www.wingluke.org/eventscalendar/roots-and-branches-exhibit');
        expect(event.description).toContain('Asian Pacific American communities');
    });

    test('strips HTML from descriptions', () => {
        const jsonPath = path.join(__dirname, 'sample-data.json');
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        const event = ripper.testMapEvent(
            data.upcoming[1], timezone, baseUrl
        ) as RipperCalendarEvent;

        expect(event.description).toBe(
            'Ring in the Year of the Horse with traditional performances, lion dances, and family activities.'
        );
        expect(event.description).not.toContain('<');
    });

    test('handles event with no location or endDate', () => {
        const jsonPath = path.join(__dirname, 'sample-data.json');
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        const event = ripper.testMapEvent(
            data.upcoming[2], timezone, baseUrl
        ) as RipperCalendarEvent;

        expect(event.summary).toBe('Virtual Storytime: Tales from the CID');
        expect(event.location).toBeUndefined();
        expect(event.duration.toHours()).toBe(2); // default
    });

    test('calculates duration from start and end dates', () => {
        const jsonPath = path.join(__dirname, 'sample-data.json');
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        const event = ripper.testMapEvent(
            data.upcoming[0], timezone, baseUrl
        ) as RipperCalendarEvent;

        // endDate - startDate = 1771290000000 - 1771279200000 = 10800000 ms = 3 hours
        expect(event.duration.toHours()).toBe(3);
    });
});

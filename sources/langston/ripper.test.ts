import { describe, expect, test } from 'vitest';
import LangstonRipper from './ripper.js';
import { ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';
import { SquarespaceEvent } from '../../lib/config/squarespace.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class TestableLangstonRipper extends LangstonRipper {
    public testMapEvent(sqEvent: SquarespaceEvent, timezone: ZoneId, baseUrl: URL) {
        return this.mapEvent(sqEvent, timezone, baseUrl);
    }
}

describe('Langston Ripper', () => {
    const ripper = new TestableLangstonRipper();
    const timezone = ZoneId.of('America/Los_Angeles');
    const baseUrl = new URL('https://www.langstonseattle.org/events/');

    test('parses all upcoming events from sample data', () => {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
        const events = data.upcoming
            .map((e: SquarespaceEvent) => ripper.testMapEvent(e, timezone, baseUrl))
            .filter(Boolean) as RipperCalendarEvent[];

        expect(events).toHaveLength(2);
    });

    test('parses Jazz Night event with location', () => {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
        const event = ripper.testMapEvent(data.upcoming[0], timezone, baseUrl) as RipperCalendarEvent;

        expect(event.summary).toBe('Jazz Night at Langston');
        expect(event.location).toContain('Langston Hughes Performing Arts Institute');
        expect(event.location).toContain('104 17th Ave S');
        expect(event.url).toBe('https://www.langstonseattle.org/events/jazz-night-february');
        expect(event.description).toContain('Black History Month');

        // Duration: 1771376400000 - 1771365600000 = 10800000 ms = 3 hours
        expect(event.duration.toHours()).toBe(3);
    });

    test('parses event without location, strips HTML', () => {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
        const event = ripper.testMapEvent(data.upcoming[1], timezone, baseUrl) as RipperCalendarEvent;

        expect(event.summary).toBe('Community Conversation: Art & Activism');
        expect(event.location).toBeUndefined();
        expect(event.description).toContain('art and social justice');
        expect(event.description).not.toContain('<strong>');

        // Duration: 1772582400000 - 1772575200000 = 7200000 ms = 2 hours
        expect(event.duration.toHours()).toBe(2);
    });
});

import { describe, expect, test } from 'vitest';
import NAAMRipper from './ripper.js';
import { ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';
import { SquarespaceEvent } from '../../lib/config/squarespace.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class TestableNAAMRipper extends NAAMRipper {
    public testMapEvent(sqEvent: SquarespaceEvent, timezone: ZoneId, baseUrl: URL) {
        return this.mapEvent(sqEvent, timezone, baseUrl);
    }
}

describe('NAAM Ripper', () => {
    const ripper = new TestableNAAMRipper();
    const timezone = ZoneId.of('America/Los_Angeles');
    const baseUrl = new URL('https://www.naamnw.org/events');

    test('parses all upcoming events from sample data', () => {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
        const events = data.upcoming
            .map((e: SquarespaceEvent) => ripper.testMapEvent(e, timezone, baseUrl))
            .filter(Boolean) as RipperCalendarEvent[];

        expect(events).toHaveLength(2);
    });

    test('parses Living Voices event correctly', () => {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
        const event = ripper.testMapEvent(data.upcoming[0], timezone, baseUrl) as RipperCalendarEvent;

        expect(event.summary).toBe('LIVING VOICES');
        expect(event.id).toBe('6987a06c54428f79938e2a78');
        expect(event.location).toContain('Northwest African American Museum');
        expect(event.location).toContain('2300 South Massachusetts Street');
        expect(event.url).toBe('https://www.naamnw.org/events/living-voices');
        expect(event.duration.toHours()).toBe(2);
    });

    test('parses Juneteenth event with HTML excerpt', () => {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
        const event = ripper.testMapEvent(data.upcoming[1], timezone, baseUrl) as RipperCalendarEvent;

        expect(event.summary).toBe('Juneteenth Week Celebration');
        expect(event.description).toContain('African American heritage');
        expect(event.description).not.toContain('<p');
    });
});

import { describe, expect, test } from 'vitest';
import JCCCWRipper from './ripper.js';
import { ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';
import { SquarespaceEvent } from '../../lib/config/squarespace.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class TestableJCCCWRipper extends JCCCWRipper {
    public testMapEvent(sqEvent: SquarespaceEvent, timezone: ZoneId, baseUrl: URL) {
        return this.mapEvent(sqEvent, timezone, baseUrl);
    }
}

describe('JCCCW Ripper', () => {
    const ripper = new TestableJCCCWRipper();
    const timezone = ZoneId.of('America/Los_Angeles');
    const baseUrl = new URL('https://www.jcccw.org/events');

    test('parses only upcoming events (ignores past)', () => {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));

        // Only upcoming events should be mapped
        const upcoming = data.upcoming
            .map((e: SquarespaceEvent) => ripper.testMapEvent(e, timezone, baseUrl))
            .filter(Boolean) as RipperCalendarEvent[];

        expect(upcoming).toHaveLength(2);
    });

    test('parses Kodomo no Hi event correctly', () => {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
        const event = ripper.testMapEvent(data.upcoming[0], timezone, baseUrl) as RipperCalendarEvent;

        expect(event.summary).toBe("Kodomo no Hi: Children's Day Festival");
        expect(event.location).toContain('Japanese Cultural & Community Center');
        expect(event.location).toContain('1414 S Weller St');
        expect(event.url).toBe('https://www.jcccw.org/events/2026/5/5/kodomo-no-hi-2026');
        expect(event.description).toContain("Children's Day");
        expect(event.description).not.toContain('<p');

        // Duration: 1778281200000 - 1778263200000 = 18000000 ms = 5 hours
        expect(event.duration.toHours()).toBe(5);
    });

    test('strips HTML tags including emphasis from excerpts', () => {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
        const event = ripper.testMapEvent(data.upcoming[1], timezone, baseUrl) as RipperCalendarEvent;

        expect(event.description).toBe(
            'Join us for our annual mochitsuki celebration, a beloved New Year tradition.'
        );
        expect(event.description).not.toContain('<em>');
    });
});

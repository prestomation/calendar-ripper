import { describe, expect, test } from 'vitest';
import { SquarespaceRipper } from '../../lib/config/squarespace.js';
import { configSchema } from '../../lib/config/schema.js';
import { ZoneRegion } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any {
    const jsonPath = path.join(__dirname, 'sample-data.json');
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

function loadConfig() {
    const configFile = fs.readFileSync(path.join(__dirname, 'ripper.yaml'), 'utf8');
    return configSchema.parse(YAML.parse(configFile));
}

describe('On the Boards (Squarespace)', () => {
    test('ripper.yaml config is valid', () => {
        const config = loadConfig();

        expect(config.name).toBe('on-the-boards');
        expect(config.type).toBe('squarespace');
        expect(config.url.hostname).toBe('ontheboards.org');
        expect(config.calendars).toHaveLength(1);
        expect(config.calendars[0].name).toBe('all-events');
        expect(config.calendars[0].timezone).toEqual(ZoneRegion.of('America/Los_Angeles'));
    });

    test('maps sample events correctly', () => {
        const ripper = new SquarespaceRipper();
        const data = loadSampleData();
        const timezone = ZoneRegion.of('America/Los_Angeles');
        const baseUrl = new URL('https://ontheboards.org/events');

        const events = data.upcoming.map((e: any) =>
            (ripper as any).mapEvent(e, timezone, baseUrl)
        ).filter(Boolean);

        expect(events).toHaveLength(3);
    });

    test('parses Rose Jarboe event properties', () => {
        const ripper = new SquarespaceRipper();
        const data = loadSampleData();
        const timezone = ZoneRegion.of('America/Los_Angeles');
        const baseUrl = new URL('https://ontheboards.org/events');

        const event = (ripper as any).mapEvent(data.upcoming[0], timezone, baseUrl);

        expect(event.id).toBe('685b3a477e1c8c3f21477dd9');
        expect(event.summary).toBe('Rose Jarboe');
        expect(event.date.year()).toBe(2026);
        expect(event.date.monthValue()).toBe(2);
        expect(event.date.dayOfMonth()).toBe(19);
        expect(event.url).toBe('https://ontheboards.org/events/25-26/rose-jarboe');
        expect(event.image).toContain('squarespace-cdn.com');
    });

    test('computes duration from startDate and endDate', () => {
        const ripper = new SquarespaceRipper();
        const data = loadSampleData();
        const timezone = ZoneRegion.of('America/Los_Angeles');
        const baseUrl = new URL('https://ontheboards.org/events');

        const event = (ripper as any).mapEvent(data.upcoming[0], timezone, baseUrl);

        // endDate - startDate = 1771736400715 - 1771560000715 = 176400000 ms = 49 hours
        const durationHours = event.duration.toHours();
        expect(durationHours).toBe(49);
    });

    test('strips HTML from excerpt in description', () => {
        const ripper = new SquarespaceRipper();
        const data = loadSampleData();
        const timezone = ZoneRegion.of('America/Los_Angeles');
        const baseUrl = new URL('https://ontheboards.org/events');

        const event = (ripper as any).mapEvent(data.upcoming[0], timezone, baseUrl);

        expect(event.description).toBeDefined();
        expect(event.description).not.toContain('<h3');
        expect(event.description).not.toContain('<p');
        expect(event.description).toContain('genre-defying musical shrine');
    });

    test('handles event with empty location fields', () => {
        const ripper = new SquarespaceRipper();
        const data = loadSampleData();
        const timezone = ZoneRegion.of('America/Los_Angeles');
        const baseUrl = new URL('https://ontheboards.org/events');

        // OTB events have location objects with empty string fields
        const event = (ripper as any).mapEvent(data.upcoming[0], timezone, baseUrl);

        // Empty address fields should result in undefined location
        expect(event.location).toBeUndefined();
    });

    test('maps Amy O\'Neal event correctly', () => {
        const ripper = new SquarespaceRipper();
        const data = loadSampleData();
        const timezone = ZoneRegion.of('America/Los_Angeles');
        const baseUrl = new URL('https://ontheboards.org/events');

        const event = (ripper as any).mapEvent(data.upcoming[1], timezone, baseUrl);

        expect(event.summary).toBe("Amy O'Neal");
        expect(event.date.year()).toBe(2026);
        expect(event.date.monthValue()).toBe(3);
        expect(event.url).toBe('https://ontheboards.org/events/25-26/amy-oneal');
    });

    test('returns null for event missing title', () => {
        const ripper = new SquarespaceRipper();
        const timezone = ZoneRegion.of('America/Los_Angeles');
        const baseUrl = new URL('https://ontheboards.org/events');

        const event = (ripper as any).mapEvent(
            { id: 'test', startDate: 1771560000715 },
            timezone,
            baseUrl
        );

        expect(event).toBeNull();
    });

    test('returns null for event missing startDate', () => {
        const ripper = new SquarespaceRipper();
        const timezone = ZoneRegion.of('America/Los_Angeles');
        const baseUrl = new URL('https://ontheboards.org/events');

        const event = (ripper as any).mapEvent(
            { id: 'test', title: 'Test Event' },
            timezone,
            baseUrl
        );

        expect(event).toBeNull();
    });
});

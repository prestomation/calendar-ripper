import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import { DICERipper } from './dice.js';
import { RipperCalendarEvent, RipperError } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const tz = ZoneId.of('America/Los_Angeles');

function loadSample(source: string): any {
    const raw = readFileSync(join(__dirname, `../../sources/${source}/sample-data.json`), 'utf-8');
    return JSON.parse(raw);
}

// Synthetic fixtures for edge-case tests
const SYNTHETIC_EVENTS = {
    noName: { id: 'syn-1', name: '', date: '2026-03-10T03:00:00Z', date_end: '2026-03-10T07:00:00Z', timezone: 'America/Los_Angeles', address: '123 Test St', venue: 'Test Venue', url: null, description: null, raw_description: null, images: [] },
    noDate: { id: 'syn-2', name: 'Show Without Dates', date: null, date_end: null, timezone: 'America/Los_Angeles', address: '123 Test St', venue: 'Test Venue', url: null, description: null, raw_description: null, images: [] },
    noId: { id: undefined, name: '', date: '2026-03-10T03:00:00Z', date_end: null, timezone: 'America/Los_Angeles', address: '123 Test St', venue: 'Test Venue', url: null, description: null, raw_description: null, images: [] },
    noEnd: { id: 'syn-3', name: 'Open-Ended Event', date: '2026-03-01T03:00:00Z', date_end: null, timezone: 'America/Los_Angeles', address: '123 Test St', venue: 'Test Venue', url: 'https://dice.fm/test', description: null, raw_description: null, images: [] },
    noAddress: { id: 'syn-4', name: 'Online Event', date: '2026-03-01T03:00:00Z', date_end: '2026-03-01T05:00:00Z', timezone: 'America/Los_Angeles', address: null, location: null, venue: 'Test Venue', url: null, description: null, raw_description: null, images: [] },
    withLocationObj: { id: 'syn-5', name: 'Location Object Event', date: '2026-03-01T03:00:00Z', date_end: '2026-03-01T05:00:00Z', timezone: 'America/Los_Angeles', address: null, location: { street: '100 Main St', city: 'Seattle', state: 'Washington', zip: '98101' }, venue: 'Test Venue', url: null, description: null, raw_description: null, images: [] },
    withMarkdownDesc: { id: 'syn-6', name: 'Markdown Event', date: '2026-03-01T03:00:00Z', date_end: '2026-03-01T05:00:00Z', timezone: 'America/Los_Angeles', address: '123 Test St', venue: 'Test Venue', url: null, description: null, raw_description: '***\\*Bold header\\**** and *italic* text', images: [] },
};

describe('DICERipper', () => {
    describe('parsing — Vera Project sample', () => {
        it('extracts events with no errors', () => {
            const ripper = new DICERipper();
            const data = loadSample('vera_project');
            const events = ripper.parseEvents(data.data, tz, '305 Harrison Street, Seattle, WA 98109');

            const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            const errors = events.filter(e => 'type' in e) as RipperError[];
            expect(valid.length).toBe(43);
            expect(errors.length).toBe(0);
        });

        it('parses summary, date, and time correctly', () => {
            const ripper = new DICERipper();
            const data = loadSample('vera_project');
            // Second event is a music show with straightforward times
            const events = ripper.parseEvents(data.data, tz, '') as RipperCalendarEvent[];
            const show = events[1];
            expect(show.summary).toBe('Lesion | Thermal Vision | Next Objective | Coping Method');
            // 2026-02-21T03:00:00Z = 2026-02-20 19:00 PST
            expect(show.date.year()).toBe(2026);
            expect(show.date.monthValue()).toBe(2);
            expect(show.date.dayOfMonth()).toBe(20);
            expect(show.date.hour()).toBe(19);
        });

        it('calculates duration from end time', () => {
            const ripper = new DICERipper();
            const data = loadSample('vera_project');
            const events = ripper.parseEvents(data.data, tz, '') as RipperCalendarEvent[];
            // Second event: 03:00Z to 07:45Z = 4h45m
            const show = events[1];
            expect(show.duration.toMinutes()).toBe(285); // 4*60+45
        });

        it('uses address from API response as location', () => {
            const ripper = new DICERipper();
            const data = loadSample('vera_project');
            const events = ripper.parseEvents(data.data, tz, '') as RipperCalendarEvent[];
            expect(events[0].location).toContain('305 Harrison Street');
            expect(events[0].location).toContain('Seattle');
        });

        it('sets URL from DICE link', () => {
            const ripper = new DICERipper();
            const data = loadSample('vera_project');
            const events = ripper.parseEvents(data.data, tz, '') as RipperCalendarEvent[];
            expect(events[0].url).toContain('dice.fm');
        });

        it('includes event image', () => {
            const ripper = new DICERipper();
            const data = loadSample('vera_project');
            const events = ripper.parseEvents(data.data, tz, '') as RipperCalendarEvent[];
            expect(events[0].image).toContain('dice-media.imgix.net');
        });

        it('assigns the correct event ID', () => {
            const ripper = new DICERipper();
            const data = loadSample('vera_project');
            const events = ripper.parseEvents(data.data, tz, '') as RipperCalendarEvent[];
            expect(events[0].id).toBe('693a1baba570f20001ce05ee');
        });
    });

    describe('parsing — Sunset Tavern sample', () => {
        it('extracts all events with no errors', () => {
            const ripper = new DICERipper();
            const data = loadSample('sunset_tavern');
            const events = ripper.parseEvents(data.data, tz, '5433 Ballard Ave NW, Seattle, WA 98107');

            const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            const errors = events.filter(e => 'type' in e) as RipperError[];
            expect(valid.length).toBe(50);
            expect(errors.length).toBe(0);
        });

        it('parses a late-night show correctly (UTC date crosses day boundary)', () => {
            const ripper = new DICERipper();
            const data = loadSample('sunset_tavern');
            const events = ripper.parseEvents(data.data, tz, '') as RipperCalendarEvent[];
            const first = events[0];
            expect(first.summary).toBe('Whitney Ballen, Small Paul, Don Piano');
            // 2026-02-21T04:30:00Z = 2026-02-20 20:30 PST
            expect(first.date.year()).toBe(2026);
            expect(first.date.monthValue()).toBe(2);
            expect(first.date.dayOfMonth()).toBe(20);
            expect(first.date.hour()).toBe(20);
            expect(first.date.minute()).toBe(30);
        });

        it('calculates duration for typical show (3 hours)', () => {
            const ripper = new DICERipper();
            const data = loadSample('sunset_tavern');
            const events = ripper.parseEvents(data.data, tz, '') as RipperCalendarEvent[];
            // Second event: 04:30Z to 07:30Z = 3 hours
            const second = events[1];
            expect(second.duration.toHours()).toBe(3);
        });
    });

    describe('deduplication', () => {
        it('ignores duplicate IDs', () => {
            const ripper = new DICERipper();
            const data = loadSample('vera_project');
            const doubled = [...data.data, ...data.data];
            const events = ripper.parseEvents(doubled, tz, '');
            expect(events.filter(e => 'summary' in e).length).toBe(43);
        });
    });

    describe('error handling', () => {
        it('returns ParseError for event with no name', () => {
            const ripper = new DICERipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noName], tz, '');
            const [e] = events.filter(e => 'type' in e) as RipperError[];
            expect(e.type).toBe('ParseError');
            expect(e.reason).toContain('no name');
        });

        it('returns ParseError for event with no date', () => {
            const ripper = new DICERipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noDate], tz, '');
            const [e] = events.filter(e => 'type' in e) as RipperError[];
            expect(e.type).toBe('ParseError');
            expect(e.reason).toContain('No start time');
        });

        it('uses "unknown" as context when event has no ID', () => {
            const ripper = new DICERipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noId], tz, '');
            const errors = events.filter(e => 'type' in e) as RipperError[];
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].context).toBe('unknown');
        });
    });

    describe('defaults and fallbacks', () => {
        it('falls back to defaultLocation when address is null', () => {
            const ripper = new DICERipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noAddress], tz, 'Fallback Location');
            const [e] = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            expect(e.location).toBe('Fallback Location');
        });

        it('builds location from location object when address is null', () => {
            const ripper = new DICERipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.withLocationObj], tz, 'Fallback');
            const [e] = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            expect(e.location).toContain('100 Main St');
            expect(e.location).toContain('Seattle');
        });

        it('uses defaultDurationHours when date_end is null', () => {
            const ripper = new DICERipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noEnd], tz, '', 4);
            const [e] = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            expect(e.duration.toHours()).toBe(4);
        });

        it('defaults to 3-hour duration when defaultDurationHours is not specified', () => {
            const ripper = new DICERipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noEnd], tz, '');
            const [e] = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            expect(e.duration.toHours()).toBe(3);
        });

        it('cleans markdown formatting from description', () => {
            const ripper = new DICERipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.withMarkdownDesc], tz, '');
            const [e] = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            expect(e.description).not.toContain('***');
            expect(e.description).not.toContain('\\*');
        });

        it('uses event timezone from API response', () => {
            const ripper = new DICERipper();
            const data = loadSample('vera_project');
            const events = ripper.parseEvents(data.data, tz, '') as RipperCalendarEvent[];
            expect(events[0].date.zone().id()).toBe('America/Los_Angeles');
        });
    });
});

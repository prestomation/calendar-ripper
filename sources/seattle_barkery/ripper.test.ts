import { describe, expect, test } from 'vitest';
import SeattleBarkeryRipper from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any {
    const jsonPath = path.join(__dirname, 'sample-data.json');
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

const testDate = ZonedDateTime.parse('2025-03-01T00:00:00-08:00[America/Los_Angeles]');

describe('Seattle Barkery Ripper', () => {
    test('parses all events from sample data', async () => {
        const ripper = new SeattleBarkeryRipper();
        const jsonData = loadSampleData();
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid).toHaveLength(8);
    });

    test('parses event dates and times correctly', async () => {
        const ripper = new SeattleBarkeryRipper();
        const jsonData = loadSampleData();
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // First event: Tattoo Time! - March 1, 2025 at 11:00 AM
        const tattooEvent = valid.find(e => e.summary === 'Tattoo Time!');
        expect(tattooEvent).toBeDefined();
        expect(tattooEvent!.date.year()).toBe(2025);
        expect(tattooEvent!.date.monthValue()).toBe(3);
        expect(tattooEvent!.date.dayOfMonth()).toBe(1);
        expect(tattooEvent!.date.hour()).toBe(11);
        expect(tattooEvent!.date.minute()).toBe(0);
    });

    test('calculates duration correctly', async () => {
        const ripper = new SeattleBarkeryRipper();
        const jsonData = loadSampleData();
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Tattoo Time! is 11:00 to 16:00 = 5 hours
        const tattooEvent = valid.find(e => e.summary === 'Tattoo Time!');
        expect(tattooEvent!.duration.toHours()).toBe(5);
        expect(tattooEvent!.duration.toMinutes() % 60).toBe(0);

        // Beer event is 12:00 to 22:00 = 10 hours
        const beerEvent = valid.find(e => e.summary.includes('Drink Beer'));
        expect(beerEvent!.duration.toHours()).toBe(10);

        // Dog Paw Art is 16:00 to 19:00 = 3 hours
        const pawArtEvent = valid.find(e => e.summary === 'Dog Paw Art');
        expect(pawArtEvent!.duration.toHours()).toBe(3);
    });

    test('decodes HTML entities in titles', async () => {
        const ripper = new SeattleBarkeryRipper();
        const jsonData = loadSampleData();
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // "Drink Beer for a Good Cause – Old Dog Haven" has an en dash (&#8211; -> –)
        const beerEvent = valid.find(e => e.summary.includes('Old Dog Haven'));
        expect(beerEvent).toBeDefined();
        expect(beerEvent!.summary).toContain('\u2013'); // en dash
        expect(beerEvent!.summary).not.toContain('&#8211;');

        // Pi Day Pie Workshop has &#8211; and &#038;
        const piWorkshop = valid.find(e => e.summary.includes('Pi Day Pie Workshop'));
        expect(piWorkshop).toBeDefined();
        expect(piWorkshop!.summary).toContain('\u2013'); // en dash
        expect(piWorkshop!.summary).toContain('&'); // decoded &#038;
        expect(piWorkshop!.summary).not.toContain('&#038;');

        // St Patrick's Day has &#8217; (right single quote)
        const stPatEvent = valid.find(e => e.summary.includes('Patrick'));
        expect(stPatEvent).toBeDefined();
        expect(stPatEvent!.summary).toContain('\u2019'); // right single quote
        expect(stPatEvent!.summary).not.toContain('&#8217;');
    });

    test('formats location from venue data', async () => {
        const ripper = new SeattleBarkeryRipper();
        const jsonData = loadSampleData();
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Tattoo Time! at The Treat Bar (Shoreline)
        const tattooEvent = valid.find(e => e.summary === 'Tattoo Time!');
        expect(tattooEvent!.location).toContain('The Treat Bar (Shoreline)');
        expect(tattooEvent!.location).toContain('516 NE 165th Street');
        expect(tattooEvent!.location).toContain('Shoreline');

        // Beer event at Hellbent Brewing
        const beerEvent = valid.find(e => e.summary.includes('Drink Beer'));
        expect(beerEvent!.location).toContain('Hellbent Brewing Company');
        expect(beerEvent!.location).toContain('13035 Lake City Way NE');
    });

    test('strips HTML from descriptions', async () => {
        const ripper = new SeattleBarkeryRipper();
        const jsonData = loadSampleData();
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const tattooEvent = valid.find(e => e.summary === 'Tattoo Time!');
        expect(tattooEvent!.description).toBeDefined();
        expect(tattooEvent!.description).not.toContain('<h2>');
        expect(tattooEvent!.description).not.toContain('<p>');
        expect(tattooEvent!.description).toContain('Tattoo Time!');
    });

    test('includes cost in description when present', async () => {
        const ripper = new SeattleBarkeryRipper();
        const jsonData = loadSampleData();
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const tattooEvent = valid.find(e => e.summary === 'Tattoo Time!');
        expect(tattooEvent!.description).toContain('Cost: $10');
    });

    test('includes image URLs', async () => {
        const ripper = new SeattleBarkeryRipper();
        const jsonData = loadSampleData();
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const tattooEvent = valid.find(e => e.summary === 'Tattoo Time!');
        expect(tattooEvent!.image).toBeDefined();
        expect(tattooEvent!.image).toContain('theseattlebarkery.com');
        expect(tattooEvent!.description).toContain('Event image:');
    });

    test('includes event URLs', async () => {
        const ripper = new SeattleBarkeryRipper();
        const jsonData = loadSampleData();
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const tattooEvent = valid.find(e => e.summary === 'Tattoo Time!');
        expect(tattooEvent!.url).toBe('https://theseattlebarkery.com/event/tattoo-time/');
    });

    test('deduplicates events across multiple calls', async () => {
        const ripper = new SeattleBarkeryRipper();
        const jsonData = loadSampleData();

        const events1 = await ripper.parseEvents(jsonData, testDate, {});
        const events2 = await ripper.parseEvents(jsonData, testDate, {});

        const valid1 = events1.filter(e => 'summary' in e);
        const valid2 = events2.filter(e => 'summary' in e);

        expect(valid1).toHaveLength(8);
        expect(valid2).toHaveLength(0); // all deduped
    });

    test('handles invalid JSON structure', async () => {
        const ripper = new SeattleBarkeryRipper();
        const events = await ripper.parseEvents({ bad: 'data' }, testDate, {});

        expect(events).toHaveLength(1);
        expect(events[0]).toHaveProperty('type', 'ParseError');
    });

    test('handles empty events array', async () => {
        const ripper = new SeattleBarkeryRipper();
        const events = await ripper.parseEvents({ events: [] }, testDate, {});

        expect(events).toHaveLength(0);
    });

    test('handles all-day events', async () => {
        const ripper = new SeattleBarkeryRipper();
        const jsonData = loadSampleData();
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // "Celebrate Pi Day 2025!" is an all-day event (00:00 to 23:59)
        const piDayEvent = valid.find(e => e.summary.includes('Celebrate Pi Day'));
        expect(piDayEvent).toBeDefined();
        expect(piDayEvent!.date.hour()).toBe(0);
        expect(piDayEvent!.date.minute()).toBe(0);
    });

    test('returns ParseError for event missing start_date_details', async () => {
        const ripper = new SeattleBarkeryRipper();
        const jsonData = {
            events: [{
                id: 99901,
                title: "Bad Event",
                start_date_details: null,
                end_date_details: { year: "2025", month: "03", day: "01", hour: "12", minutes: "00", seconds: "00" },
                timezone: "America/Los_Angeles"
            }]
        };
        const events = await ripper.parseEvents(jsonData, testDate, {});

        expect(events).toHaveLength(1);
        expect(events[0]).toHaveProperty('type', 'ParseError');
        expect((events[0] as any).reason).toContain('missing start_date_details');
    });

    test('returns ParseError for event missing end_date_details', async () => {
        const ripper = new SeattleBarkeryRipper();
        const jsonData = {
            events: [{
                id: 99902,
                title: "Bad Event",
                start_date_details: { year: "2025", month: "03", day: "01", hour: "11", minutes: "00", seconds: "00" },
                end_date_details: null,
                timezone: "America/Los_Angeles"
            }]
        };
        const events = await ripper.parseEvents(jsonData, testDate, {});

        expect(events).toHaveLength(1);
        expect(events[0]).toHaveProperty('type', 'ParseError');
        expect((events[0] as any).reason).toContain('missing end_date_details');
    });

    test('falls back to default timezone for invalid timezone string', async () => {
        const ripper = new SeattleBarkeryRipper();
        const jsonData = {
            events: [{
                id: 99903,
                title: "Timezone Fallback Event",
                start_date_details: { year: "2025", month: "06", day: "15", hour: "10", minutes: "00", seconds: "00" },
                end_date_details: { year: "2025", month: "06", day: "15", hour: "12", minutes: "00", seconds: "00" },
                timezone: "Invalid/Timezone",
                url: "https://example.com"
            }]
        };
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid).toHaveLength(1);
        expect(valid[0].summary).toBe('Timezone Fallback Event');
        expect(valid[0].date.zone().toString()).toBe('America/Los_Angeles');
    });

    test('clamps negative duration to zero', async () => {
        const ripper = new SeattleBarkeryRipper();
        const jsonData = {
            events: [{
                id: 99904,
                title: "Backwards Time Event",
                start_date_details: { year: "2025", month: "03", day: "01", hour: "14", minutes: "00", seconds: "00" },
                end_date_details: { year: "2025", month: "03", day: "01", hour: "10", minutes: "00", seconds: "00" },
                timezone: "America/Los_Angeles",
                url: "https://example.com"
            }]
        };
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid).toHaveLength(1);
        expect(valid[0].duration.toHours()).toBe(0);
        expect(valid[0].duration.toMinutes()).toBe(0);
    });
});

import { describe, expect, test } from 'vitest';
import ShowboxPresentsRipper from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'node-html-parser';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml() {
    const htmlPath = path.join(__dirname, 'sample-data.html');
    return parse(fs.readFileSync(htmlPath, 'utf8'));
}

const testDate = ZonedDateTime.parse('2026-02-10T00:00:00-08:00[America/Los_Angeles]');

describe('Showbox Presents Ripper', () => {
    test('parses Showbox SoDo events correctly', async () => {
        const ripper = new ShowboxPresentsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {
            venue: 'Showbox SoDo',
            address: '1700 1st Ave S, Seattle, WA 98134'
        });

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(validEvents.length).toBe(2);

        // THE ELOVATERS
        const elovaters = validEvents.find(e => e.summary.includes('THE ELOVATERS'));
        expect(elovaters).toBeDefined();
        expect(elovaters!.id).toBe('1131539');
        expect(elovaters!.date.year()).toBe(2026);
        expect(elovaters!.date.monthValue()).toBe(2);
        expect(elovaters!.date.dayOfMonth()).toBe(12);
        expect(elovaters!.date.hour()).toBe(19);
        expect(elovaters!.date.minute()).toBe(0);
        expect(elovaters!.summary).toContain('with Special Guests Shwayze and JARV');
        expect(elovaters!.location).toBe('Showbox SoDo, 1700 1st Ave S, Seattle, WA 98134');
        expect(elovaters!.url).toBe('https://www.showboxpresents.com/events/detail/1131539');
        expect(elovaters!.image).toBeDefined();
        expect(elovaters!.description).toContain('SUNBURN TOUR 2026');

        // Atmosphere
        const atmosphere = validEvents.find(e => e.summary.includes('Atmosphere'));
        expect(atmosphere).toBeDefined();
        expect(atmosphere!.id).toBe('1183933');
        expect(atmosphere!.date.hour()).toBe(19);
        expect(atmosphere!.date.minute()).toBe(30);
        expect(atmosphere!.summary).toContain('with Sage Francis');
    });

    test('parses The Showbox events correctly', async () => {
        const ripper = new ShowboxPresentsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {
            venue: 'The Showbox',
            address: '1426 1st Avenue, Seattle, WA 98101'
        });

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(validEvents.length).toBe(2);

        // LEVEL UP & ZINGARA
        const levelUp = validEvents.find(e => e.summary.includes('LEVEL UP'));
        expect(levelUp).toBeDefined();
        expect(levelUp!.id).toBe('1146714');
        expect(levelUp!.date.year()).toBe(2026);
        expect(levelUp!.date.monthValue()).toBe(2);
        expect(levelUp!.date.dayOfMonth()).toBe(13);
        expect(levelUp!.date.hour()).toBe(21);
        expect(levelUp!.location).toBe('The Showbox, 1426 1st Avenue, Seattle, WA 98101');
        expect(levelUp!.description).toContain('PARALLEL SPIRITS TOUR 2026');

        // Test Brunch Show (AM time)
        const brunch = validEvents.find(e => e.summary.includes('Test Brunch Show'));
        expect(brunch).toBeDefined();
        expect(brunch!.date.hour()).toBe(11);
        expect(brunch!.date.minute()).toBe(0);
    });

    test('parses Neumos events correctly', async () => {
        const ripper = new ShowboxPresentsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {
            venue: 'Neumos',
            address: '925 E Pike St, Seattle, WA 98103'
        });

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(validEvents.length).toBe(1);

        const richBrian = validEvents[0];
        expect(richBrian.id).toBe('1317756');
        expect(richBrian.summary).toBe('Rich Brian');
        expect(richBrian.date.dayOfMonth()).toBe(14);
        expect(richBrian.date.hour()).toBe(20);
        expect(richBrian.location).toBe('Neumos, 925 E Pike St, Seattle, WA 98103');
        expect(richBrian.description).toContain('WHERE IS MY HEAD? 2026 WORLD TOUR');
        // No support acts, so summary should just be the artist name
        expect(richBrian.summary).not.toContain('with');
    });

    test('filters out events at non-matching venues', async () => {
        const ripper = new ShowboxPresentsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {
            venue: 'The Showbox',
            address: '1426 1st Avenue, Seattle, WA 98101'
        });

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        // Should not include Wonder Ballroom, Showbox SoDo, or Neumos events
        for (const event of validEvents) {
            expect(event.location).toContain('The Showbox');
        }
    });

    test('deduplicates events across multiple parseEvents calls', async () => {
        const ripper = new ShowboxPresentsRipper();
        const html = loadSampleHtml();
        const config = { venue: 'Showbox SoDo', address: '1700 1st Ave S, Seattle, WA 98134' };

        const firstCall = await ripper.parseEvents(html, testDate, config);
        const secondCall = await ripper.parseEvents(html, testDate, config);

        const firstEvents = firstCall.filter(e => 'summary' in e);
        const secondEvents = secondCall.filter(e => 'summary' in e);

        expect(firstEvents.length).toBe(2);
        expect(secondEvents.length).toBe(0);
    });

    test('handles empty HTML gracefully', async () => {
        const ripper = new ShowboxPresentsRipper();
        const html = parse('<html><body></body></html>');

        const events = await ripper.parseEvents(html, testDate, {
            venue: 'The Showbox',
            address: '1426 1st Avenue, Seattle, WA 98101'
        });

        expect(events.length).toBe(0);
    });

    test('all events have required fields', async () => {
        const ripper = new ShowboxPresentsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {
            venue: 'Showbox SoDo',
            address: '1700 1st Ave S, Seattle, WA 98134'
        });

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        for (const event of validEvents) {
            expect(event.ripped).toBeInstanceOf(Date);
            expect(event.date).toBeDefined();
            expect(event.duration).toBeDefined();
            expect(event.summary).toBeTruthy();
            expect(event.id).toBeTruthy();
            expect(event.url).toBeTruthy();
            expect(event.location).toBeTruthy();
            expect(event.duration.toHours()).toBe(3);
        }
    });
});

import { describe, expect, test } from 'vitest';
import ElCorazonRipper from './ripper.js';
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

describe('El Corazon Ripper', () => {
    test('parses El Corazón events correctly', async () => {
        const ripper = new ElCorazonRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {
            venue: 'El Corazón',
            address: '109 Eastlake Avenue East, Seattle, WA 98109'
        });

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(validEvents.length).toBe(3);

        // Coroner
        const coroner = validEvents.find(e => e.summary.includes('Coroner'));
        expect(coroner).toBeDefined();
        expect(coroner!.id).toBe('coroner-13-feb');
        expect(coroner!.date.year()).toBe(2026);
        expect(coroner!.date.monthValue()).toBe(2);
        expect(coroner!.date.dayOfMonth()).toBe(13);
        expect(coroner!.date.hour()).toBe(18);
        expect(coroner!.date.minute()).toBe(45);
        expect(coroner!.summary).toContain('Heathen, Rising Of The Tides, Hellbox');
        expect(coroner!.location).toBe('El Corazón, 109 Eastlake Avenue East, Seattle, WA 98109');
        expect(coroner!.url).toBe('https://www.elcorazonseattle.com/shows/coroner-13-feb');
        expect(coroner!.image).toBeDefined();

        // The Emo Night Tour (no support acts)
        const emoNight = validEvents.find(e => e.summary.includes('Emo Night'));
        expect(emoNight).toBeDefined();
        expect(emoNight!.id).toBe('the-emo-night-tour-21-feb');
        expect(emoNight!.date.monthValue()).toBe(2);
        expect(emoNight!.date.dayOfMonth()).toBe(21);
        expect(emoNight!.date.hour()).toBe(20);
        expect(emoNight!.summary).toBe('The Emo Night Tour');

        // A Wilhelm Scream
        const wilhelm = validEvents.find(e => e.summary.includes('Wilhelm Scream'));
        expect(wilhelm).toBeDefined();
        expect(wilhelm!.date.dayOfMonth()).toBe(24);
        expect(wilhelm!.date.hour()).toBe(20);
        expect(wilhelm!.summary).toContain('Death by Stereo');
    });

    test('parses The Funhouse events correctly', async () => {
        const ripper = new ElCorazonRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {
            venue: 'The Funhouse',
            address: '109 Eastlake Avenue East, Seattle, WA 98109'
        });

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(validEvents.length).toBe(3);

        // Braden Bales
        const braden = validEvents.find(e => e.summary.includes('Braden Bales'));
        expect(braden).toBeDefined();
        expect(braden!.id).toBe('braden-bales-11-feb');
        expect(braden!.date.year()).toBe(2026);
        expect(braden!.date.monthValue()).toBe(2);
        expect(braden!.date.dayOfMonth()).toBe(11);
        expect(braden!.date.hour()).toBe(19);
        expect(braden!.date.minute()).toBe(30);
        expect(braden!.summary).toContain('Ezra, AfterThought');
        expect(braden!.location).toBe('The Funhouse, 109 Eastlake Avenue East, Seattle, WA 98109');
        expect(braden!.url).toBe('https://www.elcorazonseattle.com/shows/braden-bales-11-feb');
    });

    test('filters out events at non-matching venues', async () => {
        const ripper = new ElCorazonRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {
            venue: 'El Corazón',
            address: '109 Eastlake Avenue East, Seattle, WA 98109'
        });

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        for (const event of validEvents) {
            expect(event.location).toContain('El Corazón');
        }
    });

    test('deduplicates events across multiple parseEvents calls', async () => {
        const ripper = new ElCorazonRipper();
        const html = loadSampleHtml();
        const config = { venue: 'El Corazón', address: '109 Eastlake Avenue East, Seattle, WA 98109' };

        const firstCall = await ripper.parseEvents(html, testDate, config);
        const secondCall = await ripper.parseEvents(html, testDate, config);

        const firstEvents = firstCall.filter(e => 'summary' in e);
        const secondEvents = secondCall.filter(e => 'summary' in e);

        expect(firstEvents.length).toBe(3);
        expect(secondEvents.length).toBe(0);
    });

    test('processing both venues with same ripper returns all events', async () => {
        const ripper = new ElCorazonRipper();
        const html = loadSampleHtml();
        const address = '109 Eastlake Avenue East, Seattle, WA 98109';

        const elCorazonEvents = await ripper.parseEvents(html, testDate, {
            venue: 'El Corazón', address
        });
        const funhouseEvents = await ripper.parseEvents(html, testDate, {
            venue: 'The Funhouse', address
        });

        const ecValid = elCorazonEvents.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const fhValid = funhouseEvents.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(ecValid.length).toBe(3);
        expect(fhValid.length).toBe(3);

        // Verify no cross-venue contamination
        for (const event of ecValid) {
            expect(event.location).toContain('El Corazón');
        }
        for (const event of fhValid) {
            expect(event.location).toContain('The Funhouse');
        }
    });

    test('handles empty HTML gracefully', async () => {
        const ripper = new ElCorazonRipper();
        const html = parse('<html><body></body></html>');

        const events = await ripper.parseEvents(html, testDate, {
            venue: 'El Corazón',
            address: '109 Eastlake Avenue East, Seattle, WA 98109'
        });

        expect(events.length).toBe(0);
    });

    test('all events have required fields', async () => {
        const ripper = new ElCorazonRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {
            venue: 'El Corazón',
            address: '109 Eastlake Avenue East, Seattle, WA 98109'
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

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZoneId } from '@js-joda/core';
import { parseEvents } from './ripper.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSample(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

const ZONE = ZoneId.of('America/Los_Angeles');

describe('Neumos parseEvents', () => {
    it('parses every event listed on the page', () => {
        const results = parseEvents(loadSample(), ZONE);
        const events = results.filter(r => 'date' in r) as RipperCalendarEvent[];
        expect(events.length).toBe(12);
    });

    it('parses the Zinadelphia show with date, time, ticket link, and tagline', () => {
        const results = parseEvents(loadSample(), ZONE);
        const events = results.filter(r => 'date' in r) as RipperCalendarEvent[];
        const zina = events.find(e => e.summary.startsWith('Zinadelphia'));
        expect(zina).toBeDefined();
        expect(zina!.summary).toBe('Zinadelphia with Sophia Bacino');
        expect(zina!.date.year()).toBe(2026);
        expect(zina!.date.monthValue()).toBe(5);
        expect(zina!.date.dayOfMonth()).toBe(6);
        expect(zina!.date.hour()).toBe(19);
        expect(zina!.date.minute()).toBe(0);
        expect(zina!.location).toBe('Neumos, 925 E Pike St, Seattle, WA 98122');
        expect(zina!.url).toBe('https://www.neumos.com/events/detail/zinadelphia-tickets-1303196');
        expect(zina!.id).toBe('neumos-1303196');
        expect(zina!.image).toContain('axs.com');
        expect(zina!.description).toContain('Tickets:');
        expect(zina!.description).toContain('Doors: 7:00 PM');
    });

    it('handles events without a tagline', () => {
        const results = parseEvents(loadSample(), ZONE);
        const events = results.filter(r => 'date' in r) as RipperCalendarEvent[];
        const terror = events.find(e => e.summary.startsWith('Northwest Terror Fest'));
        expect(terror).toBeDefined();
        expect(terror!.summary).toBe('Northwest Terror Fest VIII');
        expect(terror!.date.dayOfMonth()).toBe(7);
        expect(terror!.date.hour()).toBe(16); // Doors: 4:00 PM
    });

    it('does not double up the "with" prefix when the tagline already includes it', () => {
        const results = parseEvents(loadSample(), ZONE);
        const events = results.filter(r => 'date' in r) as RipperCalendarEvent[];
        const telehealth = events.find(e => e.summary.startsWith('Telehealth'));
        expect(telehealth).toBeDefined();
        expect(telehealth!.summary).toBe('Telehealth with Coral Grief and Buddy Wynkopp');
        expect(telehealth!.summary).not.toContain('with with');
    });

    it('decodes HTML entities in titles and taglines', () => {
        const results = parseEvents(loadSample(), ZONE);
        const events = results.filter(r => 'date' in r) as RipperCalendarEvent[];
        for (const e of events) {
            expect(e.summary).not.toMatch(/&(amp|#\d+|rsquo|apos);/);
            if (e.description) expect(e.description).not.toMatch(/&(amp|#\d+);/);
        }
    });

    it('uses a stable id derived from the AXS event id in the URL', () => {
        const results = parseEvents(loadSample(), ZONE);
        const events = results.filter(r => 'date' in r) as RipperCalendarEvent[];
        const ids = events.map(e => e.id);
        for (const id of ids) {
            expect(id).toMatch(/^neumos-\d+$/);
        }
        expect(new Set(ids).size).toBe(ids.length); // all unique
    });

    it('gives a 3 hour default duration', () => {
        const results = parseEvents(loadSample(), ZONE);
        const events = results.filter(r => 'date' in r) as RipperCalendarEvent[];
        for (const e of events) {
            expect(e.duration.toHours()).toBe(3);
        }
    });

    it('returns ParseResult only — never null', () => {
        const results = parseEvents(loadSample(), ZONE);
        for (const r of results) {
            expect(r === null).toBe(false);
            expect('date' in r || 'type' in r).toBe(true);
        }
    });

    it('returns no errors for a healthy page', () => {
        const results = parseEvents(loadSample(), ZONE);
        const errors = results.filter(r => 'type' in r);
        expect(errors.length).toBe(0);
    });
});

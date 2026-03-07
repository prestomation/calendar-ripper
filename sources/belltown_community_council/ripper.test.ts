import { describe, it, expect } from 'vitest';
import BelltownCommunityCouncilRipper from './ripper.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';
import { LocalDate, ZoneRegion } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zone = ZoneRegion.of('America/Los_Angeles');

// Use a reference date before all test events
const BEFORE_ALL_EVENTS = LocalDate.of(2026, 1, 1);
// Use a reference date after the 2026 March event but before the 2031 event
const AFTER_MARCH_2026 = LocalDate.of(2026, 4, 1);

function loadSampleData(): any[] {
    const raw = fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8');
    return JSON.parse(raw).posts;
}

describe('BelltownCommunityCouncilRipper', () => {
    const ripper = new BelltownCommunityCouncilRipper();

    describe('parseEvents', () => {
        it('extracts BCC Meeting events from sample data', () => {
            const posts = loadSampleData();
            const events = ripper.parseEvents(posts, zone, BEFORE_ALL_EVENTS);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
            // Should find March 2026 and April 2031 meetings (both future from BEFORE_ALL_EVENTS)
            expect(calEvents.length).toBeGreaterThanOrEqual(2);
        });

        it('parses meeting date correctly', () => {
            const posts = loadSampleData();
            const events = ripper.parseEvents(posts, zone, BEFORE_ALL_EVENTS);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
            const march2026 = calEvents.find(e => e.date.year() === 2026);
            expect(march2026).toBeDefined();
            expect(march2026!.date.monthValue()).toBe(3);
            expect(march2026!.date.dayOfMonth()).toBe(11);
        });

        it('sets meeting time to 6:30 PM', () => {
            const posts = loadSampleData();
            const events = ripper.parseEvents(posts, zone, BEFORE_ALL_EVENTS);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
            for (const event of calEvents) {
                expect(event.date.hour()).toBe(18);
                expect(event.date.minute()).toBe(30);
            }
        });

        it('sets duration to 90 minutes', () => {
            const posts = loadSampleData();
            const events = ripper.parseEvents(posts, zone, BEFORE_ALL_EVENTS);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
            expect(calEvents.length).toBeGreaterThan(0);
            expect(calEvents[0].duration.toMinutes()).toBe(90);
        });

        it('extracts agenda from title as summary', () => {
            const posts = loadSampleData();
            const events = ripper.parseEvents(posts, zone, BEFORE_ALL_EVENTS);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
            const march2026 = calEvents.find(e => e.date.year() === 2026);
            expect(march2026!.summary).toContain('SDOT City Arborist');
        });

        it('extracts location from "See you at" pattern', () => {
            const posts = loadSampleData();
            const events = ripper.parseEvents(posts, zone, BEFORE_ALL_EVENTS);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
            const march2026 = calEvents.find(e => e.date.year() === 2026);
            expect(march2026!.location).toContain('Partners in Print');
        });

        it('filters out past meetings', () => {
            const posts = loadSampleData();
            const events = ripper.parseEvents(posts, zone, AFTER_MARCH_2026);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
            // March 2026 meeting should be filtered out; only April 2031 remains
            const march2026 = calEvents.find(e => e.date.year() === 2026);
            expect(march2026).toBeUndefined();
        });

        it('ignores "No meeting" posts', () => {
            const posts = loadSampleData();
            const events = ripper.parseEvents(posts, zone, BEFORE_ALL_EVENTS);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
            // "No meeting October 2025" should not produce an event
            const octEvent = calEvents.find(e => e.date.monthValue() === 10 && e.date.year() === 2025);
            expect(octEvent).toBeUndefined();
        });

        it('ignores non-meeting posts', () => {
            const posts = loadSampleData();
            const events = ripper.parseEvents(posts, zone, BEFORE_ALL_EVENTS);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
            // "Belltown Mural Festival 2025" should not produce an event
            const muralEvent = calEvents.find(e => e.summary?.toLowerCase().includes('mural'));
            expect(muralEvent).toBeUndefined();
        });

        it('sets event URL', () => {
            const posts = loadSampleData();
            const events = ripper.parseEvents(posts, zone, BEFORE_ALL_EVENTS);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
            expect(calEvents.length).toBeGreaterThan(0);
            expect(calEvents[0].url).toContain('belltown-cc.org');
        });

        it('deduplicates events with the same date', () => {
            const posts = [
                {
                    ID: 1,
                    title: 'BCC Meeting Wednesday April 9th 2031: First Post',
                    URL: 'http://belltown-cc.org/2031/04/01/',
                    content: '<p>See you at Test Venue, 100 Main St.</p>'
                },
                {
                    ID: 2,
                    title: 'BCC Meeting Wednesday April 9th 2031: Updated Post',
                    URL: 'http://belltown-cc.org/2031/04/02/',
                    content: '<p>See you at Test Venue, 100 Main St.</p>'
                }
            ];
            const events = ripper.parseEvents(posts, zone, BEFORE_ALL_EVENTS);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
            expect(calEvents).toHaveLength(1);
        });

        it('falls back to default location when none found', () => {
            const posts = [{
                ID: 99,
                title: 'BCC Meeting Wednesday June 11th 2031: Test',
                URL: 'http://belltown-cc.org/2031/06/01/',
                content: '<p>Our next meeting has no location info.</p>'
            }];
            const events = ripper.parseEvents(posts, zone, BEFORE_ALL_EVENTS);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
            expect(calEvents.length).toBeGreaterThan(0);
            expect(calEvents[0].location).toBe('Belltown, Seattle, WA');
        });
    });
});

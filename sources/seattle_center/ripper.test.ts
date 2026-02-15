import { describe, it, expect } from 'vitest';
import SeattleCenterRipper from './ripper.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';
import { ZoneRegion } from '@js-joda/core';
import { parse } from 'node-html-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const timezone = ZoneRegion.of('America/Los_Angeles');

describe('SeattleCenterRipper', () => {
    const ripper = new SeattleCenterRipper();

    describe('parseDateTime', () => {
        it('parses a morning time', () => {
            const result = ripper.parseDateTime('February 15', '11:00 a.m.', timezone);
            expect(result).not.toBeNull();
            expect(result!.monthValue()).toBe(2);
            expect(result!.dayOfMonth()).toBe(15);
            expect(result!.hour()).toBe(11);
            expect(result!.minute()).toBe(0);
        });

        it('parses an evening time', () => {
            const result = ripper.parseDateTime('February 15', '7:00 p.m.', timezone);
            expect(result).not.toBeNull();
            expect(result!.hour()).toBe(19);
            expect(result!.minute()).toBe(0);
        });

        it('parses All Day as midnight', () => {
            const result = ripper.parseDateTime('February 15', 'All Day', timezone);
            expect(result).not.toBeNull();
            expect(result!.hour()).toBe(0);
            expect(result!.minute()).toBe(0);
        });

        it('handles noon correctly', () => {
            const result = ripper.parseDateTime('March 1', '12:00 p.m.', timezone);
            expect(result).not.toBeNull();
            expect(result!.hour()).toBe(12);
        });

        it('handles midnight correctly', () => {
            const result = ripper.parseDateTime('March 1', '12:00 a.m.', timezone);
            expect(result).not.toBeNull();
            expect(result!.hour()).toBe(0);
        });

        it('returns null for invalid date format', () => {
            const result = ripper.parseDateTime('Invalid', '7:00 p.m.', timezone);
            expect(result).toBeNull();
        });

        it('returns null for invalid time format', () => {
            const result = ripper.parseDateTime('February 15', 'invalid time', timezone);
            expect(result).toBeNull();
        });
    });

    describe('extractLocation', () => {
        it('extracts venue name from Google Maps URL', () => {
            const html = parse('<a href="https://www.google.com/maps/place/Seattle+Center/@47.6219473,-122.353933,17z" class="event-list__location-link">Location</a>');
            const link = html.querySelector('.event-list__location-link');
            expect(ripper.extractLocation(link)).toBe('Seattle Center');
        });

        it('extracts venue with special characters', () => {
            const html = parse('<a href="https://www.google.com/maps/place/Seattle+Children&#39;s+Theatre/@47.62" class="event-list__location-link">Location</a>');
            const link = html.querySelector('.event-list__location-link');
            expect(ripper.extractLocation(link)).toBe("Seattle Children's Theatre");
        });

        it('cleans up address suffixes from venue name', () => {
            const html = parse('<a href="https://www.google.com/maps/place/Armory,+Seattle,+WA+98109/@47.62" class="event-list__location-link">Location</a>');
            const link = html.querySelector('.event-list__location-link');
            expect(ripper.extractLocation(link)).toBe('Armory');
        });

        it('extracts Climate Pledge Arena', () => {
            const html = parse('<a href="https://www.google.com/maps/place/Climate+Pledge+Arena/@47.6221,-122.35" class="event-list__location-link">Location</a>');
            const link = html.querySelector('.event-list__location-link');
            expect(ripper.extractLocation(link)).toBe('Climate Pledge Arena');
        });

        it('returns null when no link provided', () => {
            expect(ripper.extractLocation(null)).toBeNull();
        });

        it('returns null when href has no maps/place pattern', () => {
            const html = parse('<a href="https://example.com" class="event-list__location-link">Location</a>');
            const link = html.querySelector('.event-list__location-link');
            expect(ripper.extractLocation(link)).toBeNull();
        });
    });

    describe('parseEventsFromHtml', () => {
        it('parses events from sample data HTML', () => {
            const sampleHtml = fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
            const events = ripper.parseEventsFromHtml([sampleHtml], timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents.length).toBe(5);

            // First event: All Day sculpture walk on Feb 15
            expect(calEvents[0].summary).toBe('Seattle Center Sculpture Walk 2026');
            expect(calEvents[0].date.monthValue()).toBe(2);
            expect(calEvents[0].date.dayOfMonth()).toBe(15);
            expect(calEvents[0].date.hour()).toBe(0);
            expect(calEvents[0].duration.toHours()).toBe(12);
            expect(calEvents[0].location).toBe('Seattle Center');
            expect(calEvents[0].description).toContain('art installations');

            // Second event: Tet in Seattle at 11:00 a.m. on Feb 15
            expect(calEvents[1].summary).toContain('in Seattle');
            expect(calEvents[1].date.dayOfMonth()).toBe(15);
            expect(calEvents[1].date.hour()).toBe(11);
            expect(calEvents[1].duration.toHours()).toBe(2);
            expect(calEvents[1].location).toBe('Armory');
            expect(calEvents[1].description).toContain('Vietnamese Lunar New Year');

            // Third event: Ghost at 7:00 p.m. on Feb 15
            expect(calEvents[2].summary).toBe('Ghost');
            expect(calEvents[2].date.dayOfMonth()).toBe(15);
            expect(calEvents[2].date.hour()).toBe(19);
            expect(calEvents[2].location).toBe('Climate Pledge Arena');

            // Fourth event: Sculpture Walk on Feb 16 (different date)
            expect(calEvents[3].summary).toBe('Seattle Center Sculpture Walk 2026');
            expect(calEvents[3].date.dayOfMonth()).toBe(16);
            expect(calEvents[3].date.hour()).toBe(0);

            // Fifth event: Farmers Market at 10:00 a.m. on Feb 16
            expect(calEvents[4].summary).toBe('Seattle Center Farmers Market');
            expect(calEvents[4].date.dayOfMonth()).toBe(16);
            expect(calEvents[4].date.hour()).toBe(10);
        });

        it('generates correct event URLs', () => {
            const sampleHtml = fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
            const events = ripper.parseEventsFromHtml([sampleHtml], timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents[0].url).toBe('https://www.seattlecenter.com/events/event-calendar/seattle-center-sculpture-walk-2026-x46190');
            expect(calEvents[2].url).toBe('https://www.seattlecenter.com/events/event-calendar/ghost');
        });

        it('generates correct event IDs from slugs', () => {
            const sampleHtml = fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
            const events = ripper.parseEventsFromHtml([sampleHtml], timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(calEvents[0].id).toBe('seattle-center-sculpture-walk-2026-x46190');
            expect(calEvents[2].id).toBe('ghost');
        });

        it('handles events with empty descriptions', () => {
            const sampleHtml = fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
            const events = ripper.parseEventsFromHtml([sampleHtml], timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            // The farmers market event has empty description
            expect(calEvents[4].description).toBeUndefined();
        });

        it('handles multiple pages of HTML', () => {
            const sampleHtml = fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
            // Simulate two pages of the same data
            const events = ripper.parseEventsFromHtml([sampleHtml, sampleHtml], timezone);
            const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            // Should have events from both pages
            expect(calEvents.length).toBe(10);
        });

        it('returns empty array for HTML with no events', () => {
            const html = '<html><body><p>No events</p></body></html>';
            const events = ripper.parseEventsFromHtml([html], timezone);
            expect(events).toHaveLength(0);
        });
    });
});

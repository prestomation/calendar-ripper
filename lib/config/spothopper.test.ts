import { describe, it, expect } from 'vitest';
import { SpotHopperRipper } from './spothopper.js';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import { readFileSync } from 'fs';
import * as path from 'path';
import { parse } from 'node-html-parser';

const timezone = ZoneId.of('America/Los_Angeles');

describe('SpotHopperRipper', () => {
    const ripper = new SpotHopperRipper();

    describe('parseEvents with sample data', () => {
        const sampleHtml = readFileSync(
            path.join(process.cwd(), 'sources/a_stir/sample-data.html'),
            'utf-8'
        );

        it('parses events from sample HTML', () => {
            const { events, errors } = ripper.parseEvents(sampleHtml, timezone);
            expect(events.length).toBeGreaterThan(0);
            // Sample has 26 event cards
            expect(events.length + errors.length).toBe(26);
        });

        it('extracts correct fields from a simple event', () => {
            const { events } = ripper.parseEvents(sampleHtml, timezone);
            const privateEvent = events.find(e => e.summary === 'Private Event Downstairs - SLC');
            expect(privateEvent).toBeDefined();
            expect(privateEvent!.id).toBe('2687433');
            expect(privateEvent!.date.year()).toBe(2026);
            expect(privateEvent!.date.monthValue()).toBe(5);
            expect(privateEvent!.date.dayOfMonth()).toBe(7);
            expect(privateEvent!.date.hour()).toBe(18);
            expect(privateEvent!.date.minute()).toBe(0);
            expect(privateEvent!.duration.toHours()).toBe(3);
            expect(privateEvent!.duration.toMinutes()).toBe(180);
        });

        it('parses event with description', () => {
            const { events } = ripper.parseEvents(sampleHtml, timezone);
            const afterParty = events.find(e => e.summary === 'One Shot Seattle After Party');
            expect(afterParty).toBeDefined();
            expect(afterParty!.description).toContain('Emerald City King');
            expect(afterParty!.date.hour()).toBe(17);
            expect(afterParty!.date.minute()).toBe(30);
            // 5:30 PM - 9:00 PM = 3.5 hours = 210 minutes
            expect(afterParty!.duration.toMinutes()).toBe(210);
        });

        it('handles recurring events and adds recurrence note', () => {
            const { events } = ripper.parseEvents(sampleHtml, timezone);
            const soapbox = events.find(e => e.summary === 'Soapbox: A Literary Open Mic');
            expect(soapbox).toBeDefined();
            expect(soapbox!.description).toContain('Recurrence: Monthly on x');
            expect(soapbox!.date.hour()).toBe(19);
        });

        it('normalizes image URLs from // to https://', () => {
            const { events } = ripper.parseEvents(sampleHtml, timezone);
            const withImage = events.find(e => e.image);
            expect(withImage).toBeDefined();
            expect(withImage!.image).toMatch(/^https:\/\//);
            expect(withImage!.image).toContain('static.spotapps.co');
        });

        it('deduplicates events by ID', () => {
            const { events } = ripper.parseEvents(sampleHtml, timezone);
            const ids = events.map(e => e.id).filter(Boolean);
            const uniqueIds = new Set(ids);
            expect(ids.length).toBe(uniqueIds.size);
        });
    });

    describe('parseCard', () => {
        it('returns ParseError for card without title', () => {
            const card = parse(`
                <div class="event-calendar-card" data-event-start-date="2026-05-07T00:00:00.000+00:00" data-event-start-time="18:00" id="123">
                    <div class="event-text-holder"></div>
                </div>
            `).querySelector('div')!;
            const result = ripper.parseCard(card, timezone);
            expect('type' in result).toBe(true);
            if ('type' in result) {
                expect(result.reason).toContain('missing title');
            }
        });

        it('returns ParseError for card without start date', () => {
            const card = parse(`
                <div class="event-calendar-card" data-event-start-date="" data-event-start-time="18:00" id="123">
                    <div class="event-text-holder"><h2>Test Event</h2></div>
                </div>
            `).querySelector('div')!;
            const result = ripper.parseCard(card, timezone);
            expect('type' in result).toBe(true);
            if ('type' in result) {
                expect(result.reason).toContain('missing data-event-start-date');
            }
        });

        it('defaults to 3-hour duration when time is missing', () => {
            const card = parse(`
                <div class="event-calendar-card" data-event-start-date="2026-05-07T00:00:00.000+00:00" data-event-start-time="18:00" id="123">
                    <div class="event-text-holder">
                        <h2>Test Event</h2>
                        <p class="event-main-text event-day">Thursday May 7th</p>
                    </div>
                </div>
            `).querySelector('div')!;
            const result = ripper.parseCard(card, timezone);
            expect('date' in result).toBe(true);
            if ('date' in result) {
                expect(result.duration.toHours()).toBe(3);
            }
        });
    });
});

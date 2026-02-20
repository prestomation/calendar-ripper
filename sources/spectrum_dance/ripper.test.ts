import { describe, it, expect } from 'vitest';
import SpectrumDanceRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import { LocalDate, ZoneRegion } from '@js-joda/core';
import '@js-joda/timezone';

const timezone = ZoneRegion.of('America/Los_Angeles');

// Generate a future date string in "MM/DD/YYYY" format
function futureDateStr(daysFromNow: number): string {
    const date = LocalDate.now().plusDays(daysFromNow);
    const m = String(date.monthValue()).padStart(2, '0');
    const d = String(date.dayOfMonth()).padStart(2, '0');
    const y = String(date.year());
    return `${m}/${d}/${y}`;
}

function makePerformance(overrides: Record<string, any> = {}): any {
    return {
        performanceId: 11675861,
        performanceDate: futureDateStr(7),
        performanceTime: "8:00 PM",
        performanceTime24: "20:00:00",
        performanceSuperTitle: "",
        performanceSubTitle: "",
        performanceNotes: "",
        productionId: 1247156,
        productionName: "The Insidious Trilogy: A THEATRICAL EVENT ",
        productionDescription: "<p>A powerful dance performance.</p>",
        productionLogoLink: "https://web.ovationtix.com/trs/clientFile/605312",
        hasAvailableTickets: true,
        allDayEvent: false,
        ...overrides
    };
}

describe('SpectrumDanceRipper', () => {
    const ripper = new SpectrumDanceRipper();

    it('should parse a performance into a calendar event', () => {
        const performances = [makePerformance()];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        const event = calEvents[0];
        expect(event.summary).toBe('The Insidious Trilogy: A THEATRICAL EVENT');
        expect(event.id).toBe('ovationtix-spectrum-11675861');
        expect(event.location).toContain('Spectrum Dance Theater');
        expect(event.location).toContain('800 Lake Washington Blvd E');
        expect(event.url).toBe('https://web.ovationtix.com/trs/pe.c/36947');
        expect(event.image).toBe('https://web.ovationtix.com/trs/clientFile/605312');
    });

    it('should trim trailing whitespace from production name', () => {
        const performances = [makePerformance({ productionName: '  My Show  ' })];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].summary).toBe('My Show');
    });

    it('should parse date and time correctly', () => {
        const performances = [makePerformance({ performanceDate: futureDateStr(3), performanceTime24: '15:00:00' })];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        const event = calEvents[0];
        expect(event.date.hour()).toBe(15);
        expect(event.date.minute()).toBe(0);
    });

    it('should skip past events', () => {
        const pastDate = LocalDate.now().minusDays(1);
        const m = String(pastDate.monthValue()).padStart(2, '0');
        const d = String(pastDate.dayOfMonth()).padStart(2, '0');
        const pastDateStr = `${m}/${d}/${pastDate.year()}`;

        const performances = [
            makePerformance({ performanceDate: pastDateStr }),
            makePerformance({ performanceId: 11675862, performanceDate: futureDateStr(5) }),
        ];

        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].id).toBe('ovationtix-spectrum-11675862');
    });

    it('should include subtitle and description', () => {
        const performances = [makePerformance({
            performanceSubTitle: "World Premiere",
            productionDescription: "<p>An <b>epic</b> performance</p>"
        })];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].description).toContain('World Premiere');
        expect(calEvents[0].description).toContain('An epic performance');
    });

    it('should include superTitle in summary when present', () => {
        const performances = [makePerformance({ performanceSuperTitle: "Opening Night" })];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].summary).toBe('The Insidious Trilogy: A THEATRICAL EVENT: Opening Night');
    });

    it('should return a ParseError for null dates', () => {
        const performances = [makePerformance({ performanceDate: null, performanceTime24: null })];
        const events = ripper.parseEvents(performances, timezone);
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('should return a ParseError for malformed date string', () => {
        const performances = [makePerformance({ performanceDate: '20260520', performanceTime24: '20:00:00' })];
        const events = ripper.parseEvents(performances, timezone);
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('should handle missing optional fields gracefully', () => {
        const performances = [makePerformance({
            performanceSuperTitle: "",
            performanceSubTitle: "",
            performanceNotes: "",
            productionDescription: "",
            productionLogoLink: null,
        })];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].description).toBeUndefined();
        expect(calEvents[0].image).toBeUndefined();
    });

    it('should strip HTML tags from description', () => {
        const performances = [makePerformance({
            performanceSubTitle: "",
            productionDescription: "<div><p>Dance &amp; <strong>movement</strong></p></div>"
        })];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].description).toBe('Dance & movement');
    });

    it('should set duration to 2 hours', () => {
        const performances = [makePerformance()];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].duration.toMinutes()).toBe(120);
    });

    it('should parse multiple performances', () => {
        const performances = [
            makePerformance({ performanceId: 11675861, performanceDate: futureDateStr(2) }),
            makePerformance({ performanceId: 11675862, performanceDate: futureDateStr(3), productionName: "Show Two" }),
            makePerformance({ performanceId: 11675863, performanceDate: futureDateStr(4), productionName: "Show Three" }),
        ];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(3);
        expect(calEvents.map(e => e.id)).toEqual([
            'ovationtix-spectrum-11675861',
            'ovationtix-spectrum-11675862',
            'ovationtix-spectrum-11675863',
        ]);
    });

    it('should parse real sample data', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const samplePath = path.join(new URL('.', import.meta.url).pathname, 'sample-data.json');
        const raw = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
        const performancesByDate = raw.performancesByDateDisplay ?? {};
        const performances: any[] = [];
        for (const datePerfs of Object.values(performancesByDate) as any[][]) {
            performances.push(...datePerfs);
        }

        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(0);
        // All 5 performances are in May 2026 (future)
        expect(calEvents.length).toBeGreaterThan(0);
        expect(calEvents[0].location).toContain('Spectrum Dance Theater');
    });
});

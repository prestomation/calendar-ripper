import { describe, it, expect } from 'vitest';
import TaprootRipper from './ripper.js';
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
        performanceId: 11740149,
        performanceDate: futureDateStr(7),
        performanceTime: "7:30 PM",
        performanceTime24: "19:30:00",
        performanceSuperTitle: "",
        performanceSubTitle: "By C.S. Lewis, adapted for stage by Karen Lund",
        performanceNotes: "",
        productionId: 1261756,
        productionName: "Till We Have Faces",
        productionDescription: "<b>A world premiere retelling of the myth of Cupid and Psyche.</b>",
        productionLogoLink: "https://web.ovationtix.com/trs/clientFile/603312",
        hasAvailableTickets: true,
        allDayEvent: false,
        ...overrides
    };
}

describe('TaprootRipper', () => {
    const ripper = new TaprootRipper();

    it('should parse a performance into a calendar event', () => {
        const performances = [makePerformance()];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        const event = calEvents[0];
        expect(event.summary).toBe('Till We Have Faces');
        expect(event.id).toBe('ovationtix-taproot-11740149');
        expect(event.location).toContain('Taproot Theatre');
        expect(event.location).toContain('204 N 85th St');
        expect(event.url).toBe('https://web.ovationtix.com/trs/pe.c/37019');
        expect(event.image).toBe('https://web.ovationtix.com/trs/clientFile/603312');
    });

    it('should parse date and time correctly', () => {
        const performances = [makePerformance({ performanceDate: futureDateStr(3), performanceTime24: '14:00:00' })];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        const event = calEvents[0];
        expect(event.date.hour()).toBe(14);
        expect(event.date.minute()).toBe(0);
    });

    it('should skip past events', () => {
        const pastDate = LocalDate.now().minusDays(1);
        const m = String(pastDate.monthValue()).padStart(2, '0');
        const d = String(pastDate.dayOfMonth()).padStart(2, '0');
        const pastDateStr = `${m}/${d}/${pastDate.year()}`;

        const performances = [
            makePerformance({ performanceDate: pastDateStr }),
            makePerformance({ performanceId: 11740200, performanceDate: futureDateStr(5) }),
        ];

        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].id).toBe('ovationtix-taproot-11740200');
    });

    it('should include subtitle and description', () => {
        const performances = [makePerformance({
            performanceSubTitle: "By the author",
            productionDescription: "<p>A great <b>show</b></p>"
        })];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].description).toContain('By the author');
        expect(calEvents[0].description).toContain('A great show');
    });

    it('should include superTitle in summary when present', () => {
        const performances = [makePerformance({ performanceSuperTitle: "Mainstage" })];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].summary).toBe('Till We Have Faces: Mainstage');
    });

    it('should return a ParseError for invalid dates', () => {
        const performances = [makePerformance({ performanceDate: null, performanceTime24: null })];
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
            productionDescription: "<div><p>Hello &amp; <strong>world</strong></p></div>"
        })];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].description).toBe('Hello & world');
    });

    it('should set duration to 2.5 hours', () => {
        const performances = [makePerformance()];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].duration.toMinutes()).toBe(150);
    });

    it('should parse multiple performances and deduplicate by performanceId', () => {
        const performances = [
            makePerformance({ performanceId: 1, performanceDate: futureDateStr(2) }),
            makePerformance({ performanceId: 2, performanceDate: futureDateStr(3), productionName: "Show Two" }),
            makePerformance({ performanceId: 3, performanceDate: futureDateStr(4), productionName: "Show Three" }),
        ];
        const events = ripper.parseEvents(performances, timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(3);
        expect(calEvents.map(e => e.id)).toEqual([
            'ovationtix-taproot-1',
            'ovationtix-taproot-2',
            'ovationtix-taproot-3',
        ]);
    });
});

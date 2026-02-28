import { describe, it, expect } from 'vitest';
import { ZoneId, Period } from '@js-joda/core';
import '@js-joda/timezone';
import { TicketmasterRipper } from './ticketmaster.js';
import { RipperCalendarEvent, RipperError, RipperConfig, Ripper } from './schema.js';

const tz = ZoneId.of('America/Los_Angeles');

// Synthetic Ticketmaster event fixtures
function makeTmEvent(overrides: Record<string, any> = {}): any {
    return {
        id: 'vvG1fZ9kJSxYqp',
        name: 'Seattle Symphony: Beethoven & Brahms',
        url: 'https://www.ticketmaster.com/event/vvG1fZ9kJSxYqp',
        dates: {
            start: {
                localDate: '2026-04-15',
                localTime: '19:30:00',
            },
            status: { code: 'onsale' },
        },
        priceRanges: [{ min: 25, max: 150 }],
        info: 'Experience an evening of classical masterworks.',
        pleaseNote: 'Doors open 1 hour before showtime.',
        images: [
            { url: 'https://img.example.com/small.jpg', ratio: '4_3', width: 320 },
            { url: 'https://img.example.com/wide.jpg', ratio: '16_9', width: 1024 },
        ],
        _embedded: {
            venues: [{
                name: 'Benaroya Hall - S. Mark Taper Auditorium',
                address: { line1: '200 University St' },
                city: { name: 'Seattle' },
                state: { stateCode: 'WA' },
            }],
        },
        ...overrides,
    };
}

describe('TicketmasterRipper', () => {
    describe('parseEvents — basic parsing', () => {
        it('extracts event summary, date, and time', () => {
            const ripper = new TicketmasterRipper();
            const [event] = ripper.parseEvents([makeTmEvent()], tz, {}) as RipperCalendarEvent[];
            expect(event.summary).toBe('Seattle Symphony: Beethoven & Brahms');
            expect(event.date.year()).toBe(2026);
            expect(event.date.monthValue()).toBe(4);
            expect(event.date.dayOfMonth()).toBe(15);
            expect(event.date.hour()).toBe(19);
            expect(event.date.minute()).toBe(30);
        });

        it('defaults to 2-hour duration', () => {
            const ripper = new TicketmasterRipper();
            const [event] = ripper.parseEvents([makeTmEvent()], tz, {}) as RipperCalendarEvent[];
            expect(event.duration.toHours()).toBe(2);
        });

        it('sets event ID with tm- prefix', () => {
            const ripper = new TicketmasterRipper();
            const [event] = ripper.parseEvents([makeTmEvent()], tz, {}) as RipperCalendarEvent[];
            expect(event.id).toBe('tm-vvG1fZ9kJSxYqp');
        });

        it('includes URL from API response', () => {
            const ripper = new TicketmasterRipper();
            const [event] = ripper.parseEvents([makeTmEvent()], tz, {}) as RipperCalendarEvent[];
            expect(event.url).toContain('ticketmaster.com');
        });

        it('builds location from venue data', () => {
            const ripper = new TicketmasterRipper();
            const [event] = ripper.parseEvents([makeTmEvent()], tz, {}) as RipperCalendarEvent[];
            expect(event.location).toContain('Benaroya Hall');
            expect(event.location).toContain('200 University St');
            expect(event.location).toContain('Seattle');
        });

        it('builds description from info, pleaseNote, and price', () => {
            const ripper = new TicketmasterRipper();
            const [event] = ripper.parseEvents([makeTmEvent()], tz, {}) as RipperCalendarEvent[];
            expect(event.description).toContain('classical masterworks');
            expect(event.description).toContain('Doors open');
            expect(event.description).toContain('$25 - $150');
        });

        it('selects 16:9 image over other ratios', () => {
            const ripper = new TicketmasterRipper();
            const [event] = ripper.parseEvents([makeTmEvent()], tz, {}) as RipperCalendarEvent[];
            expect(event.image).toBe('https://img.example.com/wide.jpg');
        });
    });

    describe('parseEvents — configurable defaultDurationHours', () => {
        it('uses defaultDurationHours from config', () => {
            const ripper = new TicketmasterRipper();
            const config = { defaultDurationHours: 3 };
            const [event] = ripper.parseEvents([makeTmEvent()], tz, config) as RipperCalendarEvent[];
            expect(event.duration.toHours()).toBe(3);
        });

        it('falls back to 2 hours when defaultDurationHours is not set', () => {
            const ripper = new TicketmasterRipper();
            const [event] = ripper.parseEvents([makeTmEvent()], tz, {}) as RipperCalendarEvent[];
            expect(event.duration.toHours()).toBe(2);
        });
    });

    describe('parseEvents — date formats', () => {
        it('parses localDate + localTime', () => {
            const ripper = new TicketmasterRipper();
            const [event] = ripper.parseEvents([makeTmEvent()], tz, {}) as RipperCalendarEvent[];
            expect(event.date.hour()).toBe(19);
            expect(event.date.minute()).toBe(30);
        });

        it('parses dateTime (ISO 8601 with timezone)', () => {
            const ripper = new TicketmasterRipper();
            const ev = makeTmEvent({
                dates: {
                    start: { dateTime: '2026-05-01T03:30:00Z' },
                    status: { code: 'onsale' },
                },
            });
            const [event] = ripper.parseEvents([ev], tz, {}) as RipperCalendarEvent[];
            // 03:30 UTC = 20:30 PDT (UTC-7)
            expect(event.date.year()).toBe(2026);
            expect(event.date.monthValue()).toBe(4);
            expect(event.date.dayOfMonth()).toBe(30);
            expect(event.date.hour()).toBe(20);
            expect(event.date.minute()).toBe(30);
        });

        it('defaults to 19:30 when only localDate is available', () => {
            const ripper = new TicketmasterRipper();
            const ev = makeTmEvent({
                dates: {
                    start: { localDate: '2026-06-15' },
                    status: { code: 'onsale' },
                },
            });
            const [event] = ripper.parseEvents([ev], tz, {}) as RipperCalendarEvent[];
            expect(event.date.hour()).toBe(19);
            expect(event.date.minute()).toBe(30);
        });

        it('returns ParseError when date cannot be parsed', () => {
            const ripper = new TicketmasterRipper();
            const ev = makeTmEvent({
                dates: { start: {}, status: { code: 'onsale' } },
            });
            const events = ripper.parseEvents([ev], tz, {});
            const errors = events.filter(e => 'type' in e) as RipperError[];
            expect(errors.length).toBe(1);
            expect(errors[0].type).toBe('ParseError');
            expect(errors[0].reason).toContain('Could not parse date');
        });
    });

    describe('parseEvents — status filtering', () => {
        it('skips cancelled events', () => {
            const ripper = new TicketmasterRipper();
            const ev = makeTmEvent({
                dates: {
                    start: { localDate: '2026-04-15', localTime: '19:30:00' },
                    status: { code: 'cancelled' },
                },
            });
            const events = ripper.parseEvents([ev], tz, {});
            expect(events.filter(e => 'summary' in e).length).toBe(0);
        });

        it('includes postponed events with status note', () => {
            const ripper = new TicketmasterRipper();
            const ev = makeTmEvent({
                dates: {
                    start: { localDate: '2026-04-15', localTime: '19:30:00' },
                    status: { code: 'postponed' },
                },
            });
            const [event] = ripper.parseEvents([ev], tz, {}) as RipperCalendarEvent[];
            expect(event.description).toContain('POSTPONED');
        });
    });

    describe('parseEvents — deduplication', () => {
        it('skips duplicate event IDs', () => {
            const ripper = new TicketmasterRipper();
            const ev = makeTmEvent();
            const events = ripper.parseEvents([ev, ev, ev], tz, {});
            expect(events.filter(e => 'summary' in e).length).toBe(1);
        });

        it('deduplicates across multiple parseEvents calls', () => {
            const ripper = new TicketmasterRipper();
            const ev = makeTmEvent();
            ripper.parseEvents([ev], tz, {});
            const events = ripper.parseEvents([ev], tz, {});
            expect(events.filter(e => 'summary' in e).length).toBe(0);
        });
    });

    describe('parseEvents — location fallback', () => {
        it('falls back to config venueName + venueAddress when API venue has no address', () => {
            const ripper = new TicketmasterRipper();
            const ev = makeTmEvent({
                _embedded: { venues: [{ name: 'Some Venue' }] },
            });
            const config = { venueName: 'Benaroya Hall', venueAddress: '200 University St, Seattle, WA 98101' };
            const [event] = ripper.parseEvents([ev], tz, config) as RipperCalendarEvent[];
            expect(event.location).toBe('Benaroya Hall, 200 University St, Seattle, WA 98101');
        });

        it('uses config venueName when no venue data at all', () => {
            const ripper = new TicketmasterRipper();
            const ev = makeTmEvent({ _embedded: {} });
            const config = { venueName: 'Benaroya Hall', venueAddress: '200 University St, Seattle, WA 98101' };
            const [event] = ripper.parseEvents([ev], tz, config) as RipperCalendarEvent[];
            expect(event.location).toBe('Benaroya Hall, 200 University St, Seattle, WA 98101');
        });
    });

    describe('parseEvents — error handling', () => {
        it('skips events with no ID', () => {
            const ripper = new TicketmasterRipper();
            const ev = makeTmEvent({ id: undefined });
            const events = ripper.parseEvents([ev], tz, {});
            expect(events.length).toBe(0);
        });

        it('skips events with no name', () => {
            const ripper = new TicketmasterRipper();
            const ev = makeTmEvent({ name: undefined });
            const events = ripper.parseEvents([ev], tz, {});
            expect(events.length).toBe(0);
        });

        it('returns ParseError for events that throw during parsing', () => {
            const ripper = new TicketmasterRipper();
            // Create an event that will cause a parse error (invalid date format)
            const ev = makeTmEvent({
                id: 'bad-event',
                dates: {
                    start: { dateTime: 'not-a-date' },
                    status: { code: 'onsale' },
                },
            });
            const events = ripper.parseEvents([ev], tz, {});
            const errors = events.filter(e => 'type' in e) as RipperError[];
            expect(errors.length).toBe(1);
            expect(errors[0].type).toBe('ParseError');
        });
    });

    describe('parseEvents — multiple events', () => {
        it('parses multiple events correctly', () => {
            const ripper = new TicketmasterRipper();
            const events = [
                makeTmEvent({ id: 'ev-1', name: 'Concert A' }),
                makeTmEvent({ id: 'ev-2', name: 'Concert B', dates: { start: { localDate: '2026-05-01', localTime: '20:00:00' }, status: { code: 'onsale' } } }),
                makeTmEvent({ id: 'ev-3', name: 'Concert C', dates: { start: { localDate: '2026-06-01', localTime: '14:00:00' }, status: { code: 'onsale' } } }),
            ];
            const parsed = ripper.parseEvents(events, tz, {}) as RipperCalendarEvent[];
            expect(parsed.length).toBe(3);
            expect(parsed[0].summary).toBe('Concert A');
            expect(parsed[1].summary).toBe('Concert B');
            expect(parsed[2].summary).toBe('Concert C');
            expect(parsed[2].date.hour()).toBe(14);
        });
    });
});

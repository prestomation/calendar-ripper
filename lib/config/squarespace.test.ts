import { describe, expect, test } from 'vitest';
import { SquarespaceRipper, SquarespaceEvent } from './squarespace.js';
import { Duration, ZoneId, ZonedDateTime } from '@js-joda/core';
import { RipperCalendar, RipperCalendarEvent, RipperConfig } from './schema.js';
import '@js-joda/timezone';

// Access the protected mapEvent method via a test subclass
class TestSquarespaceRipper extends SquarespaceRipper {
    public testMapEvent(sqEvent: SquarespaceEvent, timezone: ZoneId, baseUrl: URL) {
        return this.mapEvent(sqEvent, timezone, baseUrl);
    }
}

// Override fetchUpcomingEvents to simulate a network failure without real network calls
class NetworkErrorSquarespaceRipper extends SquarespaceRipper {
    protected async fetchUpcomingEvents(_baseUrl: URL): Promise<SquarespaceEvent[]> {
        throw new Error('network unavailable');
    }
}

// Allows setting a mocked fetch response to test fetchUpcomingEvents logic
class MockFetchSquarespaceRipper extends SquarespaceRipper {
    public setMockResponse(response: object) {
        this.fetchFn = async () => new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

function makeMinimalRipperConfig(): { config: RipperConfig, ripperImpl: SquarespaceRipper } {
    const config = {
        name: 'test-squarespace',
        description: 'Test Squarespace',
        url: new URL('https://example.com/events'),
        friendlyLink: 'https://example.com/events',
        disabled: false,
        proxy: false,
        calendars: [{
            name: 'test-cal',
            friendlyname: 'Test Calendar',
            timezone: ZoneId.of('America/Los_Angeles'),
            config: {},
            expectEmpty: false,
        }],
    } as unknown as RipperConfig;
    return { config, ripperImpl: new NetworkErrorSquarespaceRipper() };
}

const timezone = ZoneId.of('America/Los_Angeles');
const baseUrl = new URL('https://www.example.org/events');

describe('SquarespaceRipper', () => {
    const ripper = new TestSquarespaceRipper();

    describe('mapEvent', () => {
        test('maps a complete Squarespace event to RipperCalendarEvent', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'abc123',
                title: 'Community Art Opening',
                startDate: 1771106400000, // 2026-02-15T10:00:00 PST (approx)
                endDate: 1771113600000,   // 2026-02-15T12:00:00 PST (approx)
                fullUrl: '/events/community-art-opening',
                excerpt: '<p>Join us for an evening of art and community.</p>',
                location: {
                    addressTitle: 'Example Museum',
                    addressLine1: '123 Main St',
                    addressLine2: 'Seattle, WA 98101',
                },
                assetUrl: 'https://images.squarespace-cdn.com/content/image.jpg',
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl);

            expect(event).not.toBeNull();
            const e = event as RipperCalendarEvent;
            expect(e.id).toBe('abc123');
            expect(e.summary).toBe('Community Art Opening');
            expect(e.location).toBe('Example Museum, 123 Main St, Seattle, WA 98101');
            expect(e.url).toBe('https://www.example.org/events/community-art-opening');
            expect(e.description).toBe('Join us for an evening of art and community.');
            expect(e.image).toBe('https://images.squarespace-cdn.com/content/image.jpg');
            expect(e.duration.toHours()).toBe(2);
            expect(e.date).toBeInstanceOf(ZonedDateTime);
        });

        test('calculates duration from start and end dates', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'dur1',
                title: 'Three Hour Workshop',
                startDate: 1771106400000,
                endDate: 1771106400000 + (3 * 60 * 60 * 1000), // +3 hours
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.duration.toHours()).toBe(3);
        });

        test('uses 2-hour default duration when endDate is missing', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'noend1',
                title: 'Open-Ended Event',
                startDate: 1771106400000,
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.duration.toHours()).toBe(2);
        });

        test('uses 2-hour default duration when endDate equals startDate', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'same1',
                title: 'Zero Duration Event',
                startDate: 1771106400000,
                endDate: 1771106400000,
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.duration.toHours()).toBe(2);
        });

        test('returns null when title is missing', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'notitle',
                title: '',
                startDate: 1771106400000,
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl);
            expect(event).toBeNull();
        });

        test('returns null when startDate is missing', () => {
            const sqEvent = {
                id: 'nodate',
                title: 'No Date Event',
                startDate: 0,
            } as SquarespaceEvent;

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl);
            expect(event).toBeNull();
        });

        test('handles missing location gracefully', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'noloc',
                title: 'Virtual Event',
                startDate: 1771106400000,
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.location).toBeUndefined();
        });

        test('handles partial location (only addressTitle)', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'partloc',
                title: 'Partial Location Event',
                startDate: 1771106400000,
                location: {
                    addressTitle: 'The Venue',
                },
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.location).toBe('The Venue');
        });

        test('handles empty location object', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'emptyloc',
                title: 'Empty Location Event',
                startDate: 1771106400000,
                location: {},
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.location).toBeUndefined();
        });

        test('strips HTML from excerpt', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'html1',
                title: 'HTML Description Event',
                startDate: 1771106400000,
                excerpt: '<p class="">Come join us for a <strong>great</strong> time!</p>',
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.description).toBe('Come join us for a great time!');
        });

        test('handles missing excerpt', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'noexc',
                title: 'No Excerpt Event',
                startDate: 1771106400000,
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.description).toBeUndefined();
        });

        test('builds full event URL from relative fullUrl', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'url1',
                title: 'URL Test Event',
                startDate: 1771106400000,
                fullUrl: '/events/2026/2/15/url-test-event',
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.url).toBe('https://www.example.org/events/2026/2/15/url-test-event');
        });

        test('handles missing fullUrl', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'nourl',
                title: 'No URL Event',
                startDate: 1771106400000,
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.url).toBeUndefined();
        });

        test('converts timestamps to correct timezone', () => {
            // 1771106400000 ms = specific UTC instant
            // In America/Los_Angeles, this should be Pacific time
            const sqEvent: SquarespaceEvent = {
                id: 'tz1',
                title: 'Timezone Test',
                startDate: 1771106400000,
            };

            const eventPST = ripper.testMapEvent(sqEvent, ZoneId.of('America/Los_Angeles'), baseUrl) as RipperCalendarEvent;
            const eventUTC = ripper.testMapEvent(sqEvent, ZoneId.of('UTC'), baseUrl) as RipperCalendarEvent;

            // Same instant, different zone representation
            expect(eventPST.date.toEpochSecond()).toBe(eventUTC.date.toEpochSecond());
            expect(eventPST.date.zone().id()).toBe('America/Los_Angeles');
            expect(eventUTC.date.zone().id()).toBe('UTC');
        });
    });

    describe('fetchUpcomingEvents data.past fallback', () => {
        const futureMs = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days from now
        const pastMs = Date.now() - 30 * 24 * 60 * 60 * 1000;   // 30 days ago

        test('returns future events from data.past when data.upcoming is empty', async () => {
            const mockRipper = new MockFetchSquarespaceRipper();
            mockRipper.setMockResponse({
                upcoming: [],
                past: [
                    { id: 'future1', title: 'Future Concert', startDate: futureMs },
                    { id: 'past1', title: 'Past Concert', startDate: pastMs },
                ],
            });
            const events = await (mockRipper as unknown as { fetchUpcomingEvents(u: URL): Promise<SquarespaceEvent[]> })
                .fetchUpcomingEvents(baseUrl);
            expect(events).toHaveLength(1);
            expect(events[0].id).toBe('future1');
        });

        test('returns future events from data.past when data.upcoming is absent', async () => {
            const mockRipper = new MockFetchSquarespaceRipper();
            mockRipper.setMockResponse({
                past: [
                    { id: 'future2', title: 'Another Future Concert', startDate: futureMs },
                ],
            });
            const events = await (mockRipper as unknown as { fetchUpcomingEvents(u: URL): Promise<SquarespaceEvent[]> })
                .fetchUpcomingEvents(baseUrl);
            expect(events).toHaveLength(1);
            expect(events[0].id).toBe('future2');
        });

        test('data.past fallback is skipped when data.upcoming has events', async () => {
            const mockRipper = new MockFetchSquarespaceRipper();
            mockRipper.setMockResponse({
                upcoming: [
                    { id: 'upcoming1', title: 'Upcoming Event', startDate: futureMs },
                ],
                past: [
                    { id: 'future3', title: 'Also Future But In Past Array', startDate: futureMs },
                ],
            });
            const events = await (mockRipper as unknown as { fetchUpcomingEvents(u: URL): Promise<SquarespaceEvent[]> })
                .fetchUpcomingEvents(baseUrl);
            expect(events).toHaveLength(1);
            expect(events[0].id).toBe('upcoming1');
        });

        test('data.past fallback returns no events when all past items are in the past', async () => {
            const mockRipper = new MockFetchSquarespaceRipper();
            mockRipper.setMockResponse({
                upcoming: [],
                past: [
                    { id: 'past2', title: 'Old Concert', startDate: pastMs },
                ],
            });
            const events = await (mockRipper as unknown as { fetchUpcomingEvents(u: URL): Promise<SquarespaceEvent[]> })
                .fetchUpcomingEvents(baseUrl);
            expect(events).toHaveLength(0);
        });
    });

    describe('rip() error handling', () => {
        test('returns error calendar on network failure, does not throw', async () => {
            const { config, ripperImpl } = makeMinimalRipperConfig();
            const calendars: RipperCalendar[] = await ripperImpl.rip({ config, ripperImpl });

            expect(Array.isArray(calendars)).toBe(true);
            expect(calendars.length).toBeGreaterThan(0);
            expect(calendars[0].name).toBeDefined();
            expect(Array.isArray(calendars[0].events)).toBe(true);
            expect(Array.isArray(calendars[0].errors)).toBe(true);
            expect(calendars[0].errors.length).toBeGreaterThan(0);
            expect(calendars[0].errors[0].reason).toContain('network unavailable');
        });
    });
});

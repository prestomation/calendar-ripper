import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RainierArtsCenterRipper from './ripper.js';
import { RipperCalendarEvent, RipperError, Ripper } from '../../lib/config/schema.js';
import { LocalDate } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

// A future date that will always be before the sample event (April 4 2026)
const BEFORE_EVENT = LocalDate.of(2026, 1, 1);
// A date after the sample event
const AFTER_EVENT = LocalDate.of(2026, 5, 1);

describe('RainierArtsCenterRipper', () => {
    describe('parseEventPage', () => {
        it('extracts event from sample HTML', () => {
            const ripper = new RainierArtsCenterRipper();
            const html = loadSampleHtml();
            const url = 'https://rainierartscenter.org/events/world-class-music-presents-dobet-gnahore/';
            const events = ripper.parseEventPage(html, url, BEFORE_EVENT);

            expect(events).toHaveLength(1);
            expect('date' in events[0]).toBe(true);
        });

        it('parses event title correctly', () => {
            const ripper = new RainierArtsCenterRipper();
            const html = loadSampleHtml();
            const url = 'https://rainierartscenter.org/events/world-class-music-presents-dobet-gnahore/';
            const events = ripper.parseEventPage(html, url, BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.summary).toBe('World Class Music Presents: Dobet Gnahore');
        });

        it('parses event date correctly', () => {
            const ripper = new RainierArtsCenterRipper();
            const html = loadSampleHtml();
            const url = 'https://rainierartscenter.org/events/world-class-music-presents-dobet-gnahore/';
            const events = ripper.parseEventPage(html, url, BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.date.year()).toBe(2026);
            expect(event.date.monthValue()).toBe(4);
            expect(event.date.dayOfMonth()).toBe(4);
        });

        it('parses event start time correctly', () => {
            const ripper = new RainierArtsCenterRipper();
            const html = loadSampleHtml();
            const url = 'https://rainierartscenter.org/events/world-class-music-presents-dobet-gnahore/';
            const events = ripper.parseEventPage(html, url, BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            // ISO datetime "2026-04-04T13:00:00-07:00" → hour 13, minute 0
            expect(event.date.hour()).toBe(13);
            expect(event.date.minute()).toBe(0);
        });

        it('parses event duration correctly', () => {
            const ripper = new RainierArtsCenterRipper();
            const html = loadSampleHtml();
            const url = 'https://rainierartscenter.org/events/world-class-music-presents-dobet-gnahore/';
            const events = ripper.parseEventPage(html, url, BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            // ISO datetime endDate - startDate: 14:30 - 13:00 = 90 minutes
            expect(event.duration.toMinutes()).toBe(90);
        });

        it('sets location with room name and venue address', () => {
            const ripper = new RainierArtsCenterRipper();
            const html = loadSampleHtml();
            const url = 'https://rainierartscenter.org/events/world-class-music-presents-dobet-gnahore/';
            const events = ripper.parseEventPage(html, url, BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.location).toContain('Rainier Arts Center');
            expect(event.location).toContain('3515 S Alaska St');
        });

        it('sets event URL', () => {
            const ripper = new RainierArtsCenterRipper();
            const html = loadSampleHtml();
            const url = 'https://rainierartscenter.org/events/world-class-music-presents-dobet-gnahore/';
            const events = ripper.parseEventPage(html, url, BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.url).toContain('rainierartscenter.org');
        });

        it('returns empty array for past events', () => {
            const ripper = new RainierArtsCenterRipper();
            const html = loadSampleHtml();
            const url = 'https://rainierartscenter.org/events/world-class-music-presents-dobet-gnahore/';
            // Use a date after the event (May 1, 2026 > April 4, 2026)
            const events = ripper.parseEventPage(html, url, AFTER_EVENT);

            expect(events).toHaveLength(0);
        });

        it('returns empty array for expired events', () => {
            const ripper = new RainierArtsCenterRipper();
            const html = `<html><body>
                <div class="mec-event-status">Expired!</div>
                <script type="application/ld+json" class="yoast-schema-graph">
                {"@context":"https://schema.org","@graph":[{"@type":"Event","name":"Past Show"}]}
                </script>
                </body></html>`;
            const events = ripper.parseEventPage(html, 'https://rainierartscenter.org/events/past-show/', BEFORE_EVENT);

            expect(events).toHaveLength(0);
        });

        it('parses ISO datetime startDate with endDate for duration', () => {
            const ripper = new RainierArtsCenterRipper();
            const html = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-05-10T19:00:00-07:00",
                    "endDate": "2026-05-10T21:30:00-07:00",
                    "name": "ISO Datetime Event",
                    "description": "Test",
                    "url": "https://rainierartscenter.org/events/iso-test/",
                    "location": {"@type": "Place", "name": "Auditorium", "address": ""}
                }
                </script>
                </body></html>`;
            const events = ripper.parseEventPage(html, 'https://rainierartscenter.org/events/iso-test/', BEFORE_EVENT);

            expect(events).toHaveLength(1);
            const event = events[0] as RipperCalendarEvent;
            expect(event.date.hour()).toBe(19);
            expect(event.date.minute()).toBe(0);
            expect(event.duration.toMinutes()).toBe(150);
        });

        it('correctly converts timezone offset to venue local time', () => {
            const ripper = new RainierArtsCenterRipper();
            // UTC offset -05:00 does not match LA timezone (PDT=-07, PST=-08).
            // 19:00 at UTC-5 = 00:00 UTC next day = 17:00 PDT (UTC-7) on the same day.
            const html = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-07-15T19:00:00-05:00",
                    "endDate": "2026-07-15T21:00:00-05:00",
                    "name": "East Coast Offset Event",
                    "description": "Test",
                    "url": "https://rainierartscenter.org/events/tz-test/",
                    "location": {"@type": "Place", "name": "", "address": ""}
                }
                </script>
                </body></html>`;
            const events = ripper.parseEventPage(html, 'https://rainierartscenter.org/events/tz-test/', BEFORE_EVENT);

            expect(events).toHaveLength(1);
            const event = events[0] as RipperCalendarEvent;
            // 19:00 UTC-5 = 17:00 PDT (UTC-7), not 19:00
            expect(event.date.hour()).toBe(17);
            expect(event.date.minute()).toBe(0);
            expect(event.duration.toMinutes()).toBe(120);
        });

        it('falls back to MEC HTML time for date-only startDate', () => {
            const ripper = new RainierArtsCenterRipper();
            const html = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-06-15",
                    "endDate": "2026-06-15",
                    "name": "Date Only Event",
                    "description": "Test",
                    "url": "https://rainierartscenter.org/events/date-only/",
                    "location": {"@type": "Place", "name": "", "address": ""}
                }
                </script>
                <div class="mec-single-event-time"><abbr class="mec-events-abbr">7:00 pm - 9:00 pm</abbr></div>
                </body></html>`;
            const events = ripper.parseEventPage(html, 'https://rainierartscenter.org/events/date-only/', BEFORE_EVENT);

            expect(events).toHaveLength(1);
            const event = events[0] as RipperCalendarEvent;
            expect(event.date.hour()).toBe(19);
            expect(event.date.minute()).toBe(0);
            expect(event.duration.toMinutes()).toBe(120);
        });

        it('returns ParseError when no JSON-LD Event found', () => {
            const ripper = new RainierArtsCenterRipper();
            const html = '<html><body><p>No events here</p></body></html>';
            const events = ripper.parseEventPage(html, 'https://example.com/', BEFORE_EVENT);

            expect(events).toHaveLength(1);
            expect('type' in events[0]).toBe(true);
            expect((events[0] as RipperError).type).toBe('ParseError');
        });

        it('returns empty array for cancelled events', () => {
            const ripper = new RainierArtsCenterRipper();
            const html = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-06-01",
                    "endDate": "2026-06-01",
                    "name": "Cancelled: Black Business Market",
                    "description": "",
                    "url": "https://rainierartscenter.org/events/cancelled-black-business-market/",
                    "location": {"@type": "Place", "name": "Auditorium", "address": ""}
                }
                </script>
                <div class="mec-single-event-time"><abbr class="mec-events-abbr">11:00 am - 3:00 pm</abbr></div>
                </body></html>`;
            const events = ripper.parseEventPage(html, 'https://rainierartscenter.org/events/cancelled-black-business-market/', BEFORE_EVENT);

            expect(events).toHaveLength(0);
        });

        it('uses venue address when room name is empty', () => {
            const ripper = new RainierArtsCenterRipper();
            const html = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-06-15",
                    "endDate": "2026-06-15",
                    "name": "Test Event",
                    "description": "A test event",
                    "url": "https://rainierartscenter.org/events/test-event/",
                    "location": {"@type": "Place", "name": "", "address": ""}
                }
                </script>
                <div class="mec-single-event-time"><abbr class="mec-events-abbr">7:00 pm - 9:00 pm</abbr></div>
                </body></html>`;
            const events = ripper.parseEventPage(html, 'https://rainierartscenter.org/events/test-event/', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.location).toBe('Rainier Arts Center, 3515 S Alaska St, Seattle, WA 98118');
        });
    });

    describe('parseTime', () => {
        it('parses "8:00 pm - 9:30 pm" correctly', () => {
            const ripper = new RainierArtsCenterRipper();
            const result = ripper.parseTime('8:00 pm - 9:30 pm');
            expect(result.hour).toBe(20);
            expect(result.minute).toBe(0);
            expect(result.durationMinutes).toBe(90);
        });

        it('parses "7:00 pm - 10:00 pm" correctly', () => {
            const ripper = new RainierArtsCenterRipper();
            const result = ripper.parseTime('7:00 pm - 10:00 pm');
            expect(result.hour).toBe(19);
            expect(result.minute).toBe(0);
            expect(result.durationMinutes).toBe(180);
        });

        it('parses "11:00 am - 2:00 pm" correctly', () => {
            const ripper = new RainierArtsCenterRipper();
            const result = ripper.parseTime('11:00 am - 2:00 pm');
            expect(result.hour).toBe(11);
            expect(result.minute).toBe(0);
            expect(result.durationMinutes).toBe(180);
        });

        it('parses "6:30 pm - 8:00 pm" correctly', () => {
            const ripper = new RainierArtsCenterRipper();
            const result = ripper.parseTime('6:30 pm - 8:00 pm');
            expect(result.hour).toBe(18);
            expect(result.minute).toBe(30);
            expect(result.durationMinutes).toBe(90);
        });

        it('parses single time "3:00 pm" with default 2-hour duration', () => {
            const ripper = new RainierArtsCenterRipper();
            const result = ripper.parseTime('3:00 pm');
            expect(result.hour).toBe(15);
            expect(result.minute).toBe(0);
            expect(result.durationMinutes).toBe(120);
        });

        it('returns default 7 pm for empty string', () => {
            const ripper = new RainierArtsCenterRipper();
            const result = ripper.parseTime('');
            expect(result.hour).toBe(19);
            expect(result.durationMinutes).toBe(120);
        });

        it('handles en-dash separator', () => {
            const ripper = new RainierArtsCenterRipper();
            const result = ripper.parseTime('7:00 pm\u20139:00 pm');
            expect(result.hour).toBe(19);
            expect(result.durationMinutes).toBe(120);
        });

        it('handles midnight-spanning events "11:00 pm - 1:00 am"', () => {
            const ripper = new RainierArtsCenterRipper();
            const result = ripper.parseTime('11:00 pm - 1:00 am');
            expect(result.hour).toBe(23);
            expect(result.minute).toBe(0);
            expect(result.durationMinutes).toBe(120);
        });
    });

    describe('fetchAndParseEvent retry logic', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('retries on HTTP 429 and succeeds on subsequent attempt', async () => {
            const ripper = new RainierArtsCenterRipper() as any;
            const today = LocalDate.of(2026, 1, 1);

            const successHtml = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-06-15T19:00:00-07:00",
                    "endDate": "2026-06-15T21:00:00-07:00",
                    "name": "Retry Success Event",
                    "description": "Test",
                    "url": "https://rainierartscenter.org/events/retry-test/",
                    "location": {"@type": "Place", "name": "Auditorium", "address": ""}
                }
                </script>
                </body></html>`;

            let callCount = 0;
            ripper.fetchFn = vi.fn().mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    return { ok: false, status: 429, statusText: 'Too Many Requests' };
                }
                return { ok: true, text: async () => successHtml };
            });

            const promise = ripper.fetchAndParseEvent('https://rainierartscenter.org/events/retry-test/', today);
            // Advance timers for the retry delay
            await vi.runAllTimersAsync();
            const events = await promise;

            expect(callCount).toBe(2);
            expect(events).toHaveLength(1);
            expect('date' in events[0]).toBe(true);
            expect((events[0] as RipperCalendarEvent).summary).toBe('Retry Success Event');
        });

        it('retries on HTTP 503 and succeeds on subsequent attempt', async () => {
            const ripper = new RainierArtsCenterRipper() as any;
            const today = LocalDate.of(2026, 1, 1);

            const successHtml = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-07-01T19:00:00-07:00",
                    "endDate": "2026-07-01T21:00:00-07:00",
                    "name": "503 Retry Event",
                    "description": "Test",
                    "url": "https://rainierartscenter.org/events/503-test/",
                    "location": {"@type": "Place", "name": "", "address": ""}
                }
                </script>
                </body></html>`;

            let callCount = 0;
            ripper.fetchFn = vi.fn().mockImplementation(async () => {
                callCount++;
                if (callCount <= 2) {
                    return { ok: false, status: 503, statusText: 'Service Unavailable' };
                }
                return { ok: true, text: async () => successHtml };
            });

            const promise = ripper.fetchAndParseEvent('https://rainierartscenter.org/events/503-test/', today);
            await vi.runAllTimersAsync();
            const events = await promise;

            expect(callCount).toBe(3);
            expect(events).toHaveLength(1);
            expect((events[0] as RipperCalendarEvent).summary).toBe('503 Retry Event');
        });

        it('retries on network error (TypeError) and succeeds', async () => {
            const ripper = new RainierArtsCenterRipper() as any;
            const today = LocalDate.of(2026, 1, 1);

            const successHtml = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-07-10T19:00:00-07:00",
                    "endDate": "2026-07-10T21:00:00-07:00",
                    "name": "Network Retry Event",
                    "description": "Test",
                    "url": "https://rainierartscenter.org/events/net-test/",
                    "location": {"@type": "Place", "name": "", "address": ""}
                }
                </script>
                </body></html>`;

            let callCount = 0;
            ripper.fetchFn = vi.fn().mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    throw new TypeError('fetch failed');
                }
                return { ok: true, text: async () => successHtml };
            });

            const promise = ripper.fetchAndParseEvent('https://rainierartscenter.org/events/net-test/', today);
            await vi.runAllTimersAsync();
            const events = await promise;

            expect(callCount).toBe(2);
            expect(events).toHaveLength(1);
            expect((events[0] as RipperCalendarEvent).summary).toBe('Network Retry Event');
        });

        it('records ParseError after all 3 retries exhausted on 429', async () => {
            const ripper = new RainierArtsCenterRipper() as any;
            const today = LocalDate.of(2026, 1, 1);

            let callCount = 0;
            ripper.fetchFn = vi.fn().mockImplementation(async () => {
                callCount++;
                return { ok: false, status: 429, statusText: 'Too Many Requests' };
            });

            const promise = ripper.fetchAndParseEvent('https://rainierartscenter.org/events/exhaust-test/', today);
            await vi.runAllTimersAsync();
            const events = await promise;

            // 1 initial attempt + 3 retries = 4 total calls
            expect(callCount).toBe(4);
            expect(events).toHaveLength(1);
            expect('type' in events[0]).toBe(true);
            expect((events[0] as RipperError).type).toBe('ParseError');
            expect((events[0] as RipperError).reason).toContain('after 3 retries');
        });

        it('does NOT retry on HTTP 404 (non-transient 4xx)', async () => {
            const ripper = new RainierArtsCenterRipper() as any;
            const today = LocalDate.of(2026, 1, 1);

            let callCount = 0;
            ripper.fetchFn = vi.fn().mockImplementation(async () => {
                callCount++;
                return { ok: false, status: 404, statusText: 'Not Found' };
            });

            const promise = ripper.fetchAndParseEvent('https://rainierartscenter.org/events/missing/', today);
            await vi.runAllTimersAsync();
            const events = await promise;

            // Should only try once — no retries for 404
            expect(callCount).toBe(1);
            expect(events).toHaveLength(1);
            expect((events[0] as RipperError).type).toBe('ParseError');
            expect((events[0] as RipperError).reason).toContain('HTTP 404');
        });

        it('does NOT retry on HTTP 403 (non-transient 4xx)', async () => {
            const ripper = new RainierArtsCenterRipper() as any;
            const today = LocalDate.of(2026, 1, 1);

            let callCount = 0;
            ripper.fetchFn = vi.fn().mockImplementation(async () => {
                callCount++;
                return { ok: false, status: 403, statusText: 'Forbidden' };
            });

            const promise = ripper.fetchAndParseEvent('https://rainierartscenter.org/events/forbidden/', today);
            await vi.runAllTimersAsync();
            const events = await promise;

            expect(callCount).toBe(1);
            expect((events[0] as RipperError).reason).toContain('HTTP 403');
        });
    });

    describe('cleanDescription', () => {
        it('removes [embed] shortcodes', () => {
            const ripper = new RainierArtsCenterRipper();
            const result = ripper.cleanDescription('[embed]https://youtube.com/watch?v=abc[/embed]   Some description text.');
            expect(result).not.toContain('[embed]');
            expect(result).toContain('Some description text.');
        });

        it('normalises extra whitespace', () => {
            const ripper = new RainierArtsCenterRipper();
            const result = ripper.cleanDescription('First sentence.   Second sentence.');
            expect(result).toBe('First sentence. Second sentence.');
        });

        it('returns empty string for empty input', () => {
            const ripper = new RainierArtsCenterRipper();
            expect(ripper.cleanDescription('')).toBe('');
        });
    });
});

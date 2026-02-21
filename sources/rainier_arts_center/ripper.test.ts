import { describe, it, expect } from 'vitest';
import RainierArtsCenterRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
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
            // "8:00 pm - 9:30 pm" → hour 20, minute 0
            expect(event.date.hour()).toBe(20);
            expect(event.date.minute()).toBe(0);
        });

        it('parses event duration correctly', () => {
            const ripper = new RainierArtsCenterRipper();
            const html = loadSampleHtml();
            const url = 'https://rainierartscenter.org/events/world-class-music-presents-dobet-gnahore/';
            const events = ripper.parseEventPage(html, url, BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            // "8:00 pm - 9:30 pm" → 90 minutes
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
                <abbr class="mec-events-abbr">11:00 am - 3:00 pm</abbr>
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
                <abbr class="mec-events-abbr">7:00 pm - 9:00 pm</abbr>
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

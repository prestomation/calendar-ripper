import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parse } from 'node-html-parser';
import { ZonedDateTime, ZoneId, Duration } from '@js-joda/core';
import PikePlaceMarketRipper from './ripper.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

describe('PikePlaceMarketRipper', () => {
    const timezone = ZoneId.of('America/Los_Angeles');
    const testDate = ZonedDateTime.of(2026, 2, 11, 12, 0, 0, 0, timezone);

    it('should parse events from sample HTML data', async () => {
        const ripper = new PikePlaceMarketRipper();
        const htmlContent = readFileSync('sources/pike_place_market/sample-data.html', 'utf-8');
        const html = parse(htmlContent);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        // Sample data contains 12 JSON-LD Event blocks
        expect(calEvents.length).toBeGreaterThanOrEqual(10);
    });

    it('should parse a basic event from JSON-LD', async () => {
        const ripper = new PikePlaceMarketRipper();
        const sampleHtml = `
            <html><body>
            <script type="application/ld+json">
            {
                "@context": "http://schema.org",
                "@type": "Event",
                "name": "Valentine's Day at Pike Place Market",
                "startDate": "2026-02-14",
                "endDate": "2026-02-14",
                "location": {
                    "@type": "Place",
                    "name": "Pike Place Market",
                    "address": "85 Pike Street"
                },
                "description": "Celebrate love at Pike Place Market.",
                "url": "https://www.pikeplacemarket.org/events-calendar/love/?occurrence=2026-02-14",
                "image": "https://images.pikeplacemarket.org/test.jpg"
            }
            </script>
            </body></html>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        expect(events.length).toBe(1);
        const event = events[0] as RipperCalendarEvent;
        expect(event.summary).toBe("Valentine's Day at Pike Place Market");
        expect(event.date.year()).toBe(2026);
        expect(event.date.monthValue()).toBe(2);
        expect(event.date.dayOfMonth()).toBe(14);
        expect(event.location).toBe("Pike Place Market, 85 Pike Street");
        expect(event.url).toContain("love");
        expect(event.image).toContain("test.jpg");
    });

    it('should extract time from description with p.m. format', async () => {
        const ripper = new PikePlaceMarketRipper();
        const sampleHtml = `
            <html><body>
            <script type="application/ld+json">
            {
                "@context": "http://schema.org",
                "@type": "Event",
                "name": "Zine Workshop",
                "startDate": "2026-02-11",
                "endDate": "2026-02-11",
                "location": {"@type": "Place", "name": "HistoryLink", "address": "93 Pike St"},
                "description": "&lt;h3&gt;Wednesday, February 11  5:30 p.m. - 7 p.m.&lt;/h3&gt;  Design, create, and fold a zine.",
                "url": "https://www.pikeplacemarket.org/events-calendar/zine-workshop/"
            }
            </script>
            </body></html>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        expect(events.length).toBe(1);
        const event = events[0] as RipperCalendarEvent;
        expect(event.date.hour()).toBe(17);
        expect(event.date.minute()).toBe(30);
        expect(event.duration.toMinutes()).toBe(90); // 5:30pm to 7pm
    });

    it('should extract time from description with am/pm compact format', async () => {
        const ripper = new PikePlaceMarketRipper();
        const sampleHtml = `
            <html><body>
            <script type="application/ld+json">
            {
                "@context": "http://schema.org",
                "@type": "Event",
                "name": "Market Festival",
                "startDate": "2026-03-15",
                "endDate": "2026-03-15",
                "location": {"@type": "Place", "name": "Pike Place Market", "address": "85 Pike Street"},
                "description": "Saturday, March 15  10:00am \\u2013 3:00pm  Join the market festival!",
                "url": "https://www.pikeplacemarket.org/events-calendar/festival/"
            }
            </script>
            </body></html>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        expect(events.length).toBe(1);
        const event = events[0] as RipperCalendarEvent;
        expect(event.date.hour()).toBe(10);
        expect(event.date.minute()).toBe(0);
        expect(event.duration.toMinutes()).toBe(300); // 10am to 3pm = 5 hours
    });

    it('should default to noon when no time in description', async () => {
        const ripper = new PikePlaceMarketRipper();
        const sampleHtml = `
            <html><body>
            <script type="application/ld+json">
            {
                "@context": "http://schema.org",
                "@type": "Event",
                "name": "Food Tour",
                "startDate": "2026-02-11",
                "endDate": "2026-02-11",
                "description": "Join us for a delicious food tour of the market!",
                "url": "https://www.pikeplacemarket.org/events-calendar/food-tour/"
            }
            </script>
            </body></html>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        expect(events.length).toBe(1);
        const event = events[0] as RipperCalendarEvent;
        expect(event.date.hour()).toBe(12);
        expect(event.date.minute()).toBe(0);
        expect(event.duration.toHours()).toBe(2);
    });

    it('should use Pike Place Market as default location when none provided', async () => {
        const ripper = new PikePlaceMarketRipper();
        const sampleHtml = `
            <html><body>
            <script type="application/ld+json">
            {
                "@context": "http://schema.org",
                "@type": "Event",
                "name": "Market Event",
                "startDate": "2026-02-20",
                "endDate": "2026-02-20",
                "location": {"@type": "Place", "name": "", "address": ""},
                "description": "An event.",
                "url": "https://www.pikeplacemarket.org/events-calendar/event/"
            }
            </script>
            </body></html>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        expect(events.length).toBe(1);
        const event = events[0] as RipperCalendarEvent;
        expect(event.location).toBe("Pike Place Market");
    });

    it('should skip non-Event JSON-LD blocks', async () => {
        const ripper = new PikePlaceMarketRipper();
        const sampleHtml = `
            <html><body>
            <script type="application/ld+json">
            {
                "@context": "http://schema.org",
                "@type": "WebSite",
                "name": "Pike Place Market"
            }
            </script>
            <script type="application/ld+json">
            {
                "@context": "http://schema.org",
                "@type": "Event",
                "name": "Real Event",
                "startDate": "2026-02-15",
                "endDate": "2026-02-15",
                "description": "A real event.",
                "url": "https://www.pikeplacemarket.org/events-calendar/real/"
            }
            </script>
            </body></html>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        expect(events.length).toBe(1);
        const event = events[0] as RipperCalendarEvent;
        expect(event.summary).toBe("Real Event");
    });

    it('should deduplicate events with the same URL', async () => {
        const ripper = new PikePlaceMarketRipper();
        const sampleHtml = `
            <html><body>
            <script type="application/ld+json">
            {
                "@context": "http://schema.org",
                "@type": "Event",
                "name": "Duplicate Event",
                "startDate": "2026-02-15",
                "endDate": "2026-02-15",
                "description": "First occurrence.",
                "url": "https://www.pikeplacemarket.org/events-calendar/dup/?occurrence=2026-02-15"
            }
            </script>
            <script type="application/ld+json">
            {
                "@context": "http://schema.org",
                "@type": "Event",
                "name": "Duplicate Event",
                "startDate": "2026-02-15",
                "endDate": "2026-02-15",
                "description": "Second occurrence.",
                "url": "https://www.pikeplacemarket.org/events-calendar/dup/?occurrence=2026-02-15"
            }
            </script>
            </body></html>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e);

        expect(calEvents.length).toBe(1);
    });

    it('should allow same event on different dates', async () => {
        const ripper = new PikePlaceMarketRipper();
        const sampleHtml = `
            <html><body>
            <script type="application/ld+json">
            {
                "@context": "http://schema.org",
                "@type": "Event",
                "name": "Recurring Event",
                "startDate": "2026-02-15",
                "description": "Occurrence 1.",
                "url": "https://www.pikeplacemarket.org/events-calendar/recurring/?occurrence=2026-02-15"
            }
            </script>
            <script type="application/ld+json">
            {
                "@context": "http://schema.org",
                "@type": "Event",
                "name": "Recurring Event",
                "startDate": "2026-02-16",
                "description": "Occurrence 2.",
                "url": "https://www.pikeplacemarket.org/events-calendar/recurring/?occurrence=2026-02-16"
            }
            </script>
            </body></html>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e);

        expect(calEvents.length).toBe(2);
    });

    it('should handle malformed JSON-LD gracefully', async () => {
        const ripper = new PikePlaceMarketRipper();
        const sampleHtml = `
            <html><body>
            <script type="application/ld+json">
            { this is not valid JSON }
            </script>
            <script type="application/ld+json">
            {
                "@context": "http://schema.org",
                "@type": "Event",
                "name": "Valid Event",
                "startDate": "2026-02-20",
                "description": "A valid event.",
                "url": "https://www.pikeplacemarket.org/events-calendar/valid/"
            }
            </script>
            </body></html>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        // Should have 1 error and 1 valid event
        const calEvents = events.filter(e => 'date' in e);
        const errors = events.filter(e => 'type' in e);

        expect(calEvents.length).toBe(1);
        expect(errors.length).toBe(1);
    });

    it('should decode HTML entities in event names', async () => {
        const ripper = new PikePlaceMarketRipper();
        const sampleHtml = `
            <html><body>
            <script type="application/ld+json">
            {
                "@context": "http://schema.org",
                "@type": "Event",
                "name": "Valentine&#8217;s Day at Pike Place Market",
                "startDate": "2026-02-14",
                "description": "Celebrate love &amp; friendship.",
                "url": "https://www.pikeplacemarket.org/events-calendar/valentines/"
            }
            </script>
            </body></html>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        expect(events.length).toBe(1);
        const event = events[0] as RipperCalendarEvent;
        expect(event.summary).toBe("Valentine\u2019s Day at Pike Place Market");
    });

    describe('extractTimeFromDescription', () => {
        it('should parse "5:30 p.m. - 7 p.m."', () => {
            const ripper = new PikePlaceMarketRipper();
            const result = ripper.extractTimeFromDescription('Wednesday, February 11  5:30 p.m. - 7 p.m.');
            expect(result).not.toBeNull();
            expect(result!.startHour).toBe(17);
            expect(result!.startMinute).toBe(30);
            expect(result!.duration.toMinutes()).toBe(90);
        });

        it('should parse "10:00am – 3:00pm"', () => {
            const ripper = new PikePlaceMarketRipper();
            const result = ripper.extractTimeFromDescription('Friday, February 13  10:00am \u2013 3:00pm');
            expect(result).not.toBeNull();
            expect(result!.startHour).toBe(10);
            expect(result!.startMinute).toBe(0);
            expect(result!.duration.toMinutes()).toBe(300);
        });

        it('should parse "7:30 pm - 10:30 pm"', () => {
            const ripper = new PikePlaceMarketRipper();
            const result = ripper.extractTimeFromDescription('Show starts at 7:30 pm - 10:30 pm');
            expect(result).not.toBeNull();
            expect(result!.startHour).toBe(19);
            expect(result!.startMinute).toBe(30);
            expect(result!.duration.toMinutes()).toBe(180);
        });

        it('should parse single time "7 p.m."', () => {
            const ripper = new PikePlaceMarketRipper();
            const result = ripper.extractTimeFromDescription('Doors open at 7 p.m.');
            expect(result).not.toBeNull();
            expect(result!.startHour).toBe(19);
            expect(result!.startMinute).toBe(0);
            expect(result!.duration.toHours()).toBe(2);
        });

        it('should return null for text without time', () => {
            const ripper = new PikePlaceMarketRipper();
            const result = ripper.extractTimeFromDescription('Join us for a great event!');
            expect(result).toBeNull();
        });

        it('should handle noon correctly', () => {
            const ripper = new PikePlaceMarketRipper();
            const result = ripper.extractTimeFromDescription('12:00 p.m. - 2:00 p.m.');
            expect(result).not.toBeNull();
            expect(result!.startHour).toBe(12);
            expect(result!.duration.toMinutes()).toBe(120);
        });

        it('should handle midnight correctly', () => {
            const ripper = new PikePlaceMarketRipper();
            const result = ripper.extractTimeFromDescription('12:00 a.m. - 2:00 a.m.');
            expect(result).not.toBeNull();
            expect(result!.startHour).toBe(0);
            expect(result!.duration.toMinutes()).toBe(120);
        });

        it('should return null for invalid time values', () => {
            const ripper = new PikePlaceMarketRipper();
            const result = ripper.extractTimeFromDescription('Event at 25:00 pm');
            expect(result).toBeNull();
        });
    });
});

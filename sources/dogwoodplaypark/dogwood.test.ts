import { describe, expect, test } from 'vitest';
import { readFile } from 'fs/promises';
import { parse } from 'node-html-parser';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import { RipperCalendarEvent, RipperEvent } from '../../lib/config/schema.js';
import DogwoodPlayParkRipper from './ripper.js';

describe('DogwoodPlayParkRipper', () => {
    test('should extract events from HTML with embedded JSON-LD data', async () => {
        // Load the sample HTML file
        const htmlData = await readFile('sources/dogwoodplaypark/dogwood-2025-04-07.html');
        const htmlDoc = parse(htmlData.toString());
        
        // Create a test date
        const testDate = ZonedDateTime.of(2025, 4, 7, 12, 0, 0, 0, ZoneId.of('America/Los_Angeles'));
        
        // Create an instance of the ripper
        const ripper = new DogwoodPlayParkRipper();
        
        // Parse events
        const events = await ripper.parseEvents(htmlDoc, testDate, {});
        
        // Verify we got events back
        expect(events.length).toBeGreaterThan(0);
        
        // Check that all events are of the correct type
        const calendarEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(calendarEvents.length).toBeGreaterThan(0);
        
        // Expected event names from the sample data
        const expectedEvents = [
            "Small Dog Meet Up",
            "Pet Pros",
            "Samoyed Meet-Up",
            "Golden Retriever Meet Up",
            "Doodle Romp",
            "Release the Hounds"
        ];
        
        // Check that all expected events are present (allowing for trimming and whitespace differences)
        const eventNames = calendarEvents.map(e => e.summary.trim().replace(/\s+/g, ' '));
        for (const expectedName of expectedEvents) {
            const normalizedExpectedName = expectedName.trim().replace(/\s+/g, ' ');
            expect(
                eventNames.some(name => name.includes(normalizedExpectedName)),
                `Expected to find event with name containing "${normalizedExpectedName}"`
            ).toBe(true);
        }
        
        // Check specific properties of the first event
        const firstEvent = calendarEvents[0];
        expect(firstEvent).toHaveProperty('summary');
        expect(firstEvent).toHaveProperty('description');
        expect(firstEvent).toHaveProperty('location');
        expect(firstEvent).toHaveProperty('date');
        expect(firstEvent).toHaveProperty('duration');
        expect(firstEvent).toHaveProperty('url');
        expect(firstEvent).toHaveProperty('ripped');
        
        // Verify the URL format
        expect(firstEvent.url).toMatch(/^https:\/\/www\.dogwoodplaypark\.com\/event-details\//);
        
        // Verify location contains the address
        expect(firstEvent.location).toContain("Dogwood Play Park");
        expect(firstEvent.location).toContain("Seattle");
        
        // Verify description contains useful information
        expect(firstEvent.description).toContain(firstEvent.summary);
        expect(firstEvent.description).toContain("Dogwood Play Park");
        expect(firstEvent.description).toContain(firstEvent.url);
        
        // Verify all events have reasonable durations (between 1 and 3 hours)
        for (const event of calendarEvents) {
            const durationMinutes = event.duration.toMinutes();
            expect(durationMinutes).toBeGreaterThanOrEqual(60);  // At least 1 hour
            expect(durationMinutes).toBeLessThanOrEqual(180);    // At most 3 hours
        }
    });
    
    test('should handle missing data gracefully', async () => {
        // Create a minimal HTML document with no event data
        const minimalHtml = parse('<html><body>No events here</body></html>');
        
        // Create a test date
        const testDate = ZonedDateTime.of(2025, 4, 7, 12, 0, 0, 0, ZoneId.of('America/Los_Angeles'));
        
        // Create an instance of the ripper
        const ripper = new DogwoodPlayParkRipper();
        
        // Parse events
        const events = await ripper.parseEvents(minimalHtml, testDate, {});
        
        // Verify we got an error back
        expect(events.length).toBe(1);
        expect(events[0]).toHaveProperty('type', 'ParseError');
    });
    
    test('should extract correct event dates and times from warmup data', async () => {
        // Create a mock HTML with warmup data containing a single event
        const mockWarmupData = {
            appsWarmupData: {
                '140603ad-af8d-84a5-2c80-a0f60cb47351': {
                    'widgetcomp-kp1kqz5a': {
                        events: {
                            events: [{
                                id: 'test-event-1',
                                title: 'Test Event',
                                description: 'Test Description',
                                slug: 'test-event',
                                location: {
                                    fullAddress: {
                                        formattedAddress: '12568 33rd Ave NE, Seattle, WA 98125, USA'
                                    }
                                },
                                scheduling: {
                                    config: {
                                        startDate: '2025-04-15T17:30:00.000Z',
                                        endDate: '2025-04-15T19:00:00.000Z',
                                        timeZoneId: 'America/Los_Angeles'
                                    }
                                }
                            }]
                        }
                    }
                }
            }
        };
        
        const mockHtml = parse(`
            <html>
                <body>
                    <script id="wix-warmup-data" type="application/json">
                        ${JSON.stringify(mockWarmupData)}
                    </script>
                </body>
            </html>
        `);
        
        // Create a test date
        const testDate = ZonedDateTime.of(2025, 4, 7, 12, 0, 0, 0, ZoneId.of('America/Los_Angeles'));
        
        // Create an instance of the ripper
        const ripper = new DogwoodPlayParkRipper();
        
        // Parse events
        const events = await ripper.parseEvents(mockHtml, testDate, {});
        
        // Verify we got an event back
        expect(events.length).toBe(1);
        
        // Check that the event is a calendar event
        expect('summary' in events[0]).toBe(true);
        
        const event = events[0] as RipperCalendarEvent;
        expect(event.summary).toBe('Test Event');
        expect(event.description).toContain('Test Description');
        
        // Check the date (April 15, 2025)
        expect(event.date.toString()).toContain('2025-04-15');
        
        // Check the duration (should be 90 minutes)
        expect(event.duration.toMinutes()).toBe(90);
    });
});

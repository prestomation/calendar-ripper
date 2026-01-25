import { describe, it, expect } from 'vitest';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import UrbanCraftUprisingRipper from './ripper.js';

describe('UrbanCraftUprisingRipper', () => {
    const ripper = new UrbanCraftUprisingRipper();
    const testDate = ZonedDateTime.of(2025, 12, 13, 12, 0, 0, 0, ZoneId.of('America/Los_Angeles'));

    it('should parse WordPress API response and extract events', async () => {
        const mockApiResponse = [
            {
                title: { rendered: "Eleventh Hour Makers Market" },
                slug: "eleventh-hour-makers-market",
                link: "https://urbancraftuprising.com/eleventh-hour-makers-market/",
                content: { 
                    rendered: `<div class="wpb-content-wrapper">
                        <h1>THE PACIFIC NORTHWEST'S PREMIER INDIE CRAFT SHOW PRESENTS</h1>
                        <p>FRIDAY, DECEMBER 19TH – SUNDAY, DECEMBER 21ST PACIFIC PLACE | CONCOURSE LEVEL</p>
                        <p>Last-minute holiday shopping? We've got you covered! Urban Craft Uprising is thrilled to partner with Pacific Place to present the Eleventh Hour Makers Market.</p>
                    </div>`
                }
            },
            {
                title: { rendered: "Bend Handmade Market" },
                slug: "bend-handmade-market",
                link: "https://urbancraftuprising.com/bend-handmade-market/",
                content: { 
                    rendered: `<div class="wpb-content-wrapper">
                        <h1>BEND HANDMADE MARKET</h1>
                        <p>SATURDAY, JUNE 7TH Downtown Bend</p>
                        <p>We are SO excited to be returning the Bend Handmade Market to Downtown Bend this June!</p>
                    </div>`
                }
            },
            {
                title: { rendered: "Eleventh Hour Makers Market Vendors" },
                slug: "eleventh-hour-vendors",
                link: "https://urbancraftuprising.com/eleventh-hour-vendors/",
                content: { 
                    rendered: `<div class="wpb-content-wrapper">
                        <h1>Eleventh Hour Makers Market Vendors</h1>
                        <p>List of vendors for the market...</p>
                    </div>`
                }
            }
        ];

        const events = await ripper.parseEvents(mockApiResponse, testDate, {});

        // Should filter out vendor pages and only include actual events
        expect(events).toHaveLength(2);
        
        // Check first event
        const event1 = events[0];
        expect(event1).toHaveProperty('summary', 'Eleventh Hour Makers Market');
        expect(event1).toHaveProperty('id', 'eleventh-hour-makers-market');
        expect(event1).toHaveProperty('location', 'PACIFIC PLACE');
        expect(event1).toHaveProperty('url', 'https://urbancraftuprising.com/eleventh-hour-makers-market/');
        
        if ('date' in event1) {
            expect(event1.date.year()).toBe(new Date().getFullYear());
            expect(event1.date.monthValue()).toBe(12);
            expect(event1.date.dayOfMonth()).toBe(19);
        }

        // Check second event - June is in the past so it gets moved to next year
        const event2 = events[1];
        expect(event2).toHaveProperty('summary', 'Bend Handmade Market');
        expect(event2).toHaveProperty('id', 'bend-handmade-market');
        
        if ('date' in event2) {
            expect(event2.date.year()).toBe(2026); // June 2025 is past, so moved to 2026
            expect(event2.date.monthValue()).toBe(6);
            expect(event2.date.dayOfMonth()).toBe(7);
        }
    });

    it('should handle events with no dates gracefully', async () => {
        const mockApiResponse = [
            {
                title: { rendered: "Event Without Date" },
                slug: "event-without-date",
                link: "https://urbancraftuprising.com/event-without-date/",
                content: { 
                    rendered: `<div class="wpb-content-wrapper">
                        <h1>Event Without Date</h1>
                        <p>This event has no date information.</p>
                    </div>`
                }
            }
        ];

        const events = await ripper.parseEvents(mockApiResponse, testDate, {});

        // Event without date gets filtered out during the filtering step
        expect(events).toHaveLength(0);
    });

    it('should filter out vendor and resource pages', async () => {
        const mockApiResponse = [
            {
                title: { rendered: "Summer Market" },
                slug: "summer-market",
                link: "https://urbancraftuprising.com/summer-market/",
                content: { rendered: "<p>JUNE 15TH Summer market event</p>" }
            },
            {
                title: { rendered: "Summer Market Vendors" },
                slug: "summer-market-vendors", 
                link: "https://urbancraftuprising.com/summer-market-vendors/",
                content: { rendered: "<p>List of vendors</p>" }
            },
            {
                title: { rendered: "Summer Market Vendor Resources" },
                slug: "summer-market-resources",
                link: "https://urbancraftuprising.com/summer-market-resources/", 
                content: { rendered: "<p>Resources for vendors</p>" }
            }
        ];

        const events = await ripper.parseEvents(mockApiResponse, testDate, {});

        // Should only include the actual event, not vendor pages
        expect(events).toHaveLength(1);
        expect(events[0]).toHaveProperty('summary', 'Summer Market');
        
        // June is in the past, so gets moved to next year
        if ('date' in events[0]) {
            expect(events[0].date.year()).toBe(2026);
            expect(events[0].date.monthValue()).toBe(6);
            expect(events[0].date.dayOfMonth()).toBe(15);
        }
    });
});

import { describe, it, expect } from 'vitest';
import SEAtodayRipper from './ripper.js';
import { Ripper } from '../../lib/config/schema.js';
import { ZoneRegion } from '@js-joda/core';

describe('SEAtodayRipper', () => {
    it('should fetch and parse events from CitySpark', async () => {
        const ripper: Ripper = {
            config: {
                name: 'seatoday',
                description: 'SEAtoday Events',
                url: new URL('https://portal.cityspark.com/PortalScripts/SEAT'),
                friendlyLink: 'https://seatoday.6amcity.com/events',
                disabled: false,
                tags: ['Events'],
                calendars: [{
                    name: 'seatoday-events',
                    friendlyname: 'SEAtoday Events',
                    timezone: ZoneRegion.of('America/Los_Angeles'),
                    tags: []
                }]
            },
            ripperImpl: new SEAtodayRipper()
        };

        const calendars = await ripper.ripperImpl.rip(ripper);

        expect(calendars).toHaveLength(1);
        expect(calendars[0].name).toBe('seatoday-events');
        expect(calendars[0].friendlyname).toBe('SEAtoday Events');

        console.log(`Found ${calendars[0].events.length} events`);
        console.log(`Found ${calendars[0].errors.length} errors`);

        // Should have events spanning multiple days
        expect(calendars[0].events.length).toBeGreaterThan(25);

        if (calendars[0].events.length > 0) {
            const firstEvent = calendars[0].events[0];
            console.log('First event:', {
                summary: firstEvent.summary,
                date: firstEvent.date.toString(),
                location: firstEvent.location,
                url: firstEvent.url
            });

            expect(firstEvent.summary).toBeDefined();
            expect(firstEvent.date).toBeDefined();
            expect(firstEvent.duration).toBeDefined();

            // Verify all events are in Seattle (location should contain Seattle)
            const eventsWithLocation = calendars[0].events.filter(e => e.location);
            for (const event of eventsWithLocation) {
                expect(event.location!.toLowerCase()).toContain('seattle');
            }

            // Verify events span multiple dates
            const uniqueDates = new Set(calendars[0].events.map(e => e.date.toLocalDate().toString()));
            console.log(`Events span ${uniqueDates.size} unique dates:`, [...uniqueDates].sort());
            expect(uniqueDates.size).toBeGreaterThan(1);
        }
    }, 120000); // 2 minute timeout for multiple API requests
});

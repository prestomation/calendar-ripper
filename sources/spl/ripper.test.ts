import { describe, it, expect } from 'vitest';
import SPLRipper, { extractBranchName, stripHtml, parseTrumbaEvent } from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import { ZoneId, Duration } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of("America/Los_Angeles");

function loadSampleData(): any[] {
    const dataPath = path.join(__dirname, 'sample-data.json');
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

describe('SPLRipper', () => {
    describe('extractBranchName', () => {
        it('strips HTML anchor tags from location', () => {
            const location = '<a href="https://www.spl.org/hours-and-locations/central-library" target="_blank">Central Library</a>';
            expect(extractBranchName(location)).toBe('Central Library');
        });

        it('handles plain text location', () => {
            expect(extractBranchName('Online')).toBe('Online');
        });

        it('handles location with nested HTML', () => {
            const location = '<a href="https://www.spl.org/hours-and-locations/ballard-branch" target="_blank">Ballard Branch</a>';
            expect(extractBranchName(location)).toBe('Ballard Branch');
        });

        it('handles empty string', () => {
            expect(extractBranchName('')).toBe('');
        });

        it('handles International District/Chinatown Branch', () => {
            const location = '<a href="https://www.spl.org/hours-and-locations/international-district-chinatown-branch" target="_blank">International District/Chinatown Branch</a>';
            expect(extractBranchName(location)).toBe('International District/Chinatown Branch');
        });
    });

    describe('stripHtml', () => {
        it('removes HTML tags and decodes entities', () => {
            expect(stripHtml('<p>Hello &amp; world</p>')).toBe('Hello & world');
        });

        it('handles &nbsp; entities', () => {
            expect(stripHtml('Hello&nbsp;world')).toBe('Hello world');
        });

        it('collapses whitespace', () => {
            expect(stripHtml('<p>Hello</p>  <p>world</p>')).toBe('Hello world');
        });

        it('handles plain text', () => {
            expect(stripHtml('No HTML here')).toBe('No HTML here');
        });
    });

    describe('parseTrumbaEvent', () => {
        it('parses a basic event correctly', () => {
            const event = {
                eventID: 12345,
                title: 'Test Event',
                description: '<p>A test event</p>',
                location: '<a href="https://www.spl.org/hours-and-locations/ballard-branch" target="_blank">Ballard Branch</a>',
                startDateTime: '2026-02-20T14:00:00',
                endDateTime: '2026-02-20T16:00:00',
                permaLinkUrl: 'https://www.spl.org/event-calendar?trumbaEmbed=view%3devent%26eventid%3d12345',
            };

            const result = parseTrumbaEvent(event, TIMEZONE) as RipperCalendarEvent;
            expect(result.id).toBe('spl-12345');
            expect(result.summary).toBe('Test Event');
            expect(result.description).toBe('A test event');
            expect(result.location).toBe('Ballard Branch');
            expect(result.duration).toEqual(Duration.ofHours(2));
            expect(result.date.hour()).toBe(14);
            expect(result.date.minute()).toBe(0);
            expect(result.url).toContain('eventid');
        });

        it('decodes HTML entities in title', () => {
            const event = {
                eventID: 99999,
                title: 'Free Tax Help / Ayuda gratuita con los impuestos &amp; m&#225;s',
                startDateTime: '2026-03-01T10:00:00',
                endDateTime: '2026-03-01T14:00:00',
            };

            const result = parseTrumbaEvent(event, TIMEZONE) as RipperCalendarEvent;
            expect(result.summary).toBe('Free Tax Help / Ayuda gratuita con los impuestos & más');
        });

        it('includes room location when available', () => {
            const event = {
                eventID: 11111,
                title: 'Exhibit',
                location: '<a href="#">Central Library</a>',
                startDateTime: '2026-02-20T10:00:00',
                endDateTime: '2026-02-20T18:00:00',
                customFields: [
                    { fieldID: 28780, label: 'Room Location', value: 'Level 8 - Gallery', type: 17 },
                ],
            };

            const result = parseTrumbaEvent(event, TIMEZONE) as RipperCalendarEvent;
            expect(result.location).toBe('Central Library, Level 8 - Gallery');
        });

        it('handles event with no location', () => {
            const event = {
                eventID: 22222,
                title: 'Virtual Event',
                startDateTime: '2026-02-20T12:00:00',
                endDateTime: '2026-02-20T13:00:00',
            };

            const result = parseTrumbaEvent(event, TIMEZONE) as RipperCalendarEvent;
            expect(result.location).toBeUndefined();
        });

        it('handles event image', () => {
            const event = {
                eventID: 33333,
                title: 'Event With Image',
                startDateTime: '2026-02-20T12:00:00',
                endDateTime: '2026-02-20T13:00:00',
                eventImage: { url: 'https://www.trumba.com/i/test.jpg', alt: '' },
            };

            const result = parseTrumbaEvent(event, TIMEZONE) as RipperCalendarEvent;
            expect(result.image).toBe('https://www.trumba.com/i/test.jpg');
        });

        it('calculates duration correctly for short events', () => {
            const event = {
                eventID: 44444,
                title: 'Short Event',
                startDateTime: '2026-02-20T10:30:00',
                endDateTime: '2026-02-20T11:00:00',
            };

            const result = parseTrumbaEvent(event, TIMEZONE) as RipperCalendarEvent;
            expect(result.duration.toMinutes()).toBe(30);
        });

        it('defaults to 1 hour duration when end equals start', () => {
            const event = {
                eventID: 55555,
                title: 'Zero Duration Event',
                startDateTime: '2026-02-20T10:00:00',
                endDateTime: '2026-02-20T10:00:00',
            };

            const result = parseTrumbaEvent(event, TIMEZONE) as RipperCalendarEvent;
            expect(result.duration.toHours()).toBe(1);
        });
    });

    describe('sample data parsing', () => {
        it('parses all non-cancelled events from sample data', () => {
            const data = loadSampleData();
            const nonCancelled = data.filter((e: any) => !e.canceled);

            for (const event of nonCancelled) {
                const result = parseTrumbaEvent(event, TIMEZONE);
                expect(result).toHaveProperty('date');
                expect(result).toHaveProperty('summary');
                expect((result as RipperCalendarEvent).id).toMatch(/^spl-\d+$/);
            }
        });

        it('extracts correct branch names from all sample events', () => {
            const data = loadSampleData();
            const expectedBranches = new Set([
                'Online', 'Central Library', 'Broadview Branch', 'Columbia Branch',
                'West Seattle Branch', 'Southwest Branch', 'Greenwood Branch',
                'Lake City Branch', 'Ballard Branch', 'Beacon Hill Branch',
                'Northeast Branch', 'Rainier Beach Branch', 'Northgate Branch',
                'High Point Branch', 'Queen Anne Branch', 'Magnolia Branch',
                'NewHolly Branch', 'Capitol Hill Branch',
                'International District/Chinatown Branch', 'South Park Branch',
                'Douglass-Truth Branch', 'Delridge Branch', 'Green Lake Branch',
                'non-library location', 'Fremont Branch',
            ]);

            const foundBranches = new Set<string>();
            for (const event of data) {
                if (event.location) {
                    foundBranches.add(extractBranchName(event.location));
                }
            }

            // Every branch from sample data should be extractable
            for (const branch of foundBranches) {
                expect(expectedBranches.has(branch)).toBe(true);
            }
        });

        it('identifies cancelled events in sample data', () => {
            const data = loadSampleData();
            const cancelled = data.filter((e: any) => e.canceled);
            expect(cancelled.length).toBeGreaterThan(0);

            for (const event of cancelled) {
                expect(event.canceled).toBe(true);
            }
        });

        it('generates unique IDs for each event', () => {
            const data = loadSampleData();
            const ids = new Set<string>();

            for (const event of data) {
                const result = parseTrumbaEvent(event, TIMEZONE) as RipperCalendarEvent;
                expect(ids.has(result.id!)).toBe(false);
                ids.add(result.id!);
            }
        });

        it('parses event dates correctly', () => {
            const data = loadSampleData();
            // Find the Collection Spotlight Exhibit (Central Library, 10am-6pm)
            const exhibit = data.find((e: any) => e.title === 'Collection Spotlight Exhibit');
            expect(exhibit).toBeDefined();

            const result = parseTrumbaEvent(exhibit, TIMEZONE) as RipperCalendarEvent;
            expect(result.date.hour()).toBe(10);
            expect(result.date.minute()).toBe(0);
            expect(result.duration.toHours()).toBe(8);
        });

        it('parses event with HTML entities in title', () => {
            const data = loadSampleData();
            // Find an event with &amp; in title
            const ampEvent = data.find((e: any) => e.title.includes('&amp;'));
            expect(ampEvent).toBeDefined();

            const result = parseTrumbaEvent(ampEvent, TIMEZONE) as RipperCalendarEvent;
            expect(result.summary).not.toContain('&amp;');
            expect(result.summary).toContain('&');
        });
    });
});

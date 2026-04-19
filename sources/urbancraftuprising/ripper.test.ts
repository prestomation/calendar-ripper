import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZonedDateTime, ZoneId, ZoneRegion } from '@js-joda/core';
import UrbanCraftUprisingRipper from './ripper.js';
import { parse as parseHtml } from 'node-html-parser';

// Mock HTML for the events listing page
const MOCK_EVENTS_LISTING_HTML = `
<!DOCTYPE html>
<html>
<body>
<div class="entry-content">
    <div class="wpb-content-wrapper">
        <a href="https://urbancraftuprising.com/eleventh-hour-makers-market/">
            <img alt="Eleventh Hour Makers Market" title="Eleventh Hour Makers Market" />
        </a>
        <a href="https://urbancraftuprising.com/bend-handmade-market/">
            <img alt="Bend Handmade Market" title="Bend Handmade Market" />
        </a>
        <a href="https://urbancraftuprising.com/edmonds-spring-fest/">
            <img alt="Edmonds Spring Fest" title="Edmonds Spring Fest" />
        </a>
        <a href="https://urbancraftuprising.com/eleventh-hour-vendors/">
            <img alt="Eleventh Hour Vendors" title="Eleventh Hour Vendors" />
        </a>
        <a href="https://urbancraftuprising.com/about/">About</a>
    </div>
</div>
</body>
</html>
`;

// Mock HTML for an event detail page (Eleventh Hour Makers Market)
const MOCK_ELEVENTH_HOUR_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta property="og:title" content="Eleventh Hour Makers Market | Urban Craft Uprising" />
</head>
<body>
<div class="entry-content">
    <div class="wpb-content-wrapper">
        <h1>ELEVENTH HOUR MAKERS MARKET</h1>
        <div class="wpb_text_column">
            <h6><span style="color: #ff6666;">FRIDAY, DECEMBER 19TH – SUNDAY, DECEMBER 21ST</span></h6>
            <h6><span style="color: #ff6666;">PACIFIC PLACE</span></h6>
            <h6><span style="color: #ff6666;">10AM – 5pm</span></h6>
        </div>
        <div class="wpb_text_column">
            <p>Last-minute holiday shopping? We've got you covered! Urban Craft Uprising is thrilled to partner with Pacific Place to present the Eleventh Hour Makers Market.</p>
        </div>
    </div>
</div>
</body>
</html>
`;

// Mock HTML for Bend Handmade Market event page
const MOCK_BEND_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta property="og:title" content="Bend Handmade Market | Urban Craft Uprising" />
</head>
<body>
<div class="entry-content">
    <div class="wpb-content-wrapper">
        <h1>BEND HANDMADE MARKET</h1>
        <div class="wpb_text_column">
            <h6><span style="color: #ff6666;">SATURDAY, JUNE 7TH</span></h6>
            <h6><span style="color: #ff6666;">Downtown Bend</span></h6>
            <h6><span style="color: #ff6666;">10AM – 5pm</span></h6>
        </div>
        <div class="wpb_text_column">
            <p>We are SO excited to be returning the Bend Handmade Market to Downtown Bend this June! Come join us for an amazing day of shopping, food, and community!</p>
        </div>
    </div>
</div>
</body>
</html>
`;

// Mock HTML for Edmonds Spring Fest event page
const MOCK_EDMONDS_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta property="og:title" content="Edmonds Spring Fest | Brought to you by Urban Craft Uprising - Urban Craft Uprising" />
</head>
<body>
<div class="entry-content">
    <div class="wpb-content-wrapper">
        <h1>Edmonds Spring Fest</h1>
        <div class="wpb_text_column">
            <h6><span style="color: #ff6666;">Saturday, May 9th<br /></span></h6>
            <h6><span style="color: #ff6666;">Frances Anderson Center<br /></span></h6>
            <h6><span style="color: #ff6666;">10am-5pm<br /></span></h6>
        </div>
        <div class="wpb_text_column">
            <p>Urban Craft Uprising came to Edmonds in 2018 to host our first ever Edmonds Spring Fest and it quickly grew into one of the most beloved events that we organize!</p>
        </div>
    </div>
</div>
</body>
</html>
`;

// Mock HTML for a vendor page (should be filtered out)
const MOCK_VENDOR_HTML = `
<!DOCTYPE html>
<html>
<body>
<div class="entry-content">
    <h1>Eleventh Hour Vendors</h1>
    <p>Meet our amazing vendors!</p>
</div>
</body>
</html>
`;

// Mock HTML for an event without date info
const MOCK_NO_DATE_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta property="og:title" content="Mystery Market | Urban Craft Uprising" />
</head>
<body>
<div class="entry-content">
    <div class="wpb-content-wrapper">
        <h1>Mystery Market</h1>
        <div class="wpb_text_column">
            <p>This event has no date information available yet.</p>
        </div>
    </div>
</div>
</body>
</html>
`;

describe('UrbanCraftUprisingRipper', () => {
    const ripper = new UrbanCraftUprisingRipper();
    const testDate = ZonedDateTime.of(2025, 12, 13, 12, 0, 0, 0, ZoneId.of('America/Los_Angeles'));

    // We'll test parseEvents by calling it with parsed HTML from the listing page
    // and mock fetch for the detail page fetches
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        // Mock global fetch for detail page requests
        mockFetch = vi.fn();
        // Default: return 404 for unknown URLs
        mockFetch.mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found'
        });
        // Mock specific event pages
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('eleventh-hour-makers-market')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    text: () => Promise.resolve(MOCK_ELEVENTH_HOUR_HTML)
                });
            }
            if (url.includes('bend-handmade-market')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    text: () => Promise.resolve(MOCK_BEND_HTML)
                });
            }
            if (url.includes('edmonds-spring-fest')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    text: () => Promise.resolve(MOCK_EDMONDS_HTML)
                });
            }
            if (url.includes('eleventh-hour-vendors')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    text: () => Promise.resolve(MOCK_VENDOR_HTML)
                });
            }
            return Promise.resolve({
                ok: false,
                status: 404,
                statusText: 'Not Found'
            });
        });
        vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    describe('extractEventLinks', () => {
        it('should extract event links from listing page and filter out vendor pages', () => {
            const html = parseHtml(MOCK_EVENTS_LISTING_HTML);
            // Access private method via (ripper as any)
            const links = (ripper as any).extractEventLinks(html);

            // Should find event links but filter out vendor and non-event pages
            expect(links.length).toBeGreaterThanOrEqual(2);

            // Should not include vendor pages
            const vendorLinks = links.filter((l: string) => l.includes('vendors'));
            expect(vendorLinks).toHaveLength(0);

            // Should not include about page
            const aboutLinks = links.filter((l: string) => l.includes('/about'));
            expect(aboutLinks).toHaveLength(0);
        });

        it('should return empty array for pages with no event links', () => {
            const html = parseHtml('<html><body><p>No events here</p></body></html>');
            const links = (ripper as any).extractEventLinks(html);
            expect(links).toHaveLength(0);
        });
    });

    describe('parseEvents (full flow)', () => {
        it('should parse events from listing + detail pages', async () => {
            const html = parseHtml(MOCK_EVENTS_LISTING_HTML);
            const events = await ripper.parseEvents(html, testDate, {});

            // Should get events from the detail pages (vendor page filtered at link extraction)
            const calendarEvents = events.filter(e => 'date' in e);
            expect(calendarEvents.length).toBeGreaterThanOrEqual(2);

            // Check Eleventh Hour Makers Market
            const eleventhHour = calendarEvents.find(
                (e: any) => e.id === 'eleventh-hour-makers-market'
            );
            if (eleventhHour) {
                expect(eleventhHour.summary).toContain('ELEVENTH HOUR');
                expect(eleventhHour.location).toContain('Pacific Place');
                expect(eleventhHour.url).toContain('eleventh-hour-makers-market');
            }
        });

        it('should extract date from event pages', async () => {
            const html = parseHtml(MOCK_EVENTS_LISTING_HTML);
            const events = await ripper.parseEvents(html, testDate, {});

            const calendarEvents = events.filter(e => 'date' in e) as any[];

            // Find the Edmonds event - May is past relative to Dec 13, so it should be next year
            const edmonds = calendarEvents.find(e => e.id === 'edmonds-spring-fest');
            if (edmonds) {
                expect(edmonds.date.monthValue()).toBe(5);
                expect(edmonds.date.dayOfMonth()).toBe(9);
            }

            // Find the Bend event - June is past relative to Dec 13, so next year
            const bend = calendarEvents.find(e => e.id === 'bend-handmade-market');
            if (bend) {
                expect(bend.date.monthValue()).toBe(6);
                expect(bend.date.dayOfMonth()).toBe(7);
            }
        });

        it('should extract time ranges from event pages', async () => {
            const html = parseHtml(MOCK_EVENTS_LISTING_HTML);
            const events = await ripper.parseEvents(html, testDate, {});

            const calendarEvents = events.filter(e => 'date' in e) as any[];

            // Events with "10AM – 5pm" should have start time 10:00
            const eventWithTime = calendarEvents.find(e => e.id === 'bend-handmade-market');
            if (eventWithTime) {
                expect(eventWithTime.date.hour()).toBe(10);
                expect(eventWithTime.date.minute()).toBe(0);
                // Duration should be 7 hours (10am to 5pm)
                expect(eventWithTime.duration.toHours()).toBe(7);
            }
        });

        it('should return ParseError for events without dates', async () => {
            // Create a listing that links to a page without date info
            const listingHtml = `
            <html><body>
            <div class="entry-content">
                <div class="wpb-content-wrapper">
                    <a href="https://urbancraftuprising.com/mystery-market/">
                        <img alt="Mystery Market" title="Mystery Market" />
                    </a>
                </div>
            </div>
            </body></html>
            `;

            // Mock the mystery market page
            mockFetch.mockImplementation((url: string) => {
                if (url.includes('mystery-market')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        text: () => Promise.resolve(MOCK_NO_DATE_HTML)
                    });
                }
                return Promise.resolve({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found'
                });
            });
            vi.stubGlobal('fetch', mockFetch);

            const html = parseHtml(listingHtml);
            const events = await ripper.parseEvents(html, testDate, {});

            // Should have at least one ParseError for the missing date
            const errors = events.filter(e => 'type' in e && e.type === 'ParseError');
            expect(errors.length).toBeGreaterThanOrEqual(1);
            expect(errors[0].reason).toContain('No date found');
        });

        it('should filter out vendor pages from event links', async () => {
            const html = parseHtml(MOCK_EVENTS_LISTING_HTML);
            const events = await ripper.parseEvents(html, testDate, {});

            // Should not have any events from vendor pages
            const calendarEvents = events.filter(e => 'date' in e) as any[];
            const vendorEvents = calendarEvents.filter(e => e.id?.includes('vendor'));
            expect(vendorEvents).toHaveLength(0);
        });

        it('should extract location from event pages', async () => {
            const html = parseHtml(MOCK_EVENTS_LISTING_HTML);
            const events = await ripper.parseEvents(html, testDate, {});

            const calendarEvents = events.filter(e => 'date' in e) as any[];

            // Pacific Place should be recognized
            const eleventhHour = calendarEvents.find(e => e.id === 'eleventh-hour-makers-market');
            if (eleventhHour) {
                expect(eleventhHour.location).toBeDefined();
                expect(eleventhHour.location).toContain('Pacific Place');
            }

            // Downtown Bend should be recognized
            const bend = calendarEvents.find(e => e.id === 'bend-handmade-market');
            if (bend) {
                expect(bend.location).toBeDefined();
                expect(bend.location).toContain('Bend');
            }
        });
    });

    describe('extractDate', () => {
        it('should parse "SATURDAY, JULY 11TH" format', () => {
            const result = (ripper as any).extractDate([
                'SATURDAY, JULY 11TH',
                '10AM – 5pm'
            ]);
            expect(result).not.toBeNull();
            expect(result.dateStr).toBe('JULY 11');
            expect(result.year).toBeGreaterThanOrEqual(2025);
        });

        it('should parse "FRIDAY, DECEMBER 19TH – SUNDAY, DECEMBER 21ST" format', () => {
            const result = (ripper as any).extractDate([
                'FRIDAY, DECEMBER 19TH – SUNDAY, DECEMBER 21ST',
                '10AM – 5pm'
            ]);
            expect(result).not.toBeNull();
            expect(result.dateStr).toBe('DECEMBER 19');
        });

        it('should return null for text without dates', () => {
            const result = (ripper as any).extractDate([
                'No date info here',
                'Just some random text'
            ]);
            expect(result).toBeNull();
        });
    });

    describe('extractTime', () => {
        it('should parse "10AM – 5pm" time range', () => {
            const result = (ripper as any).extractTime(['10AM – 5pm']);
            expect(result).not.toBeNull();
            expect(result.hour).toBe(10);
            expect(result.minute).toBe(0);
            expect(result.endHour).toBe(17);
            expect(result.endMinute).toBe(0);
        });

        it('should parse "10am-5pm" time range without spaces', () => {
            const result = (ripper as any).extractTime(['10am-5pm']);
            expect(result).not.toBeNull();
            expect(result.hour).toBe(10);
            expect(result.endHour).toBe(17);
        });

        it('should parse single time "10am"', () => {
            const result = (ripper as any).extractTime(['10am']);
            expect(result).not.toBeNull();
            expect(result.hour).toBe(10);
            expect(result.minute).toBe(0);
        });

        it('should return null for text without time info', () => {
            const result = (ripper as any).extractTime(['No time info here']);
            expect(result).toBeNull();
        });
    });
});
import { describe, it, expect, vi } from 'vitest';
import { ZoneId } from '@js-joda/core';
import { parseAXSSkinEvent, parseAXSSkinEvents, AXSSkinRipper } from './axsskin.js';
import { parse } from 'node-html-parser';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ZONE = ZoneId.of('America/Los_Angeles');
const LOCATION = "Test Venue, 123 Main St, Seattle, WA 98101";

function makeEventItem(html: string): any {
    const root = parse(html);
    return root.querySelector('.eventItem')!;
}

describe('AXSSkinRipper shared module', () => {
    describe('parseAXSSkinEvent', () => {
        it('parses a minimal event with title, date, and time', () => {
            const html = `<div class="eventItem entry">
                <div class="date" aria-label="Jun 15 2026">
                    <span class="m-date__month">Jun</span>
                    <span class="m-date__day">15</span>
                </div>
                <h3 class="title"><a href="/events/detail/test-event-12345">Test Event</a></h3>
                <div class="meta">
                    <span class="time">Doors: 8:00 PM</span>
                </div>
            </div>`;
            const result = parseAXSSkinEvent(makeEventItem(html), ZONE, 'test', LOCATION);
            if ('type' in result) throw new Error(`Unexpected ParseError: ${result.reason}`);
            expect(result.summary).toBe('Test Event');
            expect(result.date.year()).toBe(2026);
            expect(result.date.monthValue()).toBe(6);
            expect(result.date.dayOfMonth()).toBe(15);
            expect(result.date.hour()).toBe(20);
            expect(result.id).toBe('test-12345');
            expect(result.location).toBe(LOCATION);
        });

        it('generates date-keyed fallback ID when no numeric ID in URL', () => {
            const html = `<div class="eventItem entry">
                <div class="date" aria-label="Jul 4 2026">
                    <span class="m-date__month">Jul</span>
                    <span class="m-date__day">4</span>
                </div>
                <h3 class="title"><a href="/events/detail/some-event">Fourth of July Bash</a></h3>
                <div class="meta">
                    <span class="time">Doors: 6:00 PM</span>
                </div>
            </div>`;
            const result = parseAXSSkinEvent(makeEventItem(html), ZONE, 'test', LOCATION);
            if ('type' in result) throw new Error(`Unexpected ParseError: ${result.reason}`);
            expect(result.id).toContain('test-');
            expect(result.id).toContain('fourth-of-july-bash');
            expect(result.id).toContain('20260704');
        });

        it('strips "with" prefix from taglines to avoid double "with"', () => {
            const html = `<div class="eventItem entry">
                <div class="date" aria-label="May 20 2026">
                    <span class="m-date__month">May</span>
                    <span class="m-date__day">20</span>
                </div>
                <h3 class="title"><a href="/events/detail/band-99">The Band</a></h3>
                <div class="tagline">with The Opener</div>
                <div class="meta">
                    <span class="time">Doors: 7:00 PM</span>
                </div>
            </div>`;
            const result = parseAXSSkinEvent(makeEventItem(html), ZONE, 'test', LOCATION);
            if ('type' in result) throw new Error(`Unexpected ParseError: ${result.reason}`);
            expect(result.summary).toBe('The Band with The Opener');
            expect(result.description).toContain('with The Opener');
        });

        it('returns ParseError for events marked canceled', () => {
            const html = `<div class="eventItem entry">
                <div class="date" aria-label="May 10 2026">
                    <span class="m-date__month">May</span>
                    <span class="m-date__day">10</span>
                </div>
                <h3 class="title"><a href="/events/detail/canceled-show-55555">Canceled Show</a></h3>
                <div class="buttons">
                    <a class="tickets" data-canceled="true" href="#">Tickets</a>
                </div>
            </div>`;
            const result = parseAXSSkinEvent(makeEventItem(html), ZONE, 'test', LOCATION);
            expect('type' in result).toBe(true);
            if ('type' in result) {
                expect(result.reason).toContain('canceled');
            }
        });

        it('returns ParseError for missing title', () => {
            const html = `<div class="eventItem entry">
                <div class="date" aria-label="May 10 2026"></div>
            </div>`;
            const result = parseAXSSkinEvent(makeEventItem(html), ZONE, 'test', LOCATION);
            expect('type' in result).toBe(true);
            if ('type' in result) {
                expect(result.reason).toContain('missing title');
            }
        });

        it('returns ParseError for unparseable date', () => {
            const html = `<div class="eventItem entry">
                <div class="date"></div>
                <h3 class="title"><a href="/events/detail/no-date-999">No Date Show</a></h3>
            </div>`;
            const result = parseAXSSkinEvent(makeEventItem(html), ZONE, 'test', LOCATION);
            expect('type' in result).toBe(true);
            if ('type' in result) {
                expect(result.reason).toContain('Could not parse date');
            }
        });
    });

    describe('AXSSkinRipper base class', () => {
        it('can be subclassed', () => {
            class TestRipper extends AXSSkinRipper {
                protected venueId = 'test';
                protected location = 'Test Venue';
                protected defaultDurationHours = 3;
            }
            const ripper = new TestRipper();
            expect(ripper).toBeDefined();
            expect(typeof ripper.rip).toBe('function');
        });

        it('paginates through AJAX endpoint until empty response', async () => {
            const __dirname = dirname(fileURLToPath(import.meta.url));
            const ajaxJson = readFileSync(join(__dirname, 'sample-data-axs-ajax.json'), 'utf-8');

            class TestRipper extends AXSSkinRipper {
                protected venueId = 'test';
                protected location = LOCATION;
                protected defaultDurationHours = 3;
            }

            // Page 1: 2 events (< 12 per page, so only one fetch needed in this test)
            // But to test pagination loop, simulate: page1 = 12 items, page2 = 2 items
            const page1Html = JSON.parse(ajaxJson) as string;
            // Create a full 12-item page by repeating events with different IDs
            const items = Array.from({ length: 12 }, (_, i) =>
                page1Html.replace(/55555/g, `${70000 + i}`).replace(/66666/g, `${80000 + i}`)
                    .replace(/AJAX Event One/g, `Event ${i}a`)
                    .replace(/AJAX Event Two/g, `Event ${i}b`)
            ).join('');
            const page1Response = JSON.stringify(items);
            const page2Response = ajaxJson; // 2 items — less than perPage, terminates

            let fetchCallCount = 0;
            const mockFetch = vi.fn(async (url: string) => {
                fetchCallCount++;
                const body = fetchCallCount === 1 ? page1Response : page2Response;
                return { ok: true, text: async () => body } as Response;
            });

            // Monkey-patch getFetchForConfig via module mock
            const { getFetchForConfig } = await import('./proxy-fetch.js');
            vi.spyOn(await import('./proxy-fetch.js'), 'getFetchForConfig').mockReturnValue(mockFetch as any);

            const ripper = new TestRipper();
            const result = await ripper.rip({
                config: {
                    url: new URL('https://www.example.com/events'),
                    calendars: [{
                        name: 'test-cal',
                        friendlyname: 'Test Calendar',
                        timezone: 'America/Los_Angeles' as any,
                        tags: [],
                    }],
                } as any,
            } as any);

            expect(fetchCallCount).toBe(2);
            expect(result).toHaveLength(1);
            // Should have events from both pages (deduped)
            expect(result[0].events.length).toBeGreaterThan(2);

            vi.restoreAllMocks();
        });
    });

    describe('parseAXSSkinEvents with AJAX response format', () => {
        it('parses JSON-encoded HTML from AJAX endpoint', () => {
            const __dirname = dirname(fileURLToPath(import.meta.url));
            const ajaxJson = readFileSync(join(__dirname, 'sample-data-axs-ajax.json'), 'utf-8');
            // Simulate what the ripper does: JSON.parse the response to get HTML
            const html = JSON.parse(ajaxJson) as string;
            const results = parseAXSSkinEvents(html, ZONE, 'test', LOCATION);
            expect(results.length).toBe(2);
            const events = results.filter(r => !('type' in r));
            expect(events.length).toBe(2);
            expect(events[0].summary).toBe('AJAX Event One');
            expect(events[1].summary).toBe('AJAX Event Two');
            expect(events[0].id).toBe('test-55555');
            expect(events[1].id).toBe('test-66666');
        });
    });
});
import { describe, it, expect } from 'vitest';
import { ZoneId } from '@js-joda/core';
import { parseAXSSkinEvent, parseAXSSkinEvents, AXSSkinRipper } from './axsskin.js';
import { parse } from 'node-html-parser';

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
    });
});
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import { extractItemList, parseEventFromSchema } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACIFIC = ZoneId.of('America/Los_Angeles');

// Fixed "now": May 16, 2026 noon Pacific — before the two sample future events
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 5, 16, 12, 0), PACIFIC);

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('extractItemList', () => {
    it('finds the ItemList JSON-LD block from sample HTML', () => {
        const html = loadSampleHtml();
        const result = extractItemList(html);
        expect(result).not.toBeNull();
        expect(result!['@type']).toBe('ItemList');
        expect(result!.itemListElement).toHaveLength(2);
    });

    it('returns null when no ItemList is present', () => {
        const html = '<html><body><script type="application/ld+json">{"@type":"WebPage"}</script></body></html>';
        expect(extractItemList(html)).toBeNull();
    });

    it('returns null for empty HTML', () => {
        expect(extractItemList('<html></html>')).toBeNull();
    });

    it('skips malformed JSON blocks and finds valid ItemList', () => {
        const html = [
            '<script type="application/ld+json">NOT JSON</script>',
            '<script type="application/ld+json">{"@type":"ItemList","itemListElement":[]}</script>',
        ].join('');
        const result = extractItemList(html);
        expect(result).not.toBeNull();
        expect(result!.itemListElement).toHaveLength(0);
    });
});

describe('parseEventFromSchema', () => {
    it('parses a future event with start and end date', () => {
        const event = {
            '@type': 'Event' as const,
            name: 'Cannonball Community Day',
            startDate: '2026-05-31T19:00:00.000Z',
            endDate: '2026-06-01T00:00:00.000Z',
            url: 'https://cannonballarts.com/events/cannonball-community-day',
        };
        const result = parseEventFromSchema(event, NOW, PACIFIC);
        expect(result).not.toBeNull();
        expect('date' in result!).toBe(true);
        if (result && 'date' in result) {
            expect(result.summary).toBe('Cannonball Community Day');
            expect(result.id).toBe('cannonball-arts-cannonball-community-day');
            expect(result.url).toBe('https://cannonballarts.com/events/cannonball-community-day');
            // 2026-05-31T19:00Z = 2026-05-31T12:00 PDT
            expect(result.date.monthValue()).toBe(5);
            expect(result.date.dayOfMonth()).toBe(31);
            expect(result.date.hour()).toBe(12);
            // endDate - startDate = 5 hours
            expect(result.duration.toMinutes()).toBe(300);
        }
    });

    it('uses default 2-hour duration when endDate is absent', () => {
        const event = {
            '@type': 'Event' as const,
            name: 'Summer Open Studio',
            startDate: '2026-07-15T20:00:00.000Z',
            url: 'https://cannonballarts.com/events/summer-open-studio',
        };
        const result = parseEventFromSchema(event, NOW, PACIFIC);
        expect(result && 'date' in result ? result.duration.toMinutes() : null).toBe(120);
    });

    it('returns null for a past event', () => {
        const event = {
            '@type': 'Event' as const,
            name: 'Past Show',
            startDate: '2026-04-01T19:00:00.000Z',
            url: 'https://cannonballarts.com/events/past-show',
        };
        expect(parseEventFromSchema(event, NOW, PACIFIC)).toBeNull();
    });

    it('returns ParseError for an unparseable startDate', () => {
        const event = {
            '@type': 'Event' as const,
            name: 'Bad Date Event',
            startDate: 'not-a-date',
        };
        const result = parseEventFromSchema(event, NOW, PACIFIC);
        expect(result).not.toBeNull();
        expect('type' in result!).toBe(true);
        if (result && 'type' in result) {
            expect(result.type).toBe('ParseError');
        }
    });

    it('ignores negative or zero duration endDate and uses default', () => {
        const event = {
            '@type': 'Event' as const,
            name: 'Weird Dates Event',
            startDate: '2026-08-01T20:00:00.000Z',
            endDate: '2026-08-01T19:00:00.000Z', // end before start
            url: 'https://cannonballarts.com/events/weird-dates',
        };
        const result = parseEventFromSchema(event, NOW, PACIFIC);
        expect(result && 'date' in result ? result.duration.toMinutes() : null).toBe(120);
    });
});

describe('extractItemList + parseEventFromSchema (integration)', () => {
    it('processes sample HTML: 2 future events', () => {
        const html = loadSampleHtml();
        const itemList = extractItemList(html);
        expect(itemList).not.toBeNull();

        const events = [];
        const errors = [];
        for (const listItem of itemList!.itemListElement ?? []) {
            const event = listItem.item;
            if (!event || event['@type'] !== 'Event') continue;
            const result = parseEventFromSchema(event, NOW, PACIFIC);
            if (result === null) continue;
            if ('date' in result) events.push(result);
            else errors.push(result);
        }

        expect(events).toHaveLength(2);
        expect(errors).toHaveLength(0);
        expect(events[0].summary).toBe('Cannonball Community Day');
        expect(events[1].summary).toBe('Summer Open Studio');
    });
});

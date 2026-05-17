import { describe, it, expect } from 'vitest';
import { ZonedDateTime, Duration, ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import type {
    RipperCalendarEvent,
    RipperError,
    UncertaintyError,
} from './config/schema.js';
import type { UncertaintyCache } from './event-uncertainty-cache.js';
import { applyUncertaintyResolutions } from './uncertainty-merge.js';

const TZ = ZoneId.of('America/Los_Angeles');

function makeEvent(overrides: Partial<RipperCalendarEvent> = {}): RipperCalendarEvent {
    return {
        id: 'sample-event-2026-02-14',
        ripped: new Date('2026-05-16T00:00:00Z'),
        date: ZonedDateTime.of(2026, 2, 14, 12, 0, 0, 0, TZ),
        duration: Duration.ofHours(2),
        summary: 'Sample event',
        ...overrides,
    };
}

function makeUncertainty(event: RipperCalendarEvent, unknownFields: UncertaintyError['unknownFields']): UncertaintyError {
    return {
        type: 'Uncertainty',
        reason: 'Source page did not list a start time',
        source: 'events12',
        unknownFields,
        event,
    };
}

describe('applyUncertaintyResolutions', () => {
    it('passes events through untouched when there are no uncertainty errors', () => {
        const event = makeEvent();
        const result = applyUncertaintyResolutions([event], [], { version: 1, entries: {} }, 'events12');
        expect(result.events).toEqual([event]);
        expect(result.errors).toEqual([]);
        expect(result.stats).toEqual({ resolved: 0, acknowledgedUnresolvable: 0, outstanding: 0 });
    });

    it('keeps the error and appends a pending note when the cache misses', () => {
        const event = makeEvent({ description: 'Live music every night.' });
        const err = makeUncertainty(event, ['startTime']);
        const cache: UncertaintyCache = { version: 1, entries: {} };

        const result = applyUncertaintyResolutions([event], [err], cache, 'events12');

        expect(result.events).toHaveLength(1);
        expect(result.events[0].description).toContain('Live music every night.');
        expect(result.events[0].description).toContain('Time is approximate');
        expect(result.errors).toEqual([err]);
        expect(result.stats.outstanding).toBe(1);
        expect(result.stats.resolved).toBe(0);
    });

    it('handles missing description gracefully when appending the pending note', () => {
        const event = makeEvent({ description: undefined });
        const err = makeUncertainty(event, ['startTime']);
        const result = applyUncertaintyResolutions([event], [err], { version: 1, entries: {} }, 'events12');
        expect(result.events[0].description).toMatch(/^⚠️/);
    });

    it('applies a resolved startTime from the cache and drops the error', () => {
        const event = makeEvent();
        const err = makeUncertainty(event, ['startTime']);
        const cache: UncertaintyCache = {
            version: 1,
            entries: {
                'events12:sample-event-2026-02-14': {
                    fields: { startTime: '19:30' },
                    resolvedAt: '2026-05-17',
                    source: 'agent',
                    evidence: 'https://example.com/event/1',
                },
            },
        };

        const result = applyUncertaintyResolutions([event], [err], cache, 'events12');

        expect(result.events[0].date.hour()).toBe(19);
        expect(result.events[0].date.minute()).toBe(30);
        // Date and zone unchanged
        expect(result.events[0].date.dayOfMonth()).toBe(14);
        expect(result.events[0].date.zone().id()).toBe('America/Los_Angeles');
        expect(result.errors).toEqual([]);
        expect(result.stats.resolved).toBe(1);
    });

    it('applies a resolved duration and location from the cache', () => {
        const event = makeEvent();
        const err = makeUncertainty(event, ['duration', 'location']);
        const cache: UncertaintyCache = {
            version: 1,
            entries: {
                'events12:sample-event-2026-02-14': {
                    fields: { duration: 5400, location: '123 Main St, Seattle' },
                    resolvedAt: '2026-05-17',
                    source: 'manual',
                },
            },
        };

        const result = applyUncertaintyResolutions([event], [err], cache, 'events12');

        expect(result.events[0].duration.seconds()).toBe(5400);
        expect(result.events[0].location).toBe('123 Main St, Seattle');
        expect(result.stats.resolved).toBe(1);
        expect(result.errors).toEqual([]);
    });

    it('drops the error and appends an "unresolvable" note when cache says so', () => {
        const event = makeEvent();
        const err = makeUncertainty(event, ['startTime']);
        const cache: UncertaintyCache = {
            version: 1,
            entries: {
                'events12:sample-event-2026-02-14': {
                    unresolvable: true,
                    reason: 'Source page no longer lists this event',
                    resolvedAt: '2026-05-17',
                    source: 'manual',
                },
            },
        };

        const result = applyUncertaintyResolutions([event], [err], cache, 'events12');

        expect(result.errors).toEqual([]);
        expect(result.events[0].description).toContain('could not be verified');
        expect(result.stats.acknowledgedUnresolvable).toBe(1);
    });

    it('preserves unrelated errors and unrelated events', () => {
        const event1 = makeEvent({ id: 'event-1' });
        const event2 = makeEvent({ id: 'event-2', summary: 'Other event' });
        const uncertainty = makeUncertainty(event1, ['startTime']);
        const parseError: RipperError = {
            type: 'ParseError',
            reason: 'malformed row',
            context: 'row 42',
        };
        const cache: UncertaintyCache = {
            version: 1,
            entries: {
                'events12:event-1': {
                    fields: { startTime: '20:00' },
                    resolvedAt: '2026-05-17',
                    source: 'manual',
                },
            },
        };

        const result = applyUncertaintyResolutions([event1, event2], [uncertainty, parseError], cache, 'events12');

        expect(result.events).toHaveLength(2);
        expect(result.events[0].date.hour()).toBe(20);
        expect(result.events[1]).toEqual(event2); // untouched
        expect(result.errors).toEqual([parseError]);
        expect(result.stats.resolved).toBe(1);
    });

    it('invalidates a cache entry whose fingerprint no longer matches', () => {
        const event = makeEvent();
        const err: UncertaintyError = {
            ...makeUncertainty(event, ['startTime']),
            partialFingerprint: 'new-fingerprint',
        };
        const cache: UncertaintyCache = {
            version: 1,
            entries: {
                'events12:sample-event-2026-02-14': {
                    fields: { startTime: '08:00' },
                    resolvedAt: '2026-05-17',
                    source: 'manual',
                    partialFingerprint: 'old-fingerprint',
                },
            },
        };

        const result = applyUncertaintyResolutions([event], [err], cache, 'events12');

        // Cache miss — error kept, no fields applied
        expect(result.events[0].date.hour()).toBe(12); // unchanged
        expect(result.errors).toEqual([err]);
        expect(result.stats.outstanding).toBe(1);
        expect(result.stats.resolved).toBe(0);
    });

    it('warns and skips uncertainty errors whose event has no id', () => {
        const event = makeEvent({ id: undefined });
        const err = makeUncertainty(event, ['startTime']);
        const result = applyUncertaintyResolutions([event], [err], { version: 1, entries: {} }, 'events12');
        // The event has no id, so the merge can't match it to the error.
        // The error stays in the list but the event is untouched.
        expect(result.events[0]).toEqual(event);
        expect(result.errors).toEqual([err]);
        expect(result.stats.outstanding).toBe(0);
    });
});

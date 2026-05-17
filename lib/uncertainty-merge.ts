import { ZonedDateTime, Duration } from '@js-joda/core';
import type {
    RipperCalendarEvent,
    RipperError,
    UncertaintyError,
    UncertaintyField,
} from './config/schema.js';
import {
    lookupUncertaintyCache,
    type UncertaintyCache,
    type UncertaintyResolutionFields,
} from './event-uncertainty-cache.js';

export interface UncertaintyMergeStats {
    // Cache hit produced a resolved value — error dropped, event updated.
    resolved: number;
    // Cache hit recorded as unresolvable — error dropped, note appended to event.
    acknowledgedUnresolvable: number;
    // No cache entry yet — error kept (counts toward totalErrors), note appended to event.
    outstanding: number;
}

export interface UncertaintyMergeResult {
    events: RipperCalendarEvent[];
    errors: RipperError[];
    stats: UncertaintyMergeStats;
}

// Append a short caveat to the event description for unresolved or
// unresolvable uncertainties so subscribers see the disclaimer in their
// calendar app. Kept short and human-readable; the resolver agent
// replaces this naturally by populating the cache, which drops the note
// on the next build.
function appendUncertaintyNote(
    description: string | undefined,
    unknownFields: UncertaintyField[],
    kind: 'pending' | 'unresolvable',
    eventUrl?: string,
): string {
    const fieldLabel = unknownFields
        .map(f => {
            switch (f) {
                case 'startTime': return 'Time';
                case 'duration': return 'Duration';
                case 'location': return 'Location';
                case 'image': return 'Image';
                default: return f;
            }
        })
        .join(', ');
    const verb = unknownFields.length === 1 ? 'is' : 'are';
    const note = kind === 'pending'
        ? `⚠️ ${fieldLabel} ${verb} approximate — automated verification pending.`
        : `⚠️ ${fieldLabel} could not be verified against the source.`;
    const suffix = eventUrl ? `\nSource: ${eventUrl}` : '';
    if (!description) return `${note}${suffix}`;
    return `${description}\n\n${note}${suffix}`;
}

// Overwrite the hour/minute of a ZonedDateTime while preserving its date
// and zone. Time string is "HH:MM" or "HH:MM:SS".
function applyStartTime(date: ZonedDateTime, startTime: string): ZonedDateTime {
    const parts = startTime.split(':');
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1] ?? '0', 10);
    const second = parseInt(parts[2] ?? '0', 10);
    if (isNaN(hour) || isNaN(minute) || isNaN(second)) return date;
    return date.withHour(hour).withMinute(minute).withSecond(second).withNano(0);
}

function applyResolution(
    event: RipperCalendarEvent,
    fields: UncertaintyResolutionFields,
): RipperCalendarEvent {
    let updated = { ...event };
    if (fields.startTime) {
        updated.date = applyStartTime(updated.date, fields.startTime);
    }
    if (typeof fields.duration === 'number' && fields.duration > 0) {
        updated.duration = Duration.ofSeconds(fields.duration);
    }
    if (fields.location !== undefined) {
        updated.location = fields.location;
    }
    if (fields.image !== undefined) {
        updated.image = fields.image;
    }
    return updated;
}

// Pure function: merge ripper output against the uncertainty cache and
// return the resulting events + errors + merge stats. Does not touch the
// cache or any I/O — calendar_ripper.ts owns persistence.
//
// Behavior per event with an associated UncertaintyError:
//   - cache hit "resolved":      apply fields, drop the error.
//   - cache hit "unresolvable":  append note to event description, drop the error.
//   - cache miss:                append note to event description, keep the error.
//
// Events without a matching UncertaintyError are passed through untouched.
// Errors not of type "Uncertainty" are passed through untouched.
export function applyUncertaintyResolutions(
    events: RipperCalendarEvent[],
    errors: RipperError[],
    cache: Readonly<UncertaintyCache>,
    source: string,
): UncertaintyMergeResult {
    const stats: UncertaintyMergeStats = {
        resolved: 0,
        acknowledgedUnresolvable: 0,
        outstanding: 0,
    };

    // Index uncertainty errors by the event id they reference. A given
    // event id may have at most one UncertaintyError (rippers should
    // combine all unknown fields into one) — if multiple exist we apply
    // resolution to all of them.
    const uncertaintyByEventId = new Map<string, UncertaintyError[]>();
    for (const err of errors) {
        if (err.type !== 'Uncertainty') continue;
        const id = err.event.id;
        if (!id) {
            console.warn(`[uncertainty] ${source}: UncertaintyError missing event.id, cannot resolve from cache`);
            continue;
        }
        const list = uncertaintyByEventId.get(id) ?? [];
        list.push(err);
        uncertaintyByEventId.set(id, list);
    }

    // Track which errors to drop so we can rebuild the errors array once.
    const errorsToDrop = new Set<RipperError>();

    const updatedEvents = events.map(event => {
        if (!event.id) return event;
        const matchingErrors = uncertaintyByEventId.get(event.id);
        if (!matchingErrors || matchingErrors.length === 0) return event;

        // All matching errors share the same eventId so they consult the
        // same cache entry. Use the first one's fingerprint for lookup.
        const lookup = lookupUncertaintyCache(
            cache,
            source,
            event.id,
            matchingErrors[0].partialFingerprint,
        );

        if (lookup.kind === 'resolved' && lookup.entry?.fields) {
            for (const err of matchingErrors) errorsToDrop.add(err);
            stats.resolved += matchingErrors.length;
            return applyResolution(event, lookup.entry.fields);
        }

        if (lookup.kind === 'unresolvable') {
            for (const err of matchingErrors) errorsToDrop.add(err);
            stats.acknowledgedUnresolvable += matchingErrors.length;
            const allUnknownFields = Array.from(new Set(matchingErrors.flatMap(e => e.unknownFields)));
            return {
                ...event,
                description: appendUncertaintyNote(event.description, allUnknownFields, 'unresolvable', event.url),
            };
        }

        // Miss — keep the error, append a pending note.
        stats.outstanding += matchingErrors.length;
        const allUnknownFields = Array.from(new Set(matchingErrors.flatMap(e => e.unknownFields)));
        return {
            ...event,
            description: appendUncertaintyNote(event.description, allUnknownFields, 'pending', event.url),
        };
    });

    const updatedErrors = errors.filter(e => !errorsToDrop.has(e));

    return { events: updatedEvents, errors: updatedErrors, stats };
}

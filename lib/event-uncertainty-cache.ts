import { readFile, writeFile } from 'fs/promises';
import type { UncertaintyField } from './config/schema.js';

// Resolved values supplied by the event-uncertainty-resolver skill.
// Field names and value shapes match the script CLI in
// skills/event-uncertainty-resolver/scripts/uncertainty-cache.py.
export interface UncertaintyResolutionFields {
    startTime?: string;        // "HH:MM" or "HH:MM:SS" in the event's local timezone
    duration?: number;         // seconds
    location?: string;
    image?: string;
}

export interface UncertaintyCacheEntry {
    fields?: UncertaintyResolutionFields;
    unresolvable?: boolean;
    reason?: string;
    resolvedAt: string;        // ISO date YYYY-MM-DD
    source: 'manual' | 'agent';
    evidence?: string;         // URL the resolver used to verify the values
    partialFingerprint?: string;
}

export interface UncertaintyCache {
    version: number;
    entries: Record<string, UncertaintyCacheEntry>;
}

// Key shape is `${ripperName}:${eventId}`. The ripper name comes from
// the source YAML and the event id comes from the ripper's own stable
// id-generation logic — see AGENTS.md "Stable event IDs".
export function uncertaintyCacheKey(source: string, eventId: string): string {
    return `${source}:${eventId}`;
}

export async function loadUncertaintyCache(filePath: string): Promise<UncertaintyCache> {
    try {
        const raw = await readFile(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (
            typeof parsed === 'object' &&
            parsed !== null &&
            typeof parsed.version === 'number' &&
            typeof parsed.entries === 'object' &&
            parsed.entries !== null
        ) {
            return parsed as UncertaintyCache;
        }
        console.warn(`${filePath} has unexpected shape, starting with empty cache`);
        return { version: 1, entries: {} };
    } catch (err: any) {
        if (err?.code === 'ENOENT') {
            return { version: 1, entries: {} };
        }
        if (err instanceof SyntaxError) {
            console.warn(`${filePath} is not valid JSON, starting with empty cache: ${err.message}`);
            return { version: 1, entries: {} };
        }
        throw err;
    }
}

export async function saveUncertaintyCache(cache: UncertaintyCache, filePath: string): Promise<void> {
    await writeFile(filePath, JSON.stringify(cache, null, 2), 'utf-8');
}

export interface UncertaintyLookupResult {
    kind: 'resolved' | 'unresolvable' | 'miss';
    entry?: UncertaintyCacheEntry;
}

export function lookupUncertaintyCache(
    cache: Readonly<UncertaintyCache>,
    source: string,
    eventId: string,
    partialFingerprint?: string,
): UncertaintyLookupResult {
    const key = uncertaintyCacheKey(source, eventId);
    const entry = cache.entries[key];
    if (!entry) return { kind: 'miss' };

    // If the ripper's parsed data has changed since the resolution was
    // recorded, the resolution is stale — fall through to a miss so the
    // resolver re-investigates against the current upstream content.
    if (
        partialFingerprint !== undefined &&
        entry.partialFingerprint !== undefined &&
        entry.partialFingerprint !== partialFingerprint
    ) {
        return { kind: 'miss' };
    }

    if (entry.unresolvable) return { kind: 'unresolvable', entry };
    if (entry.fields) return { kind: 'resolved', entry };
    return { kind: 'miss' };
}

// All unique fields that any unresolved cache entry could still help with.
// Used for reporting: "X events outstanding for time, Y for location."
export function summarizeOutstandingFields(unknownFields: UncertaintyField[]): string {
    if (unknownFields.length === 0) return '(no fields)';
    return unknownFields.join(', ');
}

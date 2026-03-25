import { readFile, writeFile } from 'fs/promises';
import type { GeocodeError } from './config/schema.js';

export interface GeoCoords {
  lat: number;
  lng: number;
}

export interface GeoCacheEntry {
  lat?: number;
  lng?: number;
  unresolvable?: boolean;
  geocodedAt: string;
  source: 'nominatim' | 'manual';
}

export interface GeoCache {
  version: number;
  entries: Record<string, GeoCacheEntry>;
}

export function normalizeLocationKey(location: string): string {
  return location.trim().toLowerCase();
}

export async function loadGeoCache(filePath: string): Promise<GeoCache> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as GeoCache;
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return { version: 1, entries: {} };
    }
    throw err;
  }
}

export async function saveGeoCache(cache: GeoCache, filePath: string): Promise<void> {
  await writeFile(filePath, JSON.stringify(cache, null, 2), 'utf-8');
}

export function lookupGeoCache(cache: GeoCache, location: string): GeoCoords | null {
  const key = normalizeLocationKey(location);
  const entry = cache.entries[key];
  if (!entry) return null;
  if (entry.unresolvable) return null;
  if (entry.lat !== undefined && entry.lng !== undefined) {
    return { lat: entry.lat, lng: entry.lng };
  }
  return null;
}

let lastNominatimCallTime = 0

// In-flight deduplication: if two concurrent calls arrive for the same location key,
// the second waits for the first's promise rather than making a duplicate Nominatim
// request and racing on the cache write.
const inFlight = new Map<string, Promise<GeoCoords | null>>()

// Serializes all Nominatim HTTP calls so that concurrent requests for *different*
// locations cannot race on lastNominatimCallTime or violate the 1 req/sec policy.
// Each caller waits for the previous caller's slot to release before proceeding.
let nominatimQueueTail: Promise<void> = Promise.resolve()

async function fetchFromNominatim(location: string): Promise<GeoCoords | null> {
  // Acquire a slot in the serial queue.
  const prevTail = nominatimQueueTail
  let releaseSlot!: () => void
  nominatimQueueTail = new Promise<void>(resolve => { releaseSlot = resolve })

  try {
    await prevTail

    // Rate limit: enforce 1 req/sec.
    // Because fetchFromNominatim calls are serialized by nominatimQueueTail, only one
    // call can reach this point at a time, so reading and writing lastNominatimCallTime
    // here is race-free. We delay first, then record the timestamp so it always reflects
    // when the request actually fired rather than when we started waiting.
    const now = Date.now()
    const elapsed = now - lastNominatimCallTime
    if (lastNominatimCallTime > 0 && elapsed < 1000) {
      await new Promise(resolve => setTimeout(resolve, 1000 - elapsed))
    }
    lastNominatimCallTime = Date.now()

    const encoded = encodeURIComponent(location);
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=us&viewbox=-122.6,47.3,-121.9,47.8&bounded=1`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'calendar-ripper/1.0 (github.com/prestomation/calendar-ripper)',
        },
      });

      if (!res.ok) {
        return null;
      }

      const data = await res.json() as Array<{ lat: string; lon: string }>;
      if (!Array.isArray(data) || data.length === 0) {
        return null;
      }

      const first = data[0];
      const lat = parseFloat(first.lat);
      const lng = parseFloat(first.lon);
      if (isNaN(lat) || isNaN(lng)) return null;

      return { lat, lng };
    } catch {
      return null;
    }
  } finally {
    releaseSlot()
  }
}

export async function geocodeLocation(location: string): Promise<GeoCoords | null> {
  const key = normalizeLocationKey(location)

  // Deduplicate concurrent calls for the same location
  const existing = inFlight.get(key)
  if (existing) return existing

  const promise = fetchFromNominatim(location)

  inFlight.set(key, promise)
  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}

// In-flight deduplication for resolveEventCoords: if concurrent callers request the
// same location key simultaneously, only one geocode call is made and one cache write
// occurs. All concurrent callers for the same key share the same resolution promise.
type ResolveResult = { coords: GeoCoords | null; geocodeSource: 'ripper' | 'cached' | 'none'; error?: GeocodeError }
const resolveInFlight = new Map<string, Promise<ResolveResult>>()

export async function resolveEventCoords(
  cache: GeoCache,
  location: string | undefined,
  sourceName: string,
  onCacheUpdated?: () => Promise<void>
): Promise<ResolveResult> {
  if (!location || location.trim() === '') {
    return { coords: null, geocodeSource: 'none' };
  }

  const cached = lookupGeoCache(cache, location);
  if (cached !== null) {
    return { coords: cached, geocodeSource: 'cached' };
  }

  const key = normalizeLocationKey(location);
  // Check if unresolvable in cache
  const entry = cache.entries[key];
  if (entry?.unresolvable) {
    return { coords: null, geocodeSource: 'none' };
  }

  // Deduplicate concurrent resolves for the same location key: if another async
  // call is already geocoding this key, wait for its result rather than making a
  // second Nominatim request and racing on the cache write.
  const existingResolve = resolveInFlight.get(key)
  if (existingResolve) return existingResolve

  const promise: Promise<ResolveResult> = (async () => {
    // Cache miss — call Nominatim
    const coords = await geocodeLocation(location);

    if (coords !== null) {
      cache.entries[key] = {
        lat: coords.lat,
        lng: coords.lng,
        geocodedAt: new Date().toISOString().slice(0, 10),
        source: 'nominatim',
      };
      await onCacheUpdated?.();
      return { coords, geocodeSource: 'cached' as const };
    } else {
      // Mark as unresolvable
      cache.entries[key] = {
        unresolvable: true,
        geocodedAt: new Date().toISOString().slice(0, 10),
        source: 'nominatim',
      };
      await onCacheUpdated?.();
      const error: GeocodeError = {
        type: 'GeocodeError',
        location,
        source: sourceName,
        reason: 'Nominatim returned no results',
      };
      return { coords: null, geocodeSource: 'none' as const, error };
    }
  })()

  resolveInFlight.set(key, promise)
  try {
    return await promise
  } finally {
    resolveInFlight.delete(key)
  }
}

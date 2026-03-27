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

/**
 * Normalize a raw location string from an ICS feed or scraper:
 * 1. Unescape ICS-escaped commas (\\, → ,)
 * 2. Strip HTML tags
 * 3. Split on <br>, newlines, or semicolons and take only the first segment
 * 4. Collapse internal whitespace and trim
 */
export function normalizeLocation(location: string): string {
  // Step 1: Unescape ICS-escaped commas (\\, → ,)
  let normalized = location.replace(/\\,/g, ',');

  // Step 2: Split on <br> variants and newlines BEFORE stripping tags,
  // so we can grab the first meaningful line.
  // Also split on semicolons (ICS uses ; as multi-value separator).
  const firstSegment = normalized.split(/<br\s*\/?>/i)[0];

  // Step 3: Strip all remaining HTML tags
  const stripped = firstSegment.replace(/<[^>]*>/g, '');

  // Step 4: Split on newlines and semicolons, take the first non-empty part
  const lines = stripped.split(/[\n\r;]+/);
  const firstLine = lines.find(l => l.trim().length > 0) ?? stripped;

  // Step 5: Collapse internal whitespace and trim
  return firstLine.replace(/\s+/g, ' ').trim();
}

export function normalizeLocationKey(location: string): string {
  return normalizeLocation(location).toLowerCase();
}

/**
 * If the location looks like "Venue Name: 1234 Street..." or "Venue Name, 1234 Street..."
 * (i.e. a venue prefix followed by a street address starting with a digit),
 * return the address-only portion.  Returns null if no venue prefix is detected.
 *
 * Only `:` or `,` are treated as venue-prefix separators; plain spaces are not,
 * to avoid false positives on bare addresses like "1515 12th Ave, Seattle WA".
 */
export function extractAddressFromVenuePrefix(location: string): string | null {
  // Match "Some Venue Name: 1234 Street..." or "Some Venue Name, 1234 Street..."
  // The venue part must contain at least one non-digit character (so pure addresses
  // like "1515 12th Ave" don't accidentally match).
  const match = location.match(/^([^:,]*[A-Za-z][^:,]*)[:,]\s*(\d.+)$/);
  if (match) {
    return match[2].trim();
  }
  return null;
}

/**
 * If the location string is a Google Maps search URL of the form:
 *   https://www.google.com/maps/search/?api=1&query=<url-encoded-address>
 * extract and return the decoded query parameter as the location string.
 * Returns null if not a Google Maps search URL.
 */
export function extractFromGoogleMapsUrl(location: string): string | null {
  const trimmed = location.trim();
  // Match Google Maps search URLs
  const match = trimmed.match(/^https?:\/\/(?:www\.)?google\.com\/maps\/search\/\?/i);
  if (!match) return null;

  try {
    const url = new URL(trimmed);
    const query = url.searchParams.get('query');
    if (query != null && query.trim().length > 0) {
      return query.trim();
    }
    return null;
  } catch {
    // If URL parsing fails, try regex fallback
    const queryMatch = trimmed.match(/[?&]query=([^&]+)/i);
    if (queryMatch != null && queryMatch[1] != null) {
      try {
        const decoded = decodeURIComponent(queryMatch[1].replace(/\+/g, ' ')).trim();
        return decoded.length > 0 ? decoded : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Strip suite/floor/room/level suffixes from a location string that may cause
 * Nominatim lookup failures. Also collapses double commas and strips trailing
 * ", United States" or ", USA".
 *
 * Returns the stripped string, or null if no stripping was done (i.e. the
 * string is the same as the input after stripping).
 */
export function stripSuiteFloorSuffixes(location: string): string | null {
  let result = location;

  // Strip #NNN (including alphanumeric and hyphenated suite numbers like #100A, #3-B)
  // Suite NNN, Ste NNN, Floor N, Flr N, Room NNN, Level N
  // These may appear anywhere in the string (with a preceding comma/space separator)
  // Use [\w-]+ to match suite numbers with hyphens (e.g. Suite 200-A)
  result = result.replace(/[,\s]*#\s*[\w-]+/g, '');
  result = result.replace(/[,\s]*\bSuite\s+[\w-]+/gi, '');
  result = result.replace(/[,\s]*\bSte\.?\s+[\w-]+/gi, '');
  result = result.replace(/[,\s]*\bFloor\s+[\w-]+/gi, '');
  result = result.replace(/[,\s]*\bFlr\.?\s+[\w-]+/gi, '');
  result = result.replace(/[,\s]*\bRoom\s+[\w-]+/gi, '');
  result = result.replace(/[,\s]*\bLevel\s+[\w-]+/gi, '');

  // Collapse double commas
  result = result.replace(/,\s*,+/g, ',');

  // Strip trailing ", United States" or ", USA"
  result = result.replace(/,\s*United States\s*$/i, '');
  result = result.replace(/,\s*USA\s*$/i, '');

  // Trim
  result = result.trim().replace(/,\s*$/, '').trim();

  if (result === location || result === '') return null;
  return result;
}

/**
 * Seattle neighborhood centroid table. Used as a fallback when Nominatim
 * fails for neighborhood-level location strings.
 */
const SEATTLE_NEIGHBORHOOD_CENTROIDS: Record<string, GeoCoords> = {
  'belltown': { lat: 47.6132, lng: -122.3473 },
  'capitol hill': { lat: 47.6253, lng: -122.3222 },
  'central district': { lat: 47.6097, lng: -122.2953 },
  'fremont': { lat: 47.6512, lng: -122.3501 },
  'georgetown': { lat: 47.5477, lng: -122.3226 },
  'magnolia': { lat: 47.6431, lng: -122.4009 },
  'wallingford': { lat: 47.6603, lng: -122.3338 },
  'phinney ridge': { lat: 47.6699, lng: -122.3551 },
  'greenwood': { lat: 47.6920, lng: -122.3551 },
  'ballard': { lat: 47.6677, lng: -122.3829 },
  'south lake union': { lat: 47.6275, lng: -122.3362 },
  'seattle center': { lat: 47.6205, lng: -122.3493 },
  'pioneer square': { lat: 47.6007, lng: -122.3321 },
  'international district': { lat: 47.5983, lng: -122.3237 },
  'beacon hill': { lat: 47.5674, lng: -122.3076 },
  'columbia city': { lat: 47.5596, lng: -122.2893 },
  'rainier valley': { lat: 47.5468, lng: -122.2754 },
  'west seattle': { lat: 47.5629, lng: -122.3862 },
  'university district': { lat: 47.6614, lng: -122.3121 },
  'queen anne': { lat: 47.6374, lng: -122.3569 },
  'eastlake': { lat: 47.6392, lng: -122.3252 },
  'lake city': { lat: 47.7190, lng: -122.2976 },
};

/**
 * Look up Seattle neighborhood centroid coords from a normalized location string.
 * Matches "<neighborhood> neighborhood, seattle" or "<neighborhood>, seattle"
 * (case-insensitive). Returns null if no match.
 */
export function lookupNeighborhoodCentroid(location: string): GeoCoords | null {
  const lower = location.toLowerCase().trim();

  for (const [neighborhood, coords] of Object.entries(SEATTLE_NEIGHBORHOOD_CENTROIDS)) {
    // Match "<neighborhood> neighborhood, seattle" or "<neighborhood>, seattle"
    // or just "<neighborhood>" alone
    if (
      lower === neighborhood ||
      lower === `${neighborhood} neighborhood, seattle` ||
      lower === `${neighborhood}, seattle` ||
      lower === `${neighborhood} neighborhood, seattle, wa` ||
      lower === `${neighborhood}, seattle, wa`
    ) {
      return coords;
    }
  }

  return null;
}

/**
 * Seattle Public Library branch coordinates.
 */
const SPL_BRANCH_COORDS: Record<string, GeoCoords> = {
  'ballard branch': { lat: 47.6671, lng: -122.3836 },
  'beacon hill branch': { lat: 47.5689, lng: -122.3014 },
  'broadview branch': { lat: 47.7377, lng: -122.3560 },
  'capitol hill branch': { lat: 47.6234, lng: -122.3196 },
  'central library': { lat: 47.6064, lng: -122.3328 },
  'columbia branch': { lat: 47.5589, lng: -122.2917 },
  'delridge branch': { lat: 47.5540, lng: -122.3620 },
  'douglass-truth branch': { lat: 47.6097, lng: -122.3000 },
  'fremont branch': { lat: 47.6519, lng: -122.3502 },
  'green lake branch': { lat: 47.6788, lng: -122.3321 },
  'greenwood branch': { lat: 47.6960, lng: -122.3557 },
  'high point branch': { lat: 47.5503, lng: -122.3718 },
  'international district branch': { lat: 47.5979, lng: -122.3238 },
  'lake city branch': { lat: 47.7189, lng: -122.2971 },
  'magnolia branch': { lat: 47.6432, lng: -122.3985 },
  'montlake branch': { lat: 47.6419, lng: -122.3079 },
  'newholly branch': { lat: 47.5367, lng: -122.2839 },
  'northeast branch': { lat: 47.6766, lng: -122.2987 },
  'northgate branch': { lat: 47.7063, lng: -122.3255 },
  'queen anne branch': { lat: 47.6374, lng: -122.3569 },
  'rainier beach branch': { lat: 47.5222, lng: -122.2610 },
  'south park branch': { lat: 47.5274, lng: -122.3251 },
  'southwest branch': { lat: 47.5540, lng: -122.3776 },
  'university branch': { lat: 47.6614, lng: -122.3121 },
  'west seattle branch': { lat: 47.5629, lng: -122.3862 },
};

/**
 * Look up Seattle Public Library branch coordinates from a normalized location string.
 * Only applies to strings that explicitly mention "seattle public library" or "spl".
 * Searches for a branch name substring within the location string (case-insensitive).
 * Returns null if no match.
 */
export function lookupSPLBranchCoords(location: string): GeoCoords | null {
  const lower = location.toLowerCase();

  // Only apply to strings that explicitly reference Seattle Public Library or SPL
  // to avoid false positives (e.g. "Fremont Brewing" → "fremont branch")
  const isSPLString =
    lower.includes('seattle public library') ||
    // Match "spl" as a whole word or common SPL prefix patterns (avoid partial matches)
    /\bspl\b/.test(lower);

  if (!isSPLString) return null;

  for (const [branch, coords] of Object.entries(SPL_BRANCH_COORDS)) {
    if (lower.includes(branch)) {
      return coords;
    }
  }

  return null;
}

export async function loadGeoCache(filePath: string): Promise<GeoCache> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    // Validate the basic shape before trusting it; fall back to empty cache on corruption.
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.version === 'number' &&
      typeof parsed.entries === 'object' &&
      parsed.entries !== null
    ) {
      return parsed as GeoCache;
    }
    console.warn(`geo-cache.json has unexpected shape, starting with empty cache`);
    return { version: 1, entries: {} };
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return { version: 1, entries: {} };
    }
    if (err instanceof SyntaxError) {
      // Corrupted JSON (e.g. incomplete write on previous crash) — start fresh
      console.warn(`geo-cache.json is not valid JSON, starting with empty cache: ${err.message}`);
      return { version: 1, entries: {} };
    }
    throw err;
  }
}

export async function saveGeoCache(cache: GeoCache, filePath: string): Promise<void> {
  await writeFile(filePath, JSON.stringify(cache, null, 2), 'utf-8');
}

export function lookupGeoCache(cache: Readonly<GeoCache>, location: string): GeoCoords | null {
  const key = normalizeLocationKey(location);
  const entry = cache.entries[key];
  if (!entry) return null;
  if (entry.unresolvable) return null;
  if (entry.lat !== undefined && entry.lng !== undefined) {
    return { lat: entry.lat, lng: entry.lng };
  }
  return null;
}

// Rate limit state for Nominatim API (1 req/sec required by usage policy).
//
// Safety note: geocodeLocation is called only from resolveEventCoords, which is
// called sequentially in calendar_ripper.ts — each call is `await`ed before the
// next begins (no Promise.all or concurrent fan-out). This makes lastNominatimCallTime
// effectively single-threaded: only one call can be in-flight at a time, so reads
// and writes to this variable are race-free. If the calling code is ever parallelized,
// this variable must be replaced with a proper serialization queue.
let lastNominatimCallTime = 0

export async function geocodeLocation(location: string): Promise<GeoCoords | null> {
  // Rate limit: enforce 1 req/sec before making the Nominatim call.
  // Capture a single timestamp snapshot, compute the required delay, then
  // record (now + delay) as the next allowed call time before awaiting — this
  // means lastNominatimCallTime always reflects the scheduled fire time, not
  // the time we started waiting, and never requires a second Date.now() call.
  const now = Date.now()
  const elapsed = now - lastNominatimCallTime
  const delay = lastNominatimCallTime > 0 ? Math.max(0, 1000 - elapsed) : 0
  lastNominatimCallTime = now + delay
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  const encoded = encodeURIComponent(location);
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=us&viewbox=-122.6,47.3,-121.9,47.8&bounded=1`;

  // Build a 10-second abort signal. Guard the AbortSignal.timeout() call in case
  // the runtime environment doesn't support it (graceful degradation).
  const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(10_000)
    : undefined

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'calendar-ripper/1.0 (github.com/prestomation/calendar-ripper)',
      },
      ...(signal ? { signal } : {}),
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
}

export interface ResolveEventCoordsResult {
  coords: GeoCoords | null;
  geocodeSource: 'ripper' | 'cached' | 'none';
  error?: GeocodeError;
  /** Updated cache — new object if a new entry was added, same reference if unchanged. */
  cache: GeoCache;
}

/**
 * Pure-function geocode resolver. Takes an immutable cache snapshot and returns
 * a new cache object (with the new entry merged in) alongside the result.
 * No shared mutable state is modified — the caller is responsible for storing
 * the returned cache and persisting it to disk.
 *
 * Resolution order:
 * 1. Google Maps URL extraction (before normalization)
 * 2. normalizeLocation()
 * 3. Cache lookup
 * 4. Nominatim geocoding (with venue-prefix fallback)
 * 5. Neighborhood centroid lookup (if Nominatim fails)
 * 6. SPL branch lookup (if Nominatim fails and location mentions a branch)
 * 7. Suite/floor stripping retry (if first Nominatim attempt fails)
 */
export async function resolveEventCoords(
  cache: Readonly<GeoCache>,
  location: string | undefined,
  sourceName: string,
): Promise<ResolveEventCoordsResult> {
  if (!location || location.trim() === '') {
    return { coords: null, geocodeSource: 'none', cache };
  }

  // Step 1: Google Maps URL extraction — do this BEFORE normalization
  const googleMapsExtracted = extractFromGoogleMapsUrl(location);
  const rawLocation = googleMapsExtracted ?? location;

  // Step 2: Normalize the raw location string before any cache lookup or geocoding.
  // This ensures HTML tags, ICS-escaped commas, and extra whitespace don't
  // cause spurious cache misses or Nominatim failures.
  const normalized = normalizeLocation(rawLocation);

  if (normalized === '') {
    return { coords: null, geocodeSource: 'none', cache };
  }

  const cached = lookupGeoCache(cache, normalized);
  if (cached !== null) {
    return { coords: cached, geocodeSource: 'cached', cache };
  }

  const key = normalizeLocationKey(normalized);
  // Already known unresolvable — no network call needed
  const entry = cache.entries[key];
  if (entry?.unresolvable) {
    return { coords: null, geocodeSource: 'none', cache };
  }

  // Try geocoding the normalized string first.
  // If it looks like "Venue: 1234 Street..." also try the address-only part.
  const addressOnly = extractAddressFromVenuePrefix(normalized);
  const candidates = addressOnly ? [normalized, addressOnly] : [normalized];

  let coords: GeoCoords | null = null;
  for (const candidate of candidates) {
    coords = await geocodeLocation(candidate);
    if (coords !== null) break;
  }

  // Step 3: Neighborhood centroid lookup (if Nominatim failed)
  if (coords === null) {
    coords = lookupNeighborhoodCentroid(normalized);
  }

  // Step 4: SPL branch lookup (if Nominatim and neighborhood failed)
  if (coords === null) {
    coords = lookupSPLBranchCoords(normalized);
  }

  // Step 5: Suite/floor stripping retry (if still no coords)
  if (coords === null) {
    const stripped = stripSuiteFloorSuffixes(normalized);
    if (stripped !== null) {
      // Also try extracting address from venue prefix of stripped string
      const strippedAddressOnly = extractAddressFromVenuePrefix(stripped);
      const strippedCandidates = strippedAddressOnly ? [stripped, strippedAddressOnly] : [stripped];
      for (const candidate of strippedCandidates) {
        coords = await geocodeLocation(candidate);
        if (coords !== null) break;
      }
    }
  }

  if (coords !== null) {
    const newEntry: GeoCacheEntry = {
      lat: coords.lat,
      lng: coords.lng,
      geocodedAt: new Date().toISOString().slice(0, 10),
      source: 'nominatim',
    };
    const updatedCache: GeoCache = {
      ...cache,
      entries: { ...cache.entries, [key]: newEntry },
    };
    return { coords, geocodeSource: 'ripper', cache: updatedCache };
  } else {
    const newEntry: GeoCacheEntry = {
      unresolvable: true,
      geocodedAt: new Date().toISOString().slice(0, 10),
      source: 'nominatim',
    };
    const updatedCache: GeoCache = {
      ...cache,
      entries: { ...cache.entries, [key]: newEntry },
    };
    const error: GeocodeError = {
      type: 'GeocodeError',
      location,
      source: sourceName,
      reason: 'Nominatim returned no results',
    };
    return { coords: null, geocodeSource: 'none', error, cache: updatedCache };
  }
}

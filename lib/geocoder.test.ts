import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeLocation,
  normalizeLocationKey,
  extractAddressFromVenuePrefix,
  lookupGeoCache,
  resolveEventCoords,
  type GeoCache,
} from './geocoder.js';

// We mock global fetch so geocodeLocation never makes real network calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('normalizeLocation', () => {
  it('unescapes ICS-escaped commas', () => {
    expect(normalizeLocation('2061 15th Ave. W.\\, Seattle\\, WA 98119')).toBe('2061 15th Ave. W., Seattle, WA 98119');
  });

  it('strips HTML tags', () => {
    expect(normalizeLocation('600 4th Ave.<br>Seattle, WA')).toBe('600 4th Ave.');
  });

  it('strips HTML tags and takes only first line (br-separated)', () => {
    expect(normalizeLocation('Council Chambers<br>600 4th Ave.\\, Floor 2<br>Seattle\\, WA 98104')).toBe('Council Chambers');
  });

  it('handles self-closing br tags', () => {
    expect(normalizeLocation('Line 1<br/>Line 2<br />Line 3')).toBe('Line 1');
  });

  it('strips other HTML tags like <b> and <p>', () => {
    expect(normalizeLocation('<b>Capitol Hill</b>, Seattle WA')).toBe('Capitol Hill, Seattle WA');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeLocation('  600   4th   Ave.  ')).toBe('600 4th Ave.');
  });

  it('trims outer whitespace', () => {
    expect(normalizeLocation('   123 Main St   ')).toBe('123 Main St');
  });

  it('handles newline-separated lines (takes first)', () => {
    expect(normalizeLocation('123 Main St\nSeattle, WA 98101')).toBe('123 Main St');
  });

  it('passes through simple addresses unchanged', () => {
    expect(normalizeLocation('1515 12th Ave, Seattle WA 98122')).toBe('1515 12th Ave, Seattle WA 98122');
  });

  it('handles combined HTML and ICS escapes', () => {
    expect(normalizeLocation('NWFF: 1515 12th Ave\\, Seattle WA 98122')).toBe('NWFF: 1515 12th Ave, Seattle WA 98122');
  });
});

describe('normalizeLocationKey', () => {
  it('trims leading/trailing whitespace', () => {
    expect(normalizeLocationKey('  Seattle  ')).toBe('seattle');
  });

  it('lowercases the string', () => {
    expect(normalizeLocationKey('Capitol Hill, Seattle')).toBe('capitol hill, seattle');
  });

  it('handles already-normalized strings', () => {
    expect(normalizeLocationKey('2505 1st ave')).toBe('2505 1st ave');
  });

  it('trims and lowercases together', () => {
    expect(normalizeLocationKey('  The CROCODILE  ')).toBe('the crocodile');
  });

  it('normalizes ICS-escaped commas before keying', () => {
    const raw = 'NWFF: 1515 12th Ave\\, Seattle WA 98122';
    const clean = 'nwff: 1515 12th ave, seattle wa 98122';
    expect(normalizeLocationKey(raw)).toBe(clean);
  });

  it('produces same key for escaped and unescaped variants', () => {
    const escaped = 'NWFF: 1515 12th Ave\\, Seattle WA 98122';
    const unescaped = 'nwff: 1515 12th ave, seattle wa 98122';
    expect(normalizeLocationKey(escaped)).toBe(normalizeLocationKey(unescaped));
  });
});

describe('extractAddressFromVenuePrefix', () => {
  it('extracts address after colon-space prefix', () => {
    expect(extractAddressFromVenuePrefix('NWFF: 1515 12th Ave, Seattle WA 98122')).toBe('1515 12th Ave, Seattle WA 98122');
  });

  it('extracts address after venue-comma prefix', () => {
    expect(extractAddressFromVenuePrefix('Central Cinema, 1411 21st Ave., Seattle, WA 98122')).toBe('1411 21st Ave., Seattle, WA 98122');
  });

  it('returns null when no venue prefix detected', () => {
    expect(extractAddressFromVenuePrefix('1515 12th Ave, Seattle WA 98122')).toBeNull();
  });

  it('returns null for plain venue name', () => {
    expect(extractAddressFromVenuePrefix('The Crocodile')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractAddressFromVenuePrefix('')).toBeNull();
  });
});

describe('lookupGeoCache', () => {
  const cache: GeoCache = {
    version: 1,
    entries: {
      'pike place market, seattle': {
        lat: 47.6091,
        lng: -122.3416,
        geocodedAt: '2026-01-01',
        source: 'nominatim',
      },
      'some vague rooftop': {
        unresolvable: true,
        geocodedAt: '2026-01-01',
        source: 'nominatim',
      },
    },
  };

  it('returns coords on cache hit', () => {
    const result = lookupGeoCache(cache, 'Pike Place Market, Seattle');
    expect(result).toEqual({ lat: 47.6091, lng: -122.3416 });
  });

  it('returns null on cache miss', () => {
    const result = lookupGeoCache(cache, 'Unknown Place, Seattle');
    expect(result).toBeNull();
  });

  it('returns null for unresolvable entries', () => {
    const result = lookupGeoCache(cache, 'some vague rooftop');
    expect(result).toBeNull();
  });

  it('normalizes the key for lookup (case insensitive)', () => {
    const result = lookupGeoCache(cache, 'PIKE PLACE MARKET, SEATTLE');
    expect(result).toEqual({ lat: 47.6091, lng: -122.3416 });
  });
});

describe('resolveEventCoords', () => {
  let cache: GeoCache;

  beforeEach(() => {
    cache = {
      version: 1,
      entries: {
        'the crocodile, 2505 1st ave': {
          lat: 47.6146,
          lng: -122.3474,
          geocodedAt: '2026-01-01',
          source: 'nominatim',
        },
        'totally unresolvable place': {
          unresolvable: true,
          geocodedAt: '2026-01-01',
          source: 'nominatim',
        },
      },
    };
    mockFetch.mockReset();
  });

  it('returns none for undefined location', async () => {
    const result = await resolveEventCoords(cache, undefined, 'test-source');
    expect(result.coords).toBeNull();
    expect(result.geocodeSource).toBe('none');
    expect(result.cache).toBe(cache); // same reference — no change
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns none for empty location', async () => {
    const result = await resolveEventCoords(cache, '   ', 'test-source');
    expect(result.coords).toBeNull();
    expect(result.geocodeSource).toBe('none');
    expect(result.cache).toBe(cache); // same reference — no change
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns cached coords without network call on hit', async () => {
    const result = await resolveEventCoords(cache, 'The Crocodile, 2505 1st Ave', 'test-source');
    expect(result.coords).toEqual({ lat: 47.6146, lng: -122.3474 });
    expect(result.geocodeSource).toBe('cached');
    expect(result.cache).toBe(cache); // same reference — cache hit, no mutation
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns none without network call for unresolvable cache entry', async () => {
    const result = await resolveEventCoords(cache, 'totally unresolvable place', 'test-source');
    expect(result.coords).toBeNull();
    expect(result.geocodeSource).toBe('none');
    expect(result.cache).toBe(cache); // same reference — no change
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls geocodeLocation on cache miss and returns updated cache', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '47.6200', lon: '-122.3500' }],
    });

    const result = await resolveEventCoords(cache, 'New Venue, Seattle', 'test-source');
    expect(result.coords).toEqual({ lat: 47.6200, lng: -122.3500 });
    expect(result.geocodeSource).toBe('ripper'); // fresh Nominatim result, not a cache hit
    expect(result.error).toBeUndefined();

    // Returns a new cache object (not the same reference)
    expect(result.cache).not.toBe(cache);

    // Original cache is unmodified
    expect(cache.entries['new venue, seattle']).toBeUndefined();

    // New cache contains the entry
    const key = 'new venue, seattle';
    expect(result.cache.entries[key]).toBeDefined();
    expect(result.cache.entries[key].lat).toBe(47.6200);
    expect(result.cache.entries[key].source).toBe('nominatim');
  });

  it('normalizes ICS-escaped commas before cache lookup', async () => {
    // Cache has the clean address
    const cacheWithClean: GeoCache = {
      version: 1,
      entries: {
        '2061 15th ave. w., seattle, wa 98119': {
          lat: 47.6300,
          lng: -122.3600,
          geocodedAt: '2026-01-01',
          source: 'nominatim',
        },
      },
    };

    const result = await resolveEventCoords(
      cacheWithClean,
      '2061 15th Ave. W.\\, Seattle\\, WA 98119',
      'test-source',
    );
    expect(result.coords).toEqual({ lat: 47.6300, lng: -122.3600 });
    expect(result.geocodeSource).toBe('cached');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('normalizes HTML tags before geocoding and cache lookup', async () => {
    // Location with HTML — normalized to first line only: "Council Chambers"
    // Cache miss → Nominatim call
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '47.6050', lon: '-122.3295' }],
    });

    const result = await resolveEventCoords(
      cache,
      'Council Chambers<br>600 4th Ave.\\, Floor 2<br>Seattle\\, WA 98104',
      'test-source',
    );
    expect(result.coords).toEqual({ lat: 47.6050, lng: -122.3295 });
    expect(result.geocodeSource).toBe('ripper');
    // The cache key should be the normalized version
    expect(result.cache.entries['council chambers']).toBeDefined();
  });

  it('falls back to address-only when venue prefix present', async () => {
    // First geocode call (full string) returns null, second (address-only) succeeds
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ lat: '47.6150', lon: '-122.3200' }] });

    const result = await resolveEventCoords(
      cache,
      'NWFF: 1515 12th Ave\\, Seattle WA 98122',
      'test-source',
    );
    expect(result.coords).toEqual({ lat: 47.6150, lng: -122.3200 });
    expect(result.geocodeSource).toBe('ripper');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('marks as unresolvable and returns error when geocodeLocation fails', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const result = await resolveEventCoords(cache, 'Nowhere Land', 'my-source');
    expect(result.coords).toBeNull();
    expect(result.geocodeSource).toBe('none');
    expect(result.error).toBeDefined();
    expect(result.error?.type).toBe('GeocodeError');
    expect(result.error?.location).toBe('Nowhere Land');
    expect(result.error?.source).toBe('my-source');

    // Returns a new cache object with the unresolvable entry
    expect(result.cache).not.toBe(cache);
    expect(result.cache.entries['nowhere land'].unresolvable).toBe(true);

    // Original cache is unmodified
    expect(cache.entries['nowhere land']).toBeUndefined();
  });
});

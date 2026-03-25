import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeLocationKey,
  lookupGeoCache,
  resolveEventCoords,
  type GeoCache,
} from './geocoder.js';

// We mock global fetch so geocodeLocation never makes real network calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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
    expect(result).toEqual({ coords: null, geocodeSource: 'none' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns none for empty location', async () => {
    const result = await resolveEventCoords(cache, '   ', 'test-source');
    expect(result).toEqual({ coords: null, geocodeSource: 'none' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns cached coords without network call on hit', async () => {
    const result = await resolveEventCoords(cache, 'The Crocodile, 2505 1st Ave', 'test-source');
    expect(result).toEqual({ coords: { lat: 47.6146, lng: -122.3474 }, geocodeSource: 'cached' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns none without network call for unresolvable cache entry', async () => {
    const result = await resolveEventCoords(cache, 'totally unresolvable place', 'test-source');
    expect(result).toEqual({ coords: null, geocodeSource: 'none' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls geocodeLocation on cache miss and caches result', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '47.6200', lon: '-122.3500' }],
    });

    const result = await resolveEventCoords(cache, 'New Venue, Seattle', 'test-source');
    expect(result.coords).toEqual({ lat: 47.6200, lng: -122.3500 });
    expect(result.geocodeSource).toBe('cached');
    expect(result.error).toBeUndefined();

    // Should have been cached
    const key = 'new venue, seattle';
    expect(cache.entries[key]).toBeDefined();
    expect(cache.entries[key].lat).toBe(47.6200);
    expect(cache.entries[key].source).toBe('nominatim');
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

    // Should be marked unresolvable
    expect(cache.entries['nowhere land'].unresolvable).toBe(true);
  });
});

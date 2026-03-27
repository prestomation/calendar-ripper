import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeLocation,
  normalizeLocationKey,
  extractAddressFromVenuePrefix,
  extractFromGoogleMapsUrl,
  stripSuiteFloorSuffixes,
  lookupNeighborhoodCentroid,
  lookupSPLBranchCoords,
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

describe('extractFromGoogleMapsUrl', () => {
  it('extracts query from a Google Maps search URL', () => {
    const url = 'https://www.google.com/maps/search/?api=1&query=Seattle%20City%20Hall%2C%20600%204th%20Ave%2C%20Seattle%2C%20WA%2098104';
    expect(extractFromGoogleMapsUrl(url)).toBe('Seattle City Hall, 600 4th Ave, Seattle, WA 98104');
  });

  it('extracts query when query param comes first', () => {
    const url = 'https://www.google.com/maps/search/?query=1000+Aloha+St+Seattle+WA&api=1';
    expect(extractFromGoogleMapsUrl(url)).toBe('1000 Aloha St Seattle WA');
  });

  it('returns null for a plain address (not a URL)', () => {
    expect(extractFromGoogleMapsUrl('600 4th Ave, Seattle, WA 98104')).toBeNull();
  });

  it('returns null for a non-maps Google URL', () => {
    expect(extractFromGoogleMapsUrl('https://www.google.com/search?q=seattle')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractFromGoogleMapsUrl('')).toBeNull();
  });

  it('handles URL without query parameter', () => {
    expect(extractFromGoogleMapsUrl('https://www.google.com/maps/search/?api=1')).toBeNull();
  });

  it('handles http (non-https) Maps URLs', () => {
    const url = 'http://www.google.com/maps/search/?api=1&query=Fremont+Brewing%2C+Seattle';
    expect(extractFromGoogleMapsUrl(url)).toBe('Fremont Brewing, Seattle');
  });
});

describe('stripSuiteFloorSuffixes', () => {
  it('strips Suite NNN', () => {
    const result = stripSuiteFloorSuffixes('123 Main St, Suite 200, Seattle, WA');
    expect(result).toBe('123 Main St, Seattle, WA');
  });

  it('strips Ste NNN', () => {
    const result = stripSuiteFloorSuffixes('500 Yale Ave N, Ste 300, Seattle, WA');
    expect(result).toBe('500 Yale Ave N, Seattle, WA');
  });

  it('strips #NNN', () => {
    const result = stripSuiteFloorSuffixes('1234 5th Ave #100, Seattle, WA');
    expect(result).toBe('1234 5th Ave, Seattle, WA');
  });

  it('strips Floor N', () => {
    const result = stripSuiteFloorSuffixes('600 4th Ave, Floor 2, Seattle, WA');
    expect(result).toBe('600 4th Ave, Seattle, WA');
  });

  it('strips Room NNN', () => {
    const result = stripSuiteFloorSuffixes('100 Raitt Hall, Room 121, University of Washington');
    expect(result).toBe('100 Raitt Hall, University of Washington');
  });

  it('strips Level N', () => {
    const result = stripSuiteFloorSuffixes('2100 24th Ave E, Level 3, Seattle, WA');
    expect(result).toBe('2100 24th Ave E, Seattle, WA');
  });

  it('strips trailing ", United States"', () => {
    const result = stripSuiteFloorSuffixes('600 4th Ave, Seattle, WA 98104, United States');
    expect(result).toBe('600 4th Ave, Seattle, WA 98104');
  });

  it('strips trailing ", USA"', () => {
    const result = stripSuiteFloorSuffixes('600 4th Ave, Seattle, WA 98104, USA');
    expect(result).toBe('600 4th Ave, Seattle, WA 98104');
  });

  it('collapses double commas', () => {
    const result = stripSuiteFloorSuffixes('123 Main St,, Seattle, WA');
    expect(result).toBe('123 Main St, Seattle, WA');
  });

  it('returns null when nothing to strip', () => {
    const result = stripSuiteFloorSuffixes('123 Main St, Seattle, WA');
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(stripSuiteFloorSuffixes('')).toBeNull();
  });
});

describe('lookupNeighborhoodCentroid', () => {
  it('matches "<neighborhood>, seattle"', () => {
    const result = lookupNeighborhoodCentroid('Capitol Hill, Seattle');
    expect(result).toEqual({ lat: 47.6253, lng: -122.3222 });
  });

  it('matches "<neighborhood> neighborhood, seattle"', () => {
    const result = lookupNeighborhoodCentroid('Fremont neighborhood, Seattle');
    expect(result).toEqual({ lat: 47.6512, lng: -122.3501 });
  });

  it('matches case-insensitively', () => {
    const result = lookupNeighborhoodCentroid('BALLARD, SEATTLE');
    expect(result).toEqual({ lat: 47.6677, lng: -122.3829 });
  });

  it('matches with ", WA" suffix', () => {
    const result = lookupNeighborhoodCentroid('Beacon Hill, Seattle, WA');
    expect(result).toEqual({ lat: 47.5674, lng: -122.3076 });
  });

  it('matches bare neighborhood name', () => {
    const result = lookupNeighborhoodCentroid('South Lake Union');
    expect(result).toEqual({ lat: 47.6275, lng: -122.3362 });
  });

  it('returns null for non-neighborhood string', () => {
    expect(lookupNeighborhoodCentroid('1234 Main St, Seattle')).toBeNull();
  });

  it('returns null for unknown neighborhood', () => {
    expect(lookupNeighborhoodCentroid('Montlake, Seattle')).toBeNull();
  });

  it('returns correct coords for West Seattle', () => {
    const result = lookupNeighborhoodCentroid('West Seattle, Seattle');
    expect(result).toEqual({ lat: 47.5629, lng: -122.3862 });
  });
});

describe('lookupSPLBranchCoords', () => {
  it('matches "ballard branch" substring', () => {
    const result = lookupSPLBranchCoords('Seattle Public Library - Ballard Branch');
    expect(result).toEqual({ lat: 47.6671, lng: -122.3836 });
  });

  it('matches "central library" substring', () => {
    const result = lookupSPLBranchCoords('Seattle Public Library Central Library');
    expect(result).toEqual({ lat: 47.6064, lng: -122.3328 });
  });

  it('matches "capitol hill branch"', () => {
    const result = lookupSPLBranchCoords('SPL Capitol Hill Branch, 425 Harvard Ave E');
    expect(result).toEqual({ lat: 47.6234, lng: -122.3196 });
  });

  it('matches case-insensitively', () => {
    const result = lookupSPLBranchCoords('SEATTLE PUBLIC LIBRARY - FREMONT BRANCH');
    expect(result).toEqual({ lat: 47.6519, lng: -122.3502 });
  });

  it('returns null for non-SPL string', () => {
    expect(lookupSPLBranchCoords('123 Main St, Seattle')).toBeNull();
  });

  it('returns null for SPL with no recognized branch', () => {
    expect(lookupSPLBranchCoords('Seattle Public Library')).toBeNull();
  });

  it('matches douglass-truth branch', () => {
    const result = lookupSPLBranchCoords('Seattle Public Library - Douglass-Truth Branch');
    expect(result).toEqual({ lat: 47.6097, lng: -122.3000 });
  });
});

describe('resolveEventCoords - new strategies', () => {
  let cache: GeoCache;

  beforeEach(() => {
    cache = { version: 1, entries: {} };
    mockFetch.mockReset();
  });

  it('extracts address from Google Maps URL before geocoding', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '47.6050', lon: '-122.3295' }],
    });

    const url = 'https://www.google.com/maps/search/?api=1&query=600%204th%20Ave%2C%20Seattle%2C%20WA%2098104';
    const result = await resolveEventCoords(cache, url, 'test-source');
    expect(result.coords).toEqual({ lat: 47.6050, lng: -122.3295 });
    expect(result.geocodeSource).toBe('ripper');
    // The cache key should be the decoded address
    expect(result.cache.entries['600 4th ave, seattle, wa 98104']).toBeDefined();
  });

  it('returns neighborhood centroid when Nominatim fails', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const result = await resolveEventCoords(cache, 'Capitol Hill, Seattle', 'test-source');
    expect(result.coords).toEqual({ lat: 47.6253, lng: -122.3222 });
    expect(result.geocodeSource).toBe('ripper');
    expect(result.error).toBeUndefined();
    expect(result.cache.entries['capitol hill, seattle']).toBeDefined();
    expect(result.cache.entries['capitol hill, seattle'].unresolvable).toBeUndefined();
  });

  it('returns SPL branch coords when Nominatim fails', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const result = await resolveEventCoords(cache, 'Seattle Public Library - Ballard Branch', 'test-source');
    expect(result.coords).toEqual({ lat: 47.6671, lng: -122.3836 });
    expect(result.geocodeSource).toBe('ripper');
    expect(result.error).toBeUndefined();
  });

  it('retries with stripped suite suffix when Nominatim fails', async () => {
    // First call (full string) → empty, second call (stripped) → success
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ lat: '47.6100', lon: '-122.3400' }] });

    const result = await resolveEventCoords(cache, '500 Yale Ave N, Suite 300, Seattle, WA', 'test-source');
    expect(result.coords).toEqual({ lat: 47.6100, lng: -122.3400 });
    expect(result.geocodeSource).toBe('ripper');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('uses cached result for Google Maps URL after first resolution', async () => {
    // Pre-populate cache with the decoded address
    const primed: GeoCache = {
      version: 1,
      entries: {
        '600 4th ave, seattle, wa 98104': {
          lat: 47.6050,
          lng: -122.3295,
          geocodedAt: '2026-01-01',
          source: 'nominatim',
        },
      },
    };

    const url = 'https://www.google.com/maps/search/?api=1&query=600%204th%20Ave%2C%20Seattle%2C%20WA%2098104';
    const result = await resolveEventCoords(primed, url, 'test-source');
    expect(result.coords).toEqual({ lat: 47.6050, lng: -122.3295 });
    expect(result.geocodeSource).toBe('cached');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

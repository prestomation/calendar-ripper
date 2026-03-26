# Geocache Re-architecture Options

## Current State Analysis

### What Exists Today

The geocoder module (`lib/geocoder.ts`) has grown complex machinery to handle concurrency that doesn't actually exist:

1. **`inFlight` Map** — Deduplicates concurrent calls to `geocodeLocation()` for the same key
2. **`resolveInFlight` Map** — Deduplicates concurrent calls to `resolveEventCoords()` for the same key  
3. **`nominatimQueueTail` Promise chain** — Serializes Nominatim HTTP calls for rate limiting
4. **`cacheWriteQueueTail` Promise chain** — Serializes cache file writes

### The Core Problem

**The calling code is 100% sequential.** In `calendar_ripper.ts`, every call to `resolveEventCoords` is `await`ed in a for loop:

```typescript
for (const event of calendar.events) {
  const result = await resolveEventCoords(geoCache, event.location, sourceName, ...);
  // ...
}
```

There is never more than one geocode operation in flight. The in-flight deduplication and queue machinery is **dead code** that adds complexity without providing value.

### Why Amazon Q Keeps Flagging It

The pattern `cache.entries[key] = { ... }` inside an async function that's tracked in a `Map<string, Promise<...>>` looks like a classic race condition to static analysis:

- Shared mutable state (`cache.entries`)
- Modification inside async functions
- Complex promise-tracking machinery suggesting concurrency was expected

Even though the caller is sequential, the code *structure* implies concurrent access patterns. Q is right to be suspicious — the code has the smell of a race condition even if it can't trigger today.

---

## Option 1: Pure Function Design (Cache In, Cache Out)

### One-liner
Make geocoding a pure function that returns a new cache alongside the result — no mutation.

### How It Works

Instead of mutating `cache.entries[key] = ...` in place, the geocoder returns a tuple of `[result, updatedCache]`. The caller is responsible for adopting the new cache (or not).

This makes the flow of cache state explicit and visible in the type system. There's no hidden mutation — if you want the cache updated, you explicitly receive and use the new version.

### Code Sketch

```typescript
// New types
export interface GeocodeResult {
  coords: GeoCoords | null;
  geocodeSource: 'ripper' | 'cached' | 'none';
  error?: GeocodeError;
}

export interface ResolveOutput {
  result: GeocodeResult;
  cache: GeoCache;  // Potentially updated cache
}

// Pure function — no mutation
export async function resolveEventCoords(
  cache: Readonly<GeoCache>,
  location: string | undefined,
  sourceName: string
): Promise<ResolveOutput> {
  if (!location || location.trim() === '') {
    return { 
      result: { coords: null, geocodeSource: 'none' }, 
      cache  // Unchanged
    };
  }

  const key = normalizeLocationKey(location);
  const entry = cache.entries[key];
  
  // Cache hit
  if (entry?.lat !== undefined && entry?.lng !== undefined) {
    return {
      result: { coords: { lat: entry.lat, lng: entry.lng }, geocodeSource: 'cached' },
      cache  // Unchanged
    };
  }
  
  // Already marked unresolvable
  if (entry?.unresolvable) {
    return {
      result: { coords: null, geocodeSource: 'none' },
      cache  // Unchanged
    };
  }

  // Cache miss — call Nominatim
  const coords = await fetchFromNominatim(location);
  
  // Build new cache with updated entry
  const newEntry: GeoCacheEntry = coords
    ? { lat: coords.lat, lng: coords.lng, geocodedAt: today(), source: 'nominatim' }
    : { unresolvable: true, geocodedAt: today(), source: 'nominatim' };

  const updatedCache: GeoCache = {
    ...cache,
    entries: { ...cache.entries, [key]: newEntry }
  };

  const error = coords ? undefined : {
    type: 'GeocodeError' as const,
    location,
    source: sourceName,
    reason: 'Nominatim returned no results',
  };

  return {
    result: { 
      coords, 
      geocodeSource: coords ? 'cached' : 'none',
      error 
    },
    cache: updatedCache
  };
}
```

**Caller changes:**

```typescript
let geoCache = await loadGeoCache('geo-cache.json');

for (const event of calendar.events) {
  const { result, cache: updatedCache } = await resolveEventCoords(
    geoCache, 
    event.location, 
    sourceName
  );
  geoCache = updatedCache;  // Explicit state threading
  // ... use result
}

await saveGeoCache(geoCache, 'geo-cache.json');
```

### Pros
- **Bulletproof correctness** — No mutation means no race conditions, ever
- **Explicit data flow** — The type signature tells you exactly what happens
- **Easy to test** — Pure functions are trivial to unit test
- **Static analysis friendly** — Q can verify there's no shared mutable state

### Cons
- **More boilerplate at call site** — Caller must thread `geoCache = updatedCache` through the loop
- **Slight API churn** — Tests and callers need updates
- **Object churn** — Creates new cache objects on every miss (negligible in practice)

### Verdict: **RECOMMENDED**

This is the cleanest option. It makes the sequential reality explicit, eliminates all mutation concerns, and produces code that's obviously correct. The caller boilerplate (`geoCache = updatedCache`) is minimal and actually *clarifying* — it shows where state flows.

---

## Option 2: Explicit Sequential Wrapper

### One-liner
Remove all concurrency machinery and add a runtime assertion that calls are sequential.

### How It Works

Strip out the `inFlight` maps, the `resolveInFlight` map, and the promise queues. Keep the mutation-based API but add a guard that detects overlapping calls and throws:

```typescript
let isResolving = false;

export async function resolveEventCoords(...): Promise<ResolveResult> {
  if (isResolving) {
    throw new Error('resolveEventCoords called concurrently — this is a bug');
  }
  isResolving = true;
  try {
    // ... existing logic, but simpler (no dedup maps)
  } finally {
    isResolving = false;
  }
}
```

### Code Sketch

```typescript
// Module-level guard
let isResolving = false;

// Rate limiting — simplified, no queue needed for sequential calls
let lastNominatimCallTime = 0;

async function fetchFromNominatim(location: string): Promise<GeoCoords | null> {
  // Simple rate limit — no queue, just delay if needed
  const now = Date.now();
  const elapsed = now - lastNominatimCallTime;
  if (lastNominatimCallTime > 0 && elapsed < 1000) {
    await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
  }
  lastNominatimCallTime = Date.now();

  // ... fetch logic unchanged
}

export async function resolveEventCoords(
  cache: GeoCache,
  location: string | undefined,
  sourceName: string,
  onCacheUpdated?: () => Promise<void>
): Promise<ResolveResult> {
  // Sequential enforcement
  if (isResolving) {
    throw new Error(
      'resolveEventCoords called concurrently. ' +
      'The geocoder requires sequential calls (await each call before the next).'
    );
  }
  isResolving = true;

  try {
    if (!location || location.trim() === '') {
      return { coords: null, geocodeSource: 'none' };
    }

    const key = normalizeLocationKey(location);
    const entry = cache.entries[key];

    // Cache hit
    if (entry?.lat !== undefined && entry?.lng !== undefined) {
      return { coords: { lat: entry.lat, lng: entry.lng }, geocodeSource: 'cached' };
    }

    // Already unresolvable
    if (entry?.unresolvable) {
      return { coords: null, geocodeSource: 'none' };
    }

    // Cache miss
    const coords = await fetchFromNominatim(location);

    // Mutate cache — safe because we're the only one running
    cache.entries[key] = coords
      ? { lat: coords.lat, lng: coords.lng, geocodedAt: today(), source: 'nominatim' }
      : { unresolvable: true, geocodedAt: today(), source: 'nominatim' };

    if (onCacheUpdated) await onCacheUpdated();

    return coords
      ? { coords, geocodeSource: 'cached' }
      : { coords: null, geocodeSource: 'none', error: { ... } };
  } finally {
    isResolving = false;
  }
}
```

### Pros
- **Minimal API change** — Callers don't change at all
- **Removes dead code** — All the Map/queue machinery goes away
- **Fail-fast on misuse** — If someone adds concurrency later, it throws immediately
- **~60% less code** — Much simpler module

### Cons
- **Still has mutation** — The cache object is still mutated in place, just with a guard
- **Runtime check, not compile-time** — Q may still flag the pattern
- **Doesn't scale** — If we ever *want* concurrency, this is a dead end

### Verdict: **Acceptable but not ideal**

This is the pragmatic "just make it simple" option. It removes complexity without changing the API. But it doesn't address the fundamental issue Q is flagging (mutation of shared state). Static analysis tools may still complain.

---

## Option 3: Encapsulated Cache Class

### One-liner
Wrap the cache in a class that owns all mutation and enforces single-writer semantics.

### How It Works

Instead of passing a plain `GeoCache` object around, create a `GeoCacheManager` class that:
- Loads/saves the cache file
- Exposes read-only lookup
- Owns all writes internally
- Can enforce sequential access if needed

```typescript
class GeoCacheManager {
  private cache: GeoCache;
  private filePath: string;
  private dirty = false;

  static async load(filePath: string): Promise<GeoCacheManager> { ... }
  
  lookup(location: string): GeoCoords | null { ... }
  
  async resolve(location: string, sourceName: string): Promise<ResolveResult> { ... }
  
  async save(): Promise<void> { ... }
}
```

### Code Sketch

```typescript
export class GeoCacheManager {
  private cache: GeoCache;
  private filePath: string;
  private dirty = false;
  private lastNominatimCall = 0;

  private constructor(cache: GeoCache, filePath: string) {
    this.cache = cache;
    this.filePath = filePath;
  }

  static async load(filePath: string): Promise<GeoCacheManager> {
    try {
      const raw = await readFile(filePath, 'utf-8');
      return new GeoCacheManager(JSON.parse(raw), filePath);
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        return new GeoCacheManager({ version: 1, entries: {} }, filePath);
      }
      throw err;
    }
  }

  lookup(location: string): GeoCoords | null {
    const key = normalizeLocationKey(location);
    const entry = this.cache.entries[key];
    if (!entry || entry.unresolvable) return null;
    if (entry.lat !== undefined && entry.lng !== undefined) {
      return { lat: entry.lat, lng: entry.lng };
    }
    return null;
  }

  async resolve(location: string, sourceName: string): Promise<ResolveResult> {
    if (!location?.trim()) {
      return { coords: null, geocodeSource: 'none' };
    }

    const cached = this.lookup(location);
    if (cached) {
      return { coords: cached, geocodeSource: 'cached' };
    }

    const key = normalizeLocationKey(location);
    if (this.cache.entries[key]?.unresolvable) {
      return { coords: null, geocodeSource: 'none' };
    }

    // Rate limit
    const now = Date.now();
    const elapsed = now - this.lastNominatimCall;
    if (this.lastNominatimCall > 0 && elapsed < 1000) {
      await new Promise(r => setTimeout(r, 1000 - elapsed));
    }
    this.lastNominatimCall = Date.now();

    const coords = await this.fetchNominatim(location);

    // Internal mutation — encapsulated, not exposed
    this.cache.entries[key] = coords
      ? { lat: coords.lat, lng: coords.lng, geocodedAt: today(), source: 'nominatim' }
      : { unresolvable: true, geocodedAt: today(), source: 'nominatim' };
    this.dirty = true;

    return coords
      ? { coords, geocodeSource: 'cached' }
      : { coords: null, geocodeSource: 'none', error: { ... } };
  }

  async save(): Promise<void> {
    if (this.dirty) {
      await writeFile(this.filePath, JSON.stringify(this.cache, null, 2));
      this.dirty = false;
    }
  }

  private async fetchNominatim(location: string): Promise<GeoCoords | null> {
    // ... fetch logic
  }
}
```

**Caller changes:**

```typescript
const geocacher = await GeoCacheManager.load('geo-cache.json');

for (const event of calendar.events) {
  const result = await geocacher.resolve(event.location, sourceName);
  // ... use result
}

await geocacher.save();
```

### Pros
- **Encapsulation** — All cache mutation is internal to the class
- **Clean caller API** — No passing cache objects around
- **Dirty tracking** — Only saves when something changed
- **Rate limiting co-located** — All Nominatim concerns in one place

### Cons
- **More OOP-ish** — This codebase is mostly functional style
- **Stateful object** — Still has internal mutation, just hidden
- **Harder to test** — Need to mock/stub the class, can't just pass in a cache object
- **Q might still flag it** — Static analysis can see the internal mutation

### Verdict: **Not recommended**

This trades one form of complexity for another. The class hides mutation but doesn't eliminate it. Testing becomes harder (need mocking). The functional style of Option 1 fits this codebase better.

---

## Recommendation: Option 1 (Pure Function Design)

### Why This Wins

1. **Correctness is obvious** — The type signature `Promise<{ result, cache }>` makes it impossible to accidentally mutate shared state. There's nothing to analyze — no mutation exists.

2. **Amazon Q will be satisfied** — A pure function with `Readonly<GeoCache>` input cannot have race conditions. Static analysis tools can verify this trivially.

3. **Tests get simpler** — Pure functions are the easiest thing to test. You can verify cache updates by comparing input and output objects.

4. **Minimal caller changes** — The change from:
   ```typescript
   const result = await resolveEventCoords(geoCache, location, source, saveCallback);
   ```
   to:
   ```typescript
   const { result, cache: geoCache } = await resolveEventCoords(geoCache, location, source);
   ```
   is mechanical and actually more readable.

5. **Removes dead code** — All the `inFlight` maps, `resolveInFlight` maps, and promise queues go away. The module shrinks by ~50%.

### Implementation Notes

When implementing Option 1:

1. **Keep `fetchFromNominatim` simple** — It doesn't need queuing. The caller is sequential, so just do the rate limit inline.

2. **Remove the `onCacheUpdated` callback** — The caller now controls when to save (once at the end, same as today).

3. **Add `Readonly<GeoCache>` to the signature** — TypeScript will flag any accidental mutation attempts.

4. **Update tests** — Change assertions to check both `result` and the returned `cache`.

5. **Batch the caller loop** — The caller already saves once at the end. Just thread `geoCache = updatedCache` through the loop and save once.

### Migration Path

1. Add the new pure `resolveEventCoords` function (maybe named `resolveEventCoordsV2` temporarily)
2. Update callers to use the new function
3. Remove the old function and all the Map/queue machinery
4. Rename back to `resolveEventCoords`
5. Update tests

This can be done in a single PR with clear before/after.

# Design: Geographic Subscribe (Geo-Filtered ICS Feed)

## Status: In Progress
## Date: 2026-03-25

---

## 1. Problem Statement

Users want to subscribe to a single ICS feed that shows events near a geographic location — a neighborhood, home address, or arbitrary point on a map — rather than subscribing calendar-by-calendar. The current system only supports subscribing to individual sources or tag aggregates.

---

## 2. Goals

1. **Geofence subscription** — Users define one or more `(lat, lng, radiusKm)` filters on their account. Their personal ICS feed includes any event whose resolved location falls within any filter (OR semantics).
2. **Full fidelity** — Venue-pinned sources (fixed address) get ripper-level coords. Per-event sources (roaming organizers, discovery aggregators) get event-level coords geocoded from the `LOCATION` string.
3. **Repo-backed geocache** — All geocoding results are persisted in `geo-cache.json` (checked into the repo). CI runs are cache-hits by default; Nominatim is only called for new location strings.
4. **Non-fatal geocode failures** — If a geocode call fails, the event is included in the feed without coords (passes geo filters by default) and a `GeocodeError` is recorded in `build-errors.json`.
5. **Consistent with existing architecture** — Geocoding is part of the standard `generate-calendars` pipeline, not a separate script. The outofband pipeline uses the same code path.

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────┐
│              Build (GitHub Actions / local)      │
│                                                  │
│  sources/*/ripper.yaml ──► RipperLoader          │
│    geo: { lat, lng }?  │                         │
│                        ▼                         │
│               calendar_ripper.main()             │
│                        │                         │
│         ┌──────────────┴───────────────┐         │
│         ▼                              ▼         │
│  ripper has geo?             ripper has no geo?  │
│  → stamp all events          → resolve each      │
│    with ripper coords          event's LOCATION  │
│    (geocodeSource: ripper)     via geo-cache.json│
│                                (geocodeSource:   │
│                                 cached | none)   │
│         └──────────────┬───────────────┘         │
│                        ▼                         │
│              events-index.json                   │
│              { lat?, lng?, geocodeSource? }      │
│                                                  │
│  geo-cache.json read once at start               │
│  updated in-memory throughout build              │
│  written once at end of main()                   │
└──────────────────────────────────────────────────┘
                        │
                        ▼ (served from GitHub Pages)
┌──────────────────────────────────────────────────┐
│           Cloudflare Worker (favorites-worker)   │
│                                                  │
│  GET /feed/<token>.ics                           │
│    1. Load FavoritesRecord (icsUrls,             │
│         searchFilters, geoFilters)               │
│    2. Fetch events-index.json                    │
│    3. Apply geo filter (haversine) to index      │
│       → events with no coords: pass through      │
│       → events within any filter: include        │
│    4. Apply text search filters (existing)       │
│    5. Merge + dedup ICS (existing)               │
│                                                  │
│  CRUD /geo-filters                               │
│    GET / POST / PUT / DELETE                     │
└──────────────────────────────────────────────────┘
```

---

## 4. Data Model Changes

### 4.1 `ripper.yaml` — new optional `geo` block

```yaml
# Venue-pinned source: all events use these coords
geo:
  lat: 47.6146
  lng: -122.3474
  label: "The Crocodile, 2505 1st Ave, Seattle WA"  # optional, for humans
```

When `geo` is present, every event from that source gets `geocodeSource: "ripper"`. No geocoding is attempted.

When `geo` is absent, each event's `LOCATION` string is resolved via `geo-cache.json`.

Schema (`lib/config/schema.ts`):
```ts
export const geoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().optional(),
}).strict();

// Added to configSchema:
geo: geoSchema.optional(),
```

### 4.2 `geo-cache.json` — repo-checked-in geocode cache

Lives at `geo-cache.json` in the repo root. Checked in. Grows over time as new location strings are encountered. Key is the normalized location string (`trim().toLowerCase()`).

```json
{
  "version": 1,
  "entries": {
    "2505 1st ave, seattle, wa 98121": {
      "lat": 47.6146,
      "lng": -122.3474,
      "geocodedAt": "2026-03-25",
      "source": "nominatim"
    },
    "some vague rooftop, seattle": {
      "unresolvable": true,
      "geocodedAt": "2026-03-25"
    }
  }
}
```

`unresolvable: true` entries suppress retries across builds.

### 4.3 `events-index.json` — gains coord fields

```ts
export interface EventsIndexEntry {
  icsUrl: string
  summary: string
  description?: string
  location?: string
  date: string
  endDate?: string
  url?: string
  lat?: number                               // NEW
  lng?: number                               // NEW
  geocodeSource?: 'ripper' | 'cached' | 'none'  // NEW
}
```

### 4.4 `FavoritesRecord` — gains `geoFilters`

```ts
export interface GeoFilter {
  lat: number
  lng: number
  radiusKm: number
  label?: string   // e.g. "Home", "Work", "Capitol Hill"
}

export interface FavoritesRecord {
  icsUrls: string[]
  searchFilters: string[]
  geoFilters: GeoFilter[]    // NEW, default []
  updatedAt: string
}
```

### 4.5 New error type: `GeocodeError`

```ts
export type GeocodeError = ErrorBase & {
  type: "GeocodeError";
  location: string;    // location string that failed
  source: string;      // ripper name (e.g. "seatoday")
  reason: string;      // e.g. "Nominatim returned no results"
};
```

`GeocodeError` is non-fatal: counted in `errorCount.txt`, surfaced in `build-errors.json` under a new top-level `geocodeErrors` array. The affected event passes geo filters by default (`geocodeSource: "none"`).

---

## 5. New Module: `lib/geocoder.ts`

Fully isolated and independently testable. Key exports:

```ts
// Normalize a location string to a cache key
export function normalizeLocationKey(location: string): string

// Load/save the geo-cache file
export async function loadGeoCache(path: string): Promise<GeoCache>
export async function saveGeoCache(cache: GeoCache, path: string): Promise<void>

// Look up coords from in-memory cache (sync, no I/O)
export function lookupGeoCache(cache: GeoCache, location: string): GeoCoords | null

// Call Nominatim for a single location string
// Returns null on failure; caller is responsible for emitting GeocodeError
export async function geocodeLocation(location: string): Promise<GeoCoords | null>

// Primary entry point: resolve coords for one event's location string
// Updates cache in-place on miss
export async function resolveEventCoords(
  cache: GeoCache,
  location: string | undefined,
  sourceName: string
): Promise<{ coords: GeoCoords | null; geocodeSource: 'cached' | 'none'; error?: GeocodeError }>
```

**Nominatim details:**
- Endpoint: `https://nominatim.openstreetmap.org/search?q=<encoded>&format=json&limit=1&countrycodes=us&viewbox=-122.6,47.3,-121.9,47.8&bounded=1`
- Bounding box: Seattle metro (prevents "Seattle St, Kansas City" mismatches)
- Header: `User-Agent: calendar-ripper/1.0 (github.com/prestomation/calendar-ripper)`
- Rate limit: 1 req/sec enforced in code
- On failure (network error, empty result, non-2xx): return `null`, mark as `unresolvable` in cache

---

## 6. Build Pipeline Changes (`lib/calendar_ripper.ts`)

Geocoding is wired into `main()` alongside the existing events-index build. The geocode pass applies to **all** event sources uniformly: internal rippers, external calendars, and outofband sources all flow through the same `resolveEventCoords()` call.

```
start of main()
  → loadGeoCache("geo-cache.json")   // read once, hold in memory

  ... existing ripping, ICS generation, tag aggregation ...

  → build eventsIndex (existing loop)
      for each event:
        if ripper has geo block → use ripper coords (no geocode call)
        else → resolveEventCoords(cache, event.location, sourceName)
                 → cache hit  → coords, geocodeSource: "cached"
                 → cache miss → Nominatim call → update cache in-memory
                              → success: coords, geocodeSource: "cached"
                              → failure: null, geocodeSource: "none", GeocodeError
      push { ...event, lat, lng, geocodeSource } to eventsIndex

  → collect all GeocodeErrors
  → saveGeoCache("geo-cache.json")           // single write, updated cache
  → writeFile("output/events-index.json")    // includes coords
  → writeFile("output/build-errors.json")    // includes geocodeErrors[]
  → totalErrorCount += geocodeErrors.length
```

---

## 7. Worker Changes (`infra/favorites-worker/`)

### New file: `geo-filters.ts`
CRUD routes following the same pattern as `search-filters.ts`:

```
GET    /geo-filters
POST   /geo-filters        { lat, lng, radiusKm, label? }
PUT    /geo-filters         [array replace]
DELETE /geo-filters/:index
```

Validation: `lat` ∈ [-90, 90], `lng` ∈ [-180, 180], `radiusKm` ∈ (0, 100], max 10 filters per user.

### Changes to `feed.ts`
After fetching `events-index.json`, apply geo filter before text search:

```ts
function haversineKm(lat1, lng1, lat2, lng2): number { ... }

function eventMatchesGeoFilters(event: EventsIndexEntry, geoFilters: GeoFilter[]): boolean {
  if (geoFilters.length === 0) return true          // no filter = include all
  if (event.lat == null || event.lng == null) return true  // no coords = pass through
  return geoFilters.some(f =>
    haversineKm(f.lat, f.lng, event.lat!, event.lng!) <= f.radiusKm
  )
}
```

Geo and text filters compose: geo filters the full index first; text search runs on the geo-filtered subset.

---

## 8. UI (Phase 2 — separate PR)

Three flows for setting a geo filter:

1. **"Near me"** — `navigator.geolocation.getCurrentPosition()` + radius slider (default 2 km). Label auto-set to "Current location."
2. **Named neighborhoods** — pre-set centroids for Capitol Hill, Fremont, Ballard, SLU, etc.
3. **Map picker** — drop a pin (Leaflet/MapLibre). Deferred to a future PR.

---

## 9. Entry Points (All Code Paths That Touch This Feature)

| Entry Point | Script/File | Notes |
|---|---|---|
| Standard build | `npm run generate-calendars` → `index.ts` → `lib/calendar_ripper.ts#main()` | Primary path; geocoding runs here |
| Outofband generation | `npm run generate-outofband` → `scripts/generate-outofband.ts` | Same `resolveEventCoords()` call; outofband sources typically venue-pinned so cache hits |
| Outofband download | `npm run download-outofband` → `scripts/download-outofband.ts` | No geocoding; fetches pre-built ICS from S3 |
| Personal feed serving | Cloudflare Worker `infra/favorites-worker/` | Reads coords from events-index.json; applies haversine filter |
| Geo filter CRUD | Worker `/geo-filters` routes | Stores `GeoFilter[]` in `FavoritesRecord` KV |
| CI | `.github/workflows/build-calendars.yml` | Runs `generate-calendars`; no new secrets or steps needed |

---

## 10. What Doesn't Change

- ICS/RSS file format — no `GEO:` property added to VEVENT blocks
- Cloudflare KV schema — `FavoritesRecord` is backward-compatible (`geoFilters` defaults to `[]`)
- CI workflow — no new secrets, no new CI steps
- `lib/tag_aggregator.ts` — external calendar events flow into `eventsIndex` the same way; coords resolved from their `LOCATION` strings

---

## 11. PR Plan

**Single PR** covering the full backend implementation:

- `lib/config/schema.ts` — `geoSchema`, `GeocodeError` type, updated `configSchema`
- `lib/geocoder.ts` — new module (with tests)
- `geo-cache.json` — seed file (empty entries object)
- `lib/calendar_ripper.ts` — wire geocoding into `main()`, coord fields in `eventsIndex`, `geocodeErrors` in `build-errors.json`
- `scripts/generate-outofband.ts` — same geocoding path wired in
- `sources/*/ripper.yaml` — add `geo:` block to all venue-pinned sources (~50 files)
- `infra/favorites-worker/src/types.ts` — `GeoFilter`, updated `FavoritesRecord`, updated `EventsIndexEntry`
- `infra/favorites-worker/src/geo-filters.ts` — new CRUD routes
- `infra/favorites-worker/src/feed.ts` — haversine filter
- `infra/favorites-worker/src/index.ts` — register geo-filters routes

UI is a separate follow-up PR.

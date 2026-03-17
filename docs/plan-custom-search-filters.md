# Custom Search Filters — Implementation Plan

## Overview

Users can add free-form text search filters on their favorites page. Their personalized ICS feed will search all events using these filters and merge matching events into their favorites stream (deduped by UID). The search algorithm is shared between website and feed endpoint, tightened from threshold 0.2 → 0.1.

## Architecture

### Feed endpoint flow (with search filters)

1. Look up user by feed token (existing)
2. Get user's `FavoritesRecord` — now includes `searchFilters: string[]` alongside `icsUrls`
3. Fetch favorited `.ics` files (existing flow)
4. **NEW**: If user has search filters:
   a. Fetch & cache `events-index.json` from GitHub Pages (cacheable across users, updated ~daily)
   b. Fetch & cache `tag-all.ics` from GitHub Pages (all events in one ICS file)
   c. For each search filter, run Fuse.js search on events-index → collect matching event identifiers (summary + date pairs)
   d. Parse `tag-all.ics`, extract VEVENTs whose SUMMARY matches a search hit
   e. Merge these VEVENTs with the favorited calendar events
5. Dedup by UID (existing ics-merge.ts logic)
6. Return merged ICS

### Caching strategy

- `events-index.json` and `tag-all.ics` are cached in worker memory with a 1-hour TTL
- These are static files deployed ~daily, so 1-hour cache is safe
- Cache is shared across all user feed requests (global in worker)

## Changes

### Step 1: Tighten search algorithm

**Files:**
- `web/src/App.jsx` — Change `FUSE_THRESHOLD` from `0.2` to `0.1` (line 6)

### Step 2: Data model — add searchFilters to FavoritesRecord

**Files:**
- `infra/favorites-worker/src/types.ts` — Add `searchFilters?: string[]` to `FavoritesRecord`

### Step 3: Search filters CRUD API endpoints

**Files:**
- `infra/favorites-worker/src/search-filters.ts` — New file with Hono routes:
  - `GET /search-filters` → returns user's search filters
  - `PUT /search-filters` → replaces full list (for bulk sync)
  - `POST /search-filters` → add single filter
  - `DELETE /search-filters/:filter` → remove single filter
  - Validation: max 25 filters, max 200 chars per filter, non-empty strings
- `infra/favorites-worker/src/index.ts` — Register new route: `app.route('/search-filters', searchFiltersRoutes)`

### Step 4: Server-side event search in feed endpoint

**Files:**
- `infra/favorites-worker/src/event-search.ts` — New file:
  - `searchEvents(eventsIndex, searchFilters, threshold)` — runs Fuse.js searches, returns Set of matching `{summary, date}` pairs
  - `extractMatchingVEvents(allIcs, matchingEvents)` — parses ICS text, extracts VEVENTs matching the search results by SUMMARY
  - Simple in-memory cache for `events-index.json` and `tag-all.ics` with TTL
- `infra/favorites-worker/src/feed.ts` — After fetching favorited .ics files, if user has searchFilters:
  1. Call event search to get matching VEVENT blocks
  2. Pass them to `mergeIcsFiles()` alongside the favorited ICS contents
- `infra/favorites-worker/package.json` — Add `fuse.js` dependency

### Step 5: Frontend UI for managing search filters

**Files:**
- `web/src/App.jsx`:
  - New state: `searchFilters` (array of strings), synced to worker API like favorites
  - In the favorites view (selectedTag === '__favorites__'), add a "Search Filters" section above the feed URL banner:
    - List of existing filters with delete buttons
    - Input field + "Add" button to add new filters
    - Each filter shown as a removable chip/pill
  - Modify `favoritesEvents` computation to also include events matching search filters from eventsIndex (using same Fuse.js search with threshold 0.1)
  - Sync search filters on login (same pattern as favorites sync)

### Step 6: Tests

**Files:**
- `infra/favorites-worker/test/search-filters.test.ts` — CRUD tests for search filters API (following favorites.test.ts patterns)
- `infra/favorites-worker/test/feed.test.ts` — Add tests for feed with search filters:
  - Feed with search filters fetches events-index.json and tag-all.ics
  - Search filter matches include correct events
  - Dedup between favorited calendars and search matches
  - Empty search filters = existing behavior unchanged
- `infra/favorites-worker/test/event-search.test.ts` — Unit tests for search logic

## Matching algorithm (shared)

Both website and feed endpoint use Fuse.js with:
- `keys: ['summary', 'description', 'location']`
- `threshold: 0.1`

The feed endpoint identifies matching events by summary+date from events-index, then extracts corresponding VEVENTs from tag-all.ics by matching the SUMMARY field in the ICS text.

## Validation rules

- Max 25 search filters per user
- Max 200 characters per filter
- Non-empty, trimmed strings
- No duplicates (case-insensitive comparison)

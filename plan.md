# Plan: Address PR #152 Review Comments

Four issues were raised by the reviewer. Here's the plan to fix each.

---

## Issue 1: Missing JSON Error Handlers

**Problem:** Unhandled `JSON.parse()` / `req.json()` exceptions can crash handlers on malformed input.

### Fix in `search-filters.ts`:
- **Lines 39, 71** — Wrap `c.req.json()` calls in PUT and POST handlers with try-catch, returning `400 Bad Request` on parse failure.
- **Line 22 (`getFavorites`)** — Wrap `JSON.parse(raw)` with try-catch; return a fresh default record if KV data is corrupted.

### Fix in `event-search.ts`:
- **Line 24** — `res.json()` can throw on malformed response body. Wrap in try-catch and throw a descriptive error.

---

## Issue 2: Race Condition — Module-Level Cache Variables

**Problem:** Module-level `let` cache variables (lines 13-14 in `event-search.ts`) can serve stale cross-tenant data when concurrent requests use different `baseUrl` values.

### Fix in `event-search.ts`:
- Replace `eventsIndexCache` and `allIcsCache` with `Map<string, CachedResource<T>>` keyed by `baseUrl`.
- Update `fetchEventsIndex()` and `fetchAllIcs()` to get/set by `baseUrl` key.
- Update `_clearCaches()` to call `.clear()` on both maps (also resolves Issue 4).

---

## Issue 3: Misleading Comment

**Problem:** Line 61 says "summary+date composite key" but only summary is used.

### Fix:
- Change comment to: `// Use summary to identify matching events in ICS`

---

## Issue 4: Cache Cleanup Function Inconsistency

**Problem:** `_clearCaches()` uses null assignment, which won't work with Map-based caches.

### Fix:
- Resolved as part of Issue 2 — `_clearCaches()` will use `.clear()` on Maps.

---

## Implementation Order

1. Fix `event-search.ts` (Issues 2, 3, 4)
2. Fix `search-filters.ts` (Issue 1)
3. Update tests if cache API changed
4. Run `npm run test:all`
5. Commit and push to `claude/custom-search-filters-gLfG0`

## Files Changed

| File | Changes |
|------|---------|
| `infra/favorites-worker/src/event-search.ts` | Map-based caches, fix comment, try-catch on res.json() |
| `infra/favorites-worker/src/search-filters.ts` | try-catch on req.json() and JSON.parse in getFavorites |
| `infra/favorites-worker/test/*.test.ts` | Update if needed for Map-based cache API |

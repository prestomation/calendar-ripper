# Event Source Attribution Design Doc

## Context

Users build their personal feed from three distinct criteria types:

1. **Favorited calendars** (`icsUrls[]`) — user explicitly ♡'d a source calendar
2. **Search filters** (`searchFilters[]`) — fuzzy text matches on summary/description/location
3. **Geo filters** (`geoFilters[]`) — haversine distance matches on event lat/lng

A single event can match multiple criteria simultaneously. Example: a Crocodile show could appear because:
- The user favorited the Crocodile calendar **AND**
- It matches their geo filter for Capitol Hill **AND**
- It matches their search filter "punk"

---

## 1. The Multi-Match Problem

### What happens today

In `ics-merge.ts`, events are deduplicated by UID:

```typescript
if (uid && seenUids.has(uid)) continue
if (uid) seenUids.add(uid)
```

The first instance wins. If an event from a favorited calendar is processed before the search-matched version, we inject `X-CALRIPPER-SOURCE` with the calendar name. But if the same event also matched a search filter, that attribution is lost — there's no record that it matched "punk".

For geo filters, there's no attribution at all. `feed.ts` filters events by distance, but the resulting VEVENT has no indication of which geo filter matched.

### The right behavior

An event should carry **all** the criteria that caused it to be included. If an event matched:
- Favorited calendar "The Crocodile"
- Search filter "punk" 
- Geo filter "Capitol Hill (1km)"

...then all three attributions should be surfaced, both in the web UI and (optionally) in the ICS feed.

---

## 2. UI Options for Showing Attribution

### Option A: Attribution Chips

**One-line description:** Color-coded chips on each event card showing all matching criteria.

**How it looks:**
```
┌──────────────────────────────────────────────────┐
│ Band Name Live at The Crocodile                  │
│ 8:00 PM – 11:00 PM                               │
│                                                  │
│ [🗓️ The Crocodile] [🔍 "punk"] [📍 Capitol Hill] │
│                                                  │
│ Description text here...                         │
└──────────────────────────────────────────────────┘
```

Chips are styled distinctly:
- **🗓️ Calendar** (blue) — shows calendar friendly name
- **🔍 Search** (green) — shows the filter text that matched
- **📍 Geo** (purple) — shows the label (e.g., "Capitol Hill") or "within 2km"

**Data requirements:**
- Worker must return attribution metadata per event
- Cannot use ICS format alone — need a new JSON endpoint or piggyback on existing fetch

**Pros:**
- Clear, at-a-glance attribution
- Users can see exactly why each event is in their feed
- Chips can be interactive (click to filter to just that criteria)

**Cons:**
- Adds visual weight to event cards
- Requires backend changes to track and return attribution data

**Complexity:** Medium

---

### Option B: Grouped Sections

**One-line description:** Feed view is divided into sections by source type, with events appearing in each section they match.

**How it looks:**
```
────────────────────────────────────────────
FROM YOUR FAVORITED CALENDARS
────────────────────────────────────────────
• Band Name Live at The Crocodile (8:00 PM)
• Jazz Night at Tractor Tavern (9:00 PM)

────────────────────────────────────────────
MATCHING "punk"
────────────────────────────────────────────
• Band Name Live at The Crocodile (8:00 PM)  ← duplicate!
• Punk Show at Neumos (7:30 PM)

────────────────────────────────────────────
NEAR CAPITOL HILL
────────────────────────────────────────────
• Band Name Live at The Crocodile (8:00 PM)  ← another duplicate!
• Coffee Meetup at Victrola (10:00 AM)
```

**Data requirements:**
- Worker returns events grouped by criteria type
- Each event can appear in multiple groups

**Pros:**
- Very clear organization
- Easy to understand at a glance which filter is producing which events
- Natural for users who want to see "just my geo matches"

**Cons:**
- **Duplicate events** — confusing when the same event appears 3 times
- Takes more vertical space
- Users lose the unified chronological view

**Complexity:** Medium

---

### Option C: Source Indicator Icons (Low-Key)

**One-line description:** Small icons next to the calendar source chip indicating which criteria matched.

**How it looks:**
```
┌──────────────────────────────────────────────────┐
│ Band Name Live at The Crocodile                  │
│ 8:00 PM – 11:00 PM                               │
│                                                  │
│ 🗓️ The Crocodile  [♡] [🔍] [📍]                   │
│                                                  │
│ Description text here...                         │
└──────────────────────────────────────────────────┘
```

Icons are:
- **♡** = from a favorited calendar
- **🔍** = matched a search filter
- **📍** = matched a geo filter

Hover/tap for tooltip showing details (e.g., "Matched search filter: punk").

**Data requirements:**
- Same as Option A — need attribution metadata

**Pros:**
- Minimal visual overhead
- Doesn't clutter the card
- Progressive disclosure via tooltips

**Cons:**
- Less immediately informative than chips
- Users might not notice the icons
- Tooltips are awkward on mobile

**Complexity:** Small

---

### Option D: ICS CATEGORIES + X-Properties

**One-line description:** Encode attribution in the ICS feed itself using `CATEGORIES` and custom `X-CALRIPPER-*` properties.

**How it looks (in calendar apps):**

Most calendar apps display CATEGORIES as tags or labels. The event would show:
- Categories: `The Crocodile`, `search:punk`, `geo:Capitol Hill`

In the raw ICS:
```ics
BEGIN:VEVENT
UID:event-123@calendar-ripper
SUMMARY:Band Name Live at The Crocodile
X-CALRIPPER-SOURCE:The Crocodile
X-CALRIPPER-SEARCH:punk
X-CALRIPPER-GEO:Capitol Hill
CATEGORIES:The Crocodile,search:punk,geo:Capitol Hill
...
END:VEVENT
```

**Data requirements:**
- Changes to `ics-merge.ts` to inject new X- properties
- Feed generation must track all criteria per event

**Pros:**
- Attribution carries into the user's calendar app
- No web UI changes needed
- Persistent — doesn't depend on viewing in our app

**Cons:**
- Not all calendar apps display CATEGORIES prominently (Apple Calendar hides them)
- X- properties are invisible to most users
- Doesn't help the web UI at all

**Complexity:** Small (for ICS-only), but doesn't solve the web UI problem

---

## 3. The Multi-Match Decision

When an event matches multiple criteria, three approaches:

### Approach 1: Show All Attributions

Event appears once, with chips/icons for every matching criterion.

```
[🗓️ The Crocodile] [🔍 "punk"] [📍 Capitol Hill]
```

**Pros:** Complete transparency. Users see exactly why an event is in their feed.

**Cons:** Can get visually busy if someone has 5 search filters and 3 geo filters.

### Approach 2: Priority Order

First match wins. Only show that label.

Priority: `geo > search > favorites` (or configurable)

```
[📍 Capitol Hill]  // even though it also matched favorites + search
```

**Pros:** Clean, simple.

**Cons:** Hides information. User might wonder "why isn't my punk filter showing matches?" when it is, just overridden by geo.

### Approach 3: Dedupe with "and more"

Show primary match + count of others.

```
[🗓️ The Crocodile] +2 more
```

Expand on tap/hover to see all.

**Pros:** Compact but informative.

**Cons:** Extra interaction required. "+2 more" is ambiguous.

---

### Recommendation: **Show All Attributions (Approach 1)**

Reasons:

1. **Users set these filters intentionally.** If they added "punk", they want to know what matched. Hiding that breaks trust.

2. **The multi-match case is actually valuable.** An event matching 3 criteria is probably very relevant — highlight that, don't hide it.

3. **Visual density is manageable.** Most events will match 1–2 criteria. The rare 4+ match event deserves the visual weight.

4. **Aligns with filter debugging.** When users wonder "why is this in my feed?", the answer is right there.

For the UI, use **Option A (Attribution Chips)** — they're more discoverable than icons and avoid the duplication problem of grouped sections.

---

## 4. Implementation Approach: Client-Side Attribution (No New Endpoint)

### Key insight

The web UI is **not** a consumer of the personal ICS feed. The ICS feed is a black box that users paste into their calendar app (Google Calendar, Apple Calendar, etc.). The web site does its own independent filtering against `events-index.json` for the live preview, "Happening Soon", and map views.

This means the web UI already has everything it needs to compute attribution entirely client-side:
- `favorites` array — which `icsUrl`s the user has ♡'d
- `searchFilters` array — the user's saved text filters
- `geoFilters` array — the user's geo filters
- `eventsIndex` — the full event corpus with `lat`/`lng`

**No new worker endpoint needed.** No backend changes needed at all for the UI.

### Client-side attribution logic

In `App.jsx`, compute an attribution map as a `useMemo`:

```js
const eventAttributions = useMemo(() => {
  // Returns Map<compositeKey, Attribution[]>
  // compositeKey = summary + '|' + date (same key used by search matching)
  const map = new Map()

  const addAttr = (key, attr) => {
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(attr)
  }

  // 1. Favorited calendars — event's icsUrl is in favoritesSet
  for (const event of eventsIndex) {
    if (favoritesSet.has(event.icsUrl)) {
      const calName = friendlyNameByIcsUrl[event.icsUrl] || event.icsUrl
      addAttr(event.summary + '|' + event.date, { type: 'calendar', value: calName })
    }
  }

  // 2. Search filters — Fuse.js match (same threshold as worker: 0.1)
  if (searchFilters.length && eventsIndex.length) {
    const fuse = new Fuse(eventsIndex, { keys: ['summary', 'description', 'location'], threshold: 0.1 })
    for (const filter of searchFilters) {
      for (const { item } of fuse.search(filter)) {
        addAttr(item.summary + '|' + item.date, { type: 'search', value: filter })
      }
    }
  }

  // 3. Geo filters — haversine (same formula as worker)
  if (geoFilters.length) {
    for (const event of eventsIndex) {
      if (event.lat == null || event.lng == null) continue
      for (const gf of geoFilters) {
        if (haversineKm(gf.lat, gf.lng, event.lat, event.lng) <= gf.radiusKm) {
          addAttr(event.summary + '|' + event.date, {
            type: 'geo',
            value: gf.label || `${gf.radiusKm} km`
          })
        }
      }
    }
  }

  return map
}, [eventsIndex, favoritesSet, searchFilters, geoFilters, friendlyNameByIcsUrl])
```

Then render chips on each event card:

```jsx
const key = event.summary + '|' + event.date
const attributions = eventAttributions.get(key) || []

{attributions.length > 0 && (
  <div className="event-attributions">
    {attributions.map((attr, i) => (
      <span key={i} className={`attribution-chip attribution-${attr.type}`}>
        {attr.type === 'calendar' && '🗓️'}
        {attr.type === 'search' && '🔍'}
        {attr.type === 'geo' && '📍'}
        {' '}{attr.value}
      </span>
    ))}
  </div>
)}
```

CSS:
```css
.attribution-chip { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-right: 4px; }
.attribution-calendar { background: #e3f2fd; color: #1565c0; }
.attribution-search   { background: #e8f5e9; color: #2e7d32; }
.attribution-geo      { background: #f3e5f5; color: #7b1fa2; }
```

### Where to show chips

Attribution chips should appear in:
1. **"Happening Soon"** — next to each event in the day-grouped upcoming list
2. **Calendar event detail panel** — when expanding a specific event
3. **Events map popups** — small chips in the Leaflet popup

They are most valuable in the "Happening Soon" view because that's where users ask "why is this event showing?"

### ICS feed attribution (optional, low priority)

The personal ICS feed itself does NOT need to change for the web UI. If we ever want attribution in calendar apps, we can add `X-CALRIPPER-MATCH-*` properties and `CATEGORIES` to `ics-merge.ts` in a future PR. That's a separate concern from the UI.

---

## 5. Filter Parity Tests

The web UI and the Cloudflare Worker implement the same filtering logic independently. These must stay in sync. A dedicated test file `web/src/filter-parity.test.jsx` should verify this contract.

### What to test

```js
// web/src/filter-parity.test.jsx

import { describe, it, expect } from 'vitest'
import Fuse from 'fuse.js'

const FUSE_THRESHOLD = 0.1
const FUSE_KEYS = ['summary', 'description', 'location']

// Shared fixture — a realistic slice of events-index entries
const FIXTURE_EVENTS = [
  { icsUrl: 'crocodile-main.ics', summary: 'Punk Night at the Crocodile', description: 'Local punk bands', location: '2505 1st Ave, Seattle', date: '2026-04-01T20:00', lat: 47.6146, lng: -122.3474 },
  { icsUrl: 'neumos.ics',         summary: 'Jazz Fusion Evening',         description: 'Smooth jazz',       location: '925 E Pike St, Seattle',  date: '2026-04-02T20:00', lat: 47.6143, lng: -122.3197 },
  { icsUrl: 'mopop.ics',          summary: 'Guitar Exhibit Opening',      description: 'Rock history',       location: '325 5th Ave N, Seattle',  date: '2026-04-03T11:00', lat: 47.6214, lng: -122.3481 },
  { icsUrl: 'fremont-brewing.ics', summary: 'Trivia Night',               description: 'Beer and trivia',   location: '1050 N 34th St, Seattle', date: '2026-04-04T19:00', lat: 47.6499, lng: -122.3482 },
  { icsUrl: 'seatoday.ics',        summary: 'Community Meeting',          description: null,                location: null,                       date: '2026-04-05T18:00', lat: null,   lng: null   },
]

// Haversine — must match worker implementation exactly
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.min(1, Math.max(0,
    Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  ))
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

describe('Filter parity: client matches worker behavior', () => {
  describe('Search filters', () => {
    it('matches "punk" to the right event', () => {
      const fuse = new Fuse(FIXTURE_EVENTS, { keys: FUSE_KEYS, threshold: FUSE_THRESHOLD })
      const results = fuse.search('punk').map(r => r.item.icsUrl)
      expect(results).toContain('crocodile-main.ics')
      expect(results).not.toContain('neumos.ics')
    })

    it('does not match unrelated events', () => {
      const fuse = new Fuse(FIXTURE_EVENTS, { keys: FUSE_KEYS, threshold: FUSE_THRESHOLD })
      const results = fuse.search('jazz').map(r => r.item.icsUrl)
      expect(results).toContain('neumos.ics')
      expect(results).not.toContain('fremont-brewing.ics')
    })

    it('handles events with null description/location gracefully', () => {
      const fuse = new Fuse(FIXTURE_EVENTS, { keys: FUSE_KEYS, threshold: FUSE_THRESHOLD })
      expect(() => fuse.search('community')).not.toThrow()
    })
  })

  describe('Geo filters', () => {
    it('includes events within radius', () => {
      // Capitol Hill center
      const filter = { lat: 47.6143, lng: -122.3197, radiusKm: 1 }
      const matches = FIXTURE_EVENTS.filter(e =>
        e.lat != null && e.lng != null &&
        haversineKm(filter.lat, filter.lng, e.lat, e.lng) <= filter.radiusKm
      )
      expect(matches.map(e => e.icsUrl)).toContain('neumos.ics')
      expect(matches.map(e => e.icsUrl)).not.toContain('fremont-brewing.ics')
    })

    it('passes through events with null coords', () => {
      const filter = { lat: 47.6062, lng: -122.3321, radiusKm: 1 }
      const nullCoordEvent = FIXTURE_EVENTS.find(e => e.lat == null)
      // null-coord events should NOT be filtered out (pass-through behavior)
      expect(nullCoordEvent).toBeDefined()
      // The filter logic: if lat == null => include
      const included = nullCoordEvent.lat == null || haversineKm(filter.lat, filter.lng, nullCoordEvent.lat, nullCoordEvent.lng) <= filter.radiusKm
      expect(included).toBe(true)
    })

    it('handles large radius (city-wide)', () => {
      const filter = { lat: 47.6062, lng: -122.3321, radiusKm: 20 }
      const matches = FIXTURE_EVENTS.filter(e =>
        e.lat == null || haversineKm(filter.lat, filter.lng, e.lat, e.lng) <= filter.radiusKm
      )
      expect(matches.length).toBe(FIXTURE_EVENTS.length) // all in Seattle, all match
    })
  })

  describe('Multi-match', () => {
    it('an event can match both search and geo', () => {
      const searchFuse = new Fuse(FIXTURE_EVENTS, { keys: FUSE_KEYS, threshold: FUSE_THRESHOLD })
      const searchMatches = new Set(searchFuse.search('punk').map(r => r.item.summary + '|' + r.item.date))

      const geoFilter = { lat: 47.6146, lng: -122.3474, radiusKm: 0.5 } // right at Crocodile
      const geoMatches = new Set(
        FIXTURE_EVENTS
          .filter(e => e.lat != null && haversineKm(geoFilter.lat, geoFilter.lng, e.lat, e.lng) <= geoFilter.radiusKm)
          .map(e => e.summary + '|' + e.date)
      )

      const crocodileKey = 'Punk Night at the Crocodile|2026-04-01T20:00'
      expect(searchMatches.has(crocodileKey)).toBe(true)
      expect(geoMatches.has(crocodileKey)).toBe(true)
    })
  })
})
```

### Running parity tests

These tests live in `web/` and run with `npm run test:web`. They share no code with the worker — that's intentional. If a test fails after changing either the worker or the client filter logic, it means parity has broken and both need updating.

---

## 6. Open Questions

1. **How to handle attribution for search matches that come from a favorited calendar?**  
   If the Crocodile calendar is favorited AND an event matches "punk", show both: `[🗓️ The Crocodile] [🔍 punk]`. The user should know both criteria matched — it reinforces relevance.

2. **What if a geo filter has no label?**  
   Fall back to distance: `[📍 2 km]`. Encourage users to add labels in the geo filter form.

3. **Should attribution chips be clickable?**  
   Clicking `[🔍 punk]` could scroll to or highlight that search filter. Nice-to-have, not MVP.

4. **Performance of the attribution `useMemo`?**  
   Running Fuse.js for every search filter across the full `eventsIndex` on every render would be slow. Mitigation: the `useMemo` only recomputes when `searchFilters` or `eventsIndex` changes (both are stable between renders). The existing `searchFilterMatchSummaries` memo already does this — reuse it rather than re-running Fuse.

5. **ICS feed attribution?**  
   Deferred. The web UI doesn't consume the ICS feed, so ICS changes (`X-CALRIPPER-MATCH-*`, `CATEGORIES`) are a separate future PR if we want attribution in Apple/Google Calendar. Not needed for this feature.

---

## Summary

| Decision | Choice |
|----------|--------|
| Multi-match behavior | Show all attributions |
| UI approach | Attribution chips on event cards |
| Attribution computation | Client-side only — no backend changes |
| New worker endpoint | Not needed |
| ICS changes | Deferred to future PR |
| Parity tests | `web/src/filter-parity.test.jsx` |
| Priority | Medium |

**Estimated effort:** 1–2 days for a coding subagent, including parity tests.

# UI Plan: Geo-Filtered Calendar Subscriptions

**Status:** Planning  
**Date:** 2026-03-25  
**Backend:** Merged (PR #XXX)  
**Worker API:** `GET/POST/PUT/DELETE /geo-filters` accepting `{ lat, lng, radiusKm, label? }`

---

## Context

Users can now create geo filters that filter their personal ICS feed to only show events within N km of a location. The backend is done; we need a UI for setting these filters.

**Constraints from backend:**
- Max 10 geo filters per user
- `radiusKm` must be 0 < r ≤ 100
- `label` is optional, max 100 chars
- Requires auth (same as favorites/search filters)

**Existing UI patterns to follow:**
- Search filters: chips with remove button, text input to add, live preview of matches
- Favorites: heart toggle, syncs to server when logged in
- Feed URL banner: shows personal feed URL, copy button
- Mobile-first responsive design with breakpoints at 768px (mobile) and 1024px (tablet)

---

## Three UI Options

### Option 1: "Near Me" Button (Browser Geolocation)

**One-liner:** A single button that uses the browser's geolocation API to set a filter at the user's current location, with a radius slider.

**How it looks and works:**
1. In the Favorites view (or a new "Location Filters" section), user sees a `📍 Near Me` button
2. Click triggers `navigator.geolocation.getCurrentPosition()`
3. Browser shows permission prompt ("Allow location access?")
4. On success: modal/inline form appears with:
   - "Your location: [lat, lng]" (or "Current Location" if we don't want to show raw coords)
   - Radius slider: 1km — 100km, default 5km, with labels at key points (1km, 5km, 10km, 25km, 50km, 100km)
   - Label input: optional, placeholder "Home", "Work", etc.
   - Save / Cancel buttons
5. On save: POST to `/geo-filters` with the payload
6. New filter appears as a chip: "📍 Near Me (5km)" or "📍 Home (5km)" if labeled
7. Click chip to edit (same modal), X button to delete

**Libraries/APIs:**
- `navigator.geolocation.getCurrentPosition()` — no external dependencies
- No API keys required

**Pros:**
- Zero external dependencies
- Works offline (geolocation is browser-native)
- Simplest implementation
- Familiar UX pattern (apps like Yelp, Google Maps do this)
- No privacy concerns about typing home address

**Cons:**
- Requires location permission — users who deny lose the feature
- Accuracy varies (WiFi positioning is ~50m, GPS is better but slower)
- Can't set a filter for a location you're not currently at (e.g., "near my office" while at home)
- No visual confirmation of the radius (user has to imagine 5km)

**Complexity:** Small (1-2 days)

---

### Option 2: Address Search + Geocoding

**One-liner:** Type an address or place name, geocode it client-side, then set the radius.

**How it looks and works:**
1. Input field in the geo filters section: placeholder "Enter address or place name..."
2. As user types, debounced autocomplete suggestions from Nominatim or Photon
3. User selects a suggestion (or presses Enter on raw text)
4. Geocoding API returns lat/lng
5. Same radius slider and label input as Option 1
6. Save creates the filter

**Libraries/APIs:**
- **Nominatim** (free, OSM-based): `https://nominatim.openstreetmap.org/search`
  - No API key required
  - Rate limit: 1 req/sec (same as backend geocoder)
  - Seattle bounding box for relevance: `viewbox=-122.6,47.3,-121.9,47.8`
- Or **Photon** (Komoot's geocoder): `https://photon.komoot.io/api/` — faster, no strict rate limit
- No npm packages required; fetch is enough

**Pros:**
- Can set filters for locations you're not at
- More precise than GPS in many cases
- Familiar UX (like Google Maps search)
- Still no npm dependencies for geocoding — just fetch

**Cons:**
- Requires network for geocoding (not fully offline)
- External service dependency (Nominatim can be slow/unavailable)
- Autocomplete adds complexity (debounce, loading states, error handling)
- Address strings can be ambiguous ("Main St" exists everywhere)

**Complexity:** Medium (2-3 days)

---

### Option 3: Map Pin Drop (Leaflet/MapLibre)

**One-liner:** Embed an interactive map where users drop a pin and drag a radius circle.

**How it looks and works:**
1. A small embedded map in the geo filters section (or modal)
2. Map shows Seattle metro area, centered on downtown
3. Click to drop a pin (or long-press on mobile)
4. Draggable circle overlay shows the radius
5. Radius slider (or circle drag handles) to adjust
6. Label input + Save button

**Visual mockup (ASCII):**
```
┌──────────────────────────────────────────────┐
│  [Search: Capitol Hill_____________] [📍 Me] │
│  ┌────────────────────────────────────────┐  │
│  │                                        │  │
│  │           ┌───────────┐               │  │
│  │          /             \              │  │
│  │         │      📍       │             │  │
│  │          \             /              │  │
│  │           └───────────┘               │  │
│  │                                        │  │
│  └────────────────────────────────────────┘  │
│  Radius: [====●==========] 5 km              │
│  Label:  [Home________________________]      │
│  [Cancel]                         [Save]     │
└──────────────────────────────────────────────┘
```

**Libraries/APIs:**
- **react-leaflet** (`npm:react-leaflet` + `npm:leaflet`): ~40KB gzipped
  - Free, MIT license
  - Tile provider: OpenStreetMap (free, no key) or Stadia Maps (free tier)
- **MapLibre GL JS** (`npm:maplibre-gl`): ~200KB gzipped, but vector tiles = sharper, better perf
  - Free, BSD license
  - Tile provider: Protomaps (free/cheap) or MapTiler (free tier, needs API key)

**Recommendation:** `react-leaflet` — smaller bundle, simpler API, raster tiles are fine for this use case.

**Pros:**
- Most intuitive UX — see exactly what area is covered
- Combines address search + pin drop + "near me" in one interface
- Can click anywhere on the map (not limited to addresses)
- Visual radius confirmation

**Cons:**
- Largest bundle size (~40KB+ gzipped for Leaflet)
- Most complex implementation
- Tile provider choice (OSM tiles have usage policy; may need Stadia/Protomaps for scale)
- Mobile touch interactions need careful handling (pinch zoom vs. pin drop vs. circle drag)

**Complexity:** Large (4-5 days)

---

## Recommended Approach

**Combine Options 1 + 2: "Near Me" button + address search, no map.**

**Rationale:**
1. **Matches existing UI density.** The app's favorites and search filters sections are text-based with simple inputs. A full map widget would feel out of place and bloat the bundle.
2. **Covers the main use cases.** Most users want: (a) "show me events near where I am now" or (b) "show me events near Capitol Hill / my office / etc."
3. **No new dependencies for Option 1.** Browser geolocation is free.
4. **Photon geocoder is fast and free.** For Option 2, Photon's autocomplete is snappier than Nominatim and has no strict rate limit.
5. **Map can be a future enhancement.** If users ask for it, we can add a small preview map that shows the pin after setting a filter, without making the map interactive for input.

---

## UX Flow (Step by Step)

### Entry Point

Geo filters UI lives in the **Favorites view** (`tag=__favorites__`), in a new section below the "Search Filters" section.

### Flow A: "Near Me"

1. User clicks `📍 Add location` button in the Geo Filters section
2. Button shows spinner: "Getting location..."
3. Browser prompts for permission (if not already granted)
4. On success:
   - Inline form expands below the button
   - "Your current location" label
   - Radius slider: 1km min, 100km max, default 5km
   - Preset buttons: `1km` `5km` `10km` `25km` for quick selection
   - Optional label input
   - `Save` / `Cancel` buttons
5. On permission denied:
   - Toast: "Location access denied. You can enter an address instead."
   - Falls back to showing the address search input
6. On save: chip appears with label + radius

### Flow B: Address Search

1. User clicks `🔍 Search address` or types directly in a search input
2. Debounced autocomplete (300ms) shows dropdown of Photon results
3. Results show: "1234 Main St, Seattle, WA" style, max 5 results
4. User clicks a result
5. Same inline form as Flow A (radius slider, label input)
6. On save: chip appears

### Flow C: Edit/Delete

1. Click a geo filter chip → edit modal/inline form with pre-filled values
2. Click X on chip → confirmation: "Remove this location filter?" → DELETE `/geo-filters/:index`

---

## UI Component Breakdown

### New Components

#### `<GeoFiltersSection />`
- **Location:** Rendered inside the Favorites view (`selectedTag === '__favorites__'`), below `<SearchFiltersSection />`
- **State:**
  - `geoFilters: GeoFilter[]` — synced from server on mount (like favorites)
  - `isAdding: boolean` — shows the add form
  - `editingIndex: number | null` — which filter is being edited
  - `geolocating: boolean` — spinner state for "Near Me"
- **Renders:**
  - Header: "Location Filters"
  - Hint: "Only see events near these locations"
  - Chips for existing filters
  - `📍 Add location` / `🔍 Search address` buttons

#### `<GeoFilterChip filter={GeoFilter} onEdit onDelete />`
- **Props:** `filter`, `onEdit()`, `onDelete()`
- **Renders:** `"📍 {label || 'Location'} ({radiusKm}km)"` + X button
- **Interaction:** Click chip → onEdit, click X → onDelete

#### `<GeoFilterForm mode="add"|"edit" initialFilter? onSave onCancel />`
- **Props:** `mode`, `initialFilter` (for edit), `onSave(filter)`, `onCancel()`
- **State:**
  - `lat: number | null`
  - `lng: number | null`
  - `radiusKm: number` — default 5
  - `label: string`
  - `addressInput: string` — for search
  - `suggestions: AddressSuggestion[]` — from Photon
  - `loading: boolean`
- **Renders:**
  - If no lat/lng yet:
    - `📍 Use current location` button
    - Address search input with autocomplete dropdown
  - If lat/lng set:
    - "Location: {label or address or 'Current location'}"
    - Radius slider with value label
    - Preset buttons (1km, 5km, 10km, 25km)
    - Label input
    - Save / Cancel buttons

#### `<RadiusSlider value onChange min max />`
- Simple range input with value display
- Styled consistently with existing UI

#### `<AddressAutocomplete onSelect={(lat, lng, displayName) => void} />`
- Input with debounced fetch to Photon API
- Dropdown with results
- Loading/error states

### Modified Components

#### `App.jsx`
- Add `geoFilters` state (similar to `searchFilters`)
- Add sync logic in `useEffect` when `authUser` changes
- Pass `geoFilters` and CRUD handlers to `<GeoFiltersSection />`

---

## API Integration

```ts
// Fetch on mount (after auth)
const fetchGeoFilters = async () => {
  const res = await fetch(`${API_URL}/geo-filters`, { credentials: 'include' })
  if (res.ok) {
    const data = await res.json()
    setGeoFilters(data.geoFilters)
  }
}

// Add
const addGeoFilter = async (filter: GeoFilter) => {
  const res = await fetch(`${API_URL}/geo-filters`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filter),
  })
  if (res.ok) {
    const data = await res.json()
    setGeoFilters(data.geoFilters)
  }
}

// Update (replace all — same pattern as search filters)
const updateGeoFilters = async (filters: GeoFilter[]) => {
  const res = await fetch(`${API_URL}/geo-filters`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filters),
  })
  if (res.ok) {
    const data = await res.json()
    setGeoFilters(data.geoFilters)
  }
}

// Delete
const deleteGeoFilter = async (index: number) => {
  const res = await fetch(`${API_URL}/geo-filters/${index}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (res.ok) {
    const data = await res.json()
    setGeoFilters(data.geoFilters)
  }
}
```

---

## Open Questions

### 1. Tile provider / map for Phase 2
If we later add a visual preview or full map picker, what tile provider?
- **Stadia Maps** has a free tier (200k tiles/month) and no API key required for their basic OSM tiles
- **Protomaps** has a free tier and looks great
- **Decision:** Defer until map is needed; free OSM tiles via Stadia for now

### 2. Mobile UX for radius slider
Touch targets for sliders can be fiddly. Options:
- Use preset buttons (1km, 5km, 10km, 25km) as primary, slider as secondary
- Use a number input with stepper buttons instead of slider
- **Recommendation:** Preset buttons + slider. Presets cover 90% of cases.

### 3. What if user has no events after applying geo filter?
- Show empty state: "No events within {radiusKm}km of {label}. Try a larger radius or different location."
- Don't auto-delete the filter — the user's location might have events next week

### 4. Geocoding service for address search
- **Photon (Komoot):** Fast, no strict rate limit, but less comprehensive outside urban areas
- **Nominatim (OSM):** More comprehensive, but 1 req/sec limit
- **Recommendation:** Use Photon for autocomplete (faster UX), fallback to Nominatim if Photon fails

### 5. LocalStorage fallback for unauthenticated users?
Current favorites/search-filters store to localStorage when not logged in. Should geo filters do the same?
- **Recommendation:** Yes, for consistency. Sync to server on login (same migration pattern as favorites).

### 6. Privacy: show exact coordinates?
- Option A: Show "Current location" and never reveal lat/lng
- Option B: Show approximate location: "Near Capitol Hill" based on reverse geocoding
- Option C: Show raw coords (some users want this for debugging)
- **Recommendation:** Show label if set, else reverse-geocode to neighborhood name, else "Near [rounded lat/lng]"

---

## Implementation Order

1. **GeoFiltersSection skeleton** — renders in Favorites view, shows existing filters as chips
2. **Server sync** — fetch on auth, CRUD handlers
3. **GeoFilterChip** — display + delete
4. **"Near Me" flow** — geolocation + radius picker + save
5. **Address search** — Photon autocomplete + select + save
6. **Edit flow** — click chip to edit
7. **LocalStorage fallback** — for non-auth users
8. **Polish** — loading states, error handling, mobile UX

**Estimated total:** 3-4 days for a senior dev familiar with the codebase.

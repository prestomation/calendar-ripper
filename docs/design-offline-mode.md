# Design: Offline Mode with Cached Event Data and Search

## Status: Draft
## Date: 2026-02-24

---

## 1. Problem Statement

The site is a static SPA hosted on GitHub Pages. It currently requires a network connection for every interaction:

- **`manifest.json`** and **`events-index.json`** are fetched on every page load
- Selecting a calendar fetches its **`.ics` file** over the network
- If the user is on a slow connection, at an event venue with poor signal, or fully offline, the site is unusable
- The "Happening Soon" view and search both depend on `events-index.json`, so they fail entirely without connectivity

Since event data is rebuilt only once daily by CI, users are re-fetching identical data on every visit. Caching this data locally would eliminate redundant network requests and make the site functional offline.

## 2. Goals

1. **Full offline functionality** — After a single visit with connectivity, the entire site works offline: calendar browsing, event viewing, search, and "Happening Soon"
2. **Transparent freshness** — When online, data is updated in the background without disrupting the current session. Users always see cached data instantly, with fresh data applied on next navigation or reload
3. **Search works offline** — Fuse.js search over `events-index.json` continues to function with cached data
4. **No visible loading states on repeat visits** — The app shell and data load from cache first, so the site feels instant
5. **Minimal implementation surface** — Use platform APIs (Service Worker, Cache API) without introducing new dependencies or a build framework change

## 3. Non-Goals

- Offline *editing* (e.g., adding favorites while offline and syncing later) — the favorites API integration is a separate feature
- Push notifications for new events
- Differential/delta updates — the dataset is small enough that full replacement is fine
- Background Sync API for deferred writes — no write operations need to happen offline

## 4. Current Data Flow

```
Page Load
  ├── fetch('./manifest.json')        ~5-15 KB    Calendar metadata
  ├── fetch('./events-index.json')    ~200-500 KB  All events (for search + Happening Soon)
  └── (Vite bundle: JS + CSS)         ~150-300 KB  App shell

Calendar Selection
  └── fetch('./<name>.ics')           ~2-50 KB each  ICS file parsed client-side
```

All data is static, rebuilt daily by GitHub Actions, and served from GitHub Pages with default caching headers (`Cache-Control: max-age=600` from GitHub Pages CDN).

## 5. Architecture

### 5.1 Service Worker Strategy: Stale-While-Revalidate

The core strategy is **stale-while-revalidate** for data files and **cache-first** for the app shell. This means:

1. On first visit, everything is fetched from the network and cached
2. On subsequent visits, the cached version is served immediately while a background fetch checks for updates
3. If the background fetch gets newer data, it's stored in the cache for the *next* navigation/reload
4. If the network is unavailable, cached data is served without error

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Browser    │────▶│  Service Worker   │────▶│   Network    │
│   (App)      │◀────│                  │◀────│  (GH Pages)  │
│              │     │  ┌────────────┐  │     │              │
│              │     │  │ Cache API  │  │     │              │
│              │     │  │            │  │     │              │
│              │     │  │ - app shell│  │     │              │
│              │     │  │ - manifest │  │     │              │
│              │     │  │ - events   │  │     │              │
│              │     │  │ - ics files│  │     │              │
│              │     │  └────────────┘  │     │              │
│              │     └──────────────────┘     └─────────────┘
```

### 5.2 Cache Partitioning

Use two named caches to enable independent versioning and cleanup:

| Cache Name | Contents | Strategy | Rationale |
|---|---|---|---|
| `app-shell-v{N}` | HTML, JS, CSS, favicon | **Cache-first**, updated on SW activation | Versioned with the SW; old caches deleted on upgrade |
| `data-v1` | `manifest.json`, `events-index.json`, `*.ics` | **Stale-while-revalidate** | Data changes daily; serve cached instantly, refresh in background |

### 5.3 Service Worker Lifecycle

```
Install
  └── Precache app shell (index.html, JS/CSS bundles)
     (Use Vite's build manifest to enumerate hashed asset filenames)

Activate
  └── Delete old `app-shell-v{N-1}` caches
  └── clients.claim() so the new SW controls the page immediately

Fetch (intercept)
  ├── App shell assets (HTML, JS, CSS)  → Cache-first from `app-shell-v{N}`
  ├── manifest.json                     → Stale-while-revalidate from `data-v1`
  ├── events-index.json                 → Stale-while-revalidate from `data-v1`
  ├── *.ics                             → Stale-while-revalidate from `data-v1`
  └── Everything else                   → Network-only (analytics, external APIs)
```

### 5.4 Freshness Signaling

When the stale-while-revalidate background fetch completes and the response differs from the cache, the service worker posts a message to the client:

```
Service Worker ──postMessage({ type: 'DATA_UPDATED' })──▶ App
```

The app can then show a subtle, non-intrusive toast: **"Updated event data available — reload to see latest"** with a reload button. This avoids silently replacing data under the user while they're reading it.

## 6. Implementation Details

### 6.1 Service Worker File: `web/public/sw.js`

The service worker is a plain JS file (not bundled by Vite) placed in `web/public/` so Vite copies it to the output root. It needs to be at the root to control the full scope.

```javascript
// sw.js (conceptual outline)
const APP_SHELL_CACHE = 'app-shell-v1'
const DATA_CACHE = 'data-v1'

// Populated at build time by a Vite plugin or script
const APP_SHELL_URLS = [
  './',
  './index.html',
  // JS and CSS bundles added by build step
]

const DATA_URL_PATTERNS = [
  /manifest\.json$/,
  /events-index\.json$/,
  /\.ics$/,
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('app-shell-') && key !== APP_SHELL_CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return

  // Data files: stale-while-revalidate
  if (DATA_URL_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(staleWhileRevalidate(event.request, DATA_CACHE))
    return
  }

  // App shell: cache-first
  if (event.request.mode === 'navigate' || isAppShellAsset(url)) {
    event.respondWith(cacheFirst(event.request, APP_SHELL_CACHE))
    return
  }
})

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cachedResponse = await cache.match(request)

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone())
      // Notify clients if data changed
      notifyClients({ type: 'DATA_UPDATED' })
    }
    return response
  }).catch(() => cachedResponse) // Network failure: fall back to cache silently

  return cachedResponse || fetchPromise
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(cacheName)
    cache.put(request, response.clone())
  }
  return response
}
```

### 6.2 Build Integration

Vite hashes JS/CSS filenames (e.g., `assets/App-a1b2c3d4.js`). The service worker needs to know these filenames for precaching. Two options:

**Option A: Vite plugin that injects the manifest (recommended)**

Use `vite-plugin-pwa` or a small custom plugin that reads Vite's build manifest after bundling and writes the asset list into `sw.js`.

**Option B: Simple post-build script**

A Node script that runs after `vite build`, reads `output/.vite/manifest.json`, and injects the asset URLs into `sw.js` via string replacement.

Option B is recommended for this project — it avoids adding `vite-plugin-pwa` (which brings Workbox and significant configuration surface) and keeps the service worker simple and readable.

```javascript
// scripts/inject-sw-assets.mjs
import { readFileSync, writeFileSync } from 'fs'

const manifest = JSON.parse(readFileSync('output/.vite/manifest.json', 'utf-8'))
const assets = Object.values(manifest).map(entry => './' + entry.file)
// Include CSS files referenced by entries
Object.values(manifest).forEach(entry => {
  if (entry.css) assets.push(...entry.css.map(f => './' + f))
})
assets.push('./index.html')

const sw = readFileSync('output/sw.js', 'utf-8')
writeFileSync('output/sw.js', sw.replace(
  '/* __APP_SHELL_URLS__ */',
  JSON.stringify([...new Set(assets)])
))
```

Update `package.json`:
```json
"web:build": "cd web && vite build && node ../scripts/inject-sw-assets.mjs"
```

### 6.3 Service Worker Registration

Register the service worker in `web/src/main.jsx`:

```javascript
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch(err => console.warn('SW registration failed:', err))
  })
}
```

### 6.4 Data Update Notification in React

Add a listener in `App.jsx` for the service worker's `DATA_UPDATED` message:

```javascript
const [dataUpdateAvailable, setDataUpdateAvailable] = useState(false)

useEffect(() => {
  if (!('serviceWorker' in navigator)) return

  const handler = (event) => {
    if (event.data?.type === 'DATA_UPDATED') {
      setDataUpdateAvailable(true)
    }
  }

  navigator.serviceWorker.addEventListener('message', handler)
  return () => navigator.serviceWorker.removeEventListener('message', handler)
}, [])
```

Render a toast when `dataUpdateAvailable` is true:

```jsx
{dataUpdateAvailable && (
  <div className="update-toast">
    New event data available
    <button onClick={() => window.location.reload()}>Refresh</button>
  </div>
)}
```

### 6.5 Offline Indicator

Show a small indicator when the browser is offline so users understand they're seeing cached data:

```javascript
const [isOffline, setIsOffline] = useState(!navigator.onLine)

useEffect(() => {
  const goOffline = () => setIsOffline(true)
  const goOnline = () => setIsOffline(false)
  window.addEventListener('offline', goOffline)
  window.addEventListener('online', goOnline)
  return () => {
    window.removeEventListener('offline', goOffline)
    window.removeEventListener('online', goOnline)
  }
}, [])
```

Display as a subtle banner or badge (not a modal) at the top of the page:

```
┌─────────────────────────────────────────┐
│ 📡 Offline — showing cached events      │
└─────────────────────────────────────────┘
```

## 7. What Works Offline

After one successful visit with connectivity:

| Feature | Offline? | Notes |
|---|---|---|
| App shell (HTML/JS/CSS) | Yes | Precached on SW install |
| Calendar list sidebar | Yes | `manifest.json` cached |
| Selecting a calendar | Yes* | `.ics` files cached after first view |
| Event detail view | Yes* | Same — depends on the `.ics` being cached |
| Search (calendar names) | Yes | Fuse.js index built from `manifest.json` |
| Search (event content) | Yes | `events-index.json` cached |
| Happening Soon view | Yes | Uses `events-index.json` |
| Tag filtering | Yes | Uses `manifest.json` + `events-index.json` |
| Favorites (local) | Yes | `localStorage`, no network needed |
| Favorites (server sync) | No | Requires API connectivity |
| Subscribe/webcal links | No | Opens external calendar app, needs network |

*Individual `.ics` files are cached on first access (stale-while-revalidate), so calendars the user has never visited won't be available offline. See Section 8 for an optional eager-caching strategy.

## 8. Optional: Eager ICS Caching

By default, `.ics` files are only cached when the user visits a calendar. For a more complete offline experience, the service worker could proactively cache all `.ics` files listed in the manifest after the initial page load:

```javascript
// In SW, after install or on first DATA_UPDATED
async function eagerCacheIcsFiles() {
  const cache = await caches.open(DATA_CACHE)
  const manifestResponse = await cache.match('./manifest.json')
  if (!manifestResponse) return

  const manifest = await manifestResponse.json()
  const icsUrls = []

  manifest.rippers.forEach(ripper => {
    ripper.calendars.forEach(cal => icsUrls.push(cal.icsUrl))
  })
  manifest.externalCalendars?.forEach(cal => icsUrls.push(cal.icsUrl))
  manifest.recurringCalendars?.forEach(cal => icsUrls.push(cal.icsUrl))
  manifest.tags?.forEach(tag => icsUrls.push(`tag-${tag.toLowerCase()}.ics`))

  // Fetch in batches to avoid overwhelming the network
  const BATCH_SIZE = 10
  for (let i = 0; i < icsUrls.length; i += BATCH_SIZE) {
    const batch = icsUrls.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(
      batch.map(url => cache.add(new Request('./' + url)))
    )
  }
}
```

**Trade-off**: This downloads all `.ics` files (~1-5 MB total depending on number of sources) on first visit. Acceptable on broadband/Wi-Fi, potentially expensive on metered mobile connections. Should be gated behind a check:

```javascript
// Only eager-cache on non-metered connections
if (navigator.connection && !navigator.connection.saveData) {
  eagerCacheIcsFiles()
}
```

**Recommendation**: Start *without* eager caching (lazy stale-while-revalidate only). Add it later if users report that offline coverage is insufficient. The lazy approach already covers the user's commonly-visited calendars.

## 9. Cache Size and Lifecycle

### Size Estimates

| Asset | Approximate Size |
|---|---|
| App shell (HTML + JS + CSS) | ~200-400 KB |
| `manifest.json` | ~10-20 KB |
| `events-index.json` | ~200-500 KB |
| Individual `.ics` files (all) | ~1-5 MB total |

**Total with lazy caching**: ~500 KB - 1 MB (just shell + JSON + visited ICS files)
**Total with eager caching**: ~2-6 MB

Both are well within reasonable bounds for a PWA. For reference, most news sites cache 10-50 MB.

### Cache Expiration

The `data-v1` cache does not need TTL-based expiration because:

- Data is replaced on every successful fetch (stale-while-revalidate)
- The app shell cache is version-keyed and old versions are deleted on SW activation
- ICS files that no longer exist in the manifest could accumulate. A periodic cleanup can remove ICS cache entries not referenced by the current manifest:

```javascript
// On activate or periodically
async function pruneStaleIcsCache() {
  const cache = await caches.open(DATA_CACHE)
  const manifestResponse = await cache.match('./manifest.json')
  if (!manifestResponse) return

  const manifest = await manifestResponse.json()
  const validIcsUrls = new Set()

  manifest.rippers.forEach(r => r.calendars.forEach(c => validIcsUrls.add(c.icsUrl)))
  manifest.externalCalendars?.forEach(c => validIcsUrls.add(c.icsUrl))
  manifest.recurringCalendars?.forEach(c => validIcsUrls.add(c.icsUrl))

  const keys = await cache.keys()
  for (const request of keys) {
    const url = new URL(request.url)
    if (url.pathname.endsWith('.ics') && !validIcsUrls.has(url.pathname.split('/').pop())) {
      await cache.delete(request)
    }
  }
}
```

## 10. Testing

### Manual Testing Checklist

1. Visit the site with network connectivity — verify SW installs (check DevTools > Application > Service Workers)
2. Navigate to a few calendars — verify `.ics` files appear in DevTools > Application > Cache Storage > `data-v1`
3. Go offline (DevTools > Network > Offline checkbox) — verify:
   - App loads
   - Calendar sidebar populates
   - Previously-visited calendar events display
   - Search works (both calendar name and event content)
   - Happening Soon view shows events
   - Unvisited calendars show an appropriate offline message
4. Come back online — verify the update toast appears if data has changed
5. Click "Refresh" on the toast — verify fresh data loads
6. Clear site data (DevTools > Application > Clear storage) — verify first visit still works normally

### Automated Tests

- Unit test the service worker routing logic (which requests match which strategy)
- Unit test the `inject-sw-assets.mjs` script (correctly reads Vite manifest, produces valid URL list)
- Integration test (Playwright or similar): visit page, go offline, verify key interactions still work
- Test that the SW does not intercept cross-origin requests (analytics, API calls)

## 11. Interaction with Existing Features

### Favorites API (from personalized ICS design)

The favorites API (`VITE_FAVORITES_API_URL`) requires network connectivity. Offline behavior:

- `toggleFavorite()` updates `localStorage` immediately (works offline)
- The fire-and-forget API call will silently fail (existing `catch(() => {})`)
- On next online visit, `GET /auth/me` and `GET /favorites` re-sync from the server
- No changes needed to the favorites implementation — its existing error handling is sufficient

### GoatCounter Analytics

The analytics script loads from `gc.zgo.at`, a third-party domain. The service worker should **not** cache or intercept this — it will simply fail silently offline, which is fine (analytics for offline sessions aren't meaningful).

### URL Hash State

URL hash-based routing (`#tag=Music&calendar=stoup_brewing-all-events`) is client-side only and works offline without changes.

## 12. PWA Manifest (Optional Enhancement)

While not strictly required for offline caching, adding a Web App Manifest enables "Add to Home Screen" on mobile, which pairs naturally with offline support:

```json
// web/public/manifest.webmanifest
{
  "name": "Seattle Community Calendars",
  "short_name": "SEA Calendars",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#1a1a2e",
  "icons": [
    { "src": "./icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "./icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Add `<link rel="manifest" href="./manifest.webmanifest">` to `web/index.html`.

**Recommendation**: Include this in the implementation since it's low effort and significantly improves the mobile experience alongside offline mode. Icons can be generated from the existing site branding.

## 13. Rollout

### Phase 1: Core Service Worker + App Shell Caching
- Create `sw.js` with app shell precaching and `data-v1` stale-while-revalidate
- Create `inject-sw-assets.mjs` build script
- Register SW in `main.jsx`
- Add offline indicator to `App.jsx`
- Add data update toast to `App.jsx`

### Phase 2: ICS File Caching
- Add `.ics` URL matching to the SW fetch handler (already part of Phase 1 design, but test separately)
- Handle the "calendar not cached" case gracefully — show message like "This calendar isn't available offline yet. Connect to the internet and visit it once to cache it."

### Phase 3: PWA Manifest + Polish
- Add `manifest.webmanifest` and icons
- Add `<meta name="theme-color">` and Apple-specific meta tags
- Test "Add to Home Screen" on iOS and Android
- Tune the update toast styling and behavior

### Phase 4: Optional Eager Caching
- Implement eager ICS caching behind connection-type check
- Implement stale ICS cache pruning
- Monitor cache sizes in the wild

## 14. Implementation Task List

- [ ] Create `web/public/sw.js` with install/activate/fetch handlers
- [ ] Create `scripts/inject-sw-assets.mjs` to inject Vite build assets into SW
- [ ] Update `web:build` script in `package.json` to run the inject script
- [ ] Register service worker in `web/src/main.jsx`
- [ ] Add offline state detection (`navigator.onLine` + events) to `App.jsx`
- [ ] Add offline indicator banner to the UI
- [ ] Add `DATA_UPDATED` message listener and update toast to `App.jsx`
- [ ] Handle "calendar not cached" state in the events loading error path
- [ ] Create `web/public/manifest.webmanifest`
- [ ] Add manifest link and PWA meta tags to `web/index.html`
- [ ] Add SW routing unit tests
- [ ] Add `inject-sw-assets.mjs` unit test
- [ ] Manual QA pass through the testing checklist (Section 10)

## 15. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| SW caching bug serves stale JS indefinitely | Version the app shell cache (`app-shell-v{N}`); increment on each deploy. Users on broken versions self-heal on SW update. Include a "hard refresh" hint in the footer. |
| `events-index.json` grows too large to cache efficiently | Already tracked with a size warning in the build (500 KB threshold). If it exceeds ~2 MB, consider splitting into daily chunks or switching to Pagefind. |
| GitHub Pages sets short `max-age` (600s), causing the SW's revalidation fetch to hit the CDN cache | This is fine — the SW's revalidation check will get the CDN-cached version, which is fresh enough since data only changes daily. The important part is that the *browser* gets the response from the SW cache instantly. |
| Users don't realize they're seeing stale data | The offline indicator and update toast both address this. The offline banner clarifies data is cached; the update toast offers a one-click refresh. |
| Service worker scope issues with GitHub Pages subdirectory deployment (`/calendar-ripper/`) | Place `sw.js` at the root of the built output. Vite's `base: './'` config ensures relative paths work. The SW scope will be the deployment directory. |

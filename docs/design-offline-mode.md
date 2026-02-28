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
| `app-shell-v{HASH}` | HTML, JS, CSS, favicon | **Cache-first**, updated on SW activation | Versioned automatically — `{HASH}` is a short hash of the Vite build manifest, injected by the `inject-sw-assets.mjs` script at build time. Since Vite hashes every asset filename, any code change produces a new manifest hash, which gives the SW a new cache name and triggers the install → activate → cleanup cycle. |
| `data-v1` | `manifest.json`, `events-index.json`, `*.ics` | **Stale-while-revalidate** | Data changes daily; serve cached instantly, refresh in background |

### 5.3 Service Worker Lifecycle

```
Install
  ├── Precache app shell (index.html, JS/CSS bundles)
  │    (Use Vite's build manifest to enumerate hashed asset filenames)
  └── Precache critical data files (manifest.json, events-index.json) into `data-v1`
       so search, Happening Soon, and the sidebar work offline even if the user
       navigates away before these fetches complete on first visit

Activate
  └── Delete old `app-shell-v{HASH}` caches
  └── clients.claim() so the new SW controls the page immediately

Fetch (intercept)
  ├── App shell assets (HTML, JS, CSS)  → Cache-first from `app-shell-v{HASH}`
  ├── manifest.json                     → Stale-while-revalidate from `data-v1`
  ├── events-index.json                 → Stale-while-revalidate from `data-v1`
  ├── *.ics                             → Stale-while-revalidate from `data-v1`
  └── Everything else                   → Network-only (analytics, external APIs)
```

### 5.4 Freshness Signaling

When the stale-while-revalidate background fetch completes and the response has a different `ETag` than the cached version, the service worker posts a message to the client:

```
Service Worker ──postMessage({ type: 'DATA_UPDATED' })──▶ App
```

The app can then show a subtle, non-intrusive toast: **"Updated event data available — reload to see latest"** with a reload button. This avoids silently replacing data under the user while they're reading it.

## 6. Implementation Details

### 6.1 Service Worker File: `web/src/sw.js`

The service worker is a plain JS file (not bundled by Vite) that lives in `web/src/sw.js`. A small custom Vite plugin copies it to the build output root during the build. It needs to be at the root of the output to control the full scope.

> **Note:** The project sets `publicDir: '../output'` in `vite.config.js` (so generated calendar data is available to the dev server), which means the conventional `web/public/` directory is not used. A Vite plugin handles the copy instead:
>
> ```javascript
> // in vite.config.js plugins array
> {
>   name: 'copy-service-worker',
>   writeBundle() {
>     copyFileSync('src/sw.js', '../output/sw.js')
>   }
> }
> ```

```javascript
// sw.js (conceptual outline)
const APP_SHELL_CACHE = 'app-shell-v/* __APP_SHELL_HASH__ */'
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

// Critical data files to precache alongside the app shell so that
// search, Happening Soon, and the sidebar work offline from the first visit
const PRECACHE_DATA_URLS = ['./manifest.json', './events-index.json']

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(APP_SHELL_CACHE).then(cache => cache.addAll(APP_SHELL_URLS)),
      caches.open(DATA_CACHE).then(cache => cache.addAll(PRECACHE_DATA_URLS)),
    ]).then(() => self.skipWaiting())
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
      // Only notify clients if the data actually changed (compare ETag)
      const oldEtag = cachedResponse?.headers.get('etag')
      const newEtag = response.headers.get('etag')
      cache.put(request, response.clone())
      if (oldEtag && newEtag && oldEtag !== newEtag) {
        notifyClients({ type: 'DATA_UPDATED' })
      }
    }
    return response
  }).catch(() => cachedResponse) // Network failure: fall back to cache silently

  return cachedResponse || fetchPromise
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch (err) {
    // Both cache miss and network failure — return an offline fallback page
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    })
  }
}

// Minimal offline page shown when the app shell isn't cached and the network is down
const OFFLINE_HTML = `<!DOCTYPE html>
<html><head><title>Offline</title></head>
<body style="font-family:sans-serif;text-align:center;padding:4rem">
  <h1>You're offline</h1>
  <p>Seattle Community Calendars needs a network connection for the first visit.
     Please reconnect and reload.</p>
</body></html>`
```

### 6.2 Build Integration

Vite hashes JS/CSS filenames (e.g., `assets/App-a1b2c3d4.js`). The service worker needs to know these filenames for precaching.

**Prerequisite:** Enable Vite's build manifest by adding `manifest: true` to `vite.config.js`:

```javascript
build: {
  outDir: '../output',
  manifest: true,   // Writes .vite/manifest.json with hashed asset filenames
}
```

Two options for consuming it:

**Option A: Vite plugin that injects the manifest (recommended)**

Use `vite-plugin-pwa` or a small custom plugin that reads Vite's build manifest after bundling and writes the asset list into `sw.js`.

**Option B: Simple post-build script**

A Node script that runs after `vite build`, reads `output/.vite/manifest.json`, and injects the asset URLs into `sw.js` via string replacement.

Option B is recommended for this project — it avoids adding `vite-plugin-pwa` (which brings Workbox and significant configuration surface) and keeps the service worker simple and readable.

```javascript
// scripts/inject-sw-assets.mjs
import { readFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'

const manifestRaw = readFileSync('output/.vite/manifest.json', 'utf-8')
const manifest = JSON.parse(manifestRaw)
const assets = Object.values(manifest).map(entry => './' + entry.file)
// Include CSS files referenced by entries
Object.values(manifest).forEach(entry => {
  if (entry.css) assets.push(...entry.css.map(f => './' + f))
})
assets.push('./index.html')

// Derive a short hash from the build manifest for cache versioning
const manifestHash = createHash('sha256').update(manifestRaw).digest('hex').slice(0, 8)

let sw = readFileSync('output/sw.js', 'utf-8')
sw = sw.replace('/* __APP_SHELL_URLS__ */', JSON.stringify([...new Set(assets)]))
sw = sw.replace('/* __APP_SHELL_HASH__ */', manifestHash)
writeFileSync('output/sw.js', sw)
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
// Eager-cache by default; skip only on explicitly metered connections.
// navigator.connection is Chromium-only (not available in Safari/Firefox),
// so we default to eager caching when the API is absent.
const saveData = navigator.connection?.saveData ?? false
if (!saveData) {
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
// web/src/manifest.webmanifest (copied to output root by the Vite plugin)
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

- [ ] Add `manifest: true` to `build` config in `web/vite.config.js`
- [ ] Add `copy-service-worker` Vite plugin to `web/vite.config.js`
- [ ] Create `web/src/sw.js` with install/activate/fetch handlers (including offline fallback page)
- [ ] Create `scripts/inject-sw-assets.mjs` to inject Vite build assets and cache hash into SW
- [ ] Update `web:build` script in `package.json` to run the inject script
- [ ] Register service worker in `web/src/main.jsx`
- [ ] Add offline state detection (`navigator.onLine` + events) to `App.jsx`
- [ ] Add offline indicator banner to the UI
- [ ] Add `DATA_UPDATED` message listener and update toast to `App.jsx`
- [ ] Handle "calendar not cached" state in the events loading error path
- [ ] Create `web/src/manifest.webmanifest` (copied to output by the Vite plugin)
- [ ] Add manifest link and PWA meta tags to `web/index.html`
- [ ] Add SW routing unit tests
- [ ] Add `inject-sw-assets.mjs` unit test
- [ ] Manual QA pass through the testing checklist (Section 10)

## 15. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| SW caching bug serves stale JS indefinitely | Version the app shell cache automatically (`app-shell-v{HASH}` derived from the Vite build manifest); each deploy with code changes gets a new cache name. Users on broken versions self-heal on SW update. Include a "hard refresh" hint in the footer. |
| `events-index.json` grows too large to cache efficiently | Already tracked with a size warning in the build (500 KB threshold). If it exceeds ~2 MB, consider splitting into daily chunks or switching to Pagefind. |
| GitHub Pages sets short `max-age` (600s), causing the SW's revalidation fetch to hit the CDN cache | This is fine — the SW's revalidation check will get the CDN-cached version, which is fresh enough since data only changes daily. The important part is that the *browser* gets the response from the SW cache instantly. |
| Users don't realize they're seeing stale data | The offline indicator and update toast both address this. The offline banner clarifies data is cached; the update toast offers a one-click refresh. |
| Service worker scope issues with GitHub Pages subdirectory deployment (`/calendar-ripper/`) | The `copy-service-worker` Vite plugin places `sw.js` at the root of the built output. Vite's `base: './'` config ensures relative paths work. The SW scope will be the deployment directory. |

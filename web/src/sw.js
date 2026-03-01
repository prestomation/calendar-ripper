// Service Worker for Seattle Community Calendars
// Provides offline support via cache-first (app shell) and stale-while-revalidate (data)

const APP_SHELL_CACHE = 'app-shell-v/* __APP_SHELL_HASH__ */'
const DATA_CACHE = 'data-v1'

// Populated at build time by scripts/inject-sw-assets.mjs
const APP_SHELL_URLS = /* __APP_SHELL_URLS__ */[]

const DATA_URL_PATTERNS = [
  /manifest\.json$/,
  /events-index\.json$/,
  /\.ics$/,
]

// Critical data files precached on install so sidebar, search, and Happening Soon
// work offline from the very first visit
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

  // Only handle GET requests
  if (event.request.method !== 'GET') return

  // Data files: stale-while-revalidate
  if (DATA_URL_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(staleWhileRevalidate(event.request, DATA_CACHE))
    return
  }

  // App shell: cache-first (navigations and static assets)
  if (event.request.mode === 'navigate' || isAppShellAsset(url)) {
    event.respondWith(cacheFirst(event.request, APP_SHELL_CACHE))
    return
  }
})

function isAppShellAsset(url) {
  const path = url.pathname
  return path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.html') ||
    path.endsWith('.ico') ||
    path.endsWith('.png') ||
    path.endsWith('.svg') ||
    path.endsWith('.webmanifest')
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cachedResponse = await cache.match(request)

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      const oldEtag = cachedResponse?.headers.get('etag')
      const newEtag = response.headers.get('etag')
      cache.put(request, response.clone())
      if (oldEtag && newEtag && oldEtag !== newEtag) {
        notifyClients({ type: 'DATA_UPDATED' })
      }
    }
    return response
  }).catch(() => {
    if (cachedResponse) return cachedResponse
    return new Response('Offline and no cached data available', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    })
  })

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
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    })
  }
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window' })
  clients.forEach(client => client.postMessage(message))
}

const OFFLINE_HTML = `<!DOCTYPE html>
<html><head><title>Offline</title></head>
<body style="font-family:sans-serif;text-align:center;padding:4rem">
  <h1>You're offline</h1>
  <p>Seattle Community Calendars needs a network connection for the first visit.
     Please reconnect and reload.</p>
</body></html>`

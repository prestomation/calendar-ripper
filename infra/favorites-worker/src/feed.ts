import { Hono } from 'hono'
import type { Env, FeedTokenRecord, FavoritesRecord, EventsIndexEntry, GeoFilter } from './types.js'
import { mergeIcsFiles } from './ics-merge.js'
import { fetchEventsIndex, fetchAllIcs, searchEventsIndex, extractMatchingVEvents } from './event-search.js'
import { deduplicateEvents } from './event-dedup.js'
import { emitFeedMetrics } from './analytics.js'

// Keep in sync with web/src/lib/haversine.js (client-side copy)
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  // Clamp 'a' to [0, 1] to guard against floating-point rounding errors that
  // could produce values slightly outside this range, which would cause NaN
  // or Infinity in the sqrt/atan2 calculation.
  const aClamped = Math.min(1, Math.max(0, a))
  return R * 2 * Math.atan2(Math.sqrt(aClamped), Math.sqrt(1 - aClamped))
}

function eventMatchesGeoFilters(event: EventsIndexEntry, geoFilters: GeoFilter[]): boolean {
  if (geoFilters.length === 0) return true
  if (event.lat == null || event.lng == null) return true // no coords = pass through (don't exclude due to geocoding failures)
  const eventLat = event.lat
  const eventLng = event.lng
  return geoFilters.some(f => haversineKm(f.lat, f.lng, eventLat, eventLng) <= f.radiusKm)
}

export const feedRoutes = new Hono<{ Bindings: Env }>()

feedRoutes.get('/:filename', async (c) => {
  const filename = c.req.param('filename')
  if (!filename.endsWith('.ics')) return c.text('Not found', 404)
  const token = filename.slice(0, -4)

  const tokenRaw = await c.env.FEED_TOKENS.get(token)
  if (!tokenRaw) return c.text('Not found', 404)

  let tokenRecord: FeedTokenRecord
  try {
    tokenRecord = JSON.parse(tokenRaw) as FeedTokenRecord
  } catch {
    return c.text('Not found', 404)
  }

  const favRaw = await c.env.FAVORITES.get(tokenRecord.userId)
  let favorites: FavoritesRecord
  if (favRaw) {
    try {
      const parsed = JSON.parse(favRaw)
      favorites = { ...parsed, searchFilters: parsed.searchFilters || [], geoFilters: parsed.geoFilters || [] }
    } catch {
      favorites = { icsUrls: [], searchFilters: [], geoFilters: [], updatedAt: new Date().toISOString() }
    }
  } else {
    favorites = { icsUrls: [], searchFilters: [], geoFilters: [], updatedAt: new Date().toISOString() }
  }

  const searchFilters = favorites.searchFilters
  const geoFilters = favorites.geoFilters
  const hasIcsFavorites = favorites.icsUrls.length > 0
  const hasSearchFilters = searchFilters.length > 0
  const hasGeoFilters = geoFilters.length > 0

  if (!hasIcsFavorites && !hasSearchFilters && !hasGeoFilters) {
    const emptyIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//206.events//Favorites//EN',
      'X-WR-CALNAME:206.events — Favorites',
      'END:VCALENDAR',
    ].join('\r\n')

    await emitFeedMetrics(c.env, {
      userId: tokenRecord.userId,
      totalEvents: 0,
      dedupedCount: 0,
      finalEvents: 0,
      hasFavorites: false,
      hasGeoFilter: false,
      hasSearchFilter: false,
      geoFilterCount: 0,
      searchFilterCount: 0,
      favoritesCount: 0,
    })

    return new Response(emptyIcs, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }

  const baseUrl = c.env.GITHUB_PAGES_BASE_URL

  // Determine which ICS urls to actually fetch (may be narrowed by dedup)
  let icsUrlsToFetch = favorites.icsUrls

  // Analytics tracking variables (set inside try block below)
  let totalEvents = 0
  let dedupedCount = 0

  // Search for events matching search filters and/or geo filters
  let searchMatchedVEvents: string[] = []
  if (hasSearchFilters || hasGeoFilters || hasIcsFavorites) {
    try {
      const eventsIndex = await fetchEventsIndex(baseUrl)

      // Collect all events-index entries that would appear in this feed.
      // Favorited events are always included in full — users explicitly selected
      // those calendars, so geo filters must NOT exclude them.
      const favoritedIndexEvents: EventsIndexEntry[] = hasIcsFavorites
        ? eventsIndex.filter(e => favorites.icsUrls.includes(e.icsUrl))
        : []

      // Exclude events from favorited calendars — they are already covered by
      // favoritedIndexEvents above, so including them here too would cause the
      // same event to appear twice in combinedEvents, making the dedup algorithm
      // treat an event as a duplicate of itself and corrupt dedupedSources.
      const favoritedIcsUrls = new Set(favorites.icsUrls)
      const geoFilteredIndex = (hasSearchFilters || hasGeoFilters)
        ? eventsIndex.filter(e => eventMatchesGeoFilters(e, geoFilters) && !favoritedIcsUrls.has(e.icsUrl))
        : []

      // Combine all candidate events and deduplicate.
      // Favorited events lead so they win ties over geo-only events.
      const combinedEvents = [...favoritedIndexEvents, ...geoFilteredIndex]
      totalEvents = combinedEvents.length
      const deduped = deduplicateEvents(combinedEvents)
      dedupedCount = totalEvents - deduped.length

      // Always fetch ALL favorited ICS files — dedup removes duplicate VEVENTs in
      // the search/geo output path, but we still need the full ICS content from
      // each favorited calendar. A calendar may contain events not in the
      // events-index at all, and users explicitly chose these calendars so they
      // should appear regardless of geo location.
      // icsUrlsToFetch remains favorites.icsUrls (set above, unchanged).

      // For search/geo path: build matchingKeys from surviving deduped entries
      if (hasSearchFilters || hasGeoFilters) {
        const allIcs = await fetchAllIcs(baseUrl)

        // Filter deduped entries to those from the geo/search pool only.
        // Explicitly exclude favorited calendar entries — those are served via
        // icsContents (full ICS fetch) and must not also appear in
        // searchMatchedVEvents, otherwise the same event would be counted twice
        // in finalEvents.
        const survivingGeoEntries = deduped.filter(e => {
          return eventMatchesGeoFilters(e, geoFilters) && !favoritedIcsUrls.has(e.icsUrl)
        })

        let matchingKeys: Set<string>
        if (hasSearchFilters) {
          matchingKeys = searchEventsIndex(survivingGeoEntries, searchFilters)
        } else {
          // Geo-only: include all surviving geo-matched events
          matchingKeys = new Set(survivingGeoEntries.map(e => e.summary + '|' + e.date))
        }

        searchMatchedVEvents = extractMatchingVEvents(allIcs, matchingKeys)
      }
    } catch {
      // If events-index fetch fails, fall through to plain ICS favorites fetch
      // (dedup is a best-effort enhancement; don't break the feed)
    }
  }

  const icsContents: string[] = []

  // Fetch favorited calendar ICS files (using dedup-filtered url list)
  if (hasIcsFavorites) {
    const fetches = icsUrlsToFetch.map(async (icsUrl) => {
      try {
        // Validate URL is a safe relative .ics path (no protocol, no traversal)
        if (!icsUrl.endsWith('.ics') || icsUrl.includes('://') || icsUrl.includes('..')) {
          return
        }
        const res = await fetch(`${baseUrl}/${icsUrl}`)
        if (res.ok) {
          icsContents.push(await res.text())
        }
      } catch {
        // Skip failed fetches
      }
    })
    await Promise.all(fetches)
  }

  const merged = mergeIcsFiles(icsContents, searchMatchedVEvents)

  // Count final VEVENTs in merged output (approximate by dedupedEvents)
  // searchMatchedVEvents are individual VEVENT strings; icsContents are full ICS files.
  // Use string splitting instead of regex to avoid unbounded backtracking on large ICS files.
  const finalEvents = searchMatchedVEvents.length + icsContents.reduce((acc, ics) => {
    return acc + ics.split('BEGIN:VEVENT').length - 1
  }, 0)

  await emitFeedMetrics(c.env, {
    userId: tokenRecord.userId,
    totalEvents,
    dedupedCount,
    finalEvents,
    hasFavorites: hasIcsFavorites,
    hasGeoFilter: hasGeoFilters,
    hasSearchFilter: hasSearchFilters,
    geoFilterCount: geoFilters.length,
    searchFilterCount: searchFilters.length,
    favoritesCount: favorites.icsUrls.length,
  })

  return new Response(merged, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

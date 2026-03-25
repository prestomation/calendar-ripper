import { Hono } from 'hono'
import type { Env, FeedTokenRecord, FavoritesRecord, EventsIndexEntry, GeoFilter } from './types.js'
import { mergeIcsFiles } from './ics-merge.js'
import { fetchEventsIndex, fetchAllIcs, searchEventsIndex, extractMatchingVEvents } from './event-search.js'

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function eventMatchesGeoFilters(event: EventsIndexEntry, geoFilters: GeoFilter[]): boolean {
  if (geoFilters.length === 0) return true
  if (event.lat == null || event.lng == null) return false // no coords = exclude from geo-filtered results
  return geoFilters.some(f => haversineKm(f.lat, f.lng, event.lat!, event.lng!) <= f.radiusKm)
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
      'PRODID:-//Calendar Ripper//Favorites//EN',
      'X-WR-CALNAME:Seattle Calendar Ripper — Favorites',
      'END:VCALENDAR',
    ].join('\r\n')

    return new Response(emptyIcs, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }

  const baseUrl = c.env.GITHUB_PAGES_BASE_URL
  const icsContents: string[] = []

  // Fetch favorited calendar ICS files
  if (hasIcsFavorites) {
    const fetches = favorites.icsUrls.map(async (icsUrl) => {
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

  // Search for events matching search filters and/or geo filters
  let searchMatchedVEvents: string[] = []
  if (hasSearchFilters || hasGeoFilters) {
    try {
      const [eventsIndex, allIcs] = await Promise.all([
        fetchEventsIndex(baseUrl),
        fetchAllIcs(baseUrl),
      ])
      // Apply geo filter first, then text search
      const geoFilteredIndex = eventsIndex.filter(e => eventMatchesGeoFilters(e, geoFilters))
      let matchingKeys: Set<string>
      if (hasSearchFilters) {
        matchingKeys = searchEventsIndex(geoFilteredIndex, searchFilters)
      } else {
        // Geo-only: include all geo-matched events
        matchingKeys = new Set(geoFilteredIndex.map(e => e.summary + '|' + e.date))
      }
      searchMatchedVEvents = extractMatchingVEvents(allIcs, matchingKeys)
    } catch {
      // If search data fetch fails, continue with just favorites
    }
  }

  const merged = mergeIcsFiles(icsContents, searchMatchedVEvents)

  return new Response(merged, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

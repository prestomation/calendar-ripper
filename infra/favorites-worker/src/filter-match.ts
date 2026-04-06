import Fuse from 'fuse.js'
import type { EventsIndexEntry, GeoFilter, FavoritesRecord } from './types.js'

const FUSE_THRESHOLD = 0.1

// Keep in sync with web/src/lib/haversine.js (client-side copy)
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  // Clamp 'a' to [0, 1] to guard against floating-point rounding errors
  const aClamped = Math.min(1, Math.max(0, a))
  return R * 2 * Math.atan2(Math.sqrt(aClamped), Math.sqrt(1 - aClamped))
}

export function eventMatchesGeoFilters(event: EventsIndexEntry, geoFilters: GeoFilter[]): boolean {
  if (geoFilters.length === 0) return true
  if (event.lat == null || event.lng == null) return true // no coords = pass through
  const eventLat = event.lat
  const eventLng = event.lng
  return geoFilters.some(f => haversineKm(f.lat, f.lng, eventLat, eventLng) <= f.radiusKm)
}

export function eventMatchesSearchFilters(event: EventsIndexEntry, searchFilters: string[]): boolean {
  if (searchFilters.length === 0) return true
  const fuse = new Fuse([event], {
    keys: ['summary', 'description', 'location'],
    threshold: FUSE_THRESHOLD,
  })
  return searchFilters.some(filter => fuse.search(filter).length > 0)
}

export function searchEventsIndex(
  eventsIndex: EventsIndexEntry[],
  searchFilters: string[]
): Set<string> {
  const fuse = new Fuse(eventsIndex, {
    keys: ['summary', 'description', 'location'],
    threshold: FUSE_THRESHOLD,
  })

  const matchingKeys = new Set<string>()
  for (const filter of searchFilters) {
    const results = fuse.search(filter)
    for (const result of results) {
      matchingKeys.add(result.item.summary + '|' + result.item.date)
    }
  }
  return matchingKeys
}

export interface MatchResult {
  matchedEvents: EventsIndexEntry[]
  matchedByFavorites: EventsIndexEntry[]
  matchedBySearch: EventsIndexEntry[]
  matchedByGeo: EventsIndexEntry[]
}

/**
 * Match new events against a user's favorites, search filters, and geo filters.
 * Returns all events that match at least one of the user's preferences.
 */
export function matchEventsForUser(
  events: EventsIndexEntry[],
  favorites: FavoritesRecord
): MatchResult {
  const hasIcsFavorites = favorites.icsUrls.length > 0
  const hasSearchFilters = favorites.searchFilters.length > 0
  const hasGeoFilters = favorites.geoFilters.length > 0

  if (!hasIcsFavorites && !hasSearchFilters && !hasGeoFilters) {
    return { matchedEvents: [], matchedByFavorites: [], matchedBySearch: [], matchedByGeo: [] }
  }

  const favoritesSet = new Set(favorites.icsUrls)
  const matchedByFavorites: EventsIndexEntry[] = []
  const matchedBySearch: EventsIndexEntry[] = []
  const matchedByGeo: EventsIndexEntry[] = []
  const matchedEventsSet = new Set<string>()

  // Build Fuse index once for all search filters
  let fuse: Fuse<EventsIndexEntry> | null = null
  let searchMatchKeys: Set<string> | null = null
  if (hasSearchFilters) {
    fuse = new Fuse(events, {
      keys: ['summary', 'description', 'location'],
      threshold: FUSE_THRESHOLD,
    })
    searchMatchKeys = new Set<string>()
    for (const filter of favorites.searchFilters) {
      const results = fuse.search(filter)
      for (const result of results) {
        searchMatchKeys.add(result.item.summary + '|' + result.item.date)
      }
    }
  }

  for (const event of events) {
    const eventKey = event.summary + '|' + event.date

    // Check favorites match
    if (hasIcsFavorites && favoritesSet.has(event.icsUrl)) {
      matchedByFavorites.push(event)
      matchedEventsSet.add(eventKey)
      continue
    }

    // Check search filter match
    if (searchMatchKeys?.has(eventKey)) {
      matchedBySearch.push(event)
      matchedEventsSet.add(eventKey)
      continue
    }

    // Check geo filter match (only for events not already matched)
    if (hasGeoFilters && event.lat != null && event.lng != null) {
      if (favorites.geoFilters.some(f => haversineKm(f.lat, f.lng, event.lat!, event.lng!) <= f.radiusKm)) {
        matchedByGeo.push(event)
        matchedEventsSet.add(eventKey)
      }
    }
  }

  const matchedEvents = [...matchedByFavorites, ...matchedBySearch, ...matchedByGeo]
  return { matchedEvents, matchedByFavorites, matchedBySearch, matchedByGeo }
}

/**
 * Build the notification payload based on the number of matched events.
 */
export function buildNotificationPayload(matchedEvents: EventsIndexEntry[]): {
  title: string
  body: string
  data: { url: string }
} {
  const count = matchedEvents.length
  const siteUrl = '/'

  if (count === 1) {
    const event = matchedEvents[0]
    const dateStr = new Date(event.date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
    })
    const timeStr = new Date(event.date).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit',
    })
    return {
      title: `New event: ${event.summary}`,
      body: `${dateStr} at ${timeStr}${event.location ? ` - ${event.location}` : ''}`,
      data: { url: siteUrl },
    }
  }

  if (count <= 3) {
    const names = matchedEvents.map(e => e.summary)
    const body = count === 2
      ? `${names[0]} and ${names[1]}`
      : `${names[0]}, ${names[1]}, and ${count - 2} more`
    return {
      title: `${count} new events on your calendar`,
      body,
      data: { url: siteUrl },
    }
  }

  return {
    title: `${count} new events on your calendar`,
    body: 'Tap to see what\'s new',
    data: { url: siteUrl },
  }
}

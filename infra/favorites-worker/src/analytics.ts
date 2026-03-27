import type { Env } from './types.js'

export interface FeedMetrics {
  userId: string
  totalEvents: number
  dedupedCount: number
  finalEvents: number
  hasFavorites: boolean
  hasGeoFilter: boolean
  hasSearchFilter: boolean
  geoFilterCount: number
  searchFilterCount: number
  favoritesCount: number
}

/** Hash a string to a short hex string (for userId anonymization) */
async function shortHash(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

export function feedType(hasFav: boolean, hasGeo: boolean, hasSearch: boolean): string {
  const count = [hasFav, hasGeo, hasSearch].filter(Boolean).length
  if (count === 0) return 'empty'
  if (count > 1) return 'mixed'
  if (hasFav) return 'favorites-only'
  if (hasGeo) return 'geo-only'
  return 'search-only'
}

export async function emitFeedMetrics(env: Env, metrics: FeedMetrics): Promise<void> {
  if (!env.ANALYTICS) return // graceful no-op if not configured

  const userHash = await shortHash(metrics.userId)
  const dedupRatePct = metrics.totalEvents > 0
    ? (metrics.dedupedCount / metrics.totalEvents) * 100
    : 0

  env.ANALYTICS.writeDataPoint({
    doubles: [
      metrics.totalEvents,
      metrics.dedupedCount,
      metrics.finalEvents,
      dedupRatePct,
      metrics.hasFavorites ? 1 : 0,
      metrics.hasGeoFilter ? 1 : 0,
      metrics.hasSearchFilter ? 1 : 0,
      metrics.geoFilterCount,
      metrics.searchFilterCount,
      metrics.favoritesCount,
    ],
    blobs: [
      userHash,
      feedType(metrics.hasFavorites, metrics.hasGeoFilter, metrics.hasSearchFilter),
      metrics.dedupedCount > 0 ? 'dedup-active' : 'dedup-none',
    ],
  })
}

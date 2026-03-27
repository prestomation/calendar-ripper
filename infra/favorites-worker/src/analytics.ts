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

  try {
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
        metrics.userId,
        feedType(metrics.hasFavorites, metrics.hasGeoFilter, metrics.hasSearchFilter),
        metrics.dedupedCount > 0 ? 'dedup-active' : 'dedup-none',
      ],
    })
  } catch {
    // Analytics failures must never crash feed requests — swallow silently
  }
}

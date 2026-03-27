import { describe, it, expect, vi } from 'vitest'
import { emitFeedMetrics, feedType, type FeedMetrics } from '../src/analytics.js'
import type { Env } from '../src/types.js'

function makeEnv(writeDataPoint?: ReturnType<typeof vi.fn>): Env {
  return {
    USERS: {} as KVNamespace,
    FAVORITES: {} as KVNamespace,
    FEED_TOKENS: {} as KVNamespace,
    JWT_SECRET: 'secret',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    GITHUB_PAGES_BASE_URL: '',
    SITE_URL: '',
    ANALYTICS: writeDataPoint
      ? { writeDataPoint }
      : (undefined as unknown as Env['ANALYTICS']),
  }
}

const baseMetrics: FeedMetrics = {
  userId: 'user-123',
  totalEvents: 100,
  dedupedCount: 10,
  finalEvents: 90,
  hasFavorites: true,
  hasGeoFilter: false,
  hasSearchFilter: false,
  geoFilterCount: 0,
  searchFilterCount: 0,
  favoritesCount: 3,
}

describe('feedType', () => {
  it('returns empty when all false', () => {
    expect(feedType(false, false, false)).toBe('empty')
  })

  it('returns favorites-only', () => {
    expect(feedType(true, false, false)).toBe('favorites-only')
  })

  it('returns geo-only', () => {
    expect(feedType(false, true, false)).toBe('geo-only')
  })

  it('returns search-only', () => {
    expect(feedType(false, false, true)).toBe('search-only')
  })

  it('returns mixed for favorites + geo', () => {
    expect(feedType(true, true, false)).toBe('mixed')
  })

  it('returns mixed for geo + search', () => {
    expect(feedType(false, true, true)).toBe('mixed')
  })

  it('returns mixed for all three', () => {
    expect(feedType(true, true, true)).toBe('mixed')
  })
})

describe('emitFeedMetrics', () => {
  it('calls writeDataPoint with correct structure', async () => {
    const writeDataPoint = vi.fn()
    const env = makeEnv(writeDataPoint)

    await emitFeedMetrics(env, baseMetrics)

    expect(writeDataPoint).toHaveBeenCalledOnce()
    const call = writeDataPoint.mock.calls[0][0]

    // doubles array has 10 entries in the correct order
    expect(call.doubles).toHaveLength(10)
    expect(call.doubles[0]).toBe(100) // totalEvents
    expect(call.doubles[1]).toBe(10)  // dedupedCount
    expect(call.doubles[2]).toBe(90)  // finalEvents
    expect(call.doubles[3]).toBeCloseTo(10) // dedupRatePct = 10/100*100
    expect(call.doubles[4]).toBe(1)   // hasFavorites
    expect(call.doubles[5]).toBe(0)   // hasGeoFilter
    expect(call.doubles[6]).toBe(0)   // hasSearchFilter
    expect(call.doubles[7]).toBe(0)   // geoFilterCount
    expect(call.doubles[8]).toBe(0)   // searchFilterCount
    expect(call.doubles[9]).toBe(3)   // favoritesCount

    // blobs array has 3 entries
    expect(call.blobs).toHaveLength(3)
    expect(typeof call.blobs[0]).toBe('string')  // hashed userId
    expect(call.blobs[0]).toHaveLength(16)        // 16 hex chars
    expect(call.blobs[1]).toBe('favorites-only')
    expect(call.blobs[2]).toBe('dedup-active')
  })

  it('sets dedup-none when dedupedCount is 0', async () => {
    const writeDataPoint = vi.fn()
    const env = makeEnv(writeDataPoint)

    await emitFeedMetrics(env, { ...baseMetrics, dedupedCount: 0, finalEvents: 100 })

    const call = writeDataPoint.mock.calls[0][0]
    expect(call.blobs[2]).toBe('dedup-none')
  })

  it('computes dedupRatePct as 0 when totalEvents is 0', async () => {
    const writeDataPoint = vi.fn()
    const env = makeEnv(writeDataPoint)

    await emitFeedMetrics(env, { ...baseMetrics, totalEvents: 0, dedupedCount: 0, finalEvents: 0 })

    const call = writeDataPoint.mock.calls[0][0]
    expect(call.doubles[3]).toBe(0) // dedupRatePct zero-division guard
  })

  it('is a no-op when ANALYTICS is undefined', async () => {
    const env = makeEnv(undefined)
    // Should not throw
    await expect(emitFeedMetrics(env, baseMetrics)).resolves.toBeUndefined()
  })

  it('hashes userId consistently (same input = same hash)', async () => {
    const writeDataPoint = vi.fn()
    const env = makeEnv(writeDataPoint)

    await emitFeedMetrics(env, baseMetrics)
    await emitFeedMetrics(env, baseMetrics)

    const hash1 = writeDataPoint.mock.calls[0][0].blobs[0]
    const hash2 = writeDataPoint.mock.calls[1][0].blobs[0]
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(16)
  })

  it('produces different hashes for different userIds', async () => {
    const writeDataPoint = vi.fn()
    const env = makeEnv(writeDataPoint)

    await emitFeedMetrics(env, { ...baseMetrics, userId: 'user-aaa' })
    await emitFeedMetrics(env, { ...baseMetrics, userId: 'user-bbb' })

    const hash1 = writeDataPoint.mock.calls[0][0].blobs[0]
    const hash2 = writeDataPoint.mock.calls[1][0].blobs[0]
    expect(hash1).not.toBe(hash2)
  })

  it('sets feedType to mixed for favorites+geo', async () => {
    const writeDataPoint = vi.fn()
    const env = makeEnv(writeDataPoint)

    await emitFeedMetrics(env, {
      ...baseMetrics,
      hasFavorites: true,
      hasGeoFilter: true,
      hasSearchFilter: false,
    })

    expect(writeDataPoint.mock.calls[0][0].blobs[1]).toBe('mixed')
  })

  it('sets feedType to empty when no filters', async () => {
    const writeDataPoint = vi.fn()
    const env = makeEnv(writeDataPoint)

    await emitFeedMetrics(env, {
      ...baseMetrics,
      hasFavorites: false,
      hasGeoFilter: false,
      hasSearchFilter: false,
    })

    expect(writeDataPoint.mock.calls[0][0].blobs[1]).toBe('empty')
  })
})

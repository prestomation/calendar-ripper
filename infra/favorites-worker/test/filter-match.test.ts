import { describe, it, expect } from 'vitest'
import { haversineKm, eventMatchesGeoFilters, matchEventsForUser } from '../src/filter-match.js'
import type { EventsIndexEntry, FavoritesRecord, GeoFilter } from '../src/types.js'

function makeEvent(overrides: Partial<EventsIndexEntry> = {}): EventsIndexEntry {
  return {
    icsUrl: 'test.ics',
    summary: 'Test Event',
    date: '2026-04-15T19:00',
    ...overrides,
  }
}

function makeFavorites(overrides: Partial<FavoritesRecord> = {}): FavoritesRecord {
  return {
    icsUrls: [],
    searchFilters: [],
    geoFilters: [],
    updatedAt: '2026-04-06T00:00:00Z',
    ...overrides,
  }
}

describe('haversineKm', () => {
  it('returns 0 for the same point', () => {
    expect(haversineKm(47.6, -122.3, 47.6, -122.3)).toBe(0)
  })

  it('calculates distance between Seattle and Portland', () => {
    const dist = haversineKm(47.6062, -122.3321, 45.5152, -122.6784)
    // ~233 km
    expect(dist).toBeGreaterThan(220)
    expect(dist).toBeLessThan(250)
  })
})

describe('eventMatchesGeoFilters', () => {
  const seattleFilter: GeoFilter = { lat: 47.6062, lng: -122.3321, radiusKm: 10 }

  it('returns true when no geo filters', () => {
    expect(eventMatchesGeoFilters(makeEvent(), [])).toBe(true)
  })

  it('returns true when event has no coordinates', () => {
    expect(eventMatchesGeoFilters(makeEvent(), [seattleFilter])).toBe(true)
  })

  it('returns true for event within radius', () => {
    const event = makeEvent({ lat: 47.61, lng: -122.34 })
    expect(eventMatchesGeoFilters(event, [seattleFilter])).toBe(true)
  })

  it('returns false for event outside radius', () => {
    const event = makeEvent({ lat: 45.5, lng: -122.6 }) // Portland
    expect(eventMatchesGeoFilters(event, [seattleFilter])).toBe(false)
  })
})

describe('matchEventsForUser', () => {
  it('returns empty for user with no preferences', () => {
    const events = [makeEvent()]
    const result = matchEventsForUser(events, makeFavorites())
    expect(result.matchedEvents).toEqual([])
  })

  it('matches by favorites (icsUrl)', () => {
    const events = [
      makeEvent({ icsUrl: 'a.ics', summary: 'A' }),
      makeEvent({ icsUrl: 'b.ics', summary: 'B' }),
    ]
    const result = matchEventsForUser(events, makeFavorites({ icsUrls: ['a.ics'] }))
    expect(result.matchedByFavorites).toHaveLength(1)
    expect(result.matchedByFavorites[0].summary).toBe('A')
  })

  it('matches by search filters', () => {
    const events = [
      makeEvent({ summary: 'Jazz Concert', description: 'Live jazz music' }),
      makeEvent({ summary: 'Dog Walk', description: 'Walk with dogs' }),
    ]
    const result = matchEventsForUser(events, makeFavorites({ searchFilters: ['jazz'] }))
    expect(result.matchedBySearch).toHaveLength(1)
    expect(result.matchedBySearch[0].summary).toBe('Jazz Concert')
  })

  it('matches by geo filters', () => {
    const events = [
      makeEvent({ summary: 'Seattle Event', lat: 47.61, lng: -122.34 }),
      makeEvent({ summary: 'Portland Event', lat: 45.5, lng: -122.6 }),
    ]
    const filter: GeoFilter = { lat: 47.6062, lng: -122.3321, radiusKm: 10 }
    const result = matchEventsForUser(events, makeFavorites({ geoFilters: [filter] }))
    expect(result.matchedByGeo).toHaveLength(1)
    expect(result.matchedByGeo[0].summary).toBe('Seattle Event')
  })

  it('does not double-count events matching multiple criteria', () => {
    const events = [
      makeEvent({ icsUrl: 'a.ics', summary: 'Jazz Concert', lat: 47.61, lng: -122.34 }),
    ]
    const filter: GeoFilter = { lat: 47.6062, lng: -122.3321, radiusKm: 10 }
    const result = matchEventsForUser(events, makeFavorites({
      icsUrls: ['a.ics'],
      searchFilters: ['jazz'],
      geoFilters: [filter],
    }))
    // Should only appear once (via favorites, the first check)
    expect(result.matchedEvents).toHaveLength(1)
    expect(result.matchedByFavorites).toHaveLength(1)
    expect(result.matchedBySearch).toHaveLength(0)
    expect(result.matchedByGeo).toHaveLength(0)
  })
})

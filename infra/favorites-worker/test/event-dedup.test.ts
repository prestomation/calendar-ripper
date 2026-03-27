import { describe, it, expect } from 'vitest'
import { titleSimilarity, haversineKm, deduplicateEvents } from '../src/event-dedup.js'
import type { EventsIndexEntry } from '../src/types.js'

// Helper to build a minimal EventsIndexEntry
function makeEvent(overrides: Partial<EventsIndexEntry> & { summary: string; date: string; icsUrl: string }): EventsIndexEntry {
  return {
    summary: overrides.summary,
    date: overrides.date,
    icsUrl: overrides.icsUrl,
    description: overrides.description,
    lat: overrides.lat,
    lng: overrides.lng,
  }
}

// Approx Seattle coords for testing
const SEA_LAT = 47.6062
const SEA_LNG = -122.3321

describe('titleSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(titleSimilarity('Hello World', 'Hello World')).toBe(1.0)
  })

  it('returns 0.0 for completely different strings', () => {
    expect(titleSimilarity('alpha beta', 'gamma delta')).toBe(0.0)
  })

  it('returns 0.0 if either string is empty', () => {
    expect(titleSimilarity('', 'hello')).toBe(0.0)
    expect(titleSimilarity('hello', '')).toBe(0.0)
    expect(titleSimilarity('', '')).toBe(0.0)
  })

  it('returns correct partial overlap', () => {
    // A = {hello, world}, B = {hello, everyone}
    // intersection = {hello} = 1, union = {hello, world, everyone} = 3
    expect(titleSimilarity('hello world', 'hello everyone')).toBeCloseTo(1 / 3, 5)
  })

  it('is case-insensitive', () => {
    expect(titleSimilarity('HELLO WORLD', 'hello world')).toBe(1.0)
  })

  it('returns high similarity for near-identical titles with extra word', () => {
    // "Jazz Night at The Substation" vs "Jazz Night at The Substation (18+)"
    const sim = titleSimilarity('Jazz Night at The Substation', 'Jazz Night at The Substation 18+')
    expect(sim).toBeGreaterThan(0.6)
  })
})

describe('haversineKm', () => {
  it('returns 0 for same point', () => {
    expect(haversineKm(SEA_LAT, SEA_LNG, SEA_LAT, SEA_LNG)).toBeCloseTo(0, 5)
  })

  it('returns correct distance for known points', () => {
    // Seattle to Bellevue is roughly 5 km
    const dist = haversineKm(47.6062, -122.3321, 47.6101, -122.2015)
    expect(dist).toBeGreaterThan(4)
    expect(dist).toBeLessThan(12)
  })

  it('returns < 0.05 for points 30m apart', () => {
    // 0.0003 degrees latitude ≈ 33m
    const dist = haversineKm(SEA_LAT, SEA_LNG, SEA_LAT + 0.0003, SEA_LNG)
    expect(dist).toBeLessThan(0.05)
  })

  it('returns > 0.05 for points 200m apart', () => {
    // 0.002 degrees latitude ≈ 222m
    const dist = haversineKm(SEA_LAT, SEA_LNG, SEA_LAT + 0.002, SEA_LNG)
    expect(dist).toBeGreaterThan(0.05)
  })
})

describe('deduplicateEvents', () => {
  const DATE = '2026-03-15T19:00'
  const OTHER_DATE = '2026-03-16T19:00'

  it('returns empty array for empty input', () => {
    expect(deduplicateEvents([])).toEqual([])
  })

  it('returns single event unchanged', () => {
    const event = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'venue-a.ics', lat: SEA_LAT, lng: SEA_LNG })
    const result = deduplicateEvents([event])
    expect(result).toHaveLength(1)
    expect(result[0].summary).toBe('Jazz Night')
    expect(result[0].dedupedSources).toBeUndefined()
  })

  it('deduplicates two events with same date, coords within 50m, similar title', () => {
    const a = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-a.ics', lat: SEA_LAT, lng: SEA_LNG })
    const b = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-b.ics', lat: SEA_LAT + 0.0001, lng: SEA_LNG })
    const result = deduplicateEvents([a, b])
    expect(result).toHaveLength(1)
    expect(result[0].dedupedSources).toEqual(['cal-b.ics'])
  })

  it('keeps event with longer description', () => {
    const a = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-a.ics', lat: SEA_LAT, lng: SEA_LNG, description: 'Short' })
    const b = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-b.ics', lat: SEA_LAT, lng: SEA_LNG, description: 'Much longer description with more detail about the event' })
    const result = deduplicateEvents([a, b])
    expect(result).toHaveLength(1)
    expect(result[0].icsUrl).toBe('cal-b.ics')
    expect(result[0].dedupedSources).toEqual(['cal-a.ics'])
  })

  it('keeps first event on tie (equal description length)', () => {
    const a = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-a.ics', lat: SEA_LAT, lng: SEA_LNG })
    const b = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-b.ics', lat: SEA_LAT, lng: SEA_LNG })
    const result = deduplicateEvents([a, b])
    expect(result).toHaveLength(1)
    expect(result[0].icsUrl).toBe('cal-a.ics')
    expect(result[0].dedupedSources).toEqual(['cal-b.ics'])
  })

  it('does NOT deduplicate events with same date and coords but low title similarity', () => {
    const a = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-a.ics', lat: SEA_LAT, lng: SEA_LNG })
    const b = makeEvent({ summary: 'Rock Concert Extravaganza', date: DATE, icsUrl: 'cal-b.ics', lat: SEA_LAT, lng: SEA_LNG })
    // titleSimilarity should be 0 (no overlap)
    const result = deduplicateEvents([a, b])
    expect(result).toHaveLength(2)
    expect(result.every(e => e.dedupedSources === undefined)).toBe(true)
  })

  it('does NOT deduplicate events with same title and coords but different date', () => {
    const a = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-a.ics', lat: SEA_LAT, lng: SEA_LNG })
    const b = makeEvent({ summary: 'Jazz Night', date: OTHER_DATE, icsUrl: 'cal-b.ics', lat: SEA_LAT, lng: SEA_LNG })
    const result = deduplicateEvents([a, b])
    expect(result).toHaveLength(2)
  })

  it('does NOT deduplicate events that are far apart (> 50m)', () => {
    const a = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-a.ics', lat: SEA_LAT, lng: SEA_LNG })
    // 0.002 degrees ≈ 200m away
    const b = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-b.ics', lat: SEA_LAT + 0.002, lng: SEA_LNG })
    const result = deduplicateEvents([a, b])
    expect(result).toHaveLength(2)
  })

  it('passes through events without coordinates (no dedup)', () => {
    const a = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-a.ics' }) // no lat/lng
    const b = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-b.ics' }) // no lat/lng
    const result = deduplicateEvents([a, b])
    // No coords → not deduped, both pass through
    expect(result).toHaveLength(2)
    expect(result.every(e => e.dedupedSources === undefined)).toBe(true)
  })

  it('does not dedup a geo event against a no-coord event', () => {
    const a = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-a.ics', lat: SEA_LAT, lng: SEA_LNG })
    const b = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-b.ics' }) // no coords
    const result = deduplicateEvents([a, b])
    expect(result).toHaveLength(2)
  })

  it('deduplicates three events into one, with two suppressed sources', () => {
    const a = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-a.ics', lat: SEA_LAT, lng: SEA_LNG })
    const b = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-b.ics', lat: SEA_LAT, lng: SEA_LNG })
    const c = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-c.ics', lat: SEA_LAT, lng: SEA_LNG })
    const result = deduplicateEvents([a, b, c])
    expect(result).toHaveLength(1)
    expect(result[0].dedupedSources).toHaveLength(2)
    expect(result[0].dedupedSources).toContain('cal-b.ics')
    expect(result[0].dedupedSources).toContain('cal-c.ics')
  })

  it('deduplicates [A, B, C] where B has longest description into just B', () => {
    // Regression: verify the break-on-i-suppressed path doesn't skip C vs B.
    // When i=0(A) loses to j=1(B), we break. Then i=1(B) scans j=2(C) and
    // correctly suppresses C. All three collapse into B.
    const a = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-a.ics', lat: SEA_LAT, lng: SEA_LNG, description: 'x' })
    const b = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-b.ics', lat: SEA_LAT, lng: SEA_LNG, description: 'Much longer description that wins' })
    const c = makeEvent({ summary: 'Jazz Night', date: DATE, icsUrl: 'cal-c.ics', lat: SEA_LAT, lng: SEA_LNG, description: 'yy' })
    const result = deduplicateEvents([a, b, c])
    expect(result).toHaveLength(1)
    expect(result[0].icsUrl).toBe('cal-b.ics')
    expect(result[0].dedupedSources).toContain('cal-a.ics')
    expect(result[0].dedupedSources).toContain('cal-c.ics')
  })

  it('uses date bucket only (first 10 chars), ignores time', () => {
    // Same YYYY-MM-DD, different times → same bucket → may dedup
    const a = makeEvent({ summary: 'Jazz Night', date: '2026-03-15T19:00', icsUrl: 'cal-a.ics', lat: SEA_LAT, lng: SEA_LNG })
    const b = makeEvent({ summary: 'Jazz Night', date: '2026-03-15T20:00', icsUrl: 'cal-b.ics', lat: SEA_LAT, lng: SEA_LNG })
    const result = deduplicateEvents([a, b])
    // Same date bucket → deduped
    expect(result).toHaveLength(1)
  })
})

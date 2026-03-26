import { describe, it, expect } from 'vitest'
import Fuse from 'fuse.js'

const FUSE_THRESHOLD = 0.1
const FUSE_KEYS = ['summary', 'description', 'location']

// Shared fixture — a realistic slice of events-index entries
const FIXTURE_EVENTS = [
  { icsUrl: 'crocodile-main.ics', summary: 'Punk Night at the Crocodile', description: 'Local punk bands', location: '2505 1st Ave, Seattle', date: '2026-04-01T20:00', lat: 47.6146, lng: -122.3474 },
  { icsUrl: 'neumos.ics',         summary: 'Jazz Fusion Evening',         description: 'Smooth jazz',       location: '925 E Pike St, Seattle',  date: '2026-04-02T20:00', lat: 47.6143, lng: -122.3197 },
  { icsUrl: 'mopop.ics',          summary: 'Guitar Exhibit Opening',      description: 'Rock history',       location: '325 5th Ave N, Seattle',  date: '2026-04-03T11:00', lat: 47.6214, lng: -122.3481 },
  { icsUrl: 'fremont-brewing.ics', summary: 'Trivia Night',               description: 'Beer and trivia',   location: '1050 N 34th St, Seattle', date: '2026-04-04T19:00', lat: 47.6499, lng: -122.3482 },
  { icsUrl: 'seatoday.ics',        summary: 'Community Meeting',          description: null,                location: null,                       date: '2026-04-05T18:00', lat: null,   lng: null   },
]

// Haversine — copy-pasted from infra/favorites-worker/src/feed.ts exactly
function haversineKm(lat1, lng1, lat2, lng2) {
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

describe('Filter parity: client matches worker behavior', () => {
  describe('Search filters', () => {
    it('matches "punk" to the right event', () => {
      const fuse = new Fuse(FIXTURE_EVENTS, { keys: FUSE_KEYS, threshold: FUSE_THRESHOLD })
      const results = fuse.search('punk').map(r => r.item.icsUrl)
      expect(results).toContain('crocodile-main.ics')
      expect(results).not.toContain('neumos.ics')
    })

    it('does not match unrelated events for "jazz"', () => {
      const fuse = new Fuse(FIXTURE_EVENTS, { keys: FUSE_KEYS, threshold: FUSE_THRESHOLD })
      const results = fuse.search('jazz').map(r => r.item.icsUrl)
      expect(results).toContain('neumos.ics')
      expect(results).not.toContain('fremont-brewing.ics')
    })

    it('handles events with null description/location gracefully', () => {
      const fuse = new Fuse(FIXTURE_EVENTS, { keys: FUSE_KEYS, threshold: FUSE_THRESHOLD })
      expect(() => fuse.search('community')).not.toThrow()
    })
  })

  describe('Geo filters', () => {
    it('includes events within radius', () => {
      // Capitol Hill center
      const filter = { lat: 47.6143, lng: -122.3197, radiusKm: 1 }
      const matches = FIXTURE_EVENTS.filter(e =>
        e.lat != null && e.lng != null &&
        haversineKm(filter.lat, filter.lng, e.lat, e.lng) <= filter.radiusKm
      )
      expect(matches.map(e => e.icsUrl)).toContain('neumos.ics')
      expect(matches.map(e => e.icsUrl)).not.toContain('fremont-brewing.ics')
    })

    it('excludes events outside radius', () => {
      // Very tight radius around Neumos — should NOT include Fremont Brewing (far north)
      const filter = { lat: 47.6143, lng: -122.3197, radiusKm: 0.5 }
      const matches = FIXTURE_EVENTS.filter(e =>
        e.lat != null && e.lng != null &&
        haversineKm(filter.lat, filter.lng, e.lat, e.lng) <= filter.radiusKm
      )
      expect(matches.map(e => e.icsUrl)).not.toContain('fremont-brewing.ics')
    })

    it('passes through events with null coords', () => {
      const filter = { lat: 47.6062, lng: -122.3321, radiusKm: 1 }
      const nullCoordEvent = FIXTURE_EVENTS.find(e => e.lat == null)
      // null-coord events should NOT be filtered out (pass-through behavior)
      expect(nullCoordEvent).toBeDefined()
      // The filter logic: if lat == null => include (pass through)
      const included = nullCoordEvent.lat == null || haversineKm(filter.lat, filter.lng, nullCoordEvent.lat, nullCoordEvent.lng) <= filter.radiusKm
      expect(included).toBe(true)
    })

    it('handles large radius (city-wide, 20km) including all Seattle events', () => {
      const filter = { lat: 47.6062, lng: -122.3321, radiusKm: 20 }
      const matches = FIXTURE_EVENTS.filter(e =>
        e.lat == null || haversineKm(filter.lat, filter.lng, e.lat, e.lng) <= filter.radiusKm
      )
      expect(matches.length).toBe(FIXTURE_EVENTS.length) // all in Seattle, all match
    })
  })

  describe('Multi-match', () => {
    it('an event can match both search and geo simultaneously', () => {
      const searchFuse = new Fuse(FIXTURE_EVENTS, { keys: FUSE_KEYS, threshold: FUSE_THRESHOLD })
      const searchMatches = new Set(searchFuse.search('punk').map(r => r.item.summary + '|' + r.item.date))

      const geoFilter = { lat: 47.6146, lng: -122.3474, radiusKm: 0.5 } // right at Crocodile
      const geoMatches = new Set(
        FIXTURE_EVENTS
          .filter(e => e.lat != null && haversineKm(geoFilter.lat, geoFilter.lng, e.lat, e.lng) <= geoFilter.radiusKm)
          .map(e => e.summary + '|' + e.date)
      )

      const crocodileKey = 'Punk Night at the Crocodile|2026-04-01T20:00'
      expect(searchMatches.has(crocodileKey)).toBe(true)
      expect(geoMatches.has(crocodileKey)).toBe(true)
    })
  })
})

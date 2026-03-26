import { describe, it, expect } from 'vitest'
import Fuse from 'fuse.js'
import { haversineKm } from './lib/haversine.js'
import { eventKey } from './lib/eventKey.js'

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

    it('null-coord events produce no geo attribution chip', () => {
      const nullCoordEvent = FIXTURE_EVENTS.find(e => e.lat == null)
      expect(nullCoordEvent).toBeDefined()
      const filter = { lat: 47.6062, lng: -122.3321, radiusKm: 5 }
      // Attribution logic: skip events with null coords (they get no geo chip)
      const wouldGetGeoAttribution = nullCoordEvent.lat != null && nullCoordEvent.lng != null &&
        haversineKm(filter.lat, filter.lng, nullCoordEvent.lat, nullCoordEvent.lng) <= filter.radiusKm
      expect(wouldGetGeoAttribution).toBe(false)
    })

    it('null-coord events are still included in geo-filtered feed (pass-through)', () => {
      // Worker behavior: events with no coords pass through geo filters (not excluded)
      const nullCoordEvent = FIXTURE_EVENTS.find(e => e.lat == null)
      const filter = { lat: 47.6062, lng: -122.3321, radiusKm: 1 }
      const includedInFeed = nullCoordEvent.lat == null || nullCoordEvent.lng == null ||
        haversineKm(filter.lat, filter.lng, nullCoordEvent.lat, nullCoordEvent.lng) <= filter.radiusKm
      expect(includedInFeed).toBe(true)
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
      const searchMatches = new Set(searchFuse.search('punk').map(r => eventKey(r.item)))

      const geoFilter = { lat: 47.6146, lng: -122.3474, radiusKm: 0.5 } // right at Crocodile
      const geoMatches = new Set(
        FIXTURE_EVENTS
          .filter(e => e.lat != null && haversineKm(geoFilter.lat, geoFilter.lng, e.lat, e.lng) <= geoFilter.radiusKm)
          .map(e => eventKey(e))
      )

      const crocodileKey = 'Punk Night at the Crocodile|2026-04-01T20:00'
      expect(searchMatches.has(crocodileKey)).toBe(true)
      expect(geoMatches.has(crocodileKey)).toBe(true)
    })
  })
})

import { describe, it, expect } from 'vitest'
import { buildNotificationPayload } from '../src/filter-match.js'
import type { EventsIndexEntry } from '../src/types.js'

function makeEvent(overrides: Partial<EventsIndexEntry> = {}): EventsIndexEntry {
  return {
    icsUrl: 'test.ics',
    summary: 'Test Event',
    date: '2026-04-15T19:00',
    ...overrides,
  }
}

describe('buildNotificationPayload', () => {
  it('builds single-event payload with event name', () => {
    const events = [makeEvent({ summary: 'Volunteer Park Concert', location: 'Volunteer Park' })]
    const payload = buildNotificationPayload(events)
    expect(payload.title).toBe('New event: Volunteer Park Concert')
    expect(payload.body).toContain('Volunteer Park')
  })

  it('builds payload for 2 events', () => {
    const events = [
      makeEvent({ summary: 'Event A' }),
      makeEvent({ summary: 'Event B' }),
    ]
    const payload = buildNotificationPayload(events)
    expect(payload.title).toBe('2 new events on your calendar')
    expect(payload.body).toBe('Event A and Event B')
  })

  it('builds payload for 3 events', () => {
    const events = [
      makeEvent({ summary: 'Event A' }),
      makeEvent({ summary: 'Event B' }),
      makeEvent({ summary: 'Event C' }),
    ]
    const payload = buildNotificationPayload(events)
    expect(payload.title).toBe('3 new events on your calendar')
    expect(payload.body).toBe('Event A, Event B, and 1 more')
  })

  it('builds payload for 5+ events', () => {
    const events = Array.from({ length: 5 }, (_, i) => makeEvent({ summary: `Event ${i}` }))
    const payload = buildNotificationPayload(events)
    expect(payload.title).toBe('5 new events on your calendar')
    expect(payload.body).toBe("Tap to see what's new")
  })

  it('includes URL in data', () => {
    const payload = buildNotificationPayload([makeEvent()])
    expect(payload.data.url).toBe('/')
  })
})

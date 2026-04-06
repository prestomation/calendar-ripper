import { describe, it, expect } from 'vitest'
import { detectNewEvents, eventKey } from './detect-new-events.js'

describe('eventKey', () => {
  it('creates a composite key from summary and date', () => {
    expect(eventKey({ icsUrl: 'test.ics', summary: 'Concert', date: '2026-04-15T19:00' }))
      .toBe('Concert|2026-04-15T19:00')
  })
})

describe('detectNewEvents', () => {
  const event1 = { icsUrl: 'a.ics', summary: 'Concert', date: '2026-04-15T19:00', location: 'Park' }
  const event2 = { icsUrl: 'b.ics', summary: 'Trivia', date: '2026-04-16T20:00', location: 'Bar' }
  const event3 = { icsUrl: 'c.ics', summary: 'Market', date: '2026-04-17T10:00', location: 'Square' }

  it('returns all events when previous is empty', () => {
    const result = detectNewEvents([], [event1, event2])
    expect(result).toEqual([event1, event2])
  })

  it('returns empty when no new events', () => {
    const result = detectNewEvents([event1, event2], [event1, event2])
    expect(result).toEqual([])
  })

  it('detects only genuinely new events', () => {
    const result = detectNewEvents([event1], [event1, event2, event3])
    expect(result).toEqual([event2, event3])
  })

  it('ignores removed events', () => {
    const result = detectNewEvents([event1, event2, event3], [event1])
    expect(result).toEqual([])
  })

  it('handles events with same summary but different dates as distinct', () => {
    const eventA = { icsUrl: 'a.ics', summary: 'Concert', date: '2026-04-15T19:00' }
    const eventB = { icsUrl: 'a.ics', summary: 'Concert', date: '2026-04-22T19:00' }
    const result = detectNewEvents([eventA], [eventA, eventB])
    expect(result).toEqual([eventB])
  })

  it('handles events with same date but different summaries as distinct', () => {
    const eventA = { icsUrl: 'a.ics', summary: 'Concert', date: '2026-04-15T19:00' }
    const eventB = { icsUrl: 'b.ics', summary: 'Movie Night', date: '2026-04-15T19:00' }
    const result = detectNewEvents([eventA], [eventA, eventB])
    expect(result).toEqual([eventB])
  })

  it('handles empty both arrays', () => {
    expect(detectNewEvents([], [])).toEqual([])
  })
})

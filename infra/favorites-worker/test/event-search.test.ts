import { describe, it, expect } from 'vitest'
import { searchEventsIndex, extractMatchingVEvents } from '../src/event-search.js'
import type { EventsIndexEntry } from '../src/types.js'

const SAMPLE_EVENTS: EventsIndexEntry[] = [
  { icsUrl: 'venue-a.ics', summary: 'Jazz Night at The Blue Room', description: 'Live jazz music', location: '123 Main St', date: '2026-03-20T19:00' },
  { icsUrl: 'venue-a.ics', summary: 'Trivia Tuesday', description: 'Weekly pub trivia', location: '123 Main St', date: '2026-03-21T18:00' },
  { icsUrl: 'venue-b.ics', summary: 'Jazz Brunch', description: 'Sunday brunch with jazz', location: '456 Oak Ave', date: '2026-03-22T11:00' },
  { icsUrl: 'venue-b.ics', summary: 'Farmers Market', description: 'Weekly farmers market', location: 'Pioneer Square', date: '2026-03-23T09:00' },
  { icsUrl: 'venue-c.ics', summary: 'Comedy Open Mic', description: 'Stand-up comedy', location: '789 Pine St', date: '2026-03-24T20:00' },
]

const SAMPLE_ALL_ICS = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:All Events\r\nBEGIN:VEVENT\r\nUID:event-1\r\nDTSTART:20260320T190000Z\r\nSUMMARY:Jazz Night at The Blue Room\r\nDESCRIPTION:Live jazz music\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:event-2\r\nDTSTART:20260321T180000Z\r\nSUMMARY:Trivia Tuesday\r\nDESCRIPTION:Weekly pub trivia\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:event-3\r\nDTSTART:20260322T110000Z\r\nSUMMARY:Jazz Brunch\r\nDESCRIPTION:Sunday brunch with jazz\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:event-4\r\nDTSTART:20260323T090000Z\r\nSUMMARY:Farmers Market\r\nDESCRIPTION:Weekly farmers market\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:event-5\r\nDTSTART:20260324T200000Z\r\nSUMMARY:Comedy Open Mic\r\nDESCRIPTION:Stand-up comedy\r\nEND:VEVENT\r\nEND:VCALENDAR`

describe('searchEventsIndex', () => {
  it('finds events matching a single filter (returns summary|date keys)', () => {
    const matches = searchEventsIndex(SAMPLE_EVENTS, ['jazz'])
    expect(matches.has('Jazz Night at The Blue Room|2026-03-20T19:00')).toBe(true)
    expect(matches.has('Jazz Brunch|2026-03-22T11:00')).toBe(true)
    expect(matches.size).toBe(2)
  })

  it('finds events matching multiple filters', () => {
    const matches = searchEventsIndex(SAMPLE_EVENTS, ['jazz', 'trivia'])
    expect(matches.has('Jazz Night at The Blue Room|2026-03-20T19:00')).toBe(true)
    expect(matches.has('Jazz Brunch|2026-03-22T11:00')).toBe(true)
    expect(matches.has('Trivia Tuesday|2026-03-21T18:00')).toBe(true)
    expect(matches.has('Farmers Market|2026-03-23T09:00')).toBe(false)
  })

  it('returns empty set for no matching filters', () => {
    const matches = searchEventsIndex(SAMPLE_EVENTS, ['nonexistent-term-xyz'])
    expect(matches.size).toBe(0)
  })

  it('returns empty set for empty filters', () => {
    const matches = searchEventsIndex(SAMPLE_EVENTS, [])
    expect(matches.size).toBe(0)
  })

  it('matches on location field', () => {
    const matches = searchEventsIndex(SAMPLE_EVENTS, ['Pioneer Square'])
    expect(matches.has('Farmers Market|2026-03-23T09:00')).toBe(true)
  })

  it('matches on description field', () => {
    const matches = searchEventsIndex(SAMPLE_EVENTS, ['stand-up comedy'])
    expect(matches.has('Comedy Open Mic|2026-03-24T20:00')).toBe(true)
  })
})

describe('extractMatchingVEvents', () => {
  it('extracts VEVENTs with matching summary|date keys', () => {
    const keys = new Set(['Jazz Night at The Blue Room|2026-03-20T19:00', 'Jazz Brunch|2026-03-22T11:00'])
    const blocks = extractMatchingVEvents(SAMPLE_ALL_ICS, keys)
    expect(blocks.length).toBe(2)
    expect(blocks[0]).toContain('Jazz Night at The Blue Room')
    expect(blocks[1]).toContain('Jazz Brunch')
  })

  it('returns empty array when no keys match', () => {
    const keys = new Set(['Nonexistent Event|2026-01-01T00:00'])
    const blocks = extractMatchingVEvents(SAMPLE_ALL_ICS, keys)
    expect(blocks.length).toBe(0)
  })

  it('returns all events when all keys match', () => {
    const keys = new Set([
      'Jazz Night at The Blue Room|2026-03-20T19:00',
      'Trivia Tuesday|2026-03-21T18:00',
      'Jazz Brunch|2026-03-22T11:00',
      'Farmers Market|2026-03-23T09:00',
      'Comedy Open Mic|2026-03-24T20:00',
    ])
    const blocks = extractMatchingVEvents(SAMPLE_ALL_ICS, keys)
    expect(blocks.length).toBe(5)
  })

  it('each returned block is a valid VEVENT', () => {
    const keys = new Set(['Trivia Tuesday|2026-03-21T18:00'])
    const blocks = extractMatchingVEvents(SAMPLE_ALL_ICS, keys)
    expect(blocks.length).toBe(1)
    expect(blocks[0]).toMatch(/^BEGIN:VEVENT/)
    expect(blocks[0]).toMatch(/END:VEVENT$/)
    expect(blocks[0]).toContain('UID:event-2')
  })

  it('does not match same summary with different date', () => {
    const keys = new Set(['Jazz Night at The Blue Room|2026-12-25T19:00'])
    const blocks = extractMatchingVEvents(SAMPLE_ALL_ICS, keys)
    expect(blocks.length).toBe(0)
  })

  it('handles ICS folded lines', () => {
    const foldedIcs = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:folded-1\r\nDTSTART:20260320T190000Z\r\nSUMMARY:A Very Long Event Name That Gets\r\n  Folded Across Lines\r\nEND:VEVENT\r\nEND:VCALENDAR`
    const keys = new Set(['A Very Long Event Name That Gets Folded Across Lines|2026-03-20T19:00'])
    const blocks = extractMatchingVEvents(foldedIcs, keys)
    expect(blocks.length).toBe(1)
  })

  it('handles DTSTART with TZID parameter', () => {
    const tzidIcs = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:tzid-1\r\nDTSTART;TZID=America/Los_Angeles:20260320T190000\r\nSUMMARY:Local Time Event\r\nEND:VEVENT\r\nEND:VCALENDAR`
    const keys = new Set(['Local Time Event|2026-03-20T19:00'])
    const blocks = extractMatchingVEvents(tzidIcs, keys)
    expect(blocks.length).toBe(1)
  })
})

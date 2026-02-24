import { describe, it, expect } from 'vitest'
import { mergeIcsFiles } from '../src/ics-merge.js'

const ICS_A = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:event-a-1@test
DTSTART:20260301T100000Z
SUMMARY:Event A1
END:VEVENT
END:VCALENDAR`

const ICS_B = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-b-1@test
DTSTART:20260302T100000Z
SUMMARY:Event B1
END:VEVENT
BEGIN:VEVENT
UID:event-b-2@test
DTSTART:20260303T100000Z
SUMMARY:Event B2
END:VEVENT
END:VCALENDAR`

const ICS_DUPLICATE = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-a-1@test
DTSTART:20260301T100000Z
SUMMARY:Event A1 (duplicate)
END:VEVENT
END:VCALENDAR`

describe('mergeIcsFiles', () => {
  it('merges events from multiple ICS files', () => {
    const result = mergeIcsFiles([ICS_A, ICS_B])
    expect(result).toContain('BEGIN:VCALENDAR')
    expect(result).toContain('END:VCALENDAR')
    expect(result).toContain('Event A1')
    expect(result).toContain('Event B1')
    expect(result).toContain('Event B2')
    const eventCount = (result.match(/BEGIN:VEVENT/g) || []).length
    expect(eventCount).toBe(3)
  })

  it('deduplicates events by UID', () => {
    const result = mergeIcsFiles([ICS_A, ICS_DUPLICATE])
    const eventCount = (result.match(/BEGIN:VEVENT/g) || []).length
    expect(eventCount).toBe(1)
  })

  it('returns valid empty calendar for no input', () => {
    const result = mergeIcsFiles([])
    expect(result).toContain('BEGIN:VCALENDAR')
    expect(result).toContain('END:VCALENDAR')
    expect(result).not.toContain('BEGIN:VEVENT')
  })

  it('sets correct calendar name and PRODID', () => {
    const result = mergeIcsFiles([ICS_A])
    expect(result).toContain('X-WR-CALNAME:Seattle Calendar Ripper')
    expect(result).toContain('PRODID:-//Calendar Ripper//Favorites//EN')
  })
})

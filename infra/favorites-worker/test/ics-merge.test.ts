import { describe, it, expect } from 'vitest'
import { mergeIcsFiles } from '../src/ics-merge.js'

const ICS_A = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
X-WR-CALNAME:Stoup Brewing Events
BEGIN:VEVENT
UID:event-a-1@test
DTSTART:20260301T100000Z
SUMMARY:Event A1
END:VEVENT
END:VCALENDAR`

const ICS_B = `BEGIN:VCALENDAR
VERSION:2.0
X-WR-CALNAME:Burke Museum Events
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

const ICS_WITH_SOURCE = `BEGIN:VCALENDAR
VERSION:2.0
X-WR-CALNAME:Music Events
BEGIN:VEVENT
UID:event-tagged@test
DTSTART:20260304T100000Z
SUMMARY:Tagged Event
X-CALRIPPER-SOURCE:stoup_brewing-all-events
CATEGORIES:Stoup Brewing Events
END:VEVENT
END:VCALENDAR`

const ICS_NO_CALNAME = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-noname@test
DTSTART:20260305T100000Z
SUMMARY:No Cal Name Event
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

  it('injects X-CALRIPPER-SOURCE and CATEGORIES from X-WR-CALNAME', () => {
    const result = mergeIcsFiles([ICS_A])
    expect(result).toContain('X-CALRIPPER-SOURCE:Stoup Brewing Events')
    expect(result).toContain('CATEGORIES:Stoup Brewing Events')
  })

  it('injects source from correct calendar for each event', () => {
    const result = mergeIcsFiles([ICS_A, ICS_B])
    expect(result).toContain('X-CALRIPPER-SOURCE:Stoup Brewing Events')
    expect(result).toContain('X-CALRIPPER-SOURCE:Burke Museum Events')
    expect(result).toContain('CATEGORIES:Stoup Brewing Events')
    expect(result).toContain('CATEGORIES:Burke Museum Events')
  })

  it('does not double-tag events that already have X-CALRIPPER-SOURCE', () => {
    const result = mergeIcsFiles([ICS_WITH_SOURCE])
    const sourceCount = (result.match(/X-CALRIPPER-SOURCE/g) || []).length
    expect(sourceCount).toBe(1)
    // Original source is preserved, not overwritten with the aggregate calendar name
    expect(result).toContain('X-CALRIPPER-SOURCE:stoup_brewing-all-events')
    expect(result).not.toContain('X-CALRIPPER-SOURCE:Music Events')
  })

  it('does not inject source when X-WR-CALNAME is missing', () => {
    const result = mergeIcsFiles([ICS_NO_CALNAME])
    expect(result).not.toContain('X-CALRIPPER-SOURCE')
    expect(result).not.toContain('CATEGORIES')
    expect(result).toContain('No Cal Name Event')
  })
})

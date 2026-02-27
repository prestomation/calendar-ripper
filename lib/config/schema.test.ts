import { describe, it, expect } from 'vitest';
import { toICS, RipperCalendar, RipperCalendarEvent } from './schema.js';
import { ZonedDateTime, Duration } from '@js-joda/core';

function makeEvent(overrides: Partial<RipperCalendarEvent> = {}): RipperCalendarEvent {
  return {
    id: 'test-1',
    ripped: new Date(),
    date: ZonedDateTime.parse('2025-06-01T18:00:00-07:00[America/Los_Angeles]'),
    duration: Duration.ofHours(2),
    summary: 'Test Event',
    ...overrides,
  };
}

function makeCalendar(events: RipperCalendarEvent[]): RipperCalendar {
  return {
    name: 'test-calendar',
    friendlyname: 'Test Calendar',
    events,
    errors: [],
    tags: [],
  };
}

/** Extract the DESCRIPTION value from an ICS string, handling ICS line folding */
function extractDescription(ics: string): string | undefined {
  // ICS uses line folding: long lines are split with \r\n followed by a space or tab
  const match = ics.match(/DESCRIPTION:([\s\S]*?)(?:\r?\n[A-Z])/);
  if (!match) return undefined;
  // Unfold: remove \r\n + space/tab (line continuation)
  const raw = match[1].replace(/\r?\n[ \t]/g, '');
  // Unescape ICS escapes
  return raw.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\');
}

describe('toICS', () => {
  describe('calendar name in aggregate event descriptions', () => {
    it('should append calendar name at end of description with URL', async () => {
      const event = makeEvent({
        description: 'A great concert',
        url: 'https://example.com/event',
        sourceCalendar: 'Stoup Brewing',
        sourceCalendarName: 'stoup-brewing',
      });
      const ics = await toICS(makeCalendar([event]));

      const desc = extractDescription(ics);
      expect(desc).toContain('A great concert');
      expect(desc).toContain('https://example.com/event');
      expect(desc).toContain('From Stoup Brewing');
      // Calendar name should come AFTER the URL
      const urlIndex = desc!.indexOf('https://example.com/event');
      const fromIndex = desc!.indexOf('From Stoup Brewing');
      expect(fromIndex).toBeGreaterThan(urlIndex);
    });

    it('should append calendar name at end when event has no URL', async () => {
      const event = makeEvent({
        description: 'A great concert',
        sourceCalendar: 'Stoup Brewing',
        sourceCalendarName: 'stoup-brewing',
      });
      const ics = await toICS(makeCalendar([event]));

      const desc = extractDescription(ics);
      expect(desc).toContain('A great concert');
      expect(desc).toContain('From Stoup Brewing');
    });

    it('should show calendar name when event has no description but has URL', async () => {
      const event = makeEvent({
        description: undefined,
        url: 'https://example.com/event',
        sourceCalendar: 'Stoup Brewing',
        sourceCalendarName: 'stoup-brewing',
      });
      const ics = await toICS(makeCalendar([event]));

      const desc = extractDescription(ics);
      expect(desc).toContain('https://example.com/event');
      expect(desc).toContain('From Stoup Brewing');
    });

    it('should show only calendar name when event has no description or URL', async () => {
      const event = makeEvent({
        description: undefined,
        url: undefined,
        sourceCalendar: 'Stoup Brewing',
        sourceCalendarName: 'stoup-brewing',
      });
      const ics = await toICS(makeCalendar([event]));

      const desc = extractDescription(ics);
      expect(desc).toContain('From Stoup Brewing');
    });

    it('should not add calendar name for non-aggregate events', async () => {
      const event = makeEvent({
        description: 'A great concert',
        url: 'https://example.com/event',
        // No sourceCalendar set = not an aggregate event
      });
      const ics = await toICS(makeCalendar([event]));

      const desc = extractDescription(ics);
      expect(desc).not.toContain('From');
    });
  });
});

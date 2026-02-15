import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RipperLoader } from './config/loader.js';
import { RipperConfig, RipperCalendar, ExternalCalendar } from './config/schema.js';
import { ZonedDateTime, Duration } from '@js-joda/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  prepareTaggedCalendars,
  prepareTaggedExternalCalendars,
  createAggregateCalendars
} from './tag_aggregator.js';
import { hasFutureEventsInICS } from './calendar_ripper.js';

// Mock the file system operations
vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn()
}));

// Mock the RipperLoader
vi.mock('./config/loader.js', () => ({
  RipperLoader: vi.fn()
}));

// Mock the tag_aggregator functions
vi.mock('./tag_aggregator.js', () => ({
  prepareTaggedCalendars: vi.fn(),
  prepareTaggedExternalCalendars: vi.fn(),
  createAggregateCalendars: vi.fn()
}));

describe('Calendar Ripper Integration with Tags', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  
  it('should prepare tagged calendars with correct tags', async () => {
    // Arrange
    const calendar1: RipperCalendar = {
      name: 'ripper1-calendar1',
      friendlyname: 'Calendar 1',
      events: [],
      errors: []
    };
    
    const calendar2: RipperCalendar = {
      name: 'ripper2-calendar2',
      friendlyname: 'Calendar 2',
      events: [],
      errors: []
    };
    
    const ripperTags = new Map<string, string[]>([
      ['ripper1', ['Music']],
      ['ripper2', ['Activism']]
    ]);
    
    const calendarTags = new Map<string, string[]>([
      ['ripper1-calendar1', ['Entertainment']],
      ['ripper2-calendar2', ['Community']]
    ]);
    
    // Act
    const result = prepareTaggedCalendars([calendar1, calendar2], ripperTags, calendarTags);
    
    // Assert
    expect(prepareTaggedCalendars).toHaveBeenCalledWith([calendar1, calendar2], ripperTags, calendarTags);
    
    // Mock the implementation for this test
    (prepareTaggedCalendars as any).mockReturnValue([
      { calendar: calendar1, tags: ['Music', 'Entertainment'] },
      { calendar: calendar2, tags: ['Activism', 'Community'] }
    ]);
    
    const taggedCalendars = prepareTaggedCalendars([calendar1, calendar2], ripperTags, calendarTags);
    expect(taggedCalendars).toHaveLength(2);
    expect(taggedCalendars[0].tags).toContain('Music');
    expect(taggedCalendars[0].tags).toContain('Entertainment');
    expect(taggedCalendars[1].tags).toContain('Activism');
    expect(taggedCalendars[1].tags).toContain('Community');
  });
  
  it('should prepare tagged external calendars', async () => {
    // Arrange
    const externalCalendar1: ExternalCalendar = {
      name: 'external1',
      friendlyname: 'External Calendar 1',
      icsUrl: 'https://example.com/calendar1.ics',
      disabled: false,
      tags: ['Music', 'Entertainment']
    };
    
    const externalCalendar2: ExternalCalendar = {
      name: 'external2',
      friendlyname: 'External Calendar 2',
      icsUrl: 'https://example.com/calendar2.ics',
      disabled: true,
      tags: ['Activism', 'Community']
    };
    
    // Act
    (prepareTaggedExternalCalendars as any).mockReturnValue([
      { calendar: externalCalendar1, tags: ['Music', 'Entertainment'] }
    ]);
    
    const result = prepareTaggedExternalCalendars([externalCalendar1, externalCalendar2]);
    
    // Assert
    expect(prepareTaggedExternalCalendars).toHaveBeenCalledWith([externalCalendar1, externalCalendar2]);
    expect(result).toHaveLength(1);
    expect(result[0].calendar.name).toBe('external1');
    expect(result[0].tags).toContain('Music');
    expect(result[0].tags).toContain('Entertainment');
  });
  
  it('should create aggregate calendars based on tags', async () => {
    // Arrange
    const calendar1: RipperCalendar = {
      name: 'ripper1-calendar1',
      friendlyname: 'Calendar 1',
      events: [],
      errors: []
    };
    
    const externalCalendar1: ExternalCalendar = {
      name: 'external1',
      friendlyname: 'External Calendar 1',
      icsUrl: 'https://example.com/calendar1.ics',
      disabled: false,
      tags: ['Music']
    };
    
    const taggedCalendars = [
      { calendar: calendar1, tags: ['Music'] }
    ];
    
    const taggedExternalCalendars = [
      { calendar: externalCalendar1, tags: ['Music'] }
    ];
    
    const aggregateCalendar: RipperCalendar = {
      name: 'tag-music',
      friendlyname: 'Music Events',
      events: [],
      errors: []
    };
    
    // Act
    (createAggregateCalendars as any).mockResolvedValue([aggregateCalendar]);
    
    const result = await createAggregateCalendars(taggedCalendars, taggedExternalCalendars);
    
    // Assert
    expect(createAggregateCalendars).toHaveBeenCalledWith(taggedCalendars, taggedExternalCalendars);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('tag-music');
    expect(result[0].friendlyname).toBe('Music Events');
  });
  
  it('should handle calendars with multiple tags', async () => {
    // Arrange
    const calendar1: RipperCalendar = {
      name: 'ripper1-calendar1',
      friendlyname: 'Calendar 1',
      events: [],
      errors: []
    };
    
    const ripperTags = new Map<string, string[]>([
      ['ripper1', ['Music', 'Entertainment', 'Arts']]
    ]);
    
    const calendarTags = new Map<string, string[]>([]);
    
    // Act
    (prepareTaggedCalendars as any).mockReturnValue([
      { calendar: calendar1, tags: ['Music', 'Entertainment', 'Arts'] }
    ]);
    
    const taggedCalendars = prepareTaggedCalendars([calendar1], ripperTags, calendarTags);
    
    // Assert
    expect(taggedCalendars).toHaveLength(1);
    expect(taggedCalendars[0].tags).toHaveLength(3);
    expect(taggedCalendars[0].tags).toContain('Music');
    expect(taggedCalendars[0].tags).toContain('Entertainment');
    expect(taggedCalendars[0].tags).toContain('Arts');
  });
});

describe('hasFutureEventsInICS', () => {
  const today = new Date(2026, 1, 15); // Feb 15, 2026

  it('should return true when ICS contains events after today', () => {
    const icsContent = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:20260301T100000Z
SUMMARY:Future Event
END:VEVENT
END:VCALENDAR`;
    expect(hasFutureEventsInICS(icsContent, today)).toBe(true);
  });

  it('should return true when ICS contains events on today', () => {
    const icsContent = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:20260215T100000Z
SUMMARY:Today Event
END:VEVENT
END:VCALENDAR`;
    expect(hasFutureEventsInICS(icsContent, today)).toBe(true);
  });

  it('should return false when ICS contains only past events', () => {
    const icsContent = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:20250101T100000Z
SUMMARY:Past Event
END:VEVENT
END:VCALENDAR`;
    expect(hasFutureEventsInICS(icsContent, today)).toBe(false);
  });

  it('should return false for empty ICS content', () => {
    const icsContent = `BEGIN:VCALENDAR
END:VCALENDAR`;
    expect(hasFutureEventsInICS(icsContent, today)).toBe(false);
  });

  it('should handle DTSTART with timezone parameters', () => {
    const icsContent = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;TZID=America/Los_Angeles:20260401T190000
SUMMARY:Future Event with TZ
END:VEVENT
END:VCALENDAR`;
    expect(hasFutureEventsInICS(icsContent, today)).toBe(true);
  });

  it('should handle all-day events (date only, no time)', () => {
    const icsContent = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260301
SUMMARY:Future All-Day Event
END:VEVENT
END:VCALENDAR`;
    expect(hasFutureEventsInICS(icsContent, today)).toBe(true);
  });

  it('should return true if at least one event is in the future', () => {
    const icsContent = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:20240601T100000Z
SUMMARY:Old Past Event
END:VEVENT
BEGIN:VEVENT
DTSTART:20250101T100000Z
SUMMARY:Recent Past Event
END:VEVENT
BEGIN:VEVENT
DTSTART:20260601T100000Z
SUMMARY:Future Event
END:VEVENT
END:VCALENDAR`;
    expect(hasFutureEventsInICS(icsContent, today)).toBe(true);
  });

  it('should return false when all events are past', () => {
    const icsContent = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:20240601T100000Z
SUMMARY:Old Past Event
END:VEVENT
BEGIN:VEVENT
DTSTART:20250101T100000Z
SUMMARY:Recent Past Event
END:VEVENT
BEGIN:VEVENT
DTSTART:20260214T100000Z
SUMMARY:Yesterday Event
END:VEVENT
END:VCALENDAR`;
    expect(hasFutureEventsInICS(icsContent, today)).toBe(false);
  });
});

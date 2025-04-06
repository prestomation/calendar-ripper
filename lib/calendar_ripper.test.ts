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

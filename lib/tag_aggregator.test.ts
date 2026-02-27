import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  collectAllTags, 
  createAggregateCalendars, 
  prepareTaggedCalendars, 
  prepareTaggedExternalCalendars,
  fetchExternalCalendar,
  TaggedCalendar,
  TaggedExternalCalendar
} from './tag_aggregator.js';
import { RipperCalendar, RipperCalendarEvent, ExternalCalendar } from './config/schema.js';
import { ZonedDateTime, Duration } from '@js-joda/core';

describe('Tag Aggregator', () => {
  // Sample data for testing
  let sampleEvent1: RipperCalendarEvent;
  let sampleEvent2: RipperCalendarEvent;
  let sampleCalendar1: RipperCalendar;
  let sampleCalendar2: RipperCalendar;
  let sampleExternalCalendar1: ExternalCalendar;
  let sampleExternalCalendar2: ExternalCalendar;
  
  beforeEach(() => {
    // Create sample events
    sampleEvent1 = {
      id: '1',
      ripped: new Date(),
      date: ZonedDateTime.parse('2025-01-01T10:00:00+00:00[UTC]'),
      duration: Duration.ofHours(2),
      summary: 'Test Event 1',
      description: 'Test Description 1',
      location: 'Test Location 1'
    };
    
    sampleEvent2 = {
      id: '2',
      ripped: new Date(),
      date: ZonedDateTime.parse('2025-01-02T10:00:00+00:00[UTC]'),
      duration: Duration.ofHours(1),
      summary: 'Test Event 2',
      description: 'Test Description 2',
      location: 'Test Location 2'
    };
    
    // Create sample calendars
    sampleCalendar1 = {
      name: 'ripper1-calendar1',
      friendlyname: 'Calendar 1',
      events: [sampleEvent1],
      errors: [],
      tags: ['Music', 'Entertainment'] 
    };
    
    sampleCalendar2 = {
      name: 'ripper2-calendar2',
      friendlyname: 'Calendar 2',
      events: [sampleEvent2],
      errors: [],
      tags: ['Activism', 'Music'] 
    };
    
    // Create sample external calendars
    sampleExternalCalendar1 = {
      name: 'external1',
      friendlyname: 'External Calendar 1',
      icsUrl: 'https://example.com/calendar1.ics',
      disabled: false,
      tags: ['Music', 'Entertainment']
    };
    
    sampleExternalCalendar2 = {
      name: 'external2',
      friendlyname: 'External Calendar 2',
      icsUrl: 'https://example.com/calendar2.ics',
      disabled: false,
      tags: ['Activism', 'Community']
    };
  });
  
  describe('collectAllTags', () => {
    it('should collect unique tags from all calendars', () => {
      // Arrange
      
      const taggedExternalCalendars: TaggedExternalCalendar[] = [
        { calendar: sampleExternalCalendar1, tags: ['Music', 'Entertainment'] },
        { calendar: sampleExternalCalendar2, tags: ['Activism', 'Community'] }
      ];
      
      // Act
      const allTags = collectAllTags([sampleCalendar1, sampleCalendar2], taggedExternalCalendars);
      
      // Assert
      expect(allTags).toHaveLength(4);
      expect(allTags).toContain('Music');
      expect(allTags).toContain('Entertainment');
      expect(allTags).toContain('Activism');
      expect(allTags).toContain('Community');
    });
    
    it('should return empty array when no tags exist', () => {
      // Arrange
      sampleCalendar1.tags = []
      sampleCalendar2.tags = []
      
      const taggedExternalCalendars: TaggedExternalCalendar[] = [
        { calendar: sampleExternalCalendar1, tags: [] },
        { calendar: sampleExternalCalendar2, tags: [] }
      ];
      
      // Act
      const allTags = collectAllTags([sampleCalendar1, sampleCalendar2], taggedExternalCalendars);
      
      // Assert
      expect(allTags).toHaveLength(0);
    });
  });
  
  describe('prepareTaggedExternalCalendars', () => {
    it('should filter out disabled calendars', () => {
      // Arrange
      const externalCalendars = [
        sampleExternalCalendar1,
        { ...sampleExternalCalendar2, disabled: true }
      ];
      
      // Act
      const taggedExternalCalendars = prepareTaggedExternalCalendars(externalCalendars);
      
      // Assert
      expect(taggedExternalCalendars).toHaveLength(1);
      expect(taggedExternalCalendars[0].calendar.name).toBe('external1');
    });
    
    it('should handle missing tags', () => {
      // Arrange
      const externalCalendars = [
        { ...sampleExternalCalendar1, tags: undefined },
        sampleExternalCalendar2
      ];
      
      // Act
      const taggedExternalCalendars = prepareTaggedExternalCalendars(externalCalendars);
      
      // Assert
      expect(taggedExternalCalendars).toHaveLength(2);
      expect(taggedExternalCalendars[0].tags).toEqual([]);
      expect(taggedExternalCalendars[1].tags).toEqual(['Activism', 'Community']);
    });
  });
  
  describe('createAggregateCalendars', () => {
    it('should create aggregate calendars for each tag', async () => {
      // Arrange
      
      const taggedExternalCalendars: TaggedExternalCalendar[] = [];

      sampleCalendar1.tags = ["Music"]
      sampleCalendar2.tags = ["Activism"]
      
      // Act
      const aggregateCalendars = await createAggregateCalendars([sampleCalendar1, sampleCalendar2], taggedExternalCalendars);
      
      // Assert
      expect(aggregateCalendars).toHaveLength(2);
      
      const musicCalendar = aggregateCalendars.find(c => c.name === 'tag-music');
      expect(musicCalendar).toBeDefined();
      expect(musicCalendar?.events).toHaveLength(1);
      expect(musicCalendar?.events[0].summary).toBe('Test Event 1');
      expect(musicCalendar?.events[0].sourceCalendar).toBe('Calendar 1');
      expect(musicCalendar?.events[0].sourceCalendarName).toBe('ripper1-calendar1');

      const activismCalendar = aggregateCalendars.find(c => c.name === 'tag-activism');
      expect(activismCalendar).toBeDefined();
      expect(activismCalendar?.events).toHaveLength(1);
      expect(activismCalendar?.events[0].summary).toBe('Test Event 2');
      expect(activismCalendar?.events[0].sourceCalendar).toBe('Calendar 2');
      expect(activismCalendar?.events[0].sourceCalendarName).toBe('ripper2-calendar2');
    });

    it('should preserve original event description', async () => {
      sampleCalendar1.tags = ["Music"];
      const taggedExternalCalendars: TaggedExternalCalendar[] = [];

      const aggregateCalendars = await createAggregateCalendars([sampleCalendar1], taggedExternalCalendars);
      const event = aggregateCalendars[0].events[0];

      expect(event.description).toBe('Test Description 1');
      expect(event.sourceCalendar).toBe('Calendar 1');
    });

    it('should leave description undefined when event has no description', async () => {
      sampleEvent1.description = undefined;
      sampleCalendar1.tags = ["Music"];
      const taggedExternalCalendars: TaggedExternalCalendar[] = [];

      const aggregateCalendars = await createAggregateCalendars([sampleCalendar1], taggedExternalCalendars);
      const event = aggregateCalendars[0].events[0];

      expect(event.description).toBeUndefined();
      expect(event.sourceCalendar).toBe('Calendar 1');
    });
    
    it('should sort events by date', async () => {
      // Arrange
      const laterEvent = {
        ...sampleEvent1,
        date: ZonedDateTime.parse('2025-01-05T10:00:00+00:00[UTC]')
      };
      
      const earlierEvent = {
        ...sampleEvent2,
        date: ZonedDateTime.parse('2025-01-01T10:00:00+00:00[UTC]')
      };
      
      const calendar1 = {
        ...sampleCalendar1,
        events: [laterEvent]
      };
      
      const calendar2 = {
        ...sampleCalendar2,
        events: [earlierEvent]
      };
      
      calendar1.tags = ["Music"]
      calendar2.tags = ["Music"]
      
      const taggedExternalCalendars: TaggedExternalCalendar[] = [];
      
      // Act
      const aggregateCalendars = await createAggregateCalendars([calendar1, calendar2], taggedExternalCalendars);
      
      // Assert
      expect(aggregateCalendars).toHaveLength(1);
      
      const musicCalendar = aggregateCalendars[0];
      expect(musicCalendar.events).toHaveLength(2);
      expect(musicCalendar.events[0].date).toEqual(earlierEvent.date);
      expect(musicCalendar.events[1].date).toEqual(laterEvent.date);
    });
  });
});

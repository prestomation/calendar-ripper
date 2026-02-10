import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalDate } from '@js-joda/core';
import { RecurringEventProcessor, recurringEventSchema } from './recurring.js';
import * as fs from 'fs';

vi.mock('fs');

describe('RecurringEventProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should parse valid YAML configuration', () => {
      const mockYaml = `
events:
  - name: test-event
    friendlyname: "Test Event"
    description: "Test Description"
    schedule: "2nd Thursday"
    timezone: "America/Los_Angeles"
    duration: "PT2H"
    start_time: "19:00"
    location: "Test Location"
    url: "https://example.com"
    tags: ["test"]
`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockYaml);

      const processor = new RecurringEventProcessor('/fake/path.yaml');
      
      expect(fs.readFileSync).toHaveBeenCalledWith('/fake/path.yaml', 'utf8');
    });
  });

  describe('generateCalendars', () => {
    it('should generate calendars from recurring events', () => {
      const mockYaml = `
events:
  - name: test-event
    friendlyname: "Test Event"
    description: "Test Description"
    schedule: "2nd Thursday"
    timezone: "America/Los_Angeles"
    duration: "PT2H"
    start_time: "19:00"
    location: "Test Location"
    url: "https://example.com"
    tags: ["test"]
`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockYaml);

      const processor = new RecurringEventProcessor('/fake/path.yaml');

      const startDate = LocalDate.of(2024, 1, 1);
      const endDate = LocalDate.of(2024, 3, 31);

      const calendars = processor.generateCalendars(startDate, endDate);

      expect(calendars).toHaveLength(1);
      expect(calendars[0].name).toBe('test-event');
      expect(calendars[0].friendlyname).toBe('Test Event');
    });

    it('should generate weekly recurring events with "every <day>" schedule', () => {
      const mockYaml = `
events:
  - name: weekly-market
    friendlyname: "Weekly Sunday Market"
    description: "A weekly market every Sunday"
    schedule: "every Sunday"
    timezone: "America/Los_Angeles"
    duration: "PT5H"
    start_time: "10:00"
    location: "Test Location"
    url: "https://example.com"
    tags: ["FarmersMarket"]
`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockYaml);

      const processor = new RecurringEventProcessor('/fake/path.yaml');

      // Start on a Wednesday (2024-01-03)
      const startDate = LocalDate.of(2024, 1, 3);
      const endDate = LocalDate.of(2024, 3, 31);

      const calendars = processor.generateCalendars(startDate, endDate);

      expect(calendars).toHaveLength(1);
      expect(calendars[0].events).toHaveLength(1);

      const event = calendars[0].events[0];
      // Next Sunday after Jan 3, 2024 is Jan 7
      expect(event.date.dayOfWeek().value()).toBe(7); // Sunday
      expect(event.date.dayOfMonth()).toBe(7);
      expect(event.rrule).toBe('FREQ=WEEKLY;BYDAY=SU');
    });

    it('should generate seasonal weekly recurring events', () => {
      const mockYaml = `
events:
  - name: seasonal-market
    friendlyname: "Summer Wednesday Market"
    description: "A seasonal weekly market"
    schedule: "every Wednesday"
    timezone: "America/Los_Angeles"
    duration: "PT4H"
    start_time: "15:00"
    location: "Test Location"
    url: "https://example.com"
    tags: ["FarmersMarket"]
    seasonal: "summer"
`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockYaml);

      const processor = new RecurringEventProcessor('/fake/path.yaml');

      const startDate = LocalDate.of(2024, 1, 1);
      const endDate = LocalDate.of(2024, 12, 31);

      const calendars = processor.generateCalendars(startDate, endDate);

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      expect(event.rrule).toBe('FREQ=WEEKLY;BYDAY=WE;BYMONTH=6,7,8,9');
    });
  });
});

describe('recurringEventSchema', () => {
  it('should validate correct recurring event data', () => {
    const validEvent = {
      name: 'test-event',
      friendlyname: 'Test Event',
      description: 'Test Description',
      schedule: '2nd Thursday',
      timezone: 'America/Los_Angeles',
      duration: 'PT2H',
      start_time: '19:00',
      location: 'Test Location',
      url: 'https://example.com',
      tags: ['test']
    };

    const result = recurringEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it('should reject invalid event data', () => {
    const invalidEvent = {
      name: 'invalid name with spaces',
      friendlyname: 'Test Event'
      // missing required fields
    };

    const result = recurringEventSchema.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });
});

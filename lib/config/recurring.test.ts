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

    it('should generate seasonal weekly recurring events with DTSTART in allowed month', () => {
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
      expect(event.rrule).toBe('FREQ=YEARLY;BYDAY=WE;BYMONTH=6,7,8,9');
      // DTSTART must be in an allowed month (June-September), not January
      expect(event.date.monthValue()).toBeGreaterThanOrEqual(6);
      expect(event.date.monthValue()).toBeLessThanOrEqual(9);
    });

    it('should set DTSTART in first allowed month when start date is outside months range', () => {
      const mockYaml = `
events:
  - name: columbia-city-market
    friendlyname: "Columbia City Farmers Market"
    description: "Runs May through October"
    schedule: "every Wednesday"
    timezone: "America/Los_Angeles"
    duration: "PT4H"
    start_time: "15:00"
    location: "Test Location"
    url: "https://example.com"
    tags: ["FarmersMarket"]
    months: [5, 6, 7, 8, 9, 10]
`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockYaml);

      const processor = new RecurringEventProcessor('/fake/path.yaml');
      // Start in February - outside the May-October range
      const calendars = processor.generateCalendars(
        LocalDate.of(2024, 2, 10),
        LocalDate.of(2024, 12, 31)
      );

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      // DTSTART must be in May (first allowed month), not February
      expect(event.date.monthValue()).toBe(5);
      expect(event.date.dayOfWeek().value()).toBe(3); // Wednesday
      expect(event.rrule).toBe('FREQ=YEARLY;BYDAY=WE;BYMONTH=5,6,7,8,9,10');
    });

    it('should set DTSTART in allowed month for monthly schedule with months restriction', () => {
      const mockYaml = `
events:
  - name: summer-artwalk
    friendlyname: "Summer Art Walk"
    description: "Art walk May through September"
    schedule: "2nd Wednesday"
    timezone: "America/Los_Angeles"
    duration: "PT4H"
    start_time: "18:00"
    location: "Test Location"
    url: "https://example.com"
    tags: ["Artwalk"]
    months: [5, 6, 7, 8, 9]
`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockYaml);

      const processor = new RecurringEventProcessor('/fake/path.yaml');
      // Start in January - outside the May-September range
      const calendars = processor.generateCalendars(
        LocalDate.of(2024, 1, 15),
        LocalDate.of(2024, 12, 31)
      );

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      // DTSTART must be in May (first allowed month)
      expect(event.date.monthValue()).toBe(5);
      expect(event.rrule).toBe('FREQ=MONTHLY;BYDAY=2WE;BYMONTH=5,6,7,8,9');
    });

    it('should use explicit months array for BYMONTH in RRULE', () => {
      const mockYaml = `
events:
  - name: custom-months-market
    friendlyname: "May-October Market"
    description: "A market running May through October"
    schedule: "every Wednesday"
    timezone: "America/Los_Angeles"
    duration: "PT4H"
    start_time: "15:00"
    location: "Test Location"
    url: "https://example.com"
    tags: ["FarmersMarket"]
    months: [5, 6, 7, 8, 9, 10]
`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockYaml);

      const processor = new RecurringEventProcessor('/fake/path.yaml');
      const calendars = processor.generateCalendars(
        LocalDate.of(2024, 1, 1),
        LocalDate.of(2024, 12, 31)
      );

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      expect(event.rrule).toBe('FREQ=YEARLY;BYDAY=WE;BYMONTH=5,6,7,8,9,10');
    });

    it('should use explicit months for monthly recurring events', () => {
      const mockYaml = `
events:
  - name: custom-months-artwalk
    friendlyname: "May-September Art Walk"
    description: "An art walk running May through September"
    schedule: "2nd Wednesday"
    timezone: "America/Los_Angeles"
    duration: "PT4H"
    start_time: "18:00"
    location: "Test Location"
    url: "https://example.com"
    tags: ["Artwalk"]
    months: [5, 6, 7, 8, 9]
`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockYaml);

      const processor = new RecurringEventProcessor('/fake/path.yaml');
      const calendars = processor.generateCalendars(
        LocalDate.of(2024, 1, 1),
        LocalDate.of(2024, 12, 31)
      );

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      expect(event.rrule).toBe('FREQ=MONTHLY;BYDAY=2WE;BYMONTH=5,6,7,8,9');
    });

    it('should generate compound schedule with "1st and 3rd Tuesday"', () => {
      const mockYaml = `
events:
  - name: open-mic
    friendlyname: "Open Mic Night"
    description: "Twice-monthly open mic"
    schedule: "1st and 3rd Tuesday"
    timezone: "America/Los_Angeles"
    duration: "PT2H"
    start_time: "20:00"
    location: "Test Location"
    url: "https://example.com"
    tags: ["OpenMic"]
`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockYaml);

      const processor = new RecurringEventProcessor('/fake/path.yaml');

      // Start on Jan 1, 2024 (Monday)
      const startDate = LocalDate.of(2024, 1, 1);
      const endDate = LocalDate.of(2024, 3, 31);

      const calendars = processor.generateCalendars(startDate, endDate);

      expect(calendars).toHaveLength(1);
      expect(calendars[0].events).toHaveLength(1);

      const event = calendars[0].events[0];
      // First Tuesday on or after Jan 1 is Jan 2 (1st Tuesday of January)
      expect(event.date.dayOfWeek().value()).toBe(2); // Tuesday
      expect(event.date.dayOfMonth()).toBe(2);
      expect(event.rrule).toBe('FREQ=MONTHLY;BYDAY=1TU,3TU');
    });

    it('should pick earliest ordinal for DTSTART with compound schedule', () => {
      const mockYaml = `
events:
  - name: open-mic
    friendlyname: "Open Mic Night"
    description: "Twice-monthly open mic"
    schedule: "1st and 3rd Tuesday"
    timezone: "America/Los_Angeles"
    duration: "PT2H"
    start_time: "20:00"
    location: "Test Location"
    url: "https://example.com"
    tags: ["OpenMic"]
`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockYaml);

      const processor = new RecurringEventProcessor('/fake/path.yaml');

      // Start on Jan 10, 2024 — after 1st Tuesday (Jan 2) but before 3rd Tuesday (Jan 16)
      const startDate = LocalDate.of(2024, 1, 10);
      const endDate = LocalDate.of(2024, 3, 31);

      const calendars = processor.generateCalendars(startDate, endDate);

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      // Should pick 3rd Tuesday (Jan 16) since 1st Tuesday (Jan 2) is before startDate
      expect(event.date.dayOfMonth()).toBe(16);
      expect(event.date.monthValue()).toBe(1);
      expect(event.rrule).toBe('FREQ=MONTHLY;BYDAY=1TU,3TU');
    });

    it('should support compound schedule with month restriction', () => {
      const mockYaml = `
events:
  - name: summer-open-mic
    friendlyname: "Summer Open Mic"
    description: "Twice-monthly open mic in summer"
    schedule: "2nd and 4th Friday"
    timezone: "America/Los_Angeles"
    duration: "PT2H"
    start_time: "19:00"
    location: "Test Location"
    url: "https://example.com"
    tags: ["OpenMic"]
    months: [6, 7, 8]
`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockYaml);

      const processor = new RecurringEventProcessor('/fake/path.yaml');

      const startDate = LocalDate.of(2024, 1, 1);
      const endDate = LocalDate.of(2024, 12, 31);

      const calendars = processor.generateCalendars(startDate, endDate);

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      expect(event.date.monthValue()).toBe(6); // June (first allowed month)
      expect(event.rrule).toBe('FREQ=MONTHLY;BYDAY=2FR,4FR;BYMONTH=6,7,8');
    });

    it('should prefer explicit months over seasonal when both are provided', () => {
      const mockYaml = `
events:
  - name: override-event
    friendlyname: "Override Event"
    description: "Event with both seasonal and months"
    schedule: "every Thursday"
    timezone: "America/Los_Angeles"
    duration: "PT4H"
    start_time: "15:00"
    location: "Test Location"
    url: "https://example.com"
    tags: ["FarmersMarket"]
    seasonal: "summer"
    months: [4, 5, 6, 7, 8, 9, 10]
`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockYaml);

      const processor = new RecurringEventProcessor('/fake/path.yaml');
      const calendars = processor.generateCalendars(
        LocalDate.of(2024, 1, 1),
        LocalDate.of(2024, 12, 31)
      );

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      // months should take precedence over seasonal
      expect(event.rrule).toBe('FREQ=YEARLY;BYDAY=TH;BYMONTH=4,5,6,7,8,9,10');
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

  it('should validate recurring event with months field', () => {
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
      tags: ['test'],
      months: [5, 6, 7, 8, 9]
    };

    const result = recurringEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it('should reject months with invalid values', () => {
    const invalidEvent = {
      name: 'test-event',
      friendlyname: 'Test Event',
      description: 'Test Description',
      schedule: '2nd Thursday',
      timezone: 'America/Los_Angeles',
      duration: 'PT2H',
      start_time: '19:00',
      location: 'Test Location',
      url: 'https://example.com',
      tags: ['test'],
      months: [0, 13]  // invalid month numbers
    };

    const result = recurringEventSchema.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it('should reject empty url', () => {
    const invalidEvent = {
      name: 'test-event',
      friendlyname: 'Test Event',
      description: 'Test Description',
      schedule: '2nd Thursday',
      timezone: 'America/Los_Angeles',
      duration: 'PT2H',
      start_time: '19:00',
      location: 'Test Location',
      url: '',
      tags: ['test']
    };

    const result = recurringEventSchema.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it('should reject invalid url', () => {
    const invalidEvent = {
      name: 'test-event',
      friendlyname: 'Test Event',
      description: 'Test Description',
      schedule: '2nd Thursday',
      timezone: 'America/Los_Angeles',
      duration: 'PT2H',
      start_time: '19:00',
      location: 'Test Location',
      url: 'not-a-url',
      tags: ['test']
    };

    const result = recurringEventSchema.safeParse(invalidEvent);
    expect(result.success).toBe(false);
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

import { describe, expect, test } from 'vitest';
import SeattleBeerWeekRipper from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Seattle Beer Week Ripper', () => {
  test('parses events correctly from JSON', async () => {
    const jsonPath = path.join(__dirname, 'seattle_beer_week_2026-04-26.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    const ripper = new SeattleBeerWeekRipper();
    const date = ZonedDateTime.parse('2026-04-26T00:00:00-07:00[America/Los_Angeles]');
    const events = await ripper.parseEvents(jsonData, date, {});

    expect(events.length).toBeGreaterThan(0);

    // Find the Cask-O-Rama event which maps to Beveridge Place Pub
    const caskEvent = events.find(e =>
      'summary' in e && e.summary === 'Seattle Cask-O-Rama!'
    ) as RipperCalendarEvent;

    expect(caskEvent).toBeDefined();
    expect(caskEvent.summary).toBe('Seattle Cask-O-Rama!');

    // Location should be resolved from the locations array, not a raw ID
    expect(caskEvent.location).toContain('Beveridge Place Pub');
    expect(caskEvent.location).not.toMatch(/^Location ID:/);
    expect(caskEvent.location).not.toMatch(/^m[0-9a-z]+$/);
  });

  test('parses events correctly from old JSON format', async () => {
    const jsonPath = path.join(__dirname, 'seattle_beer_week_2025-04-06.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    const ripper = new SeattleBeerWeekRipper();
    const date = ZonedDateTime.parse('2025-04-06T00:00:00-07:00[America/Los_Angeles]');
    const events = await ripper.parseEvents(jsonData, date, {});

    expect(events.length).toBeGreaterThan(0);

    const caskEvent = events.find(e =>
      'summary' in e && e.summary === 'SEATTLE CASK-O-RAMA!'
    ) as RipperCalendarEvent;

    expect(caskEvent).toBeDefined();
    expect(caskEvent.id).toBe('m8xcy9mj');

    // Old sample has no locations array, so location should be undefined (not "Location ID: ...")
    expect(caskEvent.location).toBeUndefined();
  });
  
  test('handles errors gracefully', async () => {
    // Create a malformed JSON object
    const malformedJson = {
      data: {
        widgets: {
          "widget1": {
            data: {
              settings: {
                events: [
                  {
                    // Missing required fields
                    id: "123"
                  },
                  {
                    // Invalid date format
                    id: "456",
                    name: "Bad Event",
                    start: {
                      date: "not-a-date",
                      time: "not-a-time"
                    }
                  }
                ]
              }
            }
          }
        }
      }
    };
    
    // Create an instance of the ripper
    const ripper = new SeattleBeerWeekRipper();
    
    // Test events
    const date = ZonedDateTime.parse('2025-04-06T00:00:00-07:00[America/Los_Angeles]');
    const events = await ripper.parseEvents(malformedJson, date, {});
    
    // We should have no valid events, only errors
    const validEvents = events.filter(e => 'summary' in e);
    const errorEvents = events.filter(e => 'type' in e);
    
    expect(validEvents.length).toBe(0);
    expect(errorEvents.length).toBeGreaterThan(0);
    
    // Check that error messages are informative
    const errorEvent = errorEvents[0];
    expect(errorEvent.type).toBe('ParseError');
    expect(errorEvent.reason).toContain('Event missing');
  });
  
  test('skips empty events', async () => {
    // Create a JSON with empty events
    const jsonWithEmptyEvents = {
      data: {
        widgets: {
          "widget1": {
            data: {
              settings: {
                events: [
                  {}, // Empty event
                  {
                    id: "123",
                    name: "Valid Event",
                    start: {
                      type: "datetime",
                      date: "2025-05-09",
                      time: "17:00"
                    },
                    end: {
                      type: "datetime",
                      date: "2025-05-09",
                      time: "19:00"
                    },
                    timeZone: "America/Los_Angeles",
                    description: "Test event"
                  },
                  {} // Another empty event
                ]
              }
            }
          }
        }
      }
    };
    
    // Create an instance of the ripper
    const ripper = new SeattleBeerWeekRipper();
    
    // Test events
    const date = ZonedDateTime.parse('2025-04-06T00:00:00-07:00[America/Los_Angeles]');
    const events = await ripper.parseEvents(jsonWithEmptyEvents, date, {});
    
    // We should have only one valid event
    const validEvents = events.filter(e => 'summary' in e);
    expect(validEvents.length).toBe(1);
    expect(validEvents[0].summary).toBe('Valid Event');
  });
});

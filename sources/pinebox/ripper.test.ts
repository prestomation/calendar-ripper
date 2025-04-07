import { describe, expect, test } from 'vitest';
import PineboxRipper from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Pinebox Ripper', () => {
  test('parses events correctly from JSON', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'pinebox-2025-04-06.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new PineboxRipper();
    
    // Test with the sample data
    const date = ZonedDateTime.parse('2025-04-06T00:00:00-07:00[America/Los_Angeles]');
    const events = await ripper.parseEvents(jsonData, date, {});
    
    // Verify we got the correct number of events
    expect(events.length).toBe(jsonData.length);
    
    // Expected output for the first event
    const expectedEvent = {
      id: "67be45bf431e4e4f9d2f8556",
      summary: "Tarot Card Reading",
      date: {
        year: 2025,
        month: 4,
        day: 11,
        hour: 10,
        minute: 0
      },
      duration: {
        hours: 4,
        minutes: 0
      },
      url: "https://pinebox.com/events/2025/2/28/tarot-card-reading-dl5kh-y7nck",
      image: "https://images.squarespace-cdn.com/content/v1/59ce7d1c29f1875fd4041366/1740522898198-5FUL2XMHW80YYXBUW40N/IMG_1549.jpg"
    };
    
    // Verify specific event properties for the first event
    if (events.length > 0 && 'date' in events[0]) {
      const event = events[0] as RipperCalendarEvent;
      
      // Check basic properties
      expect(event.id).toBe(expectedEvent.id);
      expect(event.summary).toBe(expectedEvent.summary);
      expect(event.url).toBe(expectedEvent.url);
      
      // Check date
      expect(event.date.year()).toBe(expectedEvent.date.year);
      expect(event.date.monthValue()).toBe(expectedEvent.date.month);
      expect(event.date.dayOfMonth()).toBe(expectedEvent.date.day);
      
      // Check duration
      expect(event.duration.toHours()).toBe(expectedEvent.duration.hours);
      expect(event.duration.toMinutes() % 60).toBe(expectedEvent.duration.minutes);
      
      // Check image URL
      expect(event.image).toBe(expectedEvent.image);
      expect(event.description).toContain("Event image:");
      expect(event.description).toContain(expectedEvent.image);
    }
    
    // Expected output for the second event
    const expectedEvent2 = {
      id: "67be45ed241ae305e128d681",
      summary: "The Skank Tank Drag Show",
      date: {
        year: 2025,
        month: 4,
        day: 6
      },
      url: "https://pinebox.com/events/2025/3/23/the-skank-tank-drag-show-4jedy",
      image: "https://images.squarespace-cdn.com/content/v1/59ce7d1c29f1875fd4041366/1740079479085-KG7JV58UNB7YW6IBMIGS/Skank%2BTank.jpg"
    };
    
    // Verify specific event properties for the second event
    if (events.length > 1 && 'date' in events[1]) {
      const event = events[1] as RipperCalendarEvent;
      
      // Check basic properties
      expect(event.id).toBe(expectedEvent2.id);
      expect(event.summary).toBe(expectedEvent2.summary);
      expect(event.url).toBe(expectedEvent2.url);
      
      // Check date
      expect(event.date.year()).toBe(expectedEvent2.date.year);
      expect(event.date.monthValue()).toBe(expectedEvent2.date.month);
      expect(event.date.dayOfMonth()).toBe(expectedEvent2.date.day);
      
      // Check image URL
      expect(event.image).toBe(expectedEvent2.image);
      expect(event.description).toContain("Event image:");
      expect(event.description).toContain(expectedEvent2.image);
    }
  });
  
  test('handles invalid JSON data gracefully', async () => {
    // Create an instance of the ripper
    const ripper = new PineboxRipper();
    
    // Test with invalid JSON data (not an array)
    const invalidData = { events: "not an array" };
    const date = ZonedDateTime.parse('2025-04-06T00:00:00-07:00[America/Los_Angeles]');
    const events = await ripper.parseEvents(invalidData, date, {});
    
    // Should return a parse error
    expect(events.length).toBe(1);
    expect('type' in events[0]).toBe(true);
    if ('type' in events[0]) {
      expect(events[0].type).toBe("ParseError");
      expect(events[0].reason).toContain("Invalid JSON structure");
    }
  });
});

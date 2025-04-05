import { describe, expect, test } from '@jest/globals';
import DowntownSeattleRipper from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Downtown Seattle Association Ripper', () => {
  test('parses events correctly from JSON', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'dsa-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new DowntownSeattleRipper();
    
    // Test Pioneer Park events
    const pioneerParkConfig = { venue_id: 53757 };
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const pioneerParkEvents = await ripper.parseEvents(jsonData, date, pioneerParkConfig);
    
    // Verify we got the correct number of Pioneer Park events
    const pioneerParkEventsCount = jsonData.events.filter(
      (event: any) => event.venue && event.venue.id === 53757
    ).length;
    expect(pioneerParkEvents.length).toBe(pioneerParkEventsCount);
    
    // Test Westlake Park events
    const westlakeParkConfig = { venue_id: 53732 };
    const westlakeParkEvents = await ripper.parseEvents(jsonData, date, westlakeParkConfig);
    
    // Verify we got the correct number of Westlake Park events
    const westlakeParkEventsCount = jsonData.events.filter(
      (event: any) => event.venue && event.venue.id === 53732
    ).length;
    expect(westlakeParkEvents.length).toBe(westlakeParkEventsCount);
    
    // Verify event properties for a specific event
    if (pioneerParkEvents.length > 0 && 'date' in pioneerParkEvents[0]) {
      const event = pioneerParkEvents[0];
      expect(event.summary).toBeDefined();
      expect(event.date).toBeDefined();
      expect(event.duration).toBeDefined();
      expect(event.location).toContain('Pioneer Park');
    }
  });
  
  test('handles filtering by venue correctly', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'dsa-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new DowntownSeattleRipper();
    
    // Test with a non-existent venue ID
    const nonExistentVenueConfig = { venue_id: 99999 };
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const events = await ripper.parseEvents(jsonData, date, nonExistentVenueConfig);
    
    // Should return an empty array since no events match this venue
    expect(events.length).toBe(0);
  });
  
  test('handles HTML stripping in descriptions', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'dsa-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new DowntownSeattleRipper();
    
    // Get events
    const config = { venue_id: 53757 }; // Pioneer Park
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const events = await ripper.parseEvents(jsonData, date, config);
    
    // Find an event with HTML in the description
    const eventWithHtml = events.find(e => 'description' in e && e.description);
    
    if (eventWithHtml && 'description' in eventWithHtml) {
      // Verify HTML tags were stripped
      expect(eventWithHtml.description).not.toContain('<p>');
      expect(eventWithHtml.description).not.toContain('</p>');
    }
  });
});

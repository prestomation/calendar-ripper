import { describe, expect, test } from '@jest/globals';
import PacificScienceCenterRipper from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Pacific Science Center Ripper', () => {
  test('parses all events correctly from JSON', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'pac-sci-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new PacificScienceCenterRipper();
    
    // Test all events
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const allEvents = await ripper.parseEvents(jsonData, date, {});
    
    // Verify we got the correct number of events
    expect(allEvents.length).toBe(jsonData.length);
    
    // Verify specific event properties for the first event
    if (allEvents.length > 0 && 'date' in allEvents[0]) {
      const event = allEvents[0] as RipperCalendarEvent;
      const expectedEvent = jsonData[0];
      
      // Check basic properties
      expect(event.id).toBe(expectedEvent.id.toString());
      expect(event.summary).toBe(expectedEvent.title.rendered);
      expect(event.url).toBe(expectedEvent.link);
      
      // Check that the description has HTML stripped
      expect(event.description).not.toContain('<p>');
      
      // Check date parsing
      const expectedDate = ZonedDateTime.parse(expectedEvent.date + "[America/Los_Angeles]");
      expect(event.date.toString()).toBe(expectedDate.toString());
    }
  });
  
  test('filters Laser Dome events correctly', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'pac-sci-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new PacificScienceCenterRipper();
    
    // Test Laser Dome events
    const laserDomeConfig = { location_id: 40 };
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const laserDomeEvents = await ripper.parseEvents(jsonData, date, laserDomeConfig);
    
    // Get the expected Laser Dome events from the JSON data
    const expectedLaserDomeEvents = jsonData.filter(
      (event: any) => event.location && event.location.includes(40)
    );
    
    // Verify we got the correct number of Laser Dome events
    expect(laserDomeEvents.length).toBe(expectedLaserDomeEvents.length);
    
    // Verify all events are actually Laser Dome events
    for (const event of laserDomeEvents) {
      if ('location' in event) {
        expect(event.location?.toLowerCase()).toContain('laser dome');
      }
    }
  });
  
  test('filters PACCAR Theater events correctly', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'pac-sci-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new PacificScienceCenterRipper();
    
    // Test PACCAR Theater events
    const paccarConfig = { location_id: 39 };
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const paccarEvents = await ripper.parseEvents(jsonData, date, paccarConfig);
    
    // Get the expected PACCAR Theater events from the JSON data
    const expectedPaccarEvents = jsonData.filter(
      (event: any) => event.location && event.location.includes(39)
    );
    
    // Verify we got the correct number of PACCAR Theater events
    expect(paccarEvents.length).toBe(expectedPaccarEvents.length);
    
    // Verify all events are actually PACCAR Theater events
    for (const event of paccarEvents) {
      if ('location' in event) {
        expect(event.location?.toLowerCase()).toContain('paccar theater');
      }
    }
  });
  
  test('filters Special Events correctly', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'pac-sci-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new PacificScienceCenterRipper();
    
    // Test Special Events
    const specialEventsConfig = { event_series_id: 34 };
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const specialEvents = await ripper.parseEvents(jsonData, date, specialEventsConfig);
    
    // Get the expected Special Events from the JSON data
    const expectedSpecialEvents = jsonData.filter(
      (event: any) => event.event_series && event.event_series.includes(34)
    );
    
    // Verify we got the correct number of Special Events
    expect(specialEvents.length).toBe(expectedSpecialEvents.length);
  });
  
  test('handles invalid JSON data gracefully', async () => {
    // Create an instance of the ripper
    const ripper = new PacificScienceCenterRipper();
    
    // Test with invalid JSON data
    const invalidData = { events: "not an array" };
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const result = await ripper.parseEvents(invalidData, date, {});
    
    // Should return a parse error
    expect(result.length).toBe(1);
    expect('type' in result[0] && result[0].type).toBe("ParseError");
  });
  
  test('extracts image URLs correctly', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'pac-sci-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new PacificScienceCenterRipper();
    
    // Get events
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const events = await ripper.parseEvents(jsonData, date, {});
    
    // Find an event with an image
    const eventWithImage = events.find(e => 
      'image' in e && e.image
    ) as RipperCalendarEvent | undefined;
    
    if (eventWithImage) {
      // Verify image URL is set
      expect(eventWithImage.image).toBeDefined();
      
      // Verify image URL is appended to description
      expect(eventWithImage.description).toContain('Event image:');
      expect(eventWithImage.description).toContain(eventWithImage.image);
    }
  });
});

import { describe, expect, test } from 'vitest';
import DowntownSeattleRipper from './ripper.js';
import { ZonedDateTime, Duration } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Downtown Seattle Association Ripper', () => {
  test('parses Pioneer Park events correctly from JSON', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'dsa-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new DowntownSeattleRipper();
    
    // Test Pioneer Park events
    const pioneerParkConfig = { venue_id: 53757 };
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const pioneerParkEvents = await ripper.parseEvents(jsonData, date, pioneerParkConfig);
    
    // Get the expected Pioneer Park events from the JSON data
    const expectedPioneerParkEvents = jsonData.events.filter(
      (event: any) => event.venue && event.venue.id === 53757
    );
    
    // Verify we got the correct number of Pioneer Park events
    expect(pioneerParkEvents.length).toBe(expectedPioneerParkEvents.length);
    
    // Verify specific event properties for the first event
    if (pioneerParkEvents.length > 0 && 'date' in pioneerParkEvents[0]) {
      const event = pioneerParkEvents[0] as RipperCalendarEvent;
      const expectedEvent = expectedPioneerParkEvents[0];
      
      // Check basic properties
      expect(event.id).toBe(expectedEvent.id.toString());
      expect(event.summary).toBe(expectedEvent.title);
      expect(event.url).toBe(expectedEvent.url);
      
      // Check that the description has HTML stripped
      expect(event.description).not.toContain('<p>');
      expect(event.description).toContain('Enjoy a free lunchtime serenade');
      
      // Check location formatting
      expect(event.location).toContain('Pioneer Park');
      expect(event.location).toContain('100 Yesler Way');
      expect(event.location).toContain('Seattle');
      
    // Check date and duration
    const expectedYear = parseInt(expectedEvent.start_date_details.year);
    const expectedMonth = parseInt(expectedEvent.start_date_details.month);
    const expectedDay = parseInt(expectedEvent.start_date_details.day);
    const expectedHour = parseInt(expectedEvent.start_date_details.hour);
    const expectedMinute = parseInt(expectedEvent.start_date_details.minutes);
    
    expect(event.date.year()).toBe(expectedYear);
    expect(event.date.monthValue()).toBe(expectedMonth);
    expect(event.date.dayOfMonth()).toBe(expectedDay);
    expect(event.date.hour()).toBe(expectedHour);
    expect(event.date.minute()).toBe(expectedMinute);
    }
  });
  
  test('parses Westlake Park events correctly from JSON', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'dsa-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new DowntownSeattleRipper();
    
    // Test Westlake Park events
    const westlakeParkConfig = { venue_id: 53732 };
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const westlakeParkEvents = await ripper.parseEvents(jsonData, date, westlakeParkConfig);
    
    // Get the expected Westlake Park events from the JSON data
    const expectedWestlakeParkEvents = jsonData.events.filter(
      (event: any) => event.venue && event.venue.id === 53732
    );
    
    // Verify we got the correct number of Westlake Park events
    expect(westlakeParkEvents.length).toBe(expectedWestlakeParkEvents.length);
    
    // Verify specific event properties for the first event
    if (westlakeParkEvents.length > 0 && 'date' in westlakeParkEvents[0]) {
      const event = westlakeParkEvents[0] as RipperCalendarEvent;
      const expectedEvent = expectedWestlakeParkEvents[0];
      
      // Check basic properties
      expect(event.id).toBe(expectedEvent.id.toString());
      expect(event.summary).toBe(expectedEvent.title);
      expect(event.url).toBe(expectedEvent.url);
      
      // Check that the description has HTML stripped
      expect(event.description).not.toContain('<p>');
      
      // Check location formatting
      expect(event.location).toContain('Westlake Park');
      expect(event.location).toContain('401 Pine St');
      expect(event.location).toContain('Seattle');
      
      // Check specific event details for Food Truck Fest
      expect(event.summary).toContain('Food Truck Fest');
      expect(event.description).toContain('Spice up your lunch break');
      
      // Check duration calculation
      const startDetails = expectedEvent.start_date_details;
      const endDetails = expectedEvent.end_date_details;
      
      // Calculate expected duration
      const startHour = parseInt(startDetails.hour);
      const startMinute = parseInt(startDetails.minutes);
      const endHour = parseInt(endDetails.hour);
      const endMinute = parseInt(endDetails.minutes);
      
      // Calculate duration in hours and minutes
      let expectedDurationHours = endHour - startHour;
      let expectedDurationMinutes = endMinute - startMinute;
      
      // Adjust if minutes are negative
      if (expectedDurationMinutes < 0) {
        expectedDurationHours--;
        expectedDurationMinutes += 60;
      }
      
      expect(event.duration.toHours()).toBe(expectedDurationHours);
      expect(event.duration.toMinutes() % 60).toBe(expectedDurationMinutes);
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
    
    // Test with no venue filter
    const noVenueConfig = {};
    const allEvents = await ripper.parseEvents(jsonData, date, noVenueConfig);
    
    // Should return all events
    expect(allEvents.length).toBe(jsonData.events.length);
  });
  
  test('calculates event duration correctly', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'dsa-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new DowntownSeattleRipper();
    
    // Get Earth Day Market event (which has a longer duration)
    const westlakeParkConfig = { venue_id: 53732 };
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const events = await ripper.parseEvents(jsonData, date, westlakeParkConfig);
    
    // Find the Earth Day Market event
    const earthDayEvent = events.find(e => 
      'summary' in e && e.summary.includes('Earth Day Market')
    ) as RipperCalendarEvent | undefined;
    
    if (earthDayEvent) {
      // Earth Day Market is from 11am to 5pm (6 hours)
      expect(earthDayEvent.duration.toHours()).toBe(6);
      expect(earthDayEvent.duration.toMinutes() % 60).toBe(0);
    }
    
    // Find a standard 2-hour event
    const standardEvent = events.find(e => 
      'summary' in e && e.summary.includes('Food Truck Fest')
    ) as RipperCalendarEvent | undefined;
    
    if (standardEvent) {
      // Food Truck Fest is from 11am to 2pm (3 hours)
      expect(standardEvent.duration.toHours()).toBe(3);
      expect(standardEvent.duration.toMinutes() % 60).toBe(0);
    }
  });

  test('includes image URLs in events', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'dsa-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new DowntownSeattleRipper();
    
    // Get events
    const config = { venue_id: 53757 }; // Pioneer Park
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const events = await ripper.parseEvents(jsonData, date, config);
    
    // Find an event with an image
    const eventWithImage = events.find(e => 
      'image' in e && e.image
    ) as RipperCalendarEvent | undefined;
    
    if (eventWithImage) {
      // Verify image URL is set
      expect(eventWithImage.image).toBeDefined();
      expect(eventWithImage.image).toContain('https://downtownseattle.org');
      
      // Verify image URL is appended to description
      expect(eventWithImage.description).toContain('Event image:');
      expect(eventWithImage.description).toContain(eventWithImage.image);
    }
  });
});

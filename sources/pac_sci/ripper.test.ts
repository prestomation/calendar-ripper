import { describe, expect, test } from 'vitest';
import PacificScienceCenterRipper from './ripper.js';
import { ZonedDateTime, LocalDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Pacific Science Center Ripper', () => {
  test('parses all events correctly from JSON', async () => {
    const jsonPath = path.join(__dirname, 'pac-sci-2025-12-13.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    const ripper = new PacificScienceCenterRipper();
    const date = ZonedDateTime.parse('2025-12-13T00:00:00-08:00[America/Los_Angeles]');
    const allEvents = await ripper.parseEvents(jsonData, date, {});
    
    expect(allEvents.length).toBe(jsonData.length);
    
    if (allEvents.length > 0 && 'date' in allEvents[0]) {
      const event = allEvents[0] as RipperCalendarEvent;
      const expectedEvent = jsonData[0];
      
      expect(event.id).toBe(expectedEvent.id.toString());
      expect(event.summary).toBe('Laser Trans-Siberian Orchestra & Musicals'); // Expect decoded HTML entities
      expect(event.url).toBe(expectedEvent.link);
      expect(event.description).not.toContain('<p>');
      
      const expectedLocalDateTime = LocalDateTime.parse(expectedEvent.date);
      const expectedDate = expectedLocalDateTime.atZone(date.zone());
      expect(event.date.toString()).toBe(expectedDate.toString());
    }
  });
  
  test('filters Laser Dome events correctly', async () => {
    const jsonPath = path.join(__dirname, 'pac-sci-2025-12-13.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    const ripper = new PacificScienceCenterRipper();
    const laserDomeConfig = { location_id: 40 };
    const date = ZonedDateTime.parse('2025-12-13T00:00:00-08:00[America/Los_Angeles]');
    const laserDomeEvents = await ripper.parseEvents(jsonData, date, laserDomeConfig);
    
    const expectedLaserDomeEvents = jsonData.filter(
      (event: any) => event.location && event.location.includes(40)
    );
    
    expect(laserDomeEvents.length).toBe(expectedLaserDomeEvents.length);
    
    for (const event of laserDomeEvents) {
      if ('location' in event) {
        expect(event.location?.toLowerCase()).toContain('laser dome');
      }
    }
  });
  
  test('filters PACCAR Theater events correctly', async () => {
    const jsonPath = path.join(__dirname, 'pac-sci-2025-12-13.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    const ripper = new PacificScienceCenterRipper();
    const paccarConfig = { location_id: 39 };
    const date = ZonedDateTime.parse('2025-12-13T00:00:00-08:00[America/Los_Angeles]');
    const paccarEvents = await ripper.parseEvents(jsonData, date, paccarConfig);
    
    const expectedPaccarEvents = jsonData.filter(
      (event: any) => event.location && event.location.includes(39)
    );
    
    expect(paccarEvents.length).toBe(expectedPaccarEvents.length);
  });
  
  test('filters Special Events correctly', async () => {
    const jsonPath = path.join(__dirname, 'pac-sci-2025-12-13.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    const ripper = new PacificScienceCenterRipper();
    const specialEventsConfig = { event_series_id: 34 };
    const date = ZonedDateTime.parse('2025-12-13T00:00:00-08:00[America/Los_Angeles]');
    const specialEvents = await ripper.parseEvents(jsonData, date, specialEventsConfig);
    
    const expectedSpecialEvents = jsonData.filter(
      (event: any) => event.event_series && event.event_series.includes(34)
    );
    
    expect(specialEvents.length).toBe(expectedSpecialEvents.length);
  });
  
  test('handles invalid JSON data gracefully', async () => {
    const ripper = new PacificScienceCenterRipper();
    const invalidData = { events: "not an array" };
    const date = ZonedDateTime.parse('2025-12-13T00:00:00-08:00[America/Los_Angeles]');
    const result = await ripper.parseEvents(invalidData, date, {});
    
    expect(result.length).toBe(1);
    expect('type' in result[0] && result[0].type).toBe("ParseError");
  });
  
  test('extracts image URLs correctly', async () => {
    const jsonPath = path.join(__dirname, 'pac-sci-2025-12-13.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    const ripper = new PacificScienceCenterRipper();
    const date = ZonedDateTime.parse('2025-12-13T00:00:00-08:00[America/Los_Angeles]');
    const events = await ripper.parseEvents(jsonData, date, {});
    
    const eventWithImage = events.find(e => 
      'description' in e && e.description && e.description.includes('Event image:')
    ) as RipperCalendarEvent | undefined;
    
    if (eventWithImage) {
      expect(eventWithImage.description).toContain('Event image:');
    }
  });
});

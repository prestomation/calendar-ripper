import { RipperCalendar, RipperCalendarEvent, RipperError, ExternalCalendar, toICS } from './config/schema.js';
import { ZonedDateTime, Duration } from '@js-joda/core';

/**
 * Represents a calendar with its associated tags
 */
export interface TaggedCalendar {
  calendar: RipperCalendar;
  tags: string[];
}

/**
 * Represents an external calendar with its associated tags
 */
export interface TaggedExternalCalendar {
  calendar: ExternalCalendar;
  tags: string[];
}

/**
 * Collects all unique tags from the provided calendars
 */
export function collectAllTags(
  taggedCalendars: RipperCalendar[],
  taggedExternalCalendars: TaggedExternalCalendar[]
): string[] {
  const allTags = new Set<string>();
  
  // Collect tags from regular calendars
  taggedCalendars.forEach(tc => {
    tc.tags.forEach(tag => allTags.add(tag));
  });
  
  // Collect tags from external calendars
  taggedExternalCalendars.forEach(tec => {
    console.log(tec.tags);
    tec.tags.forEach(tag => allTags.add(tag));
  });
  
  return Array.from(allTags);
}

/**
 * Fetches and parses an external calendar from its URL
 * Filters events to only include those within the specified time range
 */
export async function fetchExternalCalendar(url: string): Promise<RipperCalendarEvent[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch calendar: ${response.status} ${response.statusText}`);
    }
    
    const icsData = await response.text();
    
    // Simple regex-based parsing for ICS files
    // This is a basic implementation that extracts the essential event data
    const events: RipperCalendarEvent[] = [];
    
    // Define time range: 1 week before now to 3 months in the future
    const now = new Date();
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(now.getDate() - 7);
    
    const threeMonthsLater = new Date(now);
    threeMonthsLater.setMonth(now.getMonth() + 3);
    
    // Split the ICS file into events
    const eventBlocks = icsData.split('BEGIN:VEVENT');
    
    for (let i = 1; i < eventBlocks.length; i++) {
      try {
        const eventBlock = eventBlocks[i];
        
        // Extract UID
        const uidMatch = eventBlock.match(/UID:(.*?)(?:\r\n|\n)/);
        const uid = uidMatch ? uidMatch[1].trim() : `external-${Date.now()}-${i}`;
        
        // Extract summary
        const summaryMatch = eventBlock.match(/SUMMARY:(.*?)(?:\r\n|\n)/);
        const summary = summaryMatch ? summaryMatch[1].trim() : 'Untitled Event';
        
        // Extract description
        const descriptionMatch = eventBlock.match(/DESCRIPTION:(.*?)(?:\r\n|\n)/);
        const description = descriptionMatch ? descriptionMatch[1].trim() : undefined;
        
        // Extract location
        const locationMatch = eventBlock.match(/LOCATION:(.*?)(?:\r\n|\n)/);
        const location = locationMatch ? locationMatch[1].trim() : undefined;
        
        // Extract URL
        const urlMatch = eventBlock.match(/URL:(.*?)(?:\r\n|\n)/);
        const url = urlMatch ? urlMatch[1].trim() : undefined;
        
        // Extract start date
        const dtStartMatch = eventBlock.match(/DTSTART(?:;[^:]*)?:(.*?)(?:\r\n|\n)/);
        if (!dtStartMatch) continue;
        
        const dtStartStr = dtStartMatch[1].trim();
        
        // Parse the date string
        let startDate: Date;
        if (dtStartStr.includes('T')) {
          // Format: 20250101T100000Z
          const year = parseInt(dtStartStr.substring(0, 4));
          const month = parseInt(dtStartStr.substring(4, 6)) - 1; // JS months are 0-based
          const day = parseInt(dtStartStr.substring(6, 8));
          const hour = parseInt(dtStartStr.substring(9, 11));
          const minute = parseInt(dtStartStr.substring(11, 13));
          const second = parseInt(dtStartStr.substring(13, 15));
          startDate = new Date(Date.UTC(year, month, day, hour, minute, second));
        } else {
          // Format: 20250101 (all day event)
          const year = parseInt(dtStartStr.substring(0, 4));
          const month = parseInt(dtStartStr.substring(4, 6)) - 1;
          const day = parseInt(dtStartStr.substring(6, 8));
          startDate = new Date(Date.UTC(year, month, day));
        }
        
        // Skip events outside our time range (1 week ago to 3 months in the future)
        if (startDate < oneWeekAgo || startDate > threeMonthsLater) {
          continue;
        }
        
        // Extract end date
        const dtEndMatch = eventBlock.match(/DTEND(?:;[^:]*)?:(.*?)(?:\r\n|\n)/);
        let endDate: Date | undefined;
        
        if (dtEndMatch) {
          const dtEndStr = dtEndMatch[1].trim();
          if (dtEndStr.includes('T')) {
            const year = parseInt(dtEndStr.substring(0, 4));
            const month = parseInt(dtEndStr.substring(4, 6)) - 1;
            const day = parseInt(dtEndStr.substring(6, 8));
            const hour = parseInt(dtEndStr.substring(9, 11));
            const minute = parseInt(dtEndStr.substring(11, 13));
            const second = parseInt(dtEndStr.substring(13, 15));
            endDate = new Date(Date.UTC(year, month, day, hour, minute, second));
          } else {
            const year = parseInt(dtEndStr.substring(0, 4));
            const month = parseInt(dtEndStr.substring(4, 6)) - 1;
            const day = parseInt(dtEndStr.substring(6, 8));
            endDate = new Date(Date.UTC(year, month, day));
          }
        }
        
        // Calculate duration
        let durationHours = 1; // Default 1 hour
        if (endDate) {
          const durationMs = endDate.getTime() - startDate.getTime();
          durationHours = Math.ceil(durationMs / (1000 * 60 * 60)); // Round up to nearest hour
        }
        
        // Create ZonedDateTime
        const zonedDateTimeStr = startDate.toISOString().replace('Z', '+00:00[UTC]');
        const zonedDateTime = ZonedDateTime.parse(zonedDateTimeStr);
        
        events.push({
          id: uid,
          ripped: new Date(),
          date: zonedDateTime,
          duration: Duration.ofHours(durationHours),
          summary,
          description,
          location,
          url
        });
      } catch (error) {
        console.error('Error parsing event:', error);
        // Skip this event if there's an error
      }
    }
    
    return events;
  } catch (error) {
    console.error(`Error fetching external calendar ${url}:`, error);
    return [];
  }
}

/**
 * Creates aggregate calendars based on tags
 */
export async function createAggregateCalendars(
  taggedCalendars: RipperCalendar[],
  taggedExternalCalendars: TaggedExternalCalendar[]
): Promise<RipperCalendar[]> {
  const allTags = collectAllTags(taggedCalendars, taggedExternalCalendars);
  const aggregateCalendars: RipperCalendar[] = [];
  console.log(allTags)
  
  for (const tag of allTags) {
    console.log(`Creating aggregate calendar for tag: ${tag}`);
    // Create a new calendar for this tag
    const aggregateCalendar: RipperCalendar = {
      name: `tag-${tag.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      friendlyname: `${tag} Events`,
      events: [],
      errors: [],
      tags: [tag]
    };
    
    // Add events from regular calendars with this tag
    for (const tc of taggedCalendars) {
      if (tc.tags.includes(tag)) {
        console.log(`  - Adding events from calendar: ${tc.friendlyname}`);
        // Add source calendar name to each event's description
        const eventsWithSource = tc.events.map(event => {
          if ('summary' in event) { // Check if it's a RipperCalendarEvent
            const sourceInfo = `\n\nFrom ${tc.friendlyname}`;
            return {
              ...event,
              description: event.description ? `${event.description}${sourceInfo}` : sourceInfo
            };
          }
          return event;
        });
        
        aggregateCalendar.events.push(...eventsWithSource);
        aggregateCalendar.errors.push(...tc.errors);
      }
    }
    
    // Add events from external calendars with this tag
    for (const tec of taggedExternalCalendars) {
      if (tec.tags.includes(tag)) {
        try {
          console.log(`Fetching external calendar: ${tec.calendar.friendlyname}`);
          const externalEvents = await fetchExternalCalendar(tec.calendar.icsUrl);
          console.log(`  - Found ${externalEvents.length} events within time range`);
          
          // Add source calendar name to each event's description
          const eventsWithSource = externalEvents.map(event => {
            const sourceInfo = `\n\nFrom ${tec.calendar.friendlyname}`;
            return {
              ...event,
              description: event.description ? `${event.description}${sourceInfo}` : sourceInfo
            };
          });
          
          aggregateCalendar.events.push(...eventsWithSource);
        } catch (error) {
          const ripperError: RipperError = {
            type: 'ImportError',
            reason: `Failed to import external calendar: ${error}`,
            error,
            path: tec.calendar.icsUrl
          };
          aggregateCalendar.errors.push(ripperError);
        }
      }
    }
    
    // Sort events by date
    aggregateCalendar.events.sort((a, b) => a.date.toEpochSecond() - b.date.toEpochSecond());
    
    aggregateCalendars.push(aggregateCalendar);
  }
  
  return aggregateCalendars;
}

/**
 * Prepares tagged calendars from ripper calendars and their configs
 */
export function prepareTaggedCalendars(
  ripperCalendars: RipperCalendar[],
  ripperTags: Map<string, string[]>,
  calendarTags: Map<string, string[]>
): TaggedCalendar[] {
  console.log("prepareTageged")
  return ripperCalendars.map(calendar => {
    // Combine ripper-level tags with calendar-specific tags
    const ripperName = calendar.name.split('-')[0]; // Assuming format is "ripper-calendar"
    const ripperTagsList = ripperTags.get(calendar.name) || [];
    console.log(calendar.name)
    console.log(calendarTags)
    const calendarTagsList = calendarTags.get(calendar.name) || [];
    
    // Combine and deduplicate tags
    const combinedTags = [...new Set([...ripperTagsList, ...calendarTagsList])];
    
    return {
      calendar,
      tags: combinedTags
    };
  });
}

/**
 * Prepares tagged external calendars
 */
export function prepareTaggedExternalCalendars(
  externalCalendars: ExternalCalendar[]
): TaggedExternalCalendar[] {
  return externalCalendars
    .filter(cal => !cal.disabled)
    .map(calendar => ({
      calendar,
      tags: calendar.tags || []
    }));
}

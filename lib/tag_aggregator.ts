import { RipperCalendar, RipperCalendarEvent, RipperError, ExternalCalendar, toICS } from './config/schema.js';
import { ZonedDateTime, Duration } from '@js-joda/core';
// @ts-ignore — ical.js has no type declarations
import ICAL from 'ical.js';

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
    tec.tags.forEach(tag => allTags.add(tag));
  });
  
  return Array.from(allTags);
}

/**
 * Parses external calendar ICS data into events, expanding RRULE recurrences.
 * Filters events to only include those within the specified time range.
 */
export function parseExternalCalendarEvents(icsData: string): RipperCalendarEvent[] {
  const events: RipperCalendarEvent[] = [];

  const now = new Date();
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(now.getDate() - 7);
  const threeMonthsLater = new Date(now);
  threeMonthsLater.setMonth(now.getMonth() + 3);

  let jcalData: any;
  try {
    jcalData = ICAL.parse(icsData);
  } catch (error) {
    console.error('Error parsing ICS data:', error);
    return [];
  }

  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents('vevent');

  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent);
      const uid: string = event.uid || `external-${Date.now()}-${Math.random()}`;
      const summary: string = event.summary || 'Untitled Event';
      const description: string | undefined = event.description || undefined;
      const location: string | undefined = event.location || undefined;
      const url: string | undefined = vevent.getFirstPropertyValue('url')?.toString() || undefined;

      const rrule = vevent.getFirstProperty('rrule');

      if (rrule) {
        // Expand recurring event occurrences within our time range using ical.js.
        // ICAL.RecurExpansion handles EXDATE and complex RRULE patterns correctly.
        let durationHours = 1;
        if (event.endDate && event.startDate) {
          const ms = event.endDate.toJSDate().getTime() - event.startDate.toJSDate().getTime();
          durationHours = Math.max(1, Math.ceil(ms / (1000 * 60 * 60)));
        }

        try {
          const expand = new ICAL.RecurExpansion({
            component: vevent,
            dtstart: vevent.getFirstPropertyValue('dtstart'),
          });

          let next: any;
          let instanceCount = 0;
          while (instanceCount < 1000 && (next = expand.next())) {
            const startDate = next.toJSDate();
            if (startDate > threeMonthsLater) break;
            if (startDate >= oneWeekAgo) {
              const zonedDateTime = ZonedDateTime.parse(
                startDate.toISOString().replace('Z', '+00:00[UTC]')
              );
              events.push({
                id: `${uid}-${next.toICALString()}`,
                ripped: new Date(),
                date: zonedDateTime,
                duration: Duration.ofHours(durationHours),
                summary,
                description,
                location,
                url,
              });
            }
            instanceCount++;
          }
        } catch (rruleError) {
          console.error('Error expanding RRULE for', uid, rruleError);
        }
      } else {
        const startDate = event.startDate?.toJSDate();
        if (!startDate) continue;
        if (startDate < oneWeekAgo || startDate > threeMonthsLater) continue;

        let durationHours = 1;
        if (event.endDate && event.startDate) {
          const ms = event.endDate.toJSDate().getTime() - startDate.getTime();
          durationHours = Math.max(1, Math.ceil(ms / (1000 * 60 * 60)));
        }

        const zonedDateTime = ZonedDateTime.parse(
          startDate.toISOString().replace('Z', '+00:00[UTC]')
        );
        events.push({
          id: uid,
          ripped: new Date(),
          date: zonedDateTime,
          duration: Duration.ofHours(durationHours),
          summary,
          description,
          location,
          url,
        });
      }
    } catch (error) {
      console.error('Error parsing event:', error);
    }
  }

  return events;
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
    return parseExternalCalendarEvents(icsData);
  } catch (error) {
    console.error(`Error fetching external calendar ${url}:`, error);
    return [];
  }
}

/**
 * Creates aggregate calendars based on tags.
 * If prefetchedIcsData is provided, uses cached ICS content instead of re-fetching.
 */
export async function createAggregateCalendars(
  taggedCalendars: RipperCalendar[],
  taggedExternalCalendars: TaggedExternalCalendar[],
  prefetchedIcsData?: Map<string, string>
): Promise<RipperCalendar[]> {
  const allTags = collectAllTags(taggedCalendars, taggedExternalCalendars);
  const aggregateCalendars: RipperCalendar[] = [];

  // Cache parsed events to avoid re-parsing the same external calendar for multiple tags
  const parsedEventsCache = new Map<string, RipperCalendarEvent[]>();

  // Include "All" as a special tag that aggregates every calendar
  const tagsWithAll = [...allTags.filter(t => t !== 'All'), 'All'];

  for (const tag of tagsWithAll) {
    const isAllTag = tag === 'All';
    console.log(`Creating aggregate calendar for tag: ${tag}`);
    // Create a new calendar for this tag
    const aggregateCalendar: RipperCalendar = {
      name: `tag-${tag.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      friendlyname: `${tag} Events`,
      events: [],
      errors: [],
      tags: [tag]
    };

    // Add events from regular calendars with this tag (All includes every calendar)
    for (const tc of taggedCalendars) {
      if (isAllTag || tc.tags.includes(tag)) {
        console.log(`  - Adding events from calendar: ${tc.friendlyname}`);
        // Tag each event with its source calendar for identification in aggregated feeds
        const eventsWithSource = tc.events.map(event => {
          if ('summary' in event) { // Check if it's a RipperCalendarEvent
            return {
              ...event,
              sourceCalendar: tc.friendlyname,
              sourceCalendarName: tc.name,
            };
          }
          return event;
        });

        aggregateCalendar.events.push(...eventsWithSource);
        aggregateCalendar.errors.push(...tc.errors);
      }
    }

    // Add events from external calendars with this tag (All includes every calendar)
    for (const tec of taggedExternalCalendars) {
      if (isAllTag || tec.tags.includes(tag)) {
        try {
          let externalEvents: RipperCalendarEvent[];

          if (parsedEventsCache.has(tec.calendar.icsUrl)) {
            externalEvents = parsedEventsCache.get(tec.calendar.icsUrl)!;
          } else {
            const cachedIcs = prefetchedIcsData?.get(tec.calendar.icsUrl);
            if (cachedIcs) {
              externalEvents = parseExternalCalendarEvents(cachedIcs);
            } else {
              console.log(`Fetching external calendar: ${tec.calendar.friendlyname}`);
              externalEvents = await fetchExternalCalendar(tec.calendar.icsUrl);
            }
            parsedEventsCache.set(tec.calendar.icsUrl, externalEvents);
          }

          console.log(`  - Adding ${externalEvents.length} events from ${tec.calendar.friendlyname}`);

          // Tag each event with its source calendar for identification in aggregated feeds
          const eventsWithSource = externalEvents.map(event => {
            return {
              ...event,
              sourceCalendar: tec.calendar.friendlyname,
              sourceCalendarName: tec.calendar.name,
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
  return ripperCalendars.map(calendar => {
    // Combine ripper-level tags with calendar-specific tags
    const ripperTagsList = ripperTags.get(calendar.name) || [];
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

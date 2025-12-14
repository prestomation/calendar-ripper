import { Duration, ZonedDateTime, LocalTime, LocalDate, DayOfWeek, TemporalAdjusters, ZoneRegion } from "@js-joda/core";
import { z } from "zod";
import { RipperCalendarEvent, RipperCalendar } from "./schema.js";
import { parse } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';

import '@js-joda/timezone'

export const recurringEventSchema = z.object({
    name: z.string().regex(/^[a-zA-Z0-9.-]+$/),
    friendlyname: z.string(),
    description: z.string(),
    schedule: z.string(), // e.g., "2nd Thursday", "1st Friday", "3rd Saturday"
    timezone: z.string().transform(ZoneRegion.of),
    duration: z.string().transform(d => Duration.parse(d)),
    start_time: z.string().transform(t => LocalTime.parse(t)),
    location: z.string(),
    url: z.string(),
    tags: z.array(z.string()),
    seasonal: z.string().optional() // "summer", "winter", etc.
});

export const recurringConfigSchema = z.object({
    events: z.array(recurringEventSchema)
});

export type RecurringEvent = z.infer<typeof recurringEventSchema>;
export type RecurringConfig = z.infer<typeof recurringConfigSchema>;

export class RecurringEventProcessor {
    private config: RecurringConfig;

    constructor(configPath: string) {
        const yamlContent = fs.readFileSync(configPath, 'utf8');
        const rawConfig = parse(yamlContent);
        this.config = recurringConfigSchema.parse(rawConfig);
    }

    public generateCalendars(startDate: LocalDate, endDate: LocalDate): RipperCalendar[] {
        const calendars: RipperCalendar[] = [];

        for (const event of this.config.events) {
            const calendar: RipperCalendar = {
                name: event.name,
                friendlyname: event.friendlyname,
                events: this.generateEventsForSchedule(event, startDate, endDate),
                errors: [],
                tags: event.tags
            };
            calendars.push(calendar);
        }

        return calendars;
    }

    private generateEventsForSchedule(
        event: RecurringEvent, 
        startDate: LocalDate, 
        endDate: LocalDate
    ): RipperCalendarEvent[] {
        const events: RipperCalendarEvent[] = [];
        const { ordinal, dayOfWeek } = this.parseSchedule(event.schedule);
        
        if (ordinal === null || dayOfWeek === null) {
            return events; // Skip invalid schedules
        }

        let currentDate = startDate.withDayOfMonth(1); // Start from first of month
        
        while (currentDate.isBefore(endDate) || currentDate.isEqual(endDate)) {
            // Skip if seasonal restriction applies
            if (event.seasonal && !this.isInSeason(currentDate, event.seasonal)) {
                currentDate = currentDate.plusMonths(1);
                continue;
            }

            const eventDate = this.findNthDayOfWeekInMonth(currentDate, ordinal, dayOfWeek);
            
            if (eventDate && 
                (eventDate.isAfter(startDate) || eventDate.isEqual(startDate)) && 
                (eventDate.isBefore(endDate) || eventDate.isEqual(endDate))) {
                
                const zonedDateTime = ZonedDateTime.of(
                    eventDate,
                    event.start_time,
                    event.timezone
                );

                const calendarEvent: RipperCalendarEvent = {
                    id: `${event.name}-${eventDate.toString()}`,
                    ripped: new Date(),
                    date: zonedDateTime,
                    duration: event.duration,
                    summary: event.friendlyname,
                    description: event.description,
                    location: event.location,
                    url: event.url
                };

                events.push(calendarEvent);
            }

            currentDate = currentDate.plusMonths(1);
        }

        return events;
    }

    private parseSchedule(schedule: string): { ordinal: number | null, dayOfWeek: DayOfWeek | null } {
        const match = schedule.match(/^(\d+)(?:st|nd|rd|th)\s+(\w+)$/i);
        if (!match) {
            return { ordinal: null, dayOfWeek: null };
        }

        const ordinal = parseInt(match[1]);
        const dayName = match[2].toLowerCase();
        
        const dayMap: { [key: string]: DayOfWeek } = {
            'monday': DayOfWeek.MONDAY,
            'tuesday': DayOfWeek.TUESDAY,
            'wednesday': DayOfWeek.WEDNESDAY,
            'thursday': DayOfWeek.THURSDAY,
            'friday': DayOfWeek.FRIDAY,
            'saturday': DayOfWeek.SATURDAY,
            'sunday': DayOfWeek.SUNDAY
        };

        return {
            ordinal,
            dayOfWeek: dayMap[dayName] || null
        };
    }

    private findNthDayOfWeekInMonth(monthStart: LocalDate, ordinal: number, dayOfWeek: DayOfWeek): LocalDate | null {
        const firstOfMonth = monthStart.withDayOfMonth(1);
        const firstOccurrence = firstOfMonth.with(TemporalAdjusters.nextOrSame(dayOfWeek));
        const targetDate = firstOccurrence.plusWeeks(ordinal - 1);
        
        // Check if the target date is still in the same month
        if (targetDate.month() === firstOfMonth.month()) {
            return targetDate;
        }
        
        return null;
    }

    private isInSeason(date: LocalDate, season: string): boolean {
        const month = date.monthValue();
        
        switch (season.toLowerCase()) {
            case 'summer':
                return month >= 6 && month <= 9; // June - September
            case 'winter':
                return month >= 12 || month <= 2; // December - February
            case 'spring':
                return month >= 3 && month <= 5; // March - May
            case 'fall':
            case 'autumn':
                return month >= 9 && month <= 11; // September - November
            default:
                return true; // Unknown season, include all months
        }
    }
}

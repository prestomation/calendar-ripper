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
    url: z.string().url(),
    tags: z.array(z.string()),
    seasonal: z.string().optional(), // "summer", "winter", etc.
    months: z.array(z.number().int().min(1).max(12)).optional() // explicit month list, e.g. [5,6,7,8,9]
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
                events: this.generateRRuleEvent(event, startDate),
                errors: [],
                tags: event.tags
            };
            calendars.push(calendar);
        }

        return calendars;
    }

    private generateRRuleEvent(event: RecurringEvent, startDate: LocalDate): RipperCalendarEvent[] {
        const { ordinal, dayOfWeek } = this.parseSchedule(event.schedule);

        if (ordinal === null || dayOfWeek === null) {
            return []; // Skip invalid schedules
        }

        // Resolve allowed months (explicit months take precedence over seasonal)
        const allowedMonths = event.months ?? (event.seasonal ? this.getSeasonalMonths(event.seasonal) : []);

        // Find the first occurrence on or after startDate, respecting month restrictions
        const firstOccurrence = this.findNextOccurrence(startDate, ordinal, dayOfWeek, allowedMonths);
        if (!firstOccurrence) {
            return [];
        }

        const zonedDateTime = ZonedDateTime.of(
            firstOccurrence,
            event.start_time,
            event.timezone
        );

        // Generate RRULE based on schedule
        const rrule = this.generateRRule(ordinal, dayOfWeek, allowedMonths);

        const calendarEvent: RipperCalendarEvent = {
            id: event.name,
            ripped: new Date(),
            date: zonedDateTime,
            duration: event.duration,
            summary: event.friendlyname,
            description: event.description,
            location: event.location,
            url: event.url,
            rrule: rrule
        };

        return [calendarEvent];
    }

    private generateRRule(ordinal: number, dayOfWeek: DayOfWeek, allowedMonths: number[]): string {
        const dayAbbr = this.getDayAbbreviation(dayOfWeek);
        const byMonth = allowedMonths.length > 0 ? `;BYMONTH=${allowedMonths.join(',')}` : '';

        if (ordinal === 0) {
            // Weekly recurring. When month-restricted, use FREQ=YEARLY with
            // BYDAY+BYMONTH instead of FREQ=WEEKLY+BYMONTH because many
            // calendar apps (Google, Apple) don't properly filter FREQ=WEEKLY
            // by BYMONTH, causing events to stop before the last allowed month.
            if (byMonth) {
                return `FREQ=YEARLY;BYDAY=${dayAbbr}${byMonth}`;
            }
            return `FREQ=WEEKLY;BYDAY=${dayAbbr}`;
        }

        return `FREQ=MONTHLY;BYDAY=${ordinal}${dayAbbr}${byMonth}`;
    }

    private getDayAbbreviation(dayOfWeek: DayOfWeek): string {
        const dayMap: { [key: number]: string } = {
            1: 'MO', // Monday
            2: 'TU', // Tuesday  
            3: 'WE', // Wednesday
            4: 'TH', // Thursday
            5: 'FR', // Friday
            6: 'SA', // Saturday
            7: 'SU'  // Sunday
        };
        return dayMap[dayOfWeek.value()];
    }

    private getSeasonalMonths(season: string): number[] {
        switch (season.toLowerCase()) {
            case 'summer':
                return [6, 7, 8, 9]; // June - September
            case 'winter':
                return [12, 1, 2]; // December - February
            case 'spring':
                return [3, 4, 5]; // March - May
            case 'fall':
            case 'autumn':
                return [9, 10, 11]; // September - November
            default:
                return []; // No restriction
        }
    }

    private findNextOccurrence(startDate: LocalDate, ordinal: number, dayOfWeek: DayOfWeek, allowedMonths: number[]): LocalDate | null {
        // Weekly events (ordinal = 0): find the next occurrence of the day of week
        if (ordinal === 0) {
            let candidate = startDate.with(TemporalAdjusters.nextOrSame(dayOfWeek));
            if (allowedMonths.length > 0) {
                // Advance week by week until we land in an allowed month (cap at 12 months)
                const limit = startDate.plusMonths(12);
                while (!allowedMonths.includes(candidate.monthValue()) && candidate.isBefore(limit)) {
                    candidate = candidate.plusWeeks(1);
                }
                if (!allowedMonths.includes(candidate.monthValue())) {
                    return null;
                }
            }
            return candidate;
        }

        // Start from the beginning of the current month
        let currentMonth = startDate.withDayOfMonth(1);

        // Search up to 13 months ahead to handle any month restriction
        for (let monthOffset = 0; monthOffset < 13; monthOffset++) {
            const testMonth = currentMonth.plusMonths(monthOffset);

            // Skip months not in the allowed list
            if (allowedMonths.length > 0 && !allowedMonths.includes(testMonth.monthValue())) {
                continue;
            }

            const occurrence = this.findNthDayOfWeekInMonth(testMonth, ordinal, dayOfWeek);

            if (occurrence && (occurrence.isAfter(startDate) || occurrence.isEqual(startDate))) {
                return occurrence;
            }
        }

        return null;
    }

    private parseSchedule(schedule: string): { ordinal: number | null, dayOfWeek: DayOfWeek | null } {
        const dayMap: { [key: string]: DayOfWeek } = {
            'monday': DayOfWeek.MONDAY,
            'tuesday': DayOfWeek.TUESDAY,
            'wednesday': DayOfWeek.WEDNESDAY,
            'thursday': DayOfWeek.THURSDAY,
            'friday': DayOfWeek.FRIDAY,
            'saturday': DayOfWeek.SATURDAY,
            'sunday': DayOfWeek.SUNDAY
        };

        // Support "every Sunday" format (weekly recurring, ordinal = 0)
        const everyMatch = schedule.match(/^every\s+(\w+)$/i);
        if (everyMatch) {
            const dayName = everyMatch[1].toLowerCase();
            return {
                ordinal: 0,
                dayOfWeek: dayMap[dayName] || null
            };
        }

        // Support "last Friday" format
        const lastMatch = schedule.match(/^last\s+(\w+)$/i);
        if (lastMatch) {
            const dayName = lastMatch[1].toLowerCase();
            return {
                ordinal: -1,
                dayOfWeek: dayMap[dayName] || null
            };
        }

        const match = schedule.match(/^(\d+)(?:st|nd|rd|th)\s+(\w+)$/i);
        if (!match) {
            return { ordinal: null, dayOfWeek: null };
        }

        const ordinal = parseInt(match[1]);
        const dayName = match[2].toLowerCase();

        return {
            ordinal,
            dayOfWeek: dayMap[dayName] || null
        };
    }

    private findNthDayOfWeekInMonth(monthStart: LocalDate, ordinal: number, dayOfWeek: DayOfWeek): LocalDate | null {
        const firstOfMonth = monthStart.withDayOfMonth(1);
        
        // Find all occurrences of the day in the month
        const occurrences: LocalDate[] = [];
        let current = firstOfMonth.with(TemporalAdjusters.nextOrSame(dayOfWeek));
        
        while (current.month() === firstOfMonth.month()) {
            occurrences.push(current);
            current = current.plusWeeks(1);
        }
        
        // Return the nth occurrence (1-indexed), or last if ordinal is -1
        if (ordinal === -1) {
            return occurrences.length > 0 ? occurrences[occurrences.length - 1] : null;
        }
        if (ordinal <= occurrences.length) {
            return occurrences[ordinal - 1];
        }
        
        return null;
    }
}

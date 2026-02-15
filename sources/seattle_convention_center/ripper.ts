import { Duration, LocalDate, LocalDateTime, ZonedDateTime, ZoneId, ChronoUnit } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from 'node-html-parser';
import '@js-joda/timezone';

const MONTHS: Record<string, number> = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
};

const ALL_MONTHS: Record<string, number> = {
    ...MONTHS,
    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4,
    'May': 5, 'Jun': 6, 'Jul': 7, 'Aug': 8,
    'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
};

const LOCATION = "Seattle Convention Center, 705 Pike St, Seattle, WA 98101";

export default class SeattleConventionCenterRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        const rows = html.querySelectorAll('tr');

        let currentMonth = 0;
        let currentYear = 0;

        for (const row of rows) {
            // Check if this is a month header row
            const headerCell = row.querySelector('td.COE-GroupByRowHeader');
            if (headerCell) {
                const headerText = headerCell.textContent.trim();
                const monthMatch = headerText.match(/(\w+)\s+(\d{4})/);
                if (monthMatch && MONTHS[monthMatch[1]]) {
                    currentMonth = MONTHS[monthMatch[1]];
                    currentYear = parseInt(monthMatch[2]);
                }
                continue;
            }

            // Check if this is an event row
            if (!row.classList.contains('COE-MediumText')) continue;
            if (currentMonth === 0 || currentYear === 0) continue;

            const dateCell = row.querySelector('td.COE-Date');
            const nameCell = row.querySelector('td.COE-EventName');
            if (!dateCell || !nameCell) continue;

            const link = nameCell.querySelector('a.COE-EventName');
            if (!link) continue;

            // Extract event ID from URL
            const href = link.getAttribute('href') || '';
            const eventIdMatch = href.match(/eventid=(\d+)/);
            if (!eventIdMatch) continue;
            const eventId = eventIdMatch[1];

            // Deduplicate
            if (this.seenEvents.has(eventId)) continue;

            // Check for "(Begins ...)" continuation entries - skip them
            const extendedDateSpan = nameCell.querySelector('span.COE-EventStartAndEndDates');
            const extendedDateText = extendedDateSpan?.textContent.trim() || '';
            if (extendedDateText.match(/^\(Begins/)) continue;

            this.seenEvents.add(eventId);

            try {
                const eventName = link.textContent.trim();
                if (!eventName) continue;

                // Parse date range from cell text
                // Clean up non-breaking spaces and extra whitespace
                const dateText = dateCell.textContent.replace(/\u00a0/g, ' ').trim();

                // Match patterns: "Wed 18 - Sun 22" or "Thu 12"
                const rangeMatch = dateText.match(/\w+\s+(\d{1,2})\s*-\s*\w+\s+(\d{1,2})/);
                const singleMatch = dateText.match(/\w+\s+(\d{1,2})/);

                let startDay: number;
                let endDate: LocalDate;

                if (rangeMatch) {
                    startDay = parseInt(rangeMatch[1]);
                    const endDay = parseInt(rangeMatch[2]);

                    // Check for "(Ends MonthName Day)" for cross-month events
                    const endsMatch = extendedDateText.match(/\(Ends\s+(\w+)\s+(\d{1,2})\)/);
                    if (endsMatch && ALL_MONTHS[endsMatch[1]]) {
                        const endMonth = ALL_MONTHS[endsMatch[1]];
                        const endDayNum = parseInt(endsMatch[2]);
                        let endYear = currentYear;
                        if (endMonth < currentMonth) endYear++;
                        endDate = LocalDate.of(endYear, endMonth, endDayNum);
                    } else {
                        endDate = LocalDate.of(currentYear, currentMonth, endDay);
                    }
                } else if (singleMatch) {
                    startDay = parseInt(singleMatch[1]);

                    // Single-day entry might still have "(Ends ...)" for cross-month
                    const endsMatch = extendedDateText.match(/\(Ends\s+(\w+)\s+(\d{1,2})\)/);
                    if (endsMatch && ALL_MONTHS[endsMatch[1]]) {
                        const endMonth = ALL_MONTHS[endsMatch[1]];
                        const endDayNum = parseInt(endsMatch[2]);
                        let endYear = currentYear;
                        if (endMonth < currentMonth) endYear++;
                        endDate = LocalDate.of(endYear, endMonth, endDayNum);
                    } else {
                        endDate = LocalDate.of(currentYear, currentMonth, startDay);
                    }
                } else {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date: "${dateText}" for ${eventName}`,
                        context: eventId
                    });
                    continue;
                }

                const startDate = LocalDate.of(currentYear, currentMonth, startDay);
                const totalDays = startDate.until(endDate, ChronoUnit.DAYS) + 1;

                const eventDate = ZonedDateTime.of(
                    LocalDateTime.of(currentYear, currentMonth, startDay, 9, 0),
                    ZoneId.of('America/Los_Angeles')
                );

                // Single day: 8 hours (9am-5pm). Multi-day: 9am first day to 5pm last day.
                const duration = totalDays <= 1
                    ? Duration.ofHours(8)
                    : Duration.ofHours((totalDays - 1) * 24 + 8);

                const event: RipperCalendarEvent = {
                    id: `scc-${eventId}`,
                    ripped: new Date(),
                    date: eventDate,
                    duration: duration,
                    summary: eventName,
                    description: `${eventName} at Seattle Convention Center`,
                    location: LOCATION,
                    url: "https://seattlecc.com/upcoming-events/"
                };

                events.push(event);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event ${eventId}: ${errorMessage}`,
                    context: eventId
                });
            }
        }

        return events;
    }
}

import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from 'node-html-parser';

import '@js-joda/timezone';

/**
 * Parses a time string like "6pm", "6:30pm", "10am" into hours and minutes.
 * Returns null if parsing fails.
 */
function parseTimeComponent(raw: string): { hour: number; minute: number } | null {
    const m = raw.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/i);
    if (!m) return null;
    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    const meridiem = m[3].toLowerCase();
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return { hour, minute };
}

/**
 * Parses a 19hz.info time cell like "Thu: Feb 19 (6:30pm-9:30pm)" or "(8pm)".
 * Returns start hour/minute and duration in minutes (defaults to 180 min if no end time).
 */
export function parseTimeCell(text: string): { hour: number; minute: number; durationMinutes: number } {
    // Match "(start-end)" or "(start)"
    const rangeMatch = text.match(/\((\d{1,2}(?::\d{2})?(?:am|pm))-(\d{1,2}(?::\d{2})?(?:am|pm))\)/i);
    if (rangeMatch) {
        const start = parseTimeComponent(rangeMatch[1]);
        const end = parseTimeComponent(rangeMatch[2]);
        if (start && end) {
            const startMins = start.hour * 60 + start.minute;
            let endMins = end.hour * 60 + end.minute;
            // Handle events crossing midnight
            if (endMins <= startMins) endMins += 24 * 60;
            return { hour: start.hour, minute: start.minute, durationMinutes: endMins - startMins };
        }
    }

    // Single time: "(8pm)"
    const singleMatch = text.match(/\((\d{1,2}(?::\d{2})?(?:am|pm))\)/i);
    if (singleMatch) {
        const start = parseTimeComponent(singleMatch[1]);
        if (start) {
            return { hour: start.hour, minute: start.minute, durationMinutes: 180 };
        }
    }

    // Default: midnight, 3 hours
    return { hour: 20, minute: 0, durationMinutes: 180 };
}

export default class Hz19Ripper extends HTMLRipper {
    private seenEvents = new Set<string>();
    private readonly timezone = ZoneId.of('America/Los_Angeles');

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        const rows = html.querySelectorAll('tr');

        for (const row of rows) {
            const cells = row.querySelectorAll('td');

            // Event rows have 7 cells: datetime, event+venue, genre, price, promoter, fb, date
            if (cells.length < 7) continue;

            // Machine-readable date is in the last cell
            const dateDiv = cells[cells.length - 1].querySelector('.shrink');
            if (!dateDiv) continue;

            const dateStr = dateDiv.text.trim(); // "2026/02/19"
            if (!/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) continue;

            const [year, month, day] = dateStr.split('/').map(Number);

            // Event link is in cells[1]
            const link = cells[1].querySelector('a');
            if (!link) continue;

            const title = link.text.trim();
            if (!title) continue;

            const eventUrl = link.getAttribute('href') || undefined;

            // Deduplicate by date + title
            const eventId = `19hz-${dateStr}-${title}`;
            if (this.seenEvents.has(eventId)) continue;
            this.seenEvents.add(eventId);

            // Parse time from cells[0]
            const timeText = cells[0].text;
            const { hour, minute, durationMinutes } = parseTimeCell(timeText);

            // Venue: text in cells[1] after the link, before the city in parentheses
            const eventCellText = cells[1].text;
            const atIdx = eventCellText.indexOf(' @ ');
            let location: string | undefined;
            if (atIdx >= 0) {
                const venueAndCity = eventCellText.substring(atIdx + 3);
                // Remove " (Seattle, WA)" or similar trailing city
                const cityIdx = venueAndCity.lastIndexOf(' (');
                location = cityIdx >= 0 ? venueAndCity.substring(0, cityIdx).trim() : venueAndCity.trim();
            }

            try {
                const eventDate = ZonedDateTime.of(
                    LocalDateTime.of(year, month, day, hour, minute),
                    this.timezone
                );

                const event: RipperCalendarEvent = {
                    id: eventId,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofMinutes(durationMinutes),
                    summary: title,
                    location,
                    url: eventUrl,
                };

                events.push(event);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event "${title}": ${error}`,
                    context: dateStr,
                });
            }
        }

        return events;
    }
}

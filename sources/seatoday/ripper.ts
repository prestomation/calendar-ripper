import { ZonedDateTime, Duration, LocalDateTime, ChronoUnit } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import '@js-joda/timezone';

export default class SEAtodayRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const url = ripper.config.url.toString();

        // Fetch the JavaScript file containing the CitySpark data
        const res = await fetch(url);
        if (!res.ok) {
            throw Error(`${res.status} ${res.statusText}`);
        }

        const jsContent = await res.text();

        // Extract the cSparkLocals object from the JavaScript
        const jsonData = this.extractCSparkLocals(jsContent);

        // Initialize calendars
        const calendars: { [key: string]: {events: RipperEvent[], friendlyName: string, tags: string[]} } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = {events: [], friendlyName: c.friendlyname, tags: c.tags || []};
        }

        // Parse events for each calendar
        for (const cal of ripper.config.calendars) {
            const events = await this.parseEvents(jsonData, cal.timezone, cal.config);
            calendars[cal.name].events = calendars[cal.name].events.concat(events);
        }

        return Object.keys(calendars).map(key => {
            return {
                name: key,
                friendlyname: calendars[key].friendlyName,
                events: calendars[key].events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
                errors: calendars[key].events.filter(e => "type" in e).map(e => e as RipperError),
                parent: ripper.config,
                tags: calendars[key].tags
            };
        });
    }

    private extractCSparkLocals(jsContent: string): any {
        // Extract the cSparkLocals variable assignment
        // Pattern: var cSparkLocals = {...};
        const match = jsContent.match(/var\s+cSparkLocals\s*=\s*(\{.*?\});?\s*(?:const|var|let|$)/s);

        if (!match) {
            throw new Error("Could not find cSparkLocals object in JavaScript");
        }

        try {
            // Parse the JSON object
            return JSON.parse(match[1]);
        } catch (error) {
            throw new Error(`Failed to parse cSparkLocals JSON: ${error}`);
        }
    }

    private async parseEvents(jsonData: any, timezone: any, config?: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        if (!jsonData.Events || !Array.isArray(jsonData.Events)) {
            return events;
        }

        const now = LocalDateTime.now();
        const endOfPeriod = now.plusDays(90); // Look ahead 90 days

        for (const eventData of jsonData.Events) {
            try {
                // Parse the start date (use StartUTC if available, otherwise DateStart)
                const dateString = eventData.StartUTC || eventData.DateStart;
                const startDate = this.parseDate(dateString, timezone);
                if (!startDate) {
                    continue;
                }

                // Filter out past events and events too far in the future
                const eventLocalDate = startDate.toLocalDateTime();
                if (eventLocalDate.isBefore(now) || eventLocalDate.isAfter(endOfPeriod)) {
                    continue;
                }

                // Filter by tags if configured
                if (config && config.filterTags && Array.isArray(config.filterTags)) {
                    const eventTags = eventData.Tags || [];
                    // Check if event has ANY of the configured tags
                    const hasMatchingTag = eventTags.some((tagId: number) =>
                        config.filterTags.includes(tagId)
                    );
                    if (!hasMatchingTag) {
                        continue; // Skip this event, doesn't match our tags
                    }
                }

                // Parse end date to calculate duration
                let duration = Duration.ofHours(2); // Default duration
                const endDateString = eventData.EndUTC || eventData.DateEnd;
                if (endDateString) {
                    const endDate = this.parseDate(endDateString, timezone);
                    if (endDate && endDate.isAfter(startDate)) {
                        const durationMinutes = startDate.until(endDate, ChronoUnit.MINUTES);
                        duration = Duration.ofMinutes(durationMinutes);
                    }
                }

                // Build description from available fields
                let description = '';
                if (eventData.Description) {
                    description = this.stripHtml(eventData.Description);
                }

                // Get location information
                let location = '';
                if (eventData.Venue) {
                    location = eventData.Venue;
                    if (eventData.Address) {
                        location += `, ${eventData.Address}`;
                    }
                    if (eventData.CityState) {
                        location += `, ${eventData.CityState}`;
                    }
                }

                // Build event URL
                let eventUrl = '';
                if (eventData.PId) {
                    // Use the event detail URL pattern
                    const slug = this.createSlug(eventData.Name || '');
                    const dateStr = startDate.toLocalDate().toString();
                    eventUrl = `${jsonData.baseUrl}#/details/${slug}/${eventData.PId}/${dateStr}T00`;
                }

                const event: RipperCalendarEvent = {
                    id: eventData.PId ? `cityspark-${eventData.PId}` : undefined,
                    ripped: new Date(),
                    date: startDate,
                    duration: duration,
                    summary: eventData.Name || 'Untitled Event',
                    description: description || undefined,
                    location: location || undefined,
                    url: eventUrl || undefined,
                    image: eventData.LargeImg || eventData.MediumImg || eventData.SmallImg || undefined
                };

                events.push(event);

            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse CitySpark event: ${error}`,
                    context: JSON.stringify(eventData).substring(0, 100)
                });
            }
        }

        return events;
    }

    private parseDate(dateString: string, timezone: any): ZonedDateTime | null {
        if (!dateString) return null;

        try {
            // CitySpark dates are typically in ISO 8601 format
            // e.g., "2026-01-31T18:00:00" or "2026-01-31T18:00:00Z"

            // Remove 'Z' suffix if present (we'll apply our own timezone)
            const cleanDateString = dateString.replace(/Z$/, '');

            // Parse as LocalDateTime first
            const localDateTime = LocalDateTime.parse(cleanDateString);

            // Convert to ZonedDateTime with the specified timezone
            return ZonedDateTime.of(localDateTime, timezone);

        } catch (error) {
            return null;
        }
    }

    private stripHtml(html: string): string {
        if (!html) return '';

        // Remove HTML tags
        let text = html.replace(/<[^>]*>/g, '');

        // Decode common HTML entities
        text = text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ');

        return text.trim();
    }

    private createSlug(title: string): string {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }
}

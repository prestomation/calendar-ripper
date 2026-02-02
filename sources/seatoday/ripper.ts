import { ZonedDateTime, Duration, LocalDateTime, LocalDate, ChronoUnit } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import '@js-joda/timezone';

const PAGE_SIZE = 25;
const LOOKAHEAD_DAYS = 14;

export default class SEAtodayRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const url = ripper.config.url.toString();

        // Fetch the JavaScript file to extract portal settings (ppid, slug, baseUrl)
        const res = await fetch(url);
        if (!res.ok) {
            throw Error(`${res.status} ${res.statusText}`);
        }

        const jsContent = await res.text();
        const portalSettings = this.extractCSparkLocals(jsContent);

        const slug = portalSettings.slug;
        const ppid = portalSettings.ppid;
        const siteUrl = portalSettings.siteUrl;
        const baseUrl = portalSettings.baseUrl;

        // Fetch all events for the lookahead period via the paginated API
        const allEventData = await this.fetchAllEvents(siteUrl, slug, ppid, LOOKAHEAD_DAYS);

        // Filter for Seattle events only (the API returns events from all cities in the region)
        const seattleEventData = allEventData.filter(event => {
            const cityState = (event.CityState || '').toLowerCase();
            return cityState.startsWith('seattle');
        });

        // Initialize calendars
        const calendars: { [key: string]: {events: RipperEvent[], friendlyName: string, tags: string[]} } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = {events: [], friendlyName: c.friendlyname, tags: c.tags || []};
        }

        // Parse events for each calendar (applying tag filters)
        for (const cal of ripper.config.calendars) {
            const events = this.parseEvents(seattleEventData, cal.timezone, baseUrl, cal.config);
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

    /**
     * Fetch events from the CitySpark API for each day in the lookahead period.
     * Requests are made in parallel (one per day) for performance.
     * The API returns up to 25 events per request sorted by time.
     */
    private async fetchAllEvents(siteUrl: string, slug: string, ppid: number, lookaheadDays: number): Promise<any[]> {
        const apiUrl = `${siteUrl}v1/events/${slug}`;
        const startDate = LocalDate.now();

        // Build one request per day in the lookahead window
        const dayRequests: Promise<any[]>[] = [];
        for (let d = 0; d < lookaheadDays; d++) {
            const date = startDate.plusDays(d);
            const startStr = date.atStartOfDay().toString().substring(0, 16); // "YYYY-MM-DDTHH:mm"
            dayRequests.push(this.fetchEventsPage(apiUrl, ppid, startStr));
        }

        // Fire all day requests in parallel
        const results = await Promise.all(dayRequests);
        return results.flat();
    }

    /**
     * Fetch a single page of events from the CitySpark API.
     */
    private async fetchEventsPage(apiUrl: string, ppid: number, startStr: string, skip: number = 0): Promise<any[]> {
        const body = {
            ppid: ppid,
            start: startStr,
            labels: [],
            skip: skip,
            defFilter: "all",
            sort: "Time"
        };

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            throw new Error(`CitySpark API error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json() as { Success: boolean; Value: any[]; ErrorMessage?: string };

        if (!data.Success) {
            throw new Error(`CitySpark API returned error: ${data.ErrorMessage}`);
        }

        return data.Value || [];
    }

    private parseEvents(eventsData: any[], timezone: any, baseUrl: string, config?: any): RipperEvent[] {
        const events: RipperEvent[] = [];

        const startOfToday = LocalDate.now().atStartOfDay();
        const endOfPeriod = startOfToday.plusDays(LOOKAHEAD_DAYS);

        for (const eventData of eventsData) {
            try {
                // Parse the start date (use StartUTC if available, otherwise DateStart)
                const dateString = eventData.StartUTC || eventData.DateStart;
                const startDate = this.parseDate(dateString, timezone);
                if (!startDate) {
                    continue;
                }

                // Filter out past events and events too far in the future
                const eventLocalDate = startDate.toLocalDateTime();
                if (eventLocalDate.isBefore(startOfToday) || eventLocalDate.isAfter(endOfPeriod)) {
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
                    eventUrl = `${baseUrl}#/details/${slug}/${eventData.PId}/${dateStr}T00`;
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
            // CitySpark dates are in ISO 8601 format with Z suffix (UTC)
            // e.g., "2026-01-31T08:00:00Z" means 08:00 UTC = 00:00 Pacific

            if (dateString.endsWith('Z')) {
                // Parse as UTC instant and convert to target timezone
                const instant = ZonedDateTime.parse(dateString).toInstant();
                return ZonedDateTime.ofInstant(instant, timezone);
            } else {
                // No Z suffix, treat as local time in target timezone
                const localDateTime = LocalDateTime.parse(dateString);
                return ZonedDateTime.of(localDateTime, timezone);
            }

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

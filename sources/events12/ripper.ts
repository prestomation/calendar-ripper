import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { HTMLElement } from 'node-html-parser';
import { ZonedDateTime, Duration, ZoneId } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";

export default class Events12Ripper extends HTMLRipper {
    private seenEvents = new Set<string>();

    protected preprocessHtml(html: string): string {
        // events12.com uses unclosed <p> tags which cause node-html-parser to
        // incorrectly nest subsequent <article> elements inside open <p> tags,
        // losing most articles. Adding a closing </p> before each </article>
        // prevents this cascading nesting issue.
        return html.replace(/<\/article>/g, '</p></article>');
    }

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        // Find all article elements that contain events
        const eventArticles = html.querySelectorAll('article[id]');

        for (const article of eventArticles) {
            try {
                // Get the event title from the H3 element
                const titleElement = article.querySelector('h3');
                if (!titleElement) continue;

                const title = titleElement.text.trim().replace(/\s*FREE\s*$/, '').trim();
                if (!title) continue;

                let eventDate: ZonedDateTime | null = null;
                let duration = Duration.ofHours(2);
                let location = '';
                let description = '';
                let url = '';

                // Find date element
                const dateElement = article.querySelector('p.date');
                if (dateElement) {
                    const parsed = this.parseEventDate(dateElement.text.trim(), date.zone());
                    if (parsed) {
                        eventDate = parsed.date;
                        duration = parsed.duration;
                    }
                }

                // Find location element and map link
                const locationElement = article.querySelector('p.miles');
                const mapLink = article.querySelector('a[href*="google.com/maps"]');
                if (locationElement) {
                    const locationText = locationElement.text.trim();
                    if (mapLink) {
                        location = mapLink.getAttribute('href') || '';
                        description = locationText + '\n\n';
                    } else {
                        location = locationText;
                    }
                }

                // Find description element
                const descElement = article.querySelector('p.event');
                if (descElement) {
                    description += descElement.text.trim();
                }

                // Find event URL
                const links = article.querySelectorAll('a');
                for (const link of links) {
                    const href = link.getAttribute('href');
                    if (href && !href.includes('google.com/maps') && !href.includes('facebook.com') && !href.includes('youtube.com')) {
                        url = href.startsWith('http') ? href : `https://www.events12.com${href}`;
                        break;
                    }
                }

                // Only create event if we have a valid date
                if (eventDate && title) {
                    const eventId = this.generateEventId(title, eventDate);

                    // Skip if we've already seen this event
                    if (this.seenEvents.has(eventId)) {
                        continue;
                    }
                    this.seenEvents.add(eventId);

                    const event: RipperCalendarEvent = {
                        id: eventId,
                        ripped: new Date(),
                        date: eventDate,
                        duration: duration,
                        summary: title,
                        description: description,
                        location: location,
                        url: url || undefined
                    };
                    events.push(event);
                }

            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${error}`,
                    context: article.innerHTML.substring(0, 100)
                });
            }
        }

        return events;
    }

    private parseEventDate(dateText: string, timezone: ZoneId): { date: ZonedDateTime, duration: Duration } | null {
        try {
            // Extract date components from text like:
            //   "December 3, 2025 (7 to 8:30 p.m.)"
            //   "January 1 - 11, 2026"
            //   "January 1 - Dec. 31, 2026 (4:30 to 10 p.m.)"
            const dateMatch = dateText.match(
                /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s*[-–]\s*(?:\w+\.?\s+)?\d{1,2})?,?\s+(\d{4})/
            );
            if (!dateMatch) return null;

            const monthName = dateMatch[1];
            const day = parseInt(dateMatch[2]);
            const year = parseInt(dateMatch[3]);

            const monthMap: { [key: string]: number } = {
                'January': 1, 'February': 2, 'March': 3, 'April': 4,
                'May': 5, 'June': 6, 'July': 7, 'August': 8,
                'September': 9, 'October': 10, 'November': 11, 'December': 12
            };

            const month = monthMap[monthName];
            if (!month) return null;

            // Extract time if present
            let startHour = 12; // Default to noon
            let startMinute = 0;
            let duration = Duration.ofHours(2); // Default duration

            // Try time range: "(4 to 7 p.m.)" or "(9 a.m. to 9 p.m.)" or "(4:30 to 10 p.m.)"
            const rangeMatch = dateText.match(
                /\((\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)?\s*to\s*(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)\)/i
            );

            if (rangeMatch) {
                const endAmPm = rangeMatch[6];
                const startAmPm = rangeMatch[3] || endAmPm; // Inherit end's am/pm if start lacks one

                startHour = this.convertTo24Hour(parseInt(rangeMatch[1]), startAmPm);
                startMinute = rangeMatch[2] ? parseInt(rangeMatch[2]) : 0;

                const endHour = this.convertTo24Hour(parseInt(rangeMatch[4]), endAmPm);
                const endMinute = rangeMatch[5] ? parseInt(rangeMatch[5]) : 0;

                const startTotalMinutes = startHour * 60 + startMinute;
                const endTotalMinutes = endHour * 60 + endMinute;
                if (endTotalMinutes > startTotalMinutes) {
                    duration = Duration.ofMinutes(endTotalMinutes - startTotalMinutes);
                }
            } else {
                // Try single time: "(7 p.m.)" or "(7:30 p.m.)"
                const singleMatch = dateText.match(
                    /\((\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)\)/i
                );

                if (singleMatch) {
                    startHour = this.convertTo24Hour(parseInt(singleMatch[1]), singleMatch[3]);
                    startMinute = singleMatch[2] ? parseInt(singleMatch[2]) : 0;
                }
            }

            const eventDate = ZonedDateTime.of(year, month, day, startHour, startMinute, 0, 0, timezone);
            return { date: eventDate, duration };

        } catch (error) {
            return null;
        }
    }

    private convertTo24Hour(hour: number, ampm: string | undefined): number {
        if (!ampm) return hour;
        const isPm = ampm.toLowerCase().includes('p');
        const isAm = ampm.toLowerCase().includes('a');
        if (isPm && hour !== 12) return hour + 12;
        if (isAm && hour === 12) return 0;
        return hour;
    }

    private generateEventId(title: string, date: ZonedDateTime): string {
        // Create a simple ID from title and date
        const titleSlug = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const dateStr = date.toLocalDate().toString();
        return `${titleSlug}-${dateStr}`;
    }
}

import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { HTMLElement } from 'node-html-parser';
import { ZonedDateTime, Duration, ZoneId } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";

interface JsonLdEvent {
    name: string;
    startDate: string;
    endDate?: string;
    description?: string;
    url?: string;
    image?: string;
    location?: {
        name?: string;
        address?: string;
    };
    organizer?: {
        name?: string;
    };
    offers?: {
        price?: string;
    };
}

export default class PikePlaceMarketRipper extends HTMLRipper {

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        const seenEvents = new Set<string>();
        const jsonLdScripts = html.querySelectorAll('script[type="application/ld+json"]');

        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.innerHTML);
                if (data?.["@type"] !== "Event") continue;

                const jsonLdEvent = data as JsonLdEvent;
                if (!jsonLdEvent.name || !jsonLdEvent.startDate) continue;

                const eventUrl = jsonLdEvent.url || "";
                const eventId = this.generateEventId(jsonLdEvent.name, jsonLdEvent.startDate, eventUrl);

                if (seenEvents.has(eventId)) continue;
                seenEvents.add(eventId);

                const eventDate = this.parseEventDate(jsonLdEvent.startDate, date.zone());
                if (!eventDate) {
                    events.push({
                        type: "InvalidDateError",
                        reason: `Could not parse date: ${jsonLdEvent.startDate} for event: ${jsonLdEvent.name}`
                    });
                    continue;
                }

                // Try to extract time from the HTML description
                const descriptionHtml = this.decodeHtmlEntities(jsonLdEvent.description || "");
                const timeInfo = this.extractTimeFromDescription(descriptionHtml);

                let startDateTime: ZonedDateTime;
                let duration: Duration;

                if (timeInfo) {
                    startDateTime = eventDate.withHour(timeInfo.startHour).withMinute(timeInfo.startMinute);
                    duration = timeInfo.duration;
                } else {
                    // Default to noon with 2-hour duration for events without explicit times
                    startDateTime = eventDate.withHour(12).withMinute(0);
                    duration = Duration.ofHours(2);
                }

                const location = this.buildLocation(jsonLdEvent);
                const description = this.cleanDescription(descriptionHtml);

                const event: RipperCalendarEvent = {
                    id: eventId,
                    ripped: new Date(),
                    date: startDateTime,
                    duration: duration,
                    summary: this.decodeHtmlEntities(jsonLdEvent.name),
                    description: description || undefined,
                    location: location || undefined,
                    url: eventUrl || undefined,
                    image: jsonLdEvent.image || undefined
                };
                events.push(event);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse JSON-LD event: ${error}`,
                    context: script.innerHTML.substring(0, 200)
                });
            }
        }

        return events;
    }

    private parseEventDate(dateStr: string, timezone: ZoneId): ZonedDateTime | null {
        try {
            // Handles ISO date format: "2026-02-11" or "2026-02-11T10:00"
            const parts = dateStr.split("T")[0].split("-");
            if (parts.length !== 3) return null;

            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]);
            const day = parseInt(parts[2]);

            if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

            return ZonedDateTime.of(year, month, day, 0, 0, 0, 0, timezone);
        } catch {
            return null;
        }
    }

    extractTimeFromDescription(descHtml: string): { startHour: number; startMinute: number; duration: Duration } | null {
        // Strip HTML tags for text-based time parsing
        const text = descHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

        // Pattern 1: "5:30 p.m. - 7 p.m." or "5:30 p.m. – 7:00 p.m."
        const dotPattern = /(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)/i;
        const dotMatch = text.match(dotPattern);
        if (dotMatch) {
            return this.parseTimeRange(
                parseInt(dotMatch[1]), dotMatch[2] ? parseInt(dotMatch[2]) : 0, dotMatch[3],
                parseInt(dotMatch[4]), dotMatch[5] ? parseInt(dotMatch[5]) : 0, dotMatch[6]
            );
        }

        // Pattern 2: "10:00am – 3:00pm" or "10:00am - 3:00pm"
        const compactPattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
        const compactMatch = text.match(compactPattern);
        if (compactMatch) {
            return this.parseTimeRange(
                parseInt(compactMatch[1]), compactMatch[2] ? parseInt(compactMatch[2]) : 0, compactMatch[3],
                parseInt(compactMatch[4]), compactMatch[5] ? parseInt(compactMatch[5]) : 0, compactMatch[6]
            );
        }

        // Pattern 3: "7:30 pm" (single time, no end time)
        const singlePattern = /(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.|am|pm)/i;
        const singleMatch = text.match(singlePattern);
        if (singleMatch) {
            const hour = this.convertTo24Hour(parseInt(singleMatch[1]), singleMatch[3]);
            const minute = singleMatch[2] ? parseInt(singleMatch[2]) : 0;
            if (hour === null || !this.isValidTime(hour, minute)) return null;
            return { startHour: hour, startMinute: minute, duration: Duration.ofHours(2) };
        }

        return null;
    }

    private parseTimeRange(
        startHr: number, startMin: number, startAmPm: string,
        endHr: number, endMin: number, endAmPm: string
    ): { startHour: number; startMinute: number; duration: Duration } | null {
        const startHour = this.convertTo24Hour(startHr, startAmPm);
        const endHour = this.convertTo24Hour(endHr, endAmPm);

        if (startHour === null || endHour === null) return null;
        if (!this.isValidTime(startHour, startMin) || !this.isValidTime(endHour, endMin)) return null;

        const startTotal = startHour * 60 + startMin;
        const endTotal = endHour * 60 + endMin;
        const durationMinutes = endTotal > startTotal ? endTotal - startTotal : 120;

        return {
            startHour,
            startMinute: startMin,
            duration: Duration.ofMinutes(durationMinutes)
        };
    }

    private convertTo24Hour(hour: number, ampm: string): number | null {
        const isPm = /p\.?m\.?/i.test(ampm);
        const isAm = /a\.?m\.?/i.test(ampm);
        if (!isPm && !isAm) return null;
        if (isPm && hour !== 12) return hour + 12;
        if (isAm && hour === 12) return 0;
        return hour;
    }

    private isValidTime(hour: number, minute: number): boolean {
        return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
    }

    private decodeHtmlEntities(text: string): string {
        return text
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&');
    }

    private buildLocation(event: JsonLdEvent): string {
        const parts: string[] = [];
        if (event.location?.name) parts.push(event.location.name);
        if (event.location?.address) parts.push(event.location.address);
        if (parts.length === 0) return "Pike Place Market";
        return parts.join(", ");
    }

    private cleanDescription(descHtml: string): string {
        // Strip HTML tags and normalize whitespace
        return descHtml
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 1000);
    }

    private generateEventId(name: string, date: string, url: string): string {
        // Use URL with occurrence parameter if available for unique ID
        if (url) {
            const slug = url
                .replace(/https?:\/\/[^/]+/, '')
                .replace(/[^a-z0-9]/gi, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '')
                .toLowerCase();
            return slug;
        }
        const titleSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return `${titleSlug}-${date}`;
    }
}

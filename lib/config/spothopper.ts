import { Duration, LocalDate, LocalTime, ZoneId, ZonedDateTime, LocalDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "./schema.js";
import { getFetchForConfig, FetchFn } from "./proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

/**
 * Ripper for SpotHopper/SpotApps restaurant website platform.
 *
 * SpotHopper sites render events server-side on the /calendar page.
 * Each event is a `.event-calendar-card` div with data attributes for
 * date/time and inner elements for title, description, and image.
 */
export class SpotHopperRipper implements IRipper {
    protected fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const baseUrl = ripper.config.url;

        let html: string;
        try {
            const res = await this.fetchFn(baseUrl.toString());
            if (!res.ok) {
                throw new Error(`${baseUrl} returned HTTP ${res.status}`);
            }
            html = await res.text();
        } catch (error) {
            return ripper.config.calendars.map(c => ({
                name: c.name,
                friendlyname: c.friendlyname,
                events: [],
                errors: [{
                    type: "ParseError" as const,
                    reason: `Failed to fetch SpotHopper calendar: ${error}`,
                    context: baseUrl.toString()
                }],
                parent: ripper.config,
                tags: c.tags || []
            }));
        }

        return ripper.config.calendars.map(cal => {
            const { events, errors } = this.parseEvents(html, cal.timezone);
            return {
                name: cal.name,
                friendlyname: cal.friendlyname,
                events,
                errors,
                parent: ripper.config,
                tags: cal.tags || []
            };
        });
    }

    public parseEvents(html: string, timezone: ZoneId): { events: RipperCalendarEvent[], errors: RipperError[] } {
        const root = parse(html);
        const cards = root.querySelectorAll('div.event-calendar-card[data-event-start-date]');
        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];
        const seenIds = new Set<string>();

        for (const card of cards) {
            const id = card.getAttribute('id') || '';
            if (seenIds.has(id)) continue;
            if (id) seenIds.add(id);

            const result = this.parseCard(card, timezone);
            if ('date' in result) {
                events.push(result);
            } else {
                errors.push(result);
            }
        }

        return { events, errors };
    }

    public parseCard(card: HTMLElement, timezone: ZoneId): RipperCalendarEvent | RipperError {
        const id = card.getAttribute('id') || '';
        const title = card.querySelector('h2')?.textContent?.trim();

        if (!title) {
            return {
                type: "ParseError",
                reason: "Event card missing title",
                context: `id=${id}`
            };
        }

        const startDateStr = card.getAttribute('data-event-start-date');
        const startTimeStr = card.getAttribute('data-event-start-time');

        if (!startDateStr) {
            return {
                type: "ParseError",
                reason: "Event card missing data-event-start-date",
                context: title
            };
        }

        // Parse start date — extract just the date part (timezone offset is unreliable)
        let eventDate: ZonedDateTime;
        try {
            const datePart = startDateStr.substring(0, 10); // "2026-05-07"
            const localDate = LocalDate.parse(datePart);

            let localTime = LocalTime.of(0, 0);
            if (startTimeStr) {
                const [hours, minutes] = startTimeStr.split(':').map(Number);
                localTime = LocalTime.of(hours, minutes);
            }

            eventDate = ZonedDateTime.of(LocalDateTime.of(localDate, localTime), timezone);
        } catch (error) {
            return {
                type: "ParseError",
                reason: `Failed to parse date: ${error}`,
                context: title
            };
        }

        // Parse duration from time range text
        const duration = this.parseDuration(card);

        // Extract description from .event-info-text
        const description = this.parseDescription(card);

        // Extract image
        const image = this.parseImage(card);

        // Note recurrence in description
        const recurrenceType = card.getAttribute('data-event-recurrence-type') || '';
        let fullDescription = description;
        if (recurrenceType && recurrenceType !== 'Does not Repeat') {
            const recurrenceNote = `Recurrence: ${recurrenceType}`;
            fullDescription = fullDescription
                ? `${recurrenceNote}\n\n${fullDescription}`
                : recurrenceNote;
        }

        return {
            id,
            ripped: new Date(),
            date: eventDate,
            duration,
            summary: title,
            description: fullDescription || undefined,
            image
        };
    }

    private parseDuration(card: HTMLElement): Duration {
        const timeEl = card.querySelector('p.event-main-text.event-time');
        if (!timeEl) return Duration.ofHours(3);

        const timeText = timeEl.textContent?.trim() || '';
        // Format: "06:00 PM - 09:00 PM"
        const match = timeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!match) return Duration.ofHours(3);

        const startMinutes = this.to24h(parseInt(match[1]), parseInt(match[2]), match[3]);
        const endMinutes = this.to24h(parseInt(match[4]), parseInt(match[5]), match[6]);

        let durationMinutes = endMinutes - startMinutes;
        if (durationMinutes <= 0) durationMinutes += 24 * 60; // crosses midnight

        return Duration.ofMinutes(durationMinutes);
    }

    private to24h(hours: number, minutes: number, period: string): number {
        let h = hours;
        if (period.toUpperCase() === 'PM' && h !== 12) h += 12;
        if (period.toUpperCase() === 'AM' && h === 12) h = 0;
        return h * 60 + minutes;
    }

    private parseDescription(card: HTMLElement): string | undefined {
        const infoText = card.querySelector('.event-info-text');
        if (!infoText) return undefined;

        // Remove the hidden metadata div
        const metaDiv = infoText.querySelector('div[data-event-id]');
        if (metaDiv) metaDiv.remove();

        // Remove "Read more" button
        const readMore = card.querySelector('.event-read-more');
        if (readMore) readMore.remove();

        const text = infoText.textContent?.trim();
        return text || undefined;
    }

    private parseImage(card: HTMLElement): string | undefined {
        const img = card.querySelector('.event-image-holder img');
        if (!img) return undefined;

        let src = img.getAttribute('src') || '';
        if (src.startsWith('//')) {
            src = 'https:' + src;
        }
        return src || undefined;
    }
}

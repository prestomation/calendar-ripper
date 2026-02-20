import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { HTMLElement } from "node-html-parser";
import { ChronoUnit, Duration, LocalDateTime, ZonedDateTime, ZoneRegion } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

const MONTHS: Record<string, number> = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
};

export default class MoPOPRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        // Parse JSON-LD events (have full start/end times)
        this.parseJsonLdEvents(html, events);

        // Parse calendar-dot-item elements from Webflow CMS (date-only events)
        this.parseCmsEvents(html, date.zone() as ZoneRegion, events);

        return events;
    }

    private parseJsonLdEvents(html: HTMLElement, events: RipperEvent[]): void {
        const jsonLdScripts = html.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.rawText);
                if (typeof data !== 'object' || data === null) continue;

                const eventItems = Array.isArray(data.hasPart) ? data.hasPart.filter((p: any) => p["@type"] === "Event") : [];
                for (const item of eventItems) {
                    const parsed = this.parseJsonLdEvent(item);
                    if (!parsed) continue;
                    if ("type" in parsed) {
                        events.push(parsed);
                    } else {
                        if (this.seenEvents.has(parsed.id!)) continue;
                        this.seenEvents.add(parsed.id!);
                        events.push(parsed);
                    }
                }
            } catch {
                // Non-event JSON-LD blocks are expected (e.g., Organization schema)
            }
        }
    }

    private parseCmsEvents(html: HTMLElement, timezone: ZoneRegion, events: RipperEvent[]): void {
        // Find all elements with data-date and data-title attributes
        const items = html.querySelectorAll('[data-date][data-title]');
        for (const item of items) {
            try {
                const dateStr = item.getAttribute('data-date');
                const title = item.getAttribute('data-title');
                if (!dateStr || !title) continue;

                const eventDate = this.parseDateString(dateStr, timezone);
                if (!eventDate) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date: ${dateStr}`,
                        context: title
                    });
                    continue;
                }

                // Generate a stable ID from title + date
                const id = this.generateEventId(decode(title), eventDate);
                if (this.seenEvents.has(id)) continue;
                this.seenEvents.add(id);

                // Find the event link
                const link = item.querySelector('.calendar-dot-link');
                const href = link?.getAttribute('href');
                const url = href && href !== '#'
                    ? (href.startsWith('http') ? href : `https://www.mopop.org${href}`)
                    : undefined;

                const text = item.getAttribute('data-text') || undefined;

                const event: RipperCalendarEvent = {
                    id,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofHours(4),
                    summary: decode(title),
                    description: text,
                    location: "Museum of Pop Culture, 325 5th Ave N, Seattle, WA",
                    url
                };

                events.push(event);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse CMS event: ${error}`,
                    context: item.toString().substring(0, 200)
                });
            }
        }
    }

    private parseJsonLdEvent(item: any): RipperEvent | null {
        if (!item.name || !item.startDate) return null;

        const summary = decode(item.name);
        const id = this.generateEventId(summary, null);

        // Check for duplicate by name
        if (this.seenEvents.has(id)) return null;

        const startDate = this.parseIsoDate(item.startDate);
        if (!startDate) {
            return {
                type: "ParseError",
                reason: `Could not parse startDate: ${item.startDate}`,
                context: item.name
            };
        }

        const endDate = item.endDate ? this.parseIsoDate(item.endDate) : null;
        let duration: Duration;
        if (endDate) {
            const minutes = startDate.until(endDate, ChronoUnit.MINUTES);
            duration = Duration.ofMinutes(minutes > 0 ? minutes : 240);
        } else {
            duration = Duration.ofHours(4);
        }

        const url = item.url
            ? (item.url.startsWith('http') ? item.url : `https://www.mopop.org${item.url}`)
            : undefined;

        return {
            id,
            ripped: new Date(),
            date: startDate,
            duration,
            summary,
            location: "Museum of Pop Culture, 325 5th Ave N, Seattle, WA",
            url
        };
    }

    private parseIsoDate(dateStr: string): ZonedDateTime | null {
        // Parse "2026-01-17T10:00:00" (no timezone = assume Pacific)
        const match = dateStr.match(
            /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/
        );
        if (!match) return null;

        const [, y, mo, d, h, mi, s] = match;
        return ZonedDateTime.of(
            LocalDateTime.of(parseInt(y), parseInt(mo), parseInt(d), parseInt(h), parseInt(mi), parseInt(s)),
            ZoneRegion.of("America/Los_Angeles")
        );
    }

    private parseDateString(dateStr: string, timezone: ZoneRegion): ZonedDateTime | null {
        // Parse "February 21, 2026"
        const match = dateStr.match(
            /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})$/
        );
        if (!match) return null;

        const month = MONTHS[match[1]];
        const day = parseInt(match[2]);
        const year = parseInt(match[3]);

        // Default to 10:00 AM (museum opening time)
        return ZonedDateTime.of(
            LocalDateTime.of(year, month, day, 10, 0),
            timezone
        );
    }

    private generateEventId(title: string, date: ZonedDateTime | null): string {
        const slug = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        if (date) {
            return `mopop-${slug}-${date.toLocalDate().toString()}`;
        }
        return `mopop-${slug}`;
    }
}

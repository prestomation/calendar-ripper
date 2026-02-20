import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { HTMLElement } from "node-html-parser";
import { ChronoUnit, Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

export default class HiddenHallRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        const jsonLdScripts = html.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.rawText);
                const items = Array.isArray(data) ? data : [];
                for (const item of items) {
                    if (item["@type"] !== "Event") continue;

                    // Only include Hidden Hall events (skip Nectar Lounge etc.)
                    const locationName = item.location?.name || "";
                    if (locationName !== "Hidden Hall") continue;

                    const parsed = this.parseEvent(item);
                    if (parsed && "type" in parsed) {
                        events.push(parsed);
                    } else if (parsed) {
                        if (this.seenEvents.has(parsed.id!)) continue;
                        this.seenEvents.add(parsed.id!);
                        events.push(parsed);
                    }
                }
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse JSON-LD: ${error}`,
                    context: script.rawText.substring(0, 200)
                });
            }
        }

        return events;
    }

    private parseEvent(item: any): RipperEvent | null {
        if (!item.name || !item.startDate) return null;

        const eventDate = this.parseDate(item.startDate);
        if (!eventDate) {
            return {
                type: "ParseError",
                reason: `Could not parse startDate: ${item.startDate}`,
                context: item.name
            };
        }

        const endDate = item.endDate ? this.parseDate(item.endDate) : null;
        let duration: Duration;
        if (endDate) {
            const minutes = eventDate.until(endDate, ChronoUnit.MINUTES);
            duration = Duration.ofMinutes(minutes > 0 ? minutes : 120);
        } else {
            duration = Duration.ofHours(2);
        }

        const summary = decode(item.name);

        // Strip HTML tags from description and decode entities
        let description: string | undefined;
        if (item.offers?.price != null) {
            description = `$${item.offers.price}`;
        }

        // Generate a stable ID from the Tixr URL
        const id = this.extractEventId(item.url);

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date: eventDate,
            duration,
            summary,
            description,
            location: "Hidden Hall, 400 N 35th St, Seattle, WA",
            url: item.url || undefined,
            image: item.image || undefined
        };

        return event;
    }

    private parseDate(isoString: string): ZonedDateTime | null {
        // Parse ISO 8601: "2026-02-21T04:00:00+00:00"
        const match = isoString.match(
            /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2})?$/
        );
        if (!match) return null;

        const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, offsetStr] = match;
        const localDateTime = LocalDateTime.of(
            parseInt(yearStr),
            parseInt(monthStr),
            parseInt(dayStr),
            parseInt(hourStr),
            parseInt(minuteStr),
            parseInt(secondStr)
        );

        const zone = offsetStr
            ? ZoneId.of(offsetStr)
            : ZoneId.of("America/Los_Angeles");
        return localDateTime.atZone(zone);
    }

    private extractEventId(url: string): string {
        if (!url) return `hidden-hall-${Date.now()}`;
        // Extract slug from URL like "https://www.tixr.com/groups/hiddenhall/events/swift-me-away-173706"
        const match = url.match(/events\/([^/?]+)/);
        return match ? match[1] : url;
    }
}

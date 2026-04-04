import { ZonedDateTime, Duration, LocalDateTime, ZoneRegion } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { parse } from "node-html-parser";
import { decode } from "html-entities";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

export default class CandlelightRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const res = await fetchFn(ripper.config.url.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });
        if (!res.ok) {
            throw Error(`${res.status} ${res.statusText}`);
        }

        const htmlString = await res.text();
        const events = this.parseEventsFromHtml(htmlString, ripper.config.calendars[0].timezone);

        return [{
            name: ripper.config.calendars[0].name,
            friendlyname: ripper.config.calendars[0].friendlyname,
            events: events.filter(e => "date" in e) as RipperCalendarEvent[],
            errors: events.filter(e => "type" in e) as RipperError[],
            parent: ripper.config,
            tags: ripper.config.calendars[0].tags || [],
        }];
    }

    public parseEventsFromHtml(htmlString: string, timezone: ZoneRegion): RipperEvent[] {
        const html = parse(htmlString);
        const events: RipperEvent[] = [];
        const seenIds = new Set<string>();

        // The listing page renders session cards with id="planId-YYYY-MM-DD"
        // Each card contains the event title, venue, and session times
        const sessionCards = html.querySelectorAll('[id]');

        for (const card of sessionCards) {
            const id = card.getAttribute('id') || '';
            const match = id.match(/^(\d+)-(\d{4}-\d{2}-\d{2})$/);
            if (!match) continue;

            const planId = match[1];
            const dateStr = match[2];

            try {
                const title = this.extractTitle(card);
                if (!title) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not extract title for plan ${planId} on ${dateStr}`,
                        context: id,
                    });
                    continue;
                }

                const venue = this.extractVenue(card);
                const times = this.extractTimes(card);

                if (times.length === 0) {
                    // No specific time found, default to 7:00 PM
                    const eventId = `candlelight-${planId}-${dateStr}-1900`;
                    if (seenIds.has(eventId)) continue;
                    seenIds.add(eventId);

                    const parsedDate = this.parseDate(dateStr, 19, 0, timezone);
                    if (!parsedDate) continue;

                    events.push({
                        id: eventId,
                        ripped: new Date(),
                        date: parsedDate,
                        duration: Duration.ofMinutes(65),
                        summary: decode(title),
                        description: `Candlelight concert by Fever. Tickets: https://feverup.com/m/${planId}`,
                        location: venue ? decode(venue) : undefined,
                        url: `https://feverup.com/m/${planId}`,
                    });
                } else {
                    for (const time of times) {
                        const parsed = this.parseTime(time);
                        if (!parsed) continue;

                        const eventId = `candlelight-${planId}-${dateStr}-${String(parsed.hour).padStart(2, '0')}${String(parsed.minute).padStart(2, '0')}`;
                        if (seenIds.has(eventId)) continue;
                        seenIds.add(eventId);

                        const parsedDate = this.parseDate(dateStr, parsed.hour, parsed.minute, timezone);
                        if (!parsedDate) continue;

                        events.push({
                            id: eventId,
                            ripped: new Date(),
                            date: parsedDate,
                            duration: Duration.ofMinutes(65),
                            summary: decode(title),
                            description: `Candlelight concert by Fever. Tickets: https://feverup.com/m/${planId}`,
                            location: venue ? decode(venue) : undefined,
                            url: `https://feverup.com/m/${planId}`,
                        });
                    }
                }
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse session card: ${error}`,
                    context: id,
                });
            }
        }

        return events;
    }

    private extractTitle(card: any): string | null {
        const titleEl = card.querySelector('.fv-wpf-session-plan-card-title');
        if (titleEl) return titleEl.text.trim();
        return null;
    }

    private extractVenue(card: any): string | null {
        const venueEl = card.querySelector('[data-testid="fv-plan-location__name"]');
        if (venueEl) return venueEl.text.trim();
        return null;
    }

    private extractTimes(card: any): string[] {
        const times: string[] = [];
        // Look for time patterns like "6:15 PM" in the card content
        const text = card.text;
        const matches = text.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/gi);
        if (matches) {
            for (const m of matches) {
                times.push(m.trim());
            }
        }
        return times;
    }

    private parseTime(timeStr: string): { hour: number; minute: number } | null {
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!match) return null;

        let hour = parseInt(match[1]);
        const minute = parseInt(match[2]);
        const isPM = /pm/i.test(match[3]);
        const isAM = /am/i.test(match[3]);

        if (isPM && hour !== 12) hour += 12;
        if (isAM && hour === 12) hour = 0;

        return { hour, minute };
    }

    private parseDate(dateStr: string, hour: number, minute: number, timezone: ZoneRegion): ZonedDateTime | null {
        const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;

        return ZonedDateTime.of(
            LocalDateTime.of(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]), hour, minute),
            timezone,
        );
    }
}

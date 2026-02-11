import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from 'node-html-parser';

const MONTHS: Record<string, number> = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6,
    'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12
};

export default class ElCorazonRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        const venueName: string = config.venue;
        const venueAddress: string = config.address;

        const entries = html.querySelectorAll('.ec-col-item');

        for (const entry of entries) {
            try {
                // Extract venue and skip events not matching this calendar's venue
                const venueEl = entry.querySelector('.venue div');
                if (!venueEl) continue;
                const venueText = venueEl.textContent.trim();
                if (venueText !== venueName) continue;

                // Extract event slug from the webflow link for use as ID
                const linkEl = entry.querySelector('.webflow-link');
                const eventPath = linkEl?.getAttribute('href') || '';
                const eventSlug = eventPath.replace(/^\/shows\//, '');
                if (!eventSlug) continue;

                // Deduplicate
                if (this.seenEvents.has(eventSlug)) continue;
                this.seenEvents.add(eventSlug);

                // Extract title
                const titleEl = entry.querySelector('.title div');
                if (!titleEl) continue;
                const title = titleEl.textContent.trim();
                if (!title) continue;

                // Extract headliners and support acts
                const headlinersEl = entry.querySelector('.calendar-headliners div');
                const headliners = headlinersEl?.textContent.trim() || title;
                const supportsEl = entry.querySelector('.calendar-supports div');
                const supports = supportsEl?.textContent.trim() || '';

                // Build summary
                let summary = title;
                if (supports) {
                    summary += ` with ${supports}`;
                }

                // Extract date: "February 13, 2026"
                const dateEl = entry.querySelector('.start-date div');
                if (!dateEl) continue;
                const dateText = dateEl.textContent.trim();

                const dateMatch = dateText.match(/(\w+)\s+(\d{1,2}),\s+(\d{4})/);
                if (!dateMatch) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date: "${dateText}" for ${title}`,
                        context: eventPath
                    });
                    continue;
                }

                const month = MONTHS[dateMatch[1]];
                const day = parseInt(dateMatch[2]);
                const year = parseInt(dateMatch[3]);
                if (!month) {
                    events.push({
                        type: "ParseError",
                        reason: `Unknown month: "${dateMatch[1]}" for ${title}`,
                        context: eventPath
                    });
                    continue;
                }

                // Extract show time (prefer show time over doors time)
                const showTimeEl = entry.querySelector('.show-time-cal div');
                const doorsTimeEl = entry.querySelector('.doors-cal div');
                const timeText = showTimeEl?.textContent.trim() || doorsTimeEl?.textContent.trim() || '';

                let hour = 20; // default 8 PM
                let minute = 0;
                const timeMatch = timeText.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
                if (timeMatch) {
                    hour = parseInt(timeMatch[1]);
                    minute = parseInt(timeMatch[2]);
                    const ampm = timeMatch[3].toUpperCase();
                    if (ampm === 'PM' && hour !== 12) hour += 12;
                    if (ampm === 'AM' && hour === 12) hour = 0;
                }

                const eventDate = ZonedDateTime.of(
                    LocalDateTime.of(year, month, day, hour, minute),
                    ZoneId.of('America/Los_Angeles')
                );

                // Extract image
                const imgEl = entry.querySelector('.event-image img');
                const imageUrl = imgEl?.getAttribute('src') || undefined;

                const eventUrl = `https://www.elcorazonseattle.com${eventPath}`;

                // Build description
                let description = '';
                if (headliners !== title) {
                    description += `${headliners}\n`;
                }
                if (supports) {
                    description += `with ${supports}\n`;
                }

                // Add doors time info if different from show time
                const doorsText = doorsTimeEl?.textContent.trim() || '';
                if (doorsText && doorsText !== timeText) {
                    description += `\nDoors: ${doorsText}`;
                }

                description += `\nVenue: ${venueName}, ${venueAddress}`;

                const location = `${venueName}, ${venueAddress}`;

                const event: RipperCalendarEvent = {
                    id: eventSlug,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofHours(3),
                    summary: summary,
                    description: description.trim(),
                    location: location,
                    url: eventUrl,
                    image: imageUrl
                };

                events.push(event);
            } catch (error) {
                const titleEl = entry.querySelector('.title div');
                const entryTitle = titleEl?.textContent.trim() || 'unknown';
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event for ${entryTitle}: ${error}`,
                    context: undefined
                });
            }
        }

        return events;
    }
}

import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from 'node-html-parser';

const LOCATION = "Chop Suey, 1325 E Madison St, Seattle, WA 98122";

interface ChopSueyEvent {
    id: string;
    start: string;
    title: string;
    doors: string;
    displayTime: string;
}

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&#8211;/g, '\u2013')
        .replace(/&#8212;/g, '\u2014')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function parseTime(timeStr: string): { hour: number; minute: number } | null {
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return null;
    let hour = parseInt(match[1]);
    const minute = parseInt(match[2]);
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return { hour, minute };
}

export default class ChopSueyRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        // Extract the all_events JavaScript array from the page
        const scriptContent = html.querySelectorAll('script')
            .map(s => s.textContent)
            .filter((t): t is string => t !== null)
            .find(t => t.includes('all_events'));

        if (!scriptContent) return events;

        const parsedEvents = this.extractEventsFromScript(scriptContent);

        for (const evt of parsedEvents) {
            if (this.seenEvents.has(evt.id)) continue;
            this.seenEvents.add(evt.id);

            try {
                const title = decodeHtmlEntities(evt.title);

                // Parse date from 'YYYY-MM-DD' format
                const dateParts = evt.start.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                if (!dateParts) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date: "${evt.start}" for ${title}`,
                        context: evt.id
                    });
                    continue;
                }

                const year = parseInt(dateParts[1]);
                const month = parseInt(dateParts[2]);
                const day = parseInt(dateParts[3]);

                // Parse show time from displayTime (e.g., "Show: 8:00 PM")
                let hour = 20; // default 8 PM
                let minute = 0;
                if (evt.displayTime) {
                    const time = parseTime(evt.displayTime);
                    if (time) {
                        hour = time.hour;
                        minute = time.minute;
                    }
                }

                const eventDate = ZonedDateTime.of(
                    LocalDateTime.of(year, month, day, hour, minute),
                    ZoneId.of('America/Los_Angeles')
                );

                // Look up the event dialog div for additional info
                const dialog = html.querySelector(`#tw-event-dialog-${evt.id}`);
                const infoLink = dialog?.querySelector('.tw-more-info-btn');
                const eventUrl = infoLink?.getAttribute('href') || `https://chopsuey.com/calendar/`;
                const ticketLink = dialog?.querySelector('.tw-buy-tix-btn');
                const ticketUrl = ticketLink?.getAttribute('href');

                // Extract image URL from dialog
                const imgEl = dialog?.querySelector('.tw-event-image-cal-pop img');
                const imageUrl = imgEl?.getAttribute('src') || undefined;

                // Build description
                let description = '';
                const doorsTime = evt.doors;
                if (doorsTime) {
                    description += `${doorsTime}\n`;
                }
                if (ticketUrl) {
                    description += `Tickets: ${ticketUrl}\n`;
                }
                description += `Venue: ${LOCATION}`;

                const event: RipperCalendarEvent = {
                    id: `chopsuey-${evt.id}`,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofHours(3),
                    summary: title,
                    description: description.trim(),
                    location: LOCATION,
                    url: eventUrl,
                    image: imageUrl
                };

                events.push(event);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event ${evt.id}: ${errorMessage}`,
                    context: evt.id
                });
            }
        }

        return events;
    }

    private extractEventsFromScript(script: string): ChopSueyEvent[] {
        const events: ChopSueyEvent[] = [];

        // Extract individual fields with simple, non-backtracking patterns
        const idPattern = /id:\s*'(\d+)'/g;
        const startPattern = /start:\s*'([^']+)'/g;
        const titlePattern = /title:\s*'([^']*)'/g;
        const doorsPattern = /doors:\s*'([^']*)'/g;
        const displayTimePattern = /displayTime:\s*'([^']*)'/g;

        // Split into event blocks by matching opening braces in the array
        const blocks = script.split(/\{\s*(?=id:\s*')/);

        for (const block of blocks) {
            const idMatch = idPattern.exec(block);
            const startMatch = startPattern.exec(block);
            const titleMatch = titlePattern.exec(block);
            const doorsMatch = doorsPattern.exec(block);
            const displayTimeMatch = displayTimePattern.exec(block);

            // Reset lastIndex for each block
            idPattern.lastIndex = 0;
            startPattern.lastIndex = 0;
            titlePattern.lastIndex = 0;
            doorsPattern.lastIndex = 0;
            displayTimePattern.lastIndex = 0;

            if (idMatch && startMatch && titleMatch) {
                events.push({
                    id: idMatch[1],
                    start: startMatch[1],
                    title: titleMatch[1],
                    doors: doorsMatch?.[1] || '',
                    displayTime: displayTimeMatch?.[1] || ''
                });
            }
        }

        return events;
    }
}

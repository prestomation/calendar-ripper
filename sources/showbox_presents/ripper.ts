import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from 'node-html-parser';

const MONTHS: Record<string, number> = {
    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
};

export default class ShowboxPresentsRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        const venueName: string = config.venue;
        const venueAddress: string = config.address;

        const entries = html.querySelectorAll('.entry');

        for (const entry of entries) {
            try {
                // Extract venue and skip events not matching this calendar's venue
                const venueEl = entry.querySelector('.venue');
                if (!venueEl) continue;
                const venueText = venueEl.textContent.replace('@', '').trim();
                if (venueText !== venueName) continue;

                // Extract event ID from the detail link
                const detailLink = entry.querySelector('h3 a');
                if (!detailLink) continue;
                const detailUrl = detailLink.getAttribute('href') || '';
                const idMatch = detailUrl.match(/\/events\/detail\/(\d+)/);
                const eventId = idMatch ? idMatch[1] : detailUrl;

                // Deduplicate
                if (this.seenEvents.has(eventId)) continue;
                this.seenEvents.add(eventId);

                // Extract artist name
                const artistName = detailLink.textContent.trim();
                if (!artistName) continue;

                // Extract tour name (second h5 in .title, after the presenter)
                const titleDiv = entry.querySelector('.title');
                const h5s = titleDiv?.querySelectorAll('h5') || [];
                const tourName = h5s.length > 1 ? h5s[1].textContent.trim() : '';

                // Extract supporting acts
                const supportEl = entry.querySelector('h4.animated');
                const supportText = supportEl?.textContent.trim() || '';

                // Build summary
                let summary = artistName;
                if (supportText) {
                    summary += ` ${supportText}`;
                }

                // Extract date: "Thu, Feb 12, 2026"
                const dateEl = entry.querySelector('.date');
                if (!dateEl) continue;
                const dateText = dateEl.textContent.trim();

                // Skip events with TBD dates — these are announced but not yet scheduled
                if (dateText === 'TBD' || dateText.includes('TBD')) continue;

                const dateMatch = dateText.match(/(\w{3}),\s+(\w{3})\s+(\d{1,2}),\s+(\d{4})/);
                if (!dateMatch) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date: "${dateText}" for ${artistName} at ${venueName}`,
                        context: `Event ${eventId}: ${detailUrl}`
                    });
                    continue;
                }
                const month = MONTHS[dateMatch[2]];
                const day = parseInt(dateMatch[3]);
                const year = parseInt(dateMatch[4]);
                if (!month) {
                    events.push({
                        type: "ParseError",
                        reason: `Unknown month: "${dateMatch[2]}" for ${artistName} at ${venueName}`,
                        context: `Event ${eventId}: ${detailUrl}`
                    });
                    continue;
                }

                // Extract time: "Show 7:00 PM"
                const timeEl = entry.querySelector('.time');
                let hour = 20; // default 8 PM
                let minute = 0;
                if (timeEl) {
                    const timeText = timeEl.textContent.trim();
                    const timeMatch = timeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                    if (timeMatch) {
                        hour = parseInt(timeMatch[1]);
                        minute = parseInt(timeMatch[2]);
                        const ampm = timeMatch[3].toUpperCase();
                        if (ampm === 'PM' && hour !== 12) hour += 12;
                        if (ampm === 'AM' && hour === 12) hour = 0;
                    }
                }

                const eventDate = ZonedDateTime.of(
                    LocalDateTime.of(year, month, day, hour, minute),
                    ZoneId.of('America/Los_Angeles')
                );

                // Extract ticket link
                const ticketLink = entry.querySelector('.btn-tickets');
                const ticketUrl = ticketLink?.getAttribute('href') || detailUrl;

                // Extract image
                const imgEl = entry.querySelector('.thumb img');
                const imageUrl = imgEl?.getAttribute('src') || undefined;

                // Build description
                let description = '';
                if (tourName) {
                    description += `${tourName}\n`;
                }
                if (supportText) {
                    description += `${supportText}\n`;
                }
                description += `\nVenue: ${venueName}`;
                if (venueAddress) {
                    description += `, ${venueAddress}`;
                }
                description += `\n\nTickets: ${ticketUrl}`;

                const location = venueAddress ? `${venueName}, ${venueAddress}` : venueName;

                const event: RipperCalendarEvent = {
                    id: eventId,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofHours(3),
                    summary: summary,
                    description: description,
                    location: location,
                    url: detailUrl,
                    image: imageUrl
                };

                events.push(event);
            } catch (error) {
                const entryLink = entry.querySelector('h3 a');
                const entryArtist = entryLink?.textContent.trim() || 'unknown';
                const entryUrl = entryLink?.getAttribute('href') || '';
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event for ${entryArtist} at ${venueName}: ${error}`,
                    context: `${entryUrl}`
                });
            }
        }

        return events;
    }
}

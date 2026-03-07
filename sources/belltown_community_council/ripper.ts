import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import '@js-joda/timezone';

const MONTHS: Record<string, number> = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12
};

// Matches: "BCC Meeting Wednesday March 11th 2026: Agenda text"
const MEETING_TITLE_RE = /BCC Meeting \w+ (\w+) (\d+)(?:st|nd|rd|th) (\d{4})(?::\s*(.+))?/i;

export default class BelltownCommunityCouncilRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const res = await fetch(ripper.config.url.toString());
        if (!res.ok) {
            throw Error(`${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        if (!data || typeof data !== 'object') {
            throw Error('Invalid JSON response from WordPress.com API');
        }
        const posts: any[] = data.posts || [];

        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        for (const cal of ripper.config.calendars) {
            const zone = ZoneId.of(cal.timezone.toString());
            const events = this.parseEvents(posts, zone);
            calendars[cal.name].events = calendars[cal.name].events.concat(events);
        }

        return Object.keys(calendars).map(key => ({
            name: key,
            friendlyname: calendars[key].friendlyName,
            events: calendars[key].events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: calendars[key].events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: calendars[key].tags
        }));
    }

    public parseEvents(posts: any[], zone: ZoneId, referenceDate: LocalDate = LocalDate.now()): RipperEvent[] {
        const events: RipperEvent[] = [];
        const seen = new Set<string>();

        for (const post of posts) {
            const title: string = post.title || '';
            const match = title.match(MEETING_TITLE_RE);
            if (!match) continue;

            const [, monthStr, dayStr, yearStr, agenda] = match;
            const monthNum = MONTHS[monthStr.toLowerCase()];
            if (!monthNum) continue;

            const day = parseInt(dayStr, 10);
            const year = parseInt(yearStr, 10);

            // Skip past meetings
            const meetingDate = LocalDate.of(year, monthNum, day);
            if (meetingDate.isBefore(referenceDate)) continue;

            // Deduplicate by date
            const dateKey = `${year}-${monthNum}-${day}`;
            if (seen.has(dateKey)) continue;
            seen.add(dateKey);

            const meetingDateTime = LocalDateTime.of(year, monthNum, day, 18, 30);
            const meetingZoned = ZonedDateTime.of(meetingDateTime, zone);

            const content: string = post.content || '';
            const location = this.extractLocation(content);
            const summary = agenda ? `BCC Meeting: ${agenda.trim()}` : 'Belltown Community Council Meeting';

            const event: RipperCalendarEvent = {
                id: `bcc-${dateKey}`,
                ripped: new Date(),
                date: meetingZoned,
                duration: Duration.ofMinutes(90),
                summary,
                description: this.stripHtml(content).substring(0, 600) || undefined,
                location: location || 'Belltown, Seattle, WA',
                url: post.URL
            };

            events.push(event);
        }

        return events;
    }

    private extractLocation(html: string): string | undefined {
        const text = this.stripHtml(html);
        // Try "See you at [Venue], [Address]" or "See you all at ..."
        const seeYouMatch = text.match(/[Ss]ee you (?:all )?(?:there )?at\s+([^.!\n(<]+)/);
        if (seeYouMatch) return seeYouMatch[1].trim().replace(/,\s*$/, '');

        // Try "meeting at [Venue]" or "meet at [Venue]"
        const meetAtMatch = text.match(/(?:meet(?:ing)? at|hosted? at)\s+(?:the\s+)?([^.!\n(<]+)/);
        if (meetAtMatch) return meetAtMatch[1].trim().replace(/,\s*$/, '');

        // Try to find a street address (number + street)
        const addressMatch = text.match(/(\d+\s+\w+(?:\s+\w+)?\s+(?:Ave|St|Blvd|Way|Pl|Dr|Rd)(?:\s+\w+)?)/i);
        if (addressMatch) return addressMatch[1].trim();

        return undefined;
    }

    private stripHtml(html: string): string {
        return html
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#8217;/g, "'")
            .replace(/&#\d+;/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
}

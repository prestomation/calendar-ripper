import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

const LOCATION = "Coby's Cafe, 101 Nickerson St Building B Suite 200, Seattle, WA 98109";
const TIMEZONE = ZoneId.of('America/Los_Angeles');

export default class CobysCafeRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const eventIds = await this.fetchFeaturedEventIds(ripper.config.url.href);
        const events = await this.fetchAndParseEvents(eventIds);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: events.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: events.filter((e): e is any => 'type' in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config
        }];
    }

    private async fetchFeaturedEventIds(eventsUrl: string): Promise<string[]> {
        const res = await this.fetchFn(eventsUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!res.ok) throw new Error(`Events page returned ${res.status}`);
        const html = await res.text();
        return this.extractFeaturedEventIds(html);
    }

    extractFeaturedEventIds(html: string): string[] {
        const match = html.match(/"featuredEventIds":\[([^\]]+)\]/);
        if (!match) return [];
        return match[1].replace(/"/g, '').split(',').map(id => id.trim()).filter(Boolean);
    }

    private async fetchAndParseEvents(ids: string[]): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        const seen = new Set<string>();

        for (const id of ids) {
            try {
                const url = `https://www.cobyscafe.com/product/x/${id}`;
                const res = await this.fetchFn(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                if (!res.ok) continue;
                const html = await res.text();
                const event = this.parseProductHtml(html, url, seen);
                if (event) events.push(event);
            } catch (e) {
                events.push({ type: 'ParseError', reason: `Failed to fetch/parse event ${id}: ${e}`, context: id });
            }
        }

        return events;
    }

    // Public for testing
    parseProductHtml(html: string, url: string, seen: Set<string>): RipperCalendarEvent | null {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
        if (!titleMatch) return null;

        const title = titleMatch[1]
            .replace(/ \| Coby&#039;s Cafe$/, '')
            .replace(/ \| Coby's Cafe$/, '')
            .trim();

        if (title === "Coby's Cafe" || title === '') return null;

        const titleLower = title.toLowerCase();
        if (titleLower.includes('members free rsvp') || titleLower.includes('member free rsvp')) return null;

        const descMatch = html.match(/<meta name="description" content="([^"]*)"/);
        const rawDesc = descMatch ? descMatch[1] : '';
        const description = this.decodeHtmlEntities(rawDesc);

        const parsed = this.parseDateTimeFromText(description);
        if (!parsed) return null;

        const { year, month, day, startHour, startMinute, endHour, endMinute } = parsed;

        const dedupKey = `${year}-${month}-${day}-${startHour}-${startMinute}`;
        if (seen.has(dedupKey)) return null;
        seen.add(dedupKey);

        const eventDate = ZonedDateTime.of(
            LocalDateTime.of(year, month, day, startHour, startMinute),
            TIMEZONE
        );
        const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);

        return {
            id: url,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(Math.max(30, durationMinutes)),
            summary: title,
            description,
            location: LOCATION,
            url
        };
    }

    // Public for testing
    parseDateTimeFromText(text: string): {
        year: number; month: number; day: number;
        startHour: number; startMinute: number;
        endHour: number; endMinute: number;
    } | null {
        const monthPattern = MONTHS.map(m => m[0].toUpperCase() + m.slice(1)).join('|');
        const re = new RegExp(
            `(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\\s+)?` +
            `(${monthPattern})\\s+(\\d{1,2})(?:,?\\s+\\d{4})?` +
            `\\s+from\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?` +
            `\\s*[\\u2013\\-]\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)`,
            'i'
        );

        const match = text.match(re);
        if (!match) return null;

        const [, monthName, dayStr, startHourStr, startMinStr, startAmPm,
            endHourStr, endMinStr, endAmPm] = match;

        const monthIdx = MONTHS.findIndex(m => m === monthName.toLowerCase());
        if (monthIdx === -1) return null;

        const month = monthIdx + 1;
        const day = parseInt(dayStr, 10);
        let startHour = parseInt(startHourStr, 10);
        const startMinute = parseInt(startMinStr ?? '0', 10);
        let endHour = parseInt(endHourStr, 10);
        const endMinute = parseInt(endMinStr ?? '0', 10);

        if (endAmPm.toLowerCase() === 'pm' && endHour !== 12) endHour += 12;
        else if (endAmPm.toLowerCase() === 'am' && endHour === 12) endHour = 0;

        if (startAmPm) {
            if (startAmPm.toLowerCase() === 'pm' && startHour !== 12) startHour += 12;
            else if (startAmPm.toLowerCase() === 'am' && startHour === 12) startHour = 0;
        } else if (endAmPm.toLowerCase() === 'pm' && startHour < 12) {
            startHour += 12;
        }

        const today = new Date();
        let year = today.getFullYear();
        const eventDate = new Date(year, month - 1, day);
        if (eventDate < today && today.getTime() - eventDate.getTime() > 24 * 60 * 60 * 1000) {
            year++;
        }

        return { year, month, day, startHour, startMinute, endHour, endMinute };
    }

    private decodeHtmlEntities(text: string): string {
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'");
    }
}

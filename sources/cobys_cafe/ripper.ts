import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
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
            errors: events.filter((e): e is RipperError => 'type' in e),
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
                if (!res.ok) {
                    events.push({ type: 'ParseError', reason: `HTTP ${res.status} fetching event ${id}`, context: id });
                    continue;
                }
                const html = await res.text();

                // Pre-parse filter: skip non-event pages and intentionally excluded content
                const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
                if (titleMatch) {
                    const title = titleMatch[1]
                        .replace(/ \| Coby&#039;s Cafe$/, '')
                        .replace(/ \| Coby's Cafe$/, '')
                        .trim();
                    const titleLower = title.toLowerCase();
                    if (title === "Coby's Cafe" || title === ''
                        || titleLower.includes('members free rsvp') || titleLower.includes('member free rsvp')) {
                        continue; // Not an event page or intentionally filtered
                    }
                }

                const result = this.parseProductHtml(html, url);
                // Dedup check after parsing (need date for key)
                if ('date' in result) {
                    const dedupKey = `${result.date.year()}-${result.date.monthValue()}-${result.date.dayOfMonth()}-${result.date.hour()}-${result.date.minute()}`;
                    if (seen.has(dedupKey)) continue; // Dedup — not an error
                    seen.add(dedupKey);
                }
                events.push(result);
            } catch (e) {
                events.push({ type: 'ParseError', reason: `Failed to fetch/parse event ${id}: ${e}`, context: id });
            }
        }

        return events;
    }

    // Public for testing — returns RipperCalendarEvent or RipperError, never null
    // Pre-parse filters (dedup, content exclusions) are handled in the caller
    parseProductHtml(html: string, url: string): RipperCalendarEvent | RipperError {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
        if (!titleMatch) return { type: 'ParseError', reason: 'No <title> found in HTML', context: url };

        const title = titleMatch[1]
            .replace(/ \| Coby&#039;s Cafe$/, '')
            .replace(/ \| Coby's Cafe$/, '')
            .trim();

        const descMatch = html.match(/<meta name="description" content="([^"]*)"/);
        const rawDesc = descMatch ? descMatch[1] : '';
        const description = this.decodeHtmlEntities(rawDesc);

        const parsed = this.parseDateTimeFromText(description);
        if (!parsed) return { type: 'ParseError', reason: 'No parseable date found in description', context: title };

        const { year, month, day, startHour, startMinute, endHour, endMinute } = parsed;

        const eventDate = ZonedDateTime.of(
            LocalDateTime.of(year, month, day, startHour, startMinute),
            TIMEZONE
        );
        const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
        if (durationMinutes <= 0) return { type: 'ParseError', reason: `Parsed duration <= 0 (${durationMinutes}min)`, context: title };

        return {
            id: url,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(durationMinutes),
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
        } else if (endAmPm.toLowerCase() === 'pm' && startHour + 12 <= endHour) {
            // Only infer PM for start if adding 12 still keeps it at or before end (e.g. "5-8pm"
            // → 17 ≤ 20 ✓; "11-1pm" → 23 > 13 → keep 11am ✓)
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
import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, ParseError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const DEFAULT_LOCATION = "5000 Rainier Ave S, Seattle, WA 98118";
const DEFAULT_DURATION_MINUTES = 120;

export interface EventLink {
    url: string;
    title: string;
}

export interface EventPageData {
    startDate: string;
    name: string;
    eventStatus: string;
}

function decodeHtmlEntities(str: string): string {
    return str
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

export function parseRSSFeed(xml: string): EventLink[] {
    const links: EventLink[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null) {
        const item = match[1];
        const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
        if (titleMatch && linkMatch) {
            links.push({
                title: decodeHtmlEntities(titleMatch[1].trim()),
                url: linkMatch[1].trim(),
            });
        }
    }
    return links;
}

export function parseEventPage(html: string): EventPageData | ParseError | null {
    const scriptMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!scriptMatch) return { type: 'ParseError', reason: 'No JSON-LD script tag found', context: undefined };
    try {
        const data = JSON.parse(scriptMatch[1]);
        if (data['@type'] !== 'Event') return null; // Not an event page — intentional skip
        return {
            startDate: data.startDate || '',
            name: decodeHtmlEntities(data.name || ''),
            eventStatus: data.eventStatus || '',
        };
    } catch {
        return { type: 'ParseError', reason: 'Failed to parse JSON-LD script tag', context: undefined };
    }
}

export default class RoyalRoomRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const zone = ZoneId.of(ripper.config.calendars[0].timezone.toString());
        const now = ZonedDateTime.now(zone);

        const rssRes = await fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!rssRes.ok) {
            throw Error(`RSS feed returned ${rssRes.status} ${rssRes.statusText}`);
        }
        const rssXml = await rssRes.text();
        const eventLinks = parseRSSFeed(rssXml);

        const errors: RipperError[] = [];
        const eventResults = await Promise.all(
            eventLinks.map(async (link): Promise<RipperCalendarEvent | RipperError | null> => {
                try {
                    const pageRes = await fetchFn(link.url, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
                    });
                    if (!pageRes.ok) {
                        return { type: 'ParseError', reason: `HTTP ${pageRes.status} fetching event page`, context: link.title };
                    }

                    const html = await pageRes.text();
                    const data = parseEventPage(html);
                    if (data && 'type' in data) return data; // ParseError from parseEventPage
                    if (!data || !data.startDate) return { type: 'ParseError', reason: 'No startDate found in event page JSON-LD', context: link.title };
                    if (data.eventStatus === 'EventCancelled') return null; // Intentional skip — cancelled

                    // startDate format: "2026-05-10 19:30:00"
                    const m = data.startDate.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
                    if (!m) return { type: 'ParseError', reason: `Unparseable startDate format: ${data.startDate}`, context: link.title };

                    const eventDate = ZonedDateTime.of(
                        LocalDateTime.of(
                            parseInt(m[1]), parseInt(m[2]), parseInt(m[3]),
                            parseInt(m[4]), parseInt(m[5])
                        ),
                        zone
                    );

                    if (eventDate.isBefore(now)) return null; // Past event — intentional skip

                    const slug = link.url.split('/').filter(Boolean).pop() ?? link.url;
                    return {
                        id: `royal-room-${slug}`,
                        ripped: new Date(),
                        date: eventDate,
                        duration: Duration.ofMinutes(DEFAULT_DURATION_MINUTES),
                        summary: link.title || data.name,
                        location: DEFAULT_LOCATION,
                        url: link.url,
                    };
                } catch (err) {
                    return {
                        type: 'ParseError',
                        reason: `Failed to fetch/parse event page: ${link.url}`,
                        context: String(err),
                    };
                }
            })
        );

        const events: RipperCalendarEvent[] = [];
        for (const r of eventResults) {
            if (r && 'date' in r) events.push(r);
            else if (r && 'type' in r) errors.push(r);
            // null = intentionally skipped (past event, cancelled)
        }

        return ripper.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            parent: ripper.config,
            tags: cal.tags || [],
        }));
    }
}

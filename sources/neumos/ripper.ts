import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, ParseError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

const LOCATION = "Neumos, 925 E Pike St, Seattle, WA 98122";
const DEFAULT_DURATION_HOURS = 3;

const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function decodeHtmlEntities(str: string): string {
    return str
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#039;/g, "'")
        .replace(/&rsquo;/g, '’')
        .replace(/&lsquo;/g, '‘')
        .replace(/&rdquo;/g, '”')
        .replace(/&ldquo;/g, '“')
        .replace(/&ndash;/g, '–')
        .replace(/&mdash;/g, '—');
}

function cleanText(s: string | undefined): string {
    return decodeHtmlEntities((s || '').replace(/\s+/g, ' ').trim());
}

function parseDoorsTime(timeText: string): { hour: number; minute: number } | null {
    const m = timeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return null;
    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    const ampm = m[3].toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return { hour, minute };
}

function parseAriaDate(label: string): { year: number; month: number; day: number } | null {
    const m = label.trim().match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/);
    if (!m) return null;
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (!month) return null;
    return { year: parseInt(m[3], 10), month, day: parseInt(m[2], 10) };
}

export type ParseResult = RipperCalendarEvent | ParseError;

export function parseEvent(item: HTMLElement, zone: ZoneId): ParseResult {
    const titleAnchor = item.querySelector('.title a');
    const summary = cleanText(titleAnchor?.textContent);
    if (!summary) {
        return { type: 'ParseError', reason: 'Event item missing title', context: undefined };
    }

    const eventUrl = titleAnchor?.getAttribute('href') || '';
    const idMatch = eventUrl.match(/-(\d+)(?:[/?#]|$)/);
    const id = idMatch ? `neumos-${idMatch[1]}` : `neumos-${summary.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    const dateEl = item.querySelector('.date');
    const ariaLabel = dateEl?.getAttribute('aria-label') || '';
    const parsed = parseAriaDate(ariaLabel);
    if (!parsed) {
        return { type: 'ParseError', reason: `Could not parse date from aria-label "${ariaLabel}"`, context: summary };
    }

    const timeText = cleanText(item.querySelector('.meta .time')?.textContent);
    const doors = parseDoorsTime(timeText);
    const hour = doors?.hour ?? 20;
    const minute = doors?.minute ?? 0;

    const eventDate = ZonedDateTime.of(
        LocalDateTime.of(parsed.year, parsed.month, parsed.day, hour, minute),
        zone,
    );

    const rawTagline = cleanText(item.querySelector('.tagline')?.textContent);
    // Some taglines already start with "with " (e.g. "with Coral Grief"); strip it so
    // we can format consistently as "<headliner> with <support>".
    const tagline = rawTagline.replace(/^with\s+/i, '');
    const tour = cleanText(item.querySelector('.promotion-text.tour')?.textContent);
    const ageText = cleanText(item.querySelector('.meta .age')?.textContent);

    const ticketAnchor = item.querySelector('.buttons a.tickets');
    const ticketUrl = ticketAnchor?.getAttribute('href') || undefined;
    const canceled = ticketAnchor?.getAttribute('data-canceled') === 'true';
    if (canceled) {
        return { type: 'ParseError', reason: 'Event marked canceled', context: summary };
    }

    const imageEl = item.querySelector('.thumb img');
    const image = imageEl?.getAttribute('src') || undefined;

    const descriptionParts: string[] = [];
    if (tagline) descriptionParts.push(`with ${tagline}`);
    if (tour) descriptionParts.push(tour);
    if (timeText) descriptionParts.push(timeText);
    if (ageText) descriptionParts.push(ageText);
    if (ticketUrl) descriptionParts.push(`Tickets: ${ticketUrl}`);
    descriptionParts.push(`Venue: ${LOCATION}`);

    return {
        id,
        ripped: new Date(),
        date: eventDate,
        duration: Duration.ofHours(DEFAULT_DURATION_HOURS),
        summary: tagline ? `${summary} with ${tagline}` : summary,
        description: descriptionParts.join('\n'),
        location: LOCATION,
        url: eventUrl || undefined,
        image,
    };
}

export function parseEvents(html: string, zone: ZoneId): ParseResult[] {
    const root = parse(html);
    return root.querySelectorAll('.eventItem').map(item => parseEvent(item, zone));
}

export default class NeumosRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const res = await fetchFn(ripper.config.url.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });
        if (!res.ok) {
            throw new Error(`Neumos events page returned ${res.status} ${res.statusText}`);
        }
        const html = await res.text();

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        return ripper.config.calendars.map(cal => {
            const zone = ZoneId.of(cal.timezone.toString());
            const now = ZonedDateTime.now(zone);
            const calEvents: RipperCalendarEvent[] = [];
            const calErrors: RipperError[] = [];
            const seen = new Set<string>();

            for (const result of parseEvents(html, zone)) {
                if ('type' in result) {
                    calErrors.push(result);
                    continue;
                }
                // Same date may repeat across the page if Neumos lists doubles; dedupe by id.
                if (result.id && seen.has(result.id)) continue;
                if (result.id) seen.add(result.id);
                if (result.date.isBefore(now.minusHours(6))) continue;
                calEvents.push(result);
            }

            return {
                name: cal.name,
                friendlyname: cal.friendlyname,
                events: calEvents,
                errors: calErrors,
                parent: ripper.config,
                tags: cal.tags || [],
            };
        });
    }
}

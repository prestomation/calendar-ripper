import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, ParseError } from "./schema.js";
import { getFetchForConfig } from "./proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

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

/**
 * Parse a single AXS skin event item from a venue website.
 * Used by both Neumos and Barboza rippers (and any future venue using the
 * same AXS skin platform — e.g. any site with `.eventItem` HTML structure).
 */
export function parseAXSSkinEvent(
    item: HTMLElement,
    zone: ZoneId,
    venueId: string,
    location: string,
    defaultDurationHours: number = 3,
): ParseResult {
    const titleAnchor = item.querySelector('.title a');
    const summary = cleanText(titleAnchor?.textContent);
    if (!summary) {
        return { type: 'ParseError', reason: 'Event item missing title', context: undefined };
    }

    const eventUrl = titleAnchor?.getAttribute('href') || '';

    const dateEl = item.querySelector('.date');
    const ariaLabel = dateEl?.getAttribute('aria-label') || '';
    const parsed = parseAriaDate(ariaLabel);
    if (!parsed) {
        return { type: 'ParseError', reason: `Could not parse date from aria-label "${ariaLabel}"`, context: summary };
    }

    const idMatch = eventUrl.match(/-(\d+)(?:[/?#]|$)/);
    // Use numeric ID from URL when available; otherwise generate a date-keyed fallback
    // to prevent collisions between events with similar titles on different dates.
    const id = idMatch
        ? `${venueId}-${idMatch[1]}`
        : `${venueId}-${summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${parsed.year}${String(parsed.month).padStart(2, '0')}${String(parsed.day).padStart(2, '0')}`;

    const timeText = cleanText(item.querySelector('.meta .time')?.textContent);
    const doors = parseDoorsTime(timeText);
    const hour = doors?.hour ?? 20;
    const minute = doors?.minute ?? 0;

    const eventDate = ZonedDateTime.of(
        LocalDateTime.of(parsed.year, parsed.month, parsed.day, hour, minute),
        zone,
    );

    const rawTagline = cleanText(item.querySelector('.tagline')?.textContent);
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
    descriptionParts.push(`Venue: ${location}`);

    return {
        id,
        ripped: new Date(),
        date: eventDate,
        duration: Duration.ofHours(defaultDurationHours),
        summary: tagline ? `${summary} with ${tagline}` : summary,
        description: descriptionParts.join('\n'),
        location,
        url: eventUrl || undefined,
        image,
    };
}

/**
 * Parse all AXS skin event items from an HTML page.
 */
export function parseAXSSkinEvents(html: string, zone: ZoneId, venueId: string, location: string): ParseResult[] {
    const root = parse(html);
    return root.querySelectorAll('.eventItem').map(item => parseAXSSkinEvent(item, zone, venueId, location));
}

/**
 * Base class for AXS skin venue rippers (Neumos, Barboza, etc.).
 * Subclasses just provide venue-specific config; all parsing is shared.
 */
export abstract class AXSSkinRipper implements IRipper {
    protected abstract readonly venueId: string;
    protected abstract readonly location: string;
    protected abstract readonly defaultDurationHours: number;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
        };

        // Fetch all pages via AJAX pagination endpoint
        const baseUrl = ripper.config.url.toString().replace(/\/events\/?$/, '');
        const ajaxBase = `${baseUrl}/events/events_ajax/`;
        const perPage = 12;
        const allHtml: string[] = [];

        for (let offset = 0; ; offset += perPage) {
            const ajaxUrl = `${ajaxBase}${offset}?category=0&venue=0&team=0&per_page=${perPage}&came_from_page=event-list-page`;
            const res = await fetchFn(ajaxUrl, { headers });
            if (!res.ok) {
                throw new Error(`${this.venueId} AJAX page at offset ${offset} returned ${res.status} ${res.statusText}`);
            }
            const raw = await res.text();
            // AJAX responses are JSON-encoded HTML strings
            let html: string;
            try {
                if (raw.startsWith('"')) {
                    html = JSON.parse(raw) as string;
                } else {
                    html = raw;
                }
            } catch (e) {
                throw new Error(`${this.venueId} AJAX page at offset ${offset} returned invalid JSON: ${(e as Error).message}`);
            }
            if (!html || !html.trim()) break;
            allHtml.push(html);
            // If fewer than perPage event items, this is the last page
            const root = parse(html);
            if (root.querySelectorAll('.eventItem').length < perPage) break;
        }

        return ripper.config.calendars.map(cal => {
            const zone = ZoneId.of(cal.timezone.toString());
            const now = ZonedDateTime.now(zone);
            const calEvents: RipperCalendarEvent[] = [];
            const calErrors: RipperError[] = [];
            const seen = new Set<string>();

            for (const html of allHtml) {
                for (const result of parseAXSSkinEvents(html, zone, this.venueId, this.location)) {
                    if ('type' in result) {
                        calErrors.push(result);
                        continue;
                    }
                    if (result.id && seen.has(result.id)) continue;
                    if (result.id) seen.add(result.id);
                    if (result.date.isBefore(now.minusHours(6))) continue;
                    calEvents.push(result);
                }
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
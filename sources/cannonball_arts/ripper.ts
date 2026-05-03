import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, ParseError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const DEFAULT_LOCATION = "Cannonball Arts Center, 1930 3rd Ave, Seattle, WA 98101";
const DEFAULT_DURATION_MINUTES = 120;
const DEFAULT_START_HOUR = 19;

interface WpPost {
    id: number;
    slug: string;
    link: string;
    title: { rendered: string };
    content: { rendered: string };
    acf?: Record<string, unknown>;
    meta?: Record<string, unknown>;
}

interface ParsedDateTime {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    endHour?: number;
    endMinute?: number;
}

const MONTH_NAMES: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Strip HTML tags and decode common WordPress HTML entities
export function stripHtml(html: string): string {
    return html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#8211;/g, '–')
        .replace(/&#8212;/g, '—')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Decode HTML entities in a title string
export function decodeTitle(html: string): string {
    return html
        .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
}

// Parse date and time from stripped plain text content.
// Returns ParsedDateTime or null if no recognizable date found.
export function parseDateFromText(text: string): ParsedDateTime | null {
    const monthPattern = Object.keys(MONTH_NAMES).join('|');
    const dateRe = new RegExp(
        `(${monthPattern})\\s+(\\d{1,2}),?\\s+(\\d{4})`,
        'i'
    );
    const dateMatch = text.match(dateRe);
    if (!dateMatch) return null;

    const monthNum = MONTH_NAMES[dateMatch[1].toLowerCase()];
    if (!monthNum) return null;

    const day = parseInt(dateMatch[2], 10);
    const year = parseInt(dateMatch[3], 10);

    // Extract all HH:MM AM/PM times in document order
    const timeRe = /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)/g;
    const times: Array<{ hour: number; minute: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = timeRe.exec(text)) !== null) {
        let hour = parseInt(m[1], 10);
        const minute = parseInt(m[2], 10);
        const ampm = m[3].toLowerCase();
        if (ampm === 'pm' && hour !== 12) hour += 12;
        else if (ampm === 'am' && hour === 12) hour = 0;
        times.push({ hour, minute });
    }

    const start = times[0] ?? { hour: DEFAULT_START_HOUR, minute: 0 };
    const end = times[1];

    return {
        year,
        month: monthNum,
        day,
        hour: start.hour,
        minute: start.minute,
        endHour: end?.hour,
        endMinute: end?.minute,
    };
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

function parsedDateTimeFromIso(val: string): ParsedDateTime | null {
    const m = val.match(ISO_DATE_RE);
    if (!m) return null;
    return {
        year: parseInt(m[1], 10),
        month: parseInt(m[2], 10),
        day: parseInt(m[3], 10),
        hour: m[4] !== undefined ? parseInt(m[4], 10) : DEFAULT_START_HOUR,
        minute: m[5] !== undefined ? parseInt(m[5], 10) : 0,
    };
}

// Try common ACF / meta field names AND any top-level string field that looks like
// an ISO date (custom register_rest_field entries vary by site).
export function parseDateFromFields(post: WpPost): ParsedDateTime | null {
    const NAMED_KEYS = [
        'event_date', 'cba_event_date', 'cba_date',
        'start_date', 'event_start_date', '_event_start_date',
        'date', 'start', 'event_start',
    ];

    // Check acf and meta objects for known date field names
    for (const source of [post.acf, post.meta]) {
        if (!source) continue;
        for (const key of NAMED_KEYS) {
            const val = source[key];
            if (typeof val !== 'string') continue;
            const result = parsedDateTimeFromIso(val);
            if (result) return result;
        }
    }

    // Scan ALL top-level string fields on the raw post for ISO date values.
    // WordPress register_rest_field() can expose event dates directly on the post
    // object under any field name. Skip standard WP fields (publish time, not event).
    const WP_STANDARD_FIELDS = new Set([
        'date', 'date_gmt', 'modified', 'modified_gmt',
        'slug', 'link', 'guid', 'type', 'status', 'template', 'excerpt',
    ]);
    const raw = post as Record<string, unknown>;
    for (const [key, val] of Object.entries(raw)) {
        if (WP_STANDARD_FIELDS.has(key)) continue;
        if (typeof val !== 'string') continue;
        const result = parsedDateTimeFromIso(val);
        if (result) return result;
    }

    return null;
}


// Parse a single WordPress post into a RipperCalendarEvent, ParseError, or null (past event).
export function parsePost(
    post: WpPost,
    now: ZonedDateTime,
    zone: ZoneId
): RipperCalendarEvent | ParseError | null {
    const text = stripHtml(post.content.rendered);
    const parsed = parseDateFromText(text) ?? parseDateFromFields(post);

    if (!parsed) {
        // No date found in content or structured fields — skip silently.
        return null;
    }

    const { year, month, day, hour, minute, endHour, endMinute } = parsed;

    let eventDate: ZonedDateTime;
    try {
        eventDate = ZonedDateTime.of(
            LocalDateTime.of(year, month, day, hour, minute),
            zone
        );
    } catch {
        return {
            type: 'ParseError',
            reason: `Invalid date components: ${year}-${month}-${day} ${hour}:${minute}`,
            context: post.title.rendered,
        };
    }

    if (eventDate.isBefore(now)) return null;

    let durationMinutes = DEFAULT_DURATION_MINUTES;
    if (endHour !== undefined && endMinute !== undefined) {
        const endTotal = endHour * 60 + endMinute;
        const startTotal = hour * 60 + minute;
        if (endTotal > startTotal) durationMinutes = endTotal - startTotal;
    }

    return {
        id: `cannonball-arts-${post.slug}`,
        ripped: new Date(),
        date: eventDate,
        duration: Duration.ofMinutes(durationMinutes),
        summary: decodeTitle(post.title.rendered),
        location: DEFAULT_LOCATION,
        url: post.link,
    };
}

export default class CannonballArtsRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const zone = ZoneId.of(calConfig.timezone.toString());
        const now = ZonedDateTime.now(zone);

        const url = new URL(ripper.config.url.toString());
        url.searchParams.set('per_page', '100');
        url.searchParams.set('status', 'publish');
        url.searchParams.set('orderby', 'date');
        url.searchParams.set('order', 'asc');

        const res = await fetchFn(url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) {
            throw new Error(`WordPress API returned ${res.status} ${res.statusText}`);
        }

        let posts: WpPost[];
        try {
            posts = await res.json();
        } catch (err) {
            throw new Error(`WordPress API returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
        }

        const errors: RipperError[] = [];
        const events: RipperCalendarEvent[] = [];

        for (const post of posts) {
            const result = parsePost(post, now, zone);
            if (result === null) continue;
            if ('date' in result) events.push(result);
            else errors.push(result);
        }

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}

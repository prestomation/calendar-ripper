import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const LOCATION = "Book Larder, 4252 Fremont Ave N, Seattle, WA 98103";
const TIMEZONE = ZoneId.of('America/Los_Angeles');
const DEFAULT_DURATION_MINUTES = 120;
const DEFAULT_START_HOUR = 18;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

interface ShopifyProduct {
    id: number;
    title: string;
    handle: string;
    body_html: string;
    product_type: string;
}

interface ShopifyResponse {
    products: ShopifyProduct[];
}

export default class BookLarderRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const res = await fetchFn(ripper.config.url.toString() + '?limit=250', {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' }
        });
        if (!res.ok) throw new Error(`Shopify API returned ${res.status}`);

        const data: ShopifyResponse = await res.json();

        const errors: RipperError[] = [];
        const events: RipperCalendarEvent[] = [];

        for (const product of data.products) {
            if (product.product_type !== 'Event') continue;
            try {
                const event = this.parseProduct(product);
                if (event) events.push(event);
            } catch (err) {
                errors.push({
                    type: 'ParseError',
                    reason: `Failed to parse product ${product.id}: ${err}`,
                    context: product.title,
                });
            }
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

    parseProduct(product: ShopifyProduct): RipperCalendarEvent | null {
        const plainText = this.stripHtml(product.body_html);
        const parsed = this.parseDateFromText(plainText);
        if (!parsed) return null;

        const { month, day, hour, minute, endHour, endMinute } = parsed;

        let durationMinutes = DEFAULT_DURATION_MINUTES;
        if (endHour !== undefined) {
            const end = endHour * 60 + (endMinute ?? 0);
            const start = hour * 60 + minute;
            if (end > start) durationMinutes = end - start;
        }

        const now = new Date();
        const year = now.getFullYear();
        const eventMidnight = new Date(year, month - 1, day);
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        // Book Larder events are one-time; skip past events rather than assuming next-year recurrence.
        if (eventMidnight < todayMidnight) {
            return null;
        }

        const eventDate = ZonedDateTime.of(
            LocalDateTime.of(year, month, day, hour, minute),
            TIMEZONE
        );

        return {
            id: `book-larder-${product.id}`,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(durationMinutes),
            summary: product.title,
            location: LOCATION,
            url: `https://booklarder.com/products/${product.handle}`,
        };
    }

    // Public for testing
    parseDateFromText(text: string): {
        month: number; day: number; hour: number; minute: number;
        endHour?: number; endMinute?: number;
    } | null {
        const monthNames = MONTHS.map(m => m[0].toUpperCase() + m.slice(1)).join('|');

        const dateRe = new RegExp(
            `(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\\s+)?` +
            `(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?`,
            'i'
        );
        const dateMatch = text.match(dateRe);
        if (!dateMatch) return null;

        const monthIdx = MONTHS.findIndex(m => m === dateMatch[1].toLowerCase());
        if (monthIdx === -1) return null;

        const month = monthIdx + 1;
        const day = parseInt(dateMatch[2], 10);

        // Try to find a time range "from Xam-Ypm" or "from X-Ypm"
        const rangeRe = /(?:from|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
        const rangeMatch = text.match(rangeRe);

        // Try to find a simple start time "at X:XXpm"
        const timeRe = /(?:from|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
        const timeMatch = text.match(timeRe);

        let hour = DEFAULT_START_HOUR;
        let minute = 0;
        let endHour: number | undefined;
        let endMinute: number | undefined;

        if (rangeMatch) {
            hour = parseInt(rangeMatch[1], 10);
            minute = parseInt(rangeMatch[2] ?? '0', 10);
            const startAmPm = rangeMatch[3]?.toLowerCase();
            endHour = parseInt(rangeMatch[4], 10);
            endMinute = parseInt(rangeMatch[5] ?? '0', 10);
            const endAmPm = rangeMatch[6].toLowerCase();

            if (endAmPm === 'pm' && endHour !== 12) endHour += 12;
            else if (endAmPm === 'am' && endHour === 12) endHour = 0;

            if (startAmPm === 'pm' && hour !== 12) hour += 12;
            else if (startAmPm === 'am' && hour === 12) hour = 0;
            else if (!startAmPm) {
                // endHour is already in 24h; `hour + 12 <= endHour` checks whether treating
                // start as PM produces a valid (non-negative) range, e.g. "2-5pm": 14 ≤ 17 ✓,
                // "11-1pm": 23 > 13 → start stays 11am ✓ (same logic as cobys_cafe ripper).
                if (endAmPm === 'pm' && hour + 12 <= endHour) hour += 12;
            }
        } else if (timeMatch) {
            hour = parseInt(timeMatch[1], 10);
            minute = parseInt(timeMatch[2] ?? '0', 10);
            const ampm = timeMatch[3].toLowerCase();
            if (ampm === 'pm' && hour !== 12) hour += 12;
            else if (ampm === 'am' && hour === 12) hour = 0;
        }

        return { month, day, hour, minute, endHour, endMinute };
    }

    // Public for testing
    stripHtml(html: string): string {
        return html
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }
}

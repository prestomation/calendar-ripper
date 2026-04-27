import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
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

interface ParsedDate {
    month: number; day: number; hour: number; minute: number;
    endHour?: number; endMinute?: number;
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
                const result = await this.parseProduct(product, fetchFn);
                if ('date' in result) {
                    events.push(result);
                } else {
                    errors.push(result);
                }
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

    async parseProduct(product: ShopifyProduct, fetchFn?: FetchFn): Promise<RipperCalendarEvent | RipperError> {
        const plainText = this.stripHtml(product.body_html);
        let parsed = this.parseDateFromText(plainText);

        // If no date found in body text, try fetching the Evey Events product page
        // which includes structured date/time metadata injected by the Evey Shopify app.
        // The products.json API doesn't include this data — only the rendered HTML page does.
        if (!parsed && fetchFn) {
            parsed = await this.fetchEveyDate(product.handle, fetchFn);
        }

        if (!parsed) {
            return {
                type: 'ParseError',
                reason: `No parseable date found in product description`,
                context: product.title,
            };
        }

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
        // Compare whole-day midnights so an event at 2pm today (when it's 10am) isn't skipped.
        if (eventMidnight < todayMidnight) {
            return {
                type: 'ParseError',
                reason: `Event date ${year}-${month}-${day} is in the past`,
                context: product.title,
            };
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
    parseDateFromText(text: string): ParsedDate | null {
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
                // Infer am/pm: if hour < 12 and end is PM, assume start is also PM
                // when that would produce a valid (non-negative) range.
                // e.g. "2-5pm": endHour=17, hour=2, 2<12 && 2<(17-12=5) → 2pm ✓
                // "11-1pm": endHour=13, hour=11, 11<12 but 11≮(13-12=1) → stays 11am ✓
                if (endAmPm === 'pm' && hour < 12 && hour < (endHour > 12 ? endHour - 12 : endHour)) {
                    hour += 12;
                }
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

    /**
     * Fetch the product page HTML and extract the Evey Events date/time.
     * Evey injects a hidden input like: <input id="event-date" name="properties[Event-Date]" value="May 30, 2026 10:00 AM">
     * Also visible as: <p><strong>Event Date:</strong></p><p>May 30, 2026</p>
     *               <p><strong>Event Time:</strong></p><p>10:00 am - 11:00 am</p>
     */
    async fetchEveyDate(handle: string, fetchFn: FetchFn): Promise<ParsedDate | null> {
        const url = `https://booklarder.com/collections/evey-events/products/${handle}`;
        try {
            const res = await fetchFn(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
            });
            if (!res.ok) return null;

            const html = await res.text();

            // Extract from hidden input: value="May 30, 2026 10:00 AM"
            const hiddenInputRe = /name="properties\[Event-Date\]"\s+value="([^"]+)"/i;
            const hiddenMatch = html.match(hiddenInputRe);
            if (!hiddenMatch) return null;

            const dateStr = hiddenMatch[1];
            // Parse format like "May 30, 2026 10:00 AM" or "Jun 27, 2026 10:00 AM"
            const eveyRe = /(\w{3,})\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i;
            const eveyMatch = dateStr.match(eveyRe);
            if (!eveyMatch) return null;

            const eveyMonth = eveyMatch[1].toLowerCase();
            let monthIdx = MONTHS.findIndex(m => m === eveyMonth);
            // Evey uses abbreviated months (Jun, Sep) — match by prefix if full name not found
            if (monthIdx === -1) {
                monthIdx = MONTHS.findIndex(m => m.startsWith(eveyMonth));
            }
            if (monthIdx === -1) return null;

            const month = monthIdx + 1;
            const day = parseInt(eveyMatch[2], 10);
            let hour = parseInt(eveyMatch[4], 10);
            const minute = parseInt(eveyMatch[5], 10);
            const ampm = eveyMatch[6].toUpperCase();

            if (ampm === 'PM' && hour !== 12) hour += 12;
            else if (ampm === 'AM' && hour === 12) hour = 0;

            let endHour: number | undefined;
            let endMinute: number | undefined;

            // Try to get end time from the visible "Event Time" block
            // Format: Event Time:</strong></p><p>10:00 am - 11:00 am</p>
            const timeBlockRe = /Event Time:\s*<\/strong>\s*<\/p>\s*<p>(\d{1,2}):(\d{2})\s*(am|pm)\s*[-–]\s*(\d{1,2}):(\d{2})\s*(am|pm)/i;
            const timeMatch = html.match(timeBlockRe);

            if (timeMatch) {
                // The range gives us both start and end; use the end time for duration
                let finalEndHour = parseInt(timeMatch[4], 10);
                const finalEndMinute = parseInt(timeMatch[5], 10);
                const finalEndAmpm = timeMatch[6].toLowerCase();
                if (finalEndAmpm === 'pm' && finalEndHour !== 12) finalEndHour += 12;
                else if (finalEndAmpm === 'am' && finalEndHour === 12) finalEndHour = 0;
                endHour = finalEndHour;
                endMinute = finalEndMinute;
            }

            return { month, day, hour, minute, endHour, endMinute };
        } catch {
            return null;
        }
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

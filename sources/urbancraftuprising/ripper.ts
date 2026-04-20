import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { HTMLElement, parse as parseHtml } from "node-html-parser";
import { ZonedDateTime, Duration, LocalDateTime, ZoneRegion } from "@js-joda/core";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

const MONTHS: Record<string, number> = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12
};

// Patterns that indicate non-event pages (vendor listings, resources, etc.)
const EXCLUDED_SLUGS = [
    'vendors', 'vendor', 'resources', 'selling-at-shows',
    'makers', 'apply', 'sponsors', 'contact', 'about',
    'blog', 'greenhouse-program', 'derby-days-vendors',
    'eleventh-hour-vendors', 'port-townsend-handmade-market-vendors',
    'winter-2025-vendors', 'summer-2025-vendors',
    'winter-2025', 'summer-2025'
];

// Known location patterns from the site
const LOCATION_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /Pacific Place/i, name: "Pacific Place, 400 Pine St, Seattle, WA 98101" },
    { pattern: /Magnuson Park/i, name: "Magnuson Park Hangar 30, 6310 NE 74th St, Seattle, WA 98115" },
    { pattern: /Hangar 30/i, name: "Magnuson Park Hangar 30, 6310 NE 74th St, Seattle, WA 98115" },
    { pattern: /Seattle Center/i, name: "Seattle Center Exhibition Hall, 301 Mercer St, Seattle, WA 98109" },
    { pattern: /Exhibition Hall/i, name: "Seattle Center Exhibition Hall, 301 Mercer St, Seattle, WA 98109" },
    { pattern: /Frances Anderson Center/i, name: "Frances Anderson Center, 700 Main St, Edmonds, WA 98020" },
    { pattern: /Fairview/i, name: "Fairview Hall, 237 Fairview Ave N, Seattle, WA 98109" },
    { pattern: /Downtown Bend/i, name: "Downtown Bend, OR" },
    { pattern: /Port Townsend/i, name: "Downtown Port Townsend, WA" },
    { pattern: /Edmonds/i, name: "Edmonds, WA" },
];

export default class UrbanCraftUprisingRipper extends HTMLRipper {
    /**
     * The HTMLRipper base class fetches the URL from config for each day in the lookahead period.
     * Since our URL is a static events listing page, we override parseEvents to extract
     * event links from the listing page, then fetch each detail page to get event data.
     */
    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        // Extract event links from the listing page
        const eventLinks = this.extractEventLinks(html);

        if (eventLinks.length === 0) {
            return events;
        }

        // Fetch each event detail page and parse it
        const fetchFn = getFetchForConfig((this as any).ripperConfig || { proxy: false });

        for (const link of eventLinks) {
            try {
                const res = await fetchFn(link, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    },
                });

                if (!res.ok) {
                    events.push({
                        type: "ParseError",
                        reason: `Failed to fetch event page: ${res.status} ${res.statusText}`,
                        context: link
                    });
                    continue;
                }

                const detailHtml = await res.text();
                const parsed = parseHtml(detailHtml);
                const event = this.parseEventPage(parsed, link, date.zone() as ZoneRegion);

                if (event) {
                    if ('type' in event && event.type === 'ParseError') {
                        events.push(event);
                    } else {
                        events.push(event);
                    }
                }
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Error fetching event page: ${error}`,
                    context: link
                });
            }
        }

        return events;
    }

    /**
     * Extract links to individual event pages from the events listing page.
     * The site uses WPBakery page builder with image cards linking to event pages.
     */
    private extractEventLinks(html: HTMLElement): string[] {
        const links: string[] = [];
        const seen = new Set<string>();

        // Find all links on the page that point to event pages
        const allLinks = html.querySelectorAll('a[href]');

        for (const anchor of allLinks) {
            const href = anchor.getAttribute('href');
            if (!href) continue;

            // Normalize URL
            let url = href;
            if (url.startsWith('/')) {
                url = `https://urbancraftuprising.com${url}`;
            }

            // Only include links to urbancraftuprising.com pages (not external like gobbleupnorthwest.com or campthundercraft.com)
            if (!url.startsWith('https://urbancraftuprising.com/')) continue;

            // Extract slug from URL
            const slug = url.replace(/\/+$/, '').split('/').pop()?.toLowerCase() || '';

            // Skip excluded pages
            if (EXCLUDED_SLUGS.some(excluded => slug.includes(excluded.toLowerCase()))) continue;

            // Skip the events listing page itself, homepage, and other non-event pages
            if (url === 'https://urbancraftuprising.com/events/' ||
                url === 'https://urbancraftuprising.com/events' ||
                url === 'https://urbancraftuprising.com/' ||
                url === 'https://urbancraftuprising.com') continue;

            // Skip URLs with extensions or that are clearly not event pages
            if (url.match(/\.(jpg|png|gif|pdf|css|js)$/i)) continue;

            // Skip wp-content, wp-admin, wp-json, feed URLs
            if (url.includes('/wp-content/') || url.includes('/wp-admin/') ||
                url.includes('/wp-json/') || url.includes('/feed/')) continue;

            // Skip vendor listing pages
            if (slug.endsWith('-vendors')) continue;

            if (seen.has(url)) continue;
            seen.add(url);

            // The link must be inside the main content area (entry-content or wpb-content-wrapper)
            // OR be a link from an image/heading that looks like an event card
            const parent = anchor.closest('.wpb-content-wrapper') || anchor.closest('.entry-content');
            if (!parent) continue;

            // Check if the link text or nearby text suggests it's an event
            // (has keywords like market, fest, show, uprising, or is an image link in the events section)
            const linkText = anchor.innerText?.toLowerCase() || '';
            const imgAlt = anchor.querySelector('img')?.getAttribute('alt')?.toLowerCase() || '';
            const imgTitle = anchor.querySelector('img')?.getAttribute('title')?.toLowerCase() || '';
            const combinedText = `${linkText} ${imgAlt} ${imgTitle}`;

            const isEventLike = combinedText.includes('market') ||
                combinedText.includes('fest') ||
                combinedText.includes('show') ||
                combinedText.includes('uprising') ||
                combinedText.includes('craft') ||
                combinedText.includes('gobble') ||
                combinedText.includes('handmade') ||
                combinedText.includes('sessions') ||
                anchor.querySelector('img') !== null; // image links are event cards

            if (!isEventLike) continue;

            links.push(url);
        }

        return links;
    }

    /**
     * Parse an individual event page to extract event details.
     */
    private parseEventPage(html: HTMLElement, url: string, timezone: ZoneRegion): RipperEvent | null {
        // Get the page title
        const titleEl = html.querySelector('h1');
        const pageTitle = html.querySelector('title')?.innerText || '';
        const ogTitle = html.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';

        // Determine the event title from h1 or page title
        let title = '';
        if (titleEl) {
            title = decode(titleEl.innerText.trim());
        } else if (ogTitle) {
            // OG title often includes " | Urban Craft Uprising" or " |Brought to you by Urban Craft Uprising"
            title = decode(ogTitle.replace(/\s*[|]\s*(Brought to you by\s*)?Urban Craft Uprising\s*$/i, '').trim());
        } else if (pageTitle) {
            title = decode(pageTitle.replace(/\s*[|]\s*(Brought to you by\s*)?Urban Craft Uprising\s*$/i, '').trim());
        }

        if (!title) {
            return {
                type: "ParseError",
                reason: "Could not determine event title",
                context: url
            };
        }

        // Extract slug for ID
        const slug = url.replace(/\/+$/, '').split('/').pop() || 'unknown';

        // Collect all text content from the page for date/time/location extraction
        const allText = this.extractStructuredText(html);

        // Extract date
        const dateInfo = this.extractDate(allText);
        if (!dateInfo) {
            return {
                type: "ParseError",
                reason: `No date found on event page`,
                context: `Title: ${title}, URL: ${url}`
            };
        }

        const eventDate = this.parseDate(dateInfo.dateStr, dateInfo.year, timezone);
        if (!eventDate) {
            return {
                type: "ParseError",
                reason: `Could not parse date: ${dateInfo.dateStr}`,
                context: `Title: ${title}`
            };
        }

        // Extract time
        const timeInfo = this.extractTime(allText);

        // Set hour/minute
        const hour = timeInfo?.hour ?? 10; // Default to 10 AM for markets
        const minute = timeInfo?.minute ?? 0;

        const eventDateTime = ZonedDateTime.of(
            LocalDateTime.of(
                eventDate.year(),
                eventDate.monthValue(),
                eventDate.dayOfMonth(),
                hour,
                minute
            ),
            timezone
        );

        // Determine duration
        let duration = Duration.ofHours(6); // Default 6 hours for markets/shows
        if (timeInfo?.endHour) {
            const startMinutes = hour * 60 + minute;
            const endMinutes = timeInfo.endHour * 60 + (timeInfo.endMinute ?? 0);
            const diffMinutes = endMinutes - startMinutes;
            if (diffMinutes > 0) {
                duration = Duration.ofMinutes(diffMinutes);
            }
        }

        // Extract location
        const location = this.extractLocation(allText, title);

        // Extract description
        const description = this.extractDescription(allText);

        return {
            id: slug,
            ripped: new Date(),
            date: eventDateTime,
            duration,
            summary: title,
            description,
            location,
            url
        };
    }

    /**
     * Extract structured text from h6 and other heading/content elements.
     */
    private extractStructuredText(html: HTMLElement): string[] {
        const texts: string[] = [];

        // The site uses h6 tags for date/time/location info in WPBakery layouts
        const h6Elements = html.querySelectorAll('h6');
        for (const el of h6Elements) {
            const text = el.innerText.trim();
            if (text) texts.push(text);
        }

        // Also check for strong/b tags within li elements (vending info sections)
        const listItems = html.querySelectorAll('li');
        for (const li of listItems) {
            const text = li.innerText.trim();
            if (text) texts.push(text);
        }

        // Check h1 and h3 for title context
        const h1 = html.querySelector('h1');
        if (h1) texts.push(h1.innerText.trim());

        const h3s = html.querySelectorAll('h3');
        for (const h3 of h3s) {
            texts.push(h3.innerText.trim());
        }

        return texts;
    }

    /**
     * Extract date from text content. Looks for patterns like:
     * "Saturday, July 11th"
     * "FRIDAY, DECEMBER 19TH"
     * "May 9th"
     * "June 7th"
     */
    private extractDate(texts: string[]): { dateStr: string; year: number } | null {
        const currentYear = new Date().getFullYear();
        const now = new Date();

        // Patterns to match dates
        const datePatterns = [
            // "SATURDAY, JULY 11TH" or "Saturday, May 9th" or "FRIDAY, DECEMBER 19TH"
            /\b(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY),?\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2})(?:ST|ND|RD|TH)?\b/i,
            // "JULY 11TH" or "May 9th"
            /\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2})(?:ST|ND|RD|TH)?\b/i,
            // Month + date range like "December 19 – 21" 
            /\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2})(?:ST|ND|RD|TH)?\s*[–\-]\s*(?:\d{1,2})(?:ST|ND|RD|TH)?\b/i,
        ];

        for (const text of texts) {
            // Clean HTML entities
            const cleanText = text.replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&amp;/g, '&');

            for (const pattern of datePatterns) {
                const match = cleanText.match(pattern);
                if (match) {
                    const month = match[1];
                    const day = parseInt(match[2]);
                    const monthNum = MONTHS[month.toLowerCase()];
                    if (!monthNum) continue;

                    // Determine year
                    let year = currentYear;
                    const testDate = new Date(year, monthNum - 1, day);
                    // If date is more than 7 days in the past, assume next year
                    const daysDiff = (testDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
                    if (daysDiff < -7) {
                        year = currentYear + 1;
                    }

                    return { dateStr: `${month} ${day}`, year };
                }
            }
        }

        return null;
    }

    /**
     * Extract time from text content. Looks for patterns like:
     * "10AM – 5pm" or "10am-5pm" or "10:00am - 5:00pm"
     */
    private extractTime(texts: string[]): { hour: number; minute: number; endHour?: number; endMinute?: number } | null {
        for (const text of texts) {
            const cleanText = text.replace(/&#8211;/g, '–').replace(/&#8212;/g, '—');

            // Pattern: "10AM – 5pm" or "10am-5pm" or "10:00am - 5:00pm"
            const timeRangeMatch = cleanText.match(
                /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[–\-\s]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i
            );

            if (timeRangeMatch) {
                let startHour = parseInt(timeRangeMatch[1]);
                const startMin = parseInt(timeRangeMatch[2] || '0');
                const startAmPm = timeRangeMatch[3].toLowerCase();
                let endHour = parseInt(timeRangeMatch[4]);
                const endMin = parseInt(timeRangeMatch[5] || '0');
                const endAmPm = timeRangeMatch[6].toLowerCase();

                if (startAmPm === 'pm' && startHour !== 12) startHour += 12;
                if (startAmPm === 'am' && startHour === 12) startHour = 0;
                if (endAmPm === 'pm' && endHour !== 12) endHour += 12;
                if (endAmPm === 'am' && endHour === 12) endHour = 0;

                return {
                    hour: startHour,
                    minute: startMin,
                    endHour,
                    endMinute: endMin
                };
            }

            // Pattern: single time like "10am" or "10:00am"
            const singleTimeMatch = cleanText.match(
                /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i
            );
            if (singleTimeMatch) {
                let hour = parseInt(singleTimeMatch[1]);
                const minute = parseInt(singleTimeMatch[2] || '0');
                const ampm = singleTimeMatch[3].toLowerCase();
                if (ampm === 'pm' && hour !== 12) hour += 12;
                if (ampm === 'am' && hour === 12) hour = 0;
                return { hour, minute };
            }
        }

        return null;
    }

    /**
     * Parse a date string like "July 11" with a given year into a ZonedDateTime.
     */
    private parseDate(dateStr: string, year: number, timezone: ZoneRegion): ZonedDateTime | null {
        const match = dateStr.match(/^(\w+)\s+(\d{1,2})$/i);
        if (!match) return null;

        const month = MONTHS[match[1].toLowerCase()];
        const day = parseInt(match[2]);

        if (!month || isNaN(day)) return null;

        try {
            return ZonedDateTime.of(
                LocalDateTime.of(year, month, day, 10, 0),
                timezone
            );
        } catch {
            return null;
        }
    }

    /**
     * Extract location from text content.
     */
    private extractLocation(texts: string[], title: string): string | undefined {
        const allText = texts.join(' ');

        // Check known location patterns
        for (const { pattern, name } of LOCATION_PATTERNS) {
            if (pattern.test(allText)) {
                return name;
            }
        }

        // Try to extract street addresses
        const addressMatch = allText.match(/(\d+\s+[A-Z][a-zA-Z\s]+(?:St(?:reet)?|Ave(?:nue)?|Rd|Road|Blvd|Boulevard|Dr(?:ive)?|Ln|Lane|Way|Place|Pl|Court|Ct)[,.]?(?:\s+(?:Seattle|Edmonds|Bend|Portland|Port Townsend|Tacoma)[,.]?\s*(?:WA|OR)?)?)/i);
        if (addressMatch) {
            return addressMatch[1].trim();
        }

        // Fallback: use location info from h6 headings
        for (const text of texts) {
            const locationPatterns = [
                /Downtown\s+([\w\s]+(?:Townsend|Edmonds|Bend|Seattle))/i,
                /((?:Frances Anderson Center|Hangar \d+|Exhibition Hall))/i,
            ];
            for (const pattern of locationPatterns) {
                const match = text.match(pattern);
                if (match) return match[1].trim();
            }
        }

        // Last resort: extract from title context
        if (/Bend/i.test(title)) return "Downtown Bend, OR";
        if (/Edmonds/i.test(title)) return "Edmonds, WA";
        if (/Port Townsend/i.test(title)) return "Downtown Port Townsend, WA";
        if (/Fairview/i.test(title)) return "Fairview Hall, Seattle, WA";

        return undefined;
    }

    /**
     * Extract a brief description from text content.
     */
    private extractDescription(texts: string[]): string | undefined {
        // Look for description-like text from h3 tags or longer text blocks
        for (const text of texts) {
            // Skip short text, date/time text, and vending info
            if (text.length < 40) continue;
            if (/^(?:saturday|sunday|monday|tuesday|wednesday|thursday|friday)/i.test(text)) continue;
            if (/^(?:\d{1,2})(?::\d{2})?\s*(?:am|pm)/i.test(text)) continue;
            if (/vending information/i.test(text)) continue;
            if (/vendor application/i.test(text)) continue;
            if (/meet the makers/i.test(text)) continue;

            // This looks like a description paragraph
            const cleaned = text.replace(/&#8211;/g, '–').replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"').trim();
            if (cleaned.length > 50 && cleaned.length < 500) {
                return cleaned;
            }
        }

        return undefined;
    }
}
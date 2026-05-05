import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { parse, HTMLElement } from "node-html-parser";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const LOCATION_SUFFIX = ", Waterfront Park, Seattle, WA";

/**
 * Parse a YYYYMMDDHHMM datetime string into a ZonedDateTime in America/Los_Angeles.
 * Example: "202605241100" → May 24, 2026 at 11:00
 */
export function parseDatetime(datetime: string): ZonedDateTime | null {
    const match = datetime.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (!match) return null;
    const [, y, mo, d, h, mi] = match;
    try {
        return ZonedDateTime.of(
            LocalDateTime.of(parseInt(y), parseInt(mo), parseInt(d), parseInt(h), parseInt(mi)),
            ZoneId.of("America/Los_Angeles"),
        );
    } catch {
        return null;
    }
}

/**
 * Parse a time part like "10", "10:30", "10 am", "10:30 am" into { hour, minute }.
 * If meridiem is not specified, it is returned as null (caller must infer).
 */
function parseTimePart(part: string): { hour: number; minute: number; meridiem: "am" | "pm" | null } | null {
    const s = part.trim();
    const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!m) return null;
    const hour = parseInt(m[1]);
    const minute = m[2] ? parseInt(m[2]) : 0;
    const meridiem = m[3] ? (m[3].toLowerCase() as "am" | "pm") : null;
    return { hour, minute, meridiem };
}

/**
 * Parse a time range string (from h3.date-time) and return a Duration.
 * The data-datetime already encodes the start time; we use the time range
 * only to compute how long the event lasts.
 *
 * Handles formats like:
 *   "10 am"          → default 2 hours (no end time)
 *   "10 am‑12 pm"    → 2 hours
 *   "1‑8 pm"         → 7 hours (implicit pm on start)
 *   "9‑11:30 am"     → 2.5 hours (implicit am on start)
 *   "11:30 am‑3:30 pm" → 4 hours
 *   "6:30‑10 pm"     → 3.5 hours
 */
export function parseDuration(timeRange: string): Duration {
    // Separator is U+2011 (non-breaking hyphen) or regular hyphen between numbers
    // We split on the non-breaking hyphen between the two time parts
    const parts = timeRange.split(/\u2011/);

    if (parts.length < 2) {
        return Duration.ofHours(2);
    }

    const startPart = parseTimePart(parts[0]);
    const endPart = parseTimePart(parts[1]);

    if (!startPart || !endPart) {
        return Duration.ofHours(2);
    }

    // End always has explicit meridiem
    if (!endPart.meridiem) {
        return Duration.ofHours(2);
    }

    // Apply end meridiem to start if start has none
    const startMeridiem = startPart.meridiem ?? endPart.meridiem;

    // Convert to 24-hour
    let startH = startPart.hour;
    if (startMeridiem === "pm" && startH !== 12) startH += 12;
    if (startMeridiem === "am" && startH === 12) startH = 0;

    let endH = endPart.hour;
    if (endPart.meridiem === "pm" && endH !== 12) endH += 12;
    if (endPart.meridiem === "am" && endH === 12) endH = 0;

    const startMinutes = startH * 60 + startPart.minute;
    const endMinutes = endH * 60 + endPart.minute;
    const diff = endMinutes - startMinutes;

    if (diff <= 0) {
        return Duration.ofHours(2);
    }

    return Duration.ofMinutes(diff);
}

/**
 * Strip HTML tags and normalize whitespace. Used to clean venue text
 * which contains <span> elements for "|", "Free", "Ticketed" labels.
 * We strip everything from the "|" separator onward.
 */
function cleanVenueText(html: string): string {
    // Remove content in spans that follow a pipe separator ("|")
    // The HTML typically looks like: "Pier 62 <span>|</span><span>Free</span>"
    const stripped = html
        .replace(/<span[^>]*>\|<\/span>.*$/is, "")  // strip | and everything after
        .replace(/<[^>]+>/g, "")                     // strip remaining tags
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return stripped;
}

/**
 * Parse events from the waterfront park events page HTML.
 * Exported for testing.
 */
export function parseEventsFromHtml(
    html: HTMLElement,
    seenEvents: Set<string>,
): RipperEvent[] {
    const events: RipperEvent[] = [];

    const gridItems = html.querySelectorAll(".grid-item[data-datetime]");

    for (const item of gridItems) {
        try {
            const datetimeStr = item.getAttribute("data-datetime");
            const dataId = item.getAttribute("data-id");

            // Skip non-event cards (promo/category cards have data-datetime but no data-id)
            if (!dataId) continue;

            if (!datetimeStr) {
                events.push({
                    type: "ParseError",
                    reason: "Missing data-datetime attribute",
                    context: dataId,
                });
                continue;
            }

            // Dedup by post ID + datetime (same recurring event on different dates)
            const eventKey = `waterfront-park-${dataId}-${datetimeStr}`;
            if (seenEvents.has(eventKey)) continue;
            seenEvents.add(eventKey);

            const date = parseDatetime(datetimeStr);
            if (!date) {
                events.push({
                    type: "ParseError",
                    reason: `Could not parse data-datetime: "${datetimeStr}"`,
                    context: dataId,
                });
                continue;
            }

            // Title from h4
            const titleEl = item.querySelector("h4");
            if (!titleEl) {
                events.push({
                    type: "ParseError",
                    reason: "No h4 title element found",
                    context: datetimeStr,
                });
                continue;
            }
            const summary = titleEl.textContent.replace(/\u00a0/g, " ").trim();

            // Time range from h3.date-time for duration calculation
            const timeEl = item.querySelector("h3.date-time");
            const duration = timeEl ? parseDuration(timeEl.textContent.trim()) : Duration.ofHours(2);

            // Venue from third h3 (after date and time-range h3s)
            const allH3s = item.querySelectorAll("h3");
            let venue = "";
            // Find the h3 that is NOT .date-time and NOT the date display
            // Structure: h3 (date display) | h3.date-time (time) | h3 (venue)
            const venueH3 = allH3s.find(h => !h.classList.contains("date-time") && !h.classList.contains("section-title") && h !== allH3s[0]);
            if (venueH3) {
                venue = cleanVenueText(venueH3.innerHTML);
            }

            const location = venue ? `${venue}${LOCATION_SUFFIX}` : `Waterfront Park, Seattle, WA`;

            // Description from p.brief
            const briefEl = item.querySelector("p.brief");
            const description = briefEl ? briefEl.textContent.replace(/\u00a0/g, " ").trim() : undefined;

            // URL from the anchor (may be external or internal)
            const linkEl = item.querySelector("a");
            const href = linkEl?.getAttribute("href");
            const url = href || undefined;

            const event: RipperCalendarEvent = {
                id: eventKey,
                ripped: new Date(),
                date,
                duration,
                summary,
                description: description || undefined,
                location,
                url,
            };

            events.push(event);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            events.push({
                type: "ParseError",
                reason: `Failed to parse event card: ${msg}`,
                context: undefined,
            });
        }
    }

    return events;
}

export default class WaterfrontParkRipper implements IRipper {
    private seenEvents = new Set<string>();

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn: FetchFn = getFetchForConfig(ripper.config);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const htmlStr = await res.text();
        const doc = parse(htmlStr);
        const allEvents = parseEventsFromHtml(doc, this.seenEvents);

        const cal = ripper.config.calendars[0];
        if (!cal) {
            throw new Error("No calendars configured for waterfront-park ripper");
        }

        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: allEvents.filter(e => "date" in e) as RipperCalendarEvent[],
            errors: allEvents.filter(e => "type" in e) as RipperError[],
            parent: ripper.config,
            tags: cal.tags || [],
        }];
    }
}

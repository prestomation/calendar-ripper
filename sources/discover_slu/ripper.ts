import { Duration, LocalDateTime, ZonedDateTime, ZoneId, ChronoUnit } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { parse, HTMLElement } from "node-html-parser";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const BASE_URL = "https://www.discoverslu.com";
const AJAX_URL = "https://www.discoverslu.com/wp-admin/admin-ajax.php";

const MONTH_MAP: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Parse a date string from the feature__tag span.
 * Handles several formats found on discoverslu.com:
 *   "March 15, 10:00 am"      — date with time
 *   "April 5"                  — date without time
 *   "April 24-25"              — same-month date range (uses first day)
 *   "May 9-10"                 — same-month date range (uses first day)
 *   "May 16-17, 12:30 pm"      — same-month date range with time (uses first day + time)
 *   "March 30 - April 3"       — cross-month date range (uses first day)
 *   "March 30 - April 3, 2026" — cross-month range with year (uses first day)
 */
function parseFeatureTag(tagText: string): { month: number; day: number; hour: number; minute: number } | null {
    const text = tagText.trim();

    // Format: "Month Day, H:MM am/pm"
    const withTime = text.match(/^(\w+)\s+(\d{1,2}),\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (withTime) {
        const month = MONTH_MAP[withTime[1].toLowerCase()];
        if (!month) return null;
        const day = parseInt(withTime[2]);
        let hour = parseInt(withTime[3]);
        const minute = parseInt(withTime[4]);
        const ampm = withTime[5].toLowerCase();
        if (ampm === "pm" && hour !== 12) hour += 12;
        if (ampm === "am" && hour === 12) hour = 0;
        return { month, day, hour, minute };
    }

    // Format: "Month Day-Day, H:MM am/pm" (same-month range with time, use first day + time)
    const rangeWithTime = text.match(/^(\w+)\s+(\d{1,2})\s*-\s*\d{1,2},\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (rangeWithTime) {
        const month = MONTH_MAP[rangeWithTime[1].toLowerCase()];
        if (!month) return null;
        const day = parseInt(rangeWithTime[2]);
        let hour = parseInt(rangeWithTime[3]);
        const minute = parseInt(rangeWithTime[4]);
        const ampm = rangeWithTime[5].toLowerCase();
        if (ampm === "pm" && hour !== 12) hour += 12;
        if (ampm === "am" && hour === 12) hour = 0;
        return { month, day, hour, minute };
    }

    // Format: "Month Day - Month Day[, Year]" (cross-month range, use first day)
    const crossMonth = text.match(/^(\w+)\s+(\d{1,2})\s*-\s*\w+\s+\d{1,2}(?:,\s*\d{4})?$/i);
    if (crossMonth) {
        const month = MONTH_MAP[crossMonth[1].toLowerCase()];
        if (!month) return null;
        const day = parseInt(crossMonth[2]);
        return { month, day, hour: 10, minute: 0 }; // default to 10 AM
    }

    // Format: "Month Day-Day[, Year]" (same-month range, use first day) or "Month Day" (no time)
    const dateOnly = text.match(/^(\w+)\s+(\d{1,2})(?:\s*-\s*\d{1,2})?(?:,\s*\d{4})?$/i);
    if (dateOnly) {
        const month = MONTH_MAP[dateOnly[1].toLowerCase()];
        if (!month) return null;
        const day = parseInt(dateOnly[2]);
        return { month, day, hour: 10, minute: 0 }; // default to 10 AM
    }

    return null;
}

/**
 * Parse the "event-day" heading like "Sunday March 15, 2026" to extract the year.
 */
function parseEventDayYear(heading: string): number | null {
    const match = heading.match(/(\d{4})/);
    return match ? parseInt(match[1]) : null;
}

/**
 * Parse events from the HTML fragment used by both the initial page and AJAX responses.
 */
export function parseEventsFromHtml(
    html: HTMLElement,
    seenEvents: Set<string>,
    defaultYear: number,
): RipperEvent[] {
    const events: RipperEvent[] = [];

    // Extract the year from day headings (e.g. "Sunday March 15, 2026").
    // Use the last heading's year as the default for cards where we can't
    // walk up to a specific heading.
    let currentYear = defaultYear;
    for (const heading of html.querySelectorAll("h2.event-day")) {
        const year = parseEventDayYear(heading.textContent.trim());
        if (year) currentYear = year;
    }

    const eventCards = html.querySelectorAll(".feature.full");

    for (const card of eventCards) {
        try {
            // Extract title and URL
            const titleLink = card.querySelector("h3 a");
            if (!titleLink) continue;

            const title = titleLink.textContent.trim();
            const href = titleLink.getAttribute("href") || "";
            const eventUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

            // Use the URL slug as a stable ID
            const slug = href.includes("/events/")
                ? href.replace(/.*\/events\//, "").replace(/\/$/, "")
                : href.replace(/^.*\//, "").replace(/\/$/, "") || title.toLowerCase().replace(/\s+/g, "-");
            const eventId = `discover-slu-${slug}`;

            if (seenEvents.has(eventId)) continue;
            seenEvents.add(eventId);

            // Extract date/time from the feature__tag span
            const tagSpan = card.querySelector(".feature__tag");
            if (!tagSpan) {
                events.push({
                    type: "ParseError",
                    reason: `No date tag found for "${title}"`,
                    context: eventId,
                });
                continue;
            }

            const tagText = tagSpan.textContent.trim();
            const parsed = parseFeatureTag(tagText);
            if (!parsed) {
                events.push({
                    type: "ParseError",
                    reason: `Could not parse date from "${tagText}" for "${title}"`,
                    context: eventId,
                });
                continue;
            }

            // Determine the year: walk up from the card to find the closest day heading
            // Use the year from the nearest preceding h2.event-day
            let year = currentYear;
            const parentSiteWidth = card.closest(".site-width");
            if (parentSiteWidth) {
                const prevSibling = parentSiteWidth.previousElementSibling;
                if (prevSibling) {
                    const heading = prevSibling.querySelector?.("h2.event-day") ??
                        (prevSibling.classList?.contains("site-width") ? prevSibling.querySelector("h2.event-day") : null);
                    if (heading) {
                        const headingYear = parseEventDayYear(heading.textContent.trim());
                        if (headingYear) year = headingYear;
                    }
                }
            }
            // Fallback: if the month in the tag is earlier than the default year's
            // current month, it might be next year (unlikely but handle edge case)

            const eventDate = ZonedDateTime.of(
                LocalDateTime.of(year, parsed.month, parsed.day, parsed.hour, parsed.minute),
                ZoneId.of("America/Los_Angeles"),
            );

            // Extract location
            const locationEl = card.querySelector(".feature__location");
            const locationText = locationEl?.textContent.trim().replace(/^@\s*/, "") || undefined;
            const location = locationText ? `${locationText}, South Lake Union, Seattle, WA` : "South Lake Union, Seattle, WA";

            // Extract description
            const textDiv = card.querySelector(".text");
            const descP = textDiv?.querySelectorAll("p");
            let description: string | undefined;
            if (descP) {
                for (const p of descP) {
                    if (!p.classList.contains("feature__location")) {
                        const text = p.textContent.trim();
                        if (text) {
                            description = text;
                            break;
                        }
                    }
                }
            }

            // Extract image
            const imgEl = card.querySelector(".feature__image img");
            const imgSrc = imgEl?.getAttribute("src");
            const image = imgSrc ? (imgSrc.startsWith("http") ? imgSrc : `${BASE_URL}${imgSrc}`) : undefined;

            const event: RipperCalendarEvent = {
                id: eventId,
                ripped: new Date(),
                date: eventDate,
                duration: Duration.ofHours(2),
                summary: title,
                description,
                location,
                url: eventUrl,
                image,
            };

            events.push(event);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            events.push({
                type: "ParseError",
                reason: `Failed to parse event: ${errorMessage}`,
                context: undefined,
            });
        }
    }

    return events;
}

export default class DiscoverSLURipper implements IRipper {
    private seenEvents = new Set<string>();

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const now = LocalDateTime.now();
        const defaultYear = now.year();

        const allEvents: RipperEvent[] = [];

        // Step 1: Fetch the initial calendar page (contains the first week of events)
        const initialRes = await fetchFn(ripper.config.url.toString());
        if (!initialRes.ok) {
            throw Error(`Initial page returned HTTP ${initialRes.status}`);
        }
        const initialHtml = await initialRes.text();
        const initialDoc = parse(initialHtml);

        // Extract events from the initial page's calendar-events-container
        const container = initialDoc.querySelector("#calendar-events-container");
        if (container) {
            const events = parseEventsFromHtml(container, this.seenEvents, defaultYear);
            allEvents.push(...events);
        }

        // Step 2: Fetch subsequent weeks via AJAX
        // The AJAX endpoint returns events in weekly chunks.
        // We call it with incrementing start dates to cover the lookahead period.
        const lookaheadDays = ripper.config.lookahead
            ? now.until(now.plus(ripper.config.lookahead), ChronoUnit.DAYS)
            : 30;

        // Calculate how many AJAX calls we need (each returns ~1 week)
        const weeksNeeded = Math.ceil(lookaheadDays / 7);
        let currentDate = now.plusDays(7); // Start after the initial page's week

        for (let i = 0; i < weeksNeeded - 1; i++) {
            const dateStr = `${currentDate.year()}-${String(currentDate.monthValue()).padStart(2, "0")}-${String(currentDate.dayOfMonth()).padStart(2, "0")}`;

            try {
                const res = await fetchFn(AJAX_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: `action=get_events_ajax&start_date=${dateStr}&direction=DESC`,
                });

                if (!res.ok) {
                    allEvents.push({
                        type: "ParseError",
                        reason: `AJAX request for ${dateStr} returned HTTP ${res.status}`,
                        context: dateStr,
                    });
                    break;
                }

                const data = await res.json() as { status: string; start_date: string; events_html: string };

                if (data.status !== "pass") {
                    // No more events available
                    break;
                }

                const weekHtml = parse(data.events_html);
                const events = parseEventsFromHtml(weekHtml, this.seenEvents, currentDate.year());
                allEvents.push(...events);

                // Use the returned start_date for the next request (it may skip ahead if no events)
                const nextDate = new Date(data.start_date);
                currentDate = LocalDateTime.of(
                    nextDate.getFullYear(),
                    nextDate.getMonth() + 1,
                    nextDate.getDate(),
                    0, 0,
                ).plusDays(7);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                allEvents.push({
                    type: "ParseError",
                    reason: `AJAX request failed for ${dateStr}: ${msg}`,
                    context: dateStr,
                });
                break;
            }
        }

        const cal = ripper.config.calendars[0];
        if (!cal) {
            throw new Error("No calendars configured for discover-slu ripper");
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

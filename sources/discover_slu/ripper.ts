import { Duration, LocalDateTime, ZonedDateTime, ZoneId, ChronoUnit } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { parse, HTMLElement } from "node-html-parser";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const BASE_URL = "https://www.discoverslu.com";
const AJAX_URL = "https://www.discoverslu.com/wp-admin/admin-ajax.php";

/**
 * Parse a date string like "March 15, 10:00 am" from the feature__tag span.
 * Returns month, day, hour, minute.
 */
function parseFeatureTag(tagText: string): { month: number; day: number; hour: number; minute: number } | null {
    const match = tagText.trim().match(
        /^(\w+)\s+(\d{1,2}),\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i
    );
    if (!match) return null;

    const monthName = match[1].toLowerCase();
    const monthMap: Record<string, number> = {
        january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    };
    const month = monthMap[monthName];
    if (!month) return null;

    const day = parseInt(match[2]);
    let hour = parseInt(match[3]);
    const minute = parseInt(match[4]);
    const ampm = match[5].toLowerCase();
    if (ampm === "pm" && hour !== 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;

    return { month, day, hour, minute };
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

    // Track the current year from day headings
    let currentYear = defaultYear;

    // The HTML has day sections with h2.event-day headings followed by event cards.
    // We need to iterate through all children to track the current day heading.
    const dayHeadings = html.querySelectorAll("h2.event-day");
    const headingYears = new Map<string, number>();
    for (const heading of dayHeadings) {
        const text = heading.textContent.trim();
        const year = parseEventDayYear(text);
        if (year) {
            headingYears.set(text, year);
            currentYear = year;
        }
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
            const slug = href.replace(/.*\/events\//, "").replace(/\/$/, "");
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
                const events = parseEventsFromHtml(weekHtml, this.seenEvents, defaultYear);
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

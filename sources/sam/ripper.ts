import { ZonedDateTime, Duration, LocalDateTime, LocalDate, DayOfWeek, TemporalAdjusters, ZoneRegion } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { parse, HTMLElement } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

const LOCATION_ADDRESSES: Record<string, string> = {
    "Seattle Art Museum": "Seattle Art Museum, 1300 First Avenue, Seattle, WA 98101",
    "Seattle Asian Art Museum": "Seattle Asian Art Museum, 1400 E Prospect St, Seattle, WA 98112",
    "Olympic Sculpture Park": "Olympic Sculpture Park, 2901 Western Ave, Seattle, WA 98121",
};

// Free First Thursday hours per SAM venue (no FFT at Olympic Sculpture Park — it's always free)
const FFT_HOURS: Record<string, { startHour: number; durationHours: number }> = {
    "Seattle Art Museum": { startHour: 10, durationHours: 10 },       // 10 AM – 8 PM
    "Seattle Asian Art Museum": { startHour: 10, durationHours: 7 },  // 10 AM – 5 PM
};

/**
 * Parse a time string like "10 am", "1:30 pm", "12 pm" into { hour, minute }.
 * Returns null if parsing fails.
 */
export function parseTime(timeStr: string): { hour: number; minute: number } | null {
    const match = timeStr.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (!match) return null;

    let hour = parseInt(match[1], 10);
    const minute = match[2] ? parseInt(match[2], 10) : 0;
    const isPM = /pm/i.test(match[3]);
    const isAM = /am/i.test(match[3]);

    if (isPM && hour !== 12) hour += 12;
    if (isAM && hour === 12) hour = 0;

    return { hour, minute };
}

/**
 * Parse a time range like "10 am–5 pm", "1:30–4 pm", "3–4 pm".
 * The en-dash (–) or hyphen (-) separates start and end.
 * When the start time has no am/pm, it inherits from the end time.
 */
export function parseTimeRange(text: string): { start: { hour: number; minute: number }; end: { hour: number; minute: number } } | null {
    // Normalize dashes
    const normalized = text.replace(/\u2013/g, '-').replace(/&ndash;/g, '-').trim();

    const rangeMatch = normalized.match(/^(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*-\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)$/i);
    if (!rangeMatch) {
        // Try single time (no range)
        const single = parseTime(normalized);
        if (single) {
            return { start: single, end: { hour: (single.hour + 1) % 24, minute: single.minute } };
        }
        return null;
    }

    const endPeriod = rangeMatch[4]; // always present
    const startPeriod = rangeMatch[2] || endPeriod; // inherit from end if missing

    const startStr = rangeMatch[1] + " " + startPeriod;
    const endStr = rangeMatch[3] + " " + endPeriod;

    const start = parseTime(startStr);
    const end = parseTime(endStr);

    if (!start || !end) return null;
    return { start, end };
}

export interface ParsedArticle {
    title: string;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    location: string;
    category: string;
    audiences: string;
    url: string;
    timeText: string;
    dateText: string;
    imageUrl?: string;
    canceled: boolean;
}

/**
 * Parse a single article element into a structured object.
 */
export function parseArticle(article: HTMLElement): ParsedArticle | null {
    const startDate = article.getAttribute("data-start-date");
    const endDate = article.getAttribute("data-end-date");
    const location = article.getAttribute("data-location") || "";
    const category = article.getAttribute("data-category") || "";
    const audiences = article.getAttribute("data-audiences") || "";

    if (!startDate || !endDate) return null;

    const link = article.querySelector("a");
    const url = link?.getAttribute("href") || "";

    const titleEl = article.querySelector(".title");
    const title = titleEl ? decode(titleEl.text.trim()) : "";
    if (!title) return null;

    // Extract date and time from subtitle elements
    // Date subtitle has "pr-3" in its class, time subtitle does not
    const subtitles = article.querySelectorAll(".subtitle.is-6");
    let dateText = "";
    let timeText = "";
    for (const sub of subtitles) {
        const cls = sub.getAttribute("class") || "";
        if (cls.includes("pr-3")) {
            dateText = decode(sub.text.trim());
        } else if (!timeText) {
            timeText = decode(sub.text.trim());
        }
    }

    const imageEl = article.querySelector("img");
    const imageUrl = imageEl?.getAttribute("src") || undefined;

    // Check for canceled badge
    const canceled = article.text.toLowerCase().includes("canceled");

    return {
        title,
        startDate,
        endDate,
        location,
        category,
        audiences,
        url,
        timeText,
        dateText,
        imageUrl,
        canceled,
    };
}

/**
 * Convert a parsed article to a RipperCalendarEvent.
 */
export function articleToEvent(article: ParsedArticle, timezone: ZoneRegion): RipperCalendarEvent | null {
    const timeRange = parseTimeRange(article.timeText);

    // Parse the start date from data attribute (ISO format YYYY-MM-DD)
    const dateParts = article.startDate.split("-");
    if (dateParts.length !== 3) return null;

    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);
    const day = parseInt(dateParts[2], 10);

    let startHour = 10; // default to 10am
    let startMinute = 0;
    let durationMinutes = 120; // default 2 hours

    if (timeRange) {
        startHour = timeRange.start.hour;
        startMinute = timeRange.start.minute;
        let endMinutes = timeRange.end.hour * 60 + timeRange.end.minute;
        let startMinutes = timeRange.start.hour * 60 + timeRange.start.minute;
        durationMinutes = endMinutes - startMinutes;
        if (durationMinutes <= 0) durationMinutes = 120; // fallback
    }

    const startDt = ZonedDateTime.of(
        LocalDateTime.of(year, month, day, startHour, startMinute),
        timezone
    );

    // Generate a stable ID from the URL slug
    const slug = article.url.replace(/.*\/events\//, "").replace(/\/$/, "");
    const id = slug || `sam-${article.startDate}-${article.title.substring(0, 30).replace(/\W+/g, "-")}`;

    return {
        id,
        ripped: new Date(),
        date: startDt,
        duration: Duration.ofMinutes(durationMinutes),
        summary: article.title,
        description: article.category ? article.category.split(",").map(c => c.trim()).join(", ") : undefined,
        location: LOCATION_ADDRESSES[article.location] || article.location,
        url: article.url || undefined,
        image: article.imageUrl,
    };
}

export default class SAMRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars: { [key: string]: { events: RipperEvent[]; friendlyName: string; tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        // Build location-to-calendar mapping
        const locationToCalendar = new Map<string, string>();
        for (const c of ripper.config.calendars) {
            const loc = (c.config as { location?: string })?.location;
            if (loc) {
                locationToCalendar.set(loc, c.name);
            }
        }

        // Fetch the events page
        const html = await this.fetchPage(ripper.config.url.toString());
        const articles = this.parseHtml(html);

        const fftFoundForLocation = new Set<string>();

        for (const article of articles) {
            // Skip cancelled events
            if (article.canceled) continue;

            const calendarName = locationToCalendar.get(article.location);
            if (!calendarName || !calendars[calendarName]) continue;

            const timezone = ripper.config.calendars.find(c => c.name === calendarName)?.timezone;
            if (!timezone) continue;

            // Track if we see a Free First Thursday event for this location
            if (/free first thursday/i.test(article.title)) {
                fftFoundForLocation.add(article.location);
            }

            try {
                const event = articleToEvent(article, timezone);
                if (event) {
                    calendars[calendarName].events.push(event);
                }
            } catch (error) {
                calendars[calendarName].events.push({
                    type: "ParseError",
                    reason: `Failed to parse SAM event "${article.title}": ${error}`,
                    context: article.url,
                });
            }
        }

        // Synthesize Free First Thursday events for venues where the website didn't list one
        this.synthesizeFreeFirstThursday(calendars, locationToCalendar, fftFoundForLocation, ripper);

        return Object.keys(calendars).map(key => ({
            name: key,
            friendlyname: calendars[key].friendlyName,
            events: calendars[key].events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: calendars[key].events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: calendars[key].tags,
        }));
    }

    private synthesizeFreeFirstThursday(
        calendars: { [key: string]: { events: RipperEvent[]; friendlyName: string; tags: string[] } },
        locationToCalendar: Map<string, string>,
        fftFoundForLocation: Set<string>,
        ripper: Ripper,
    ): void {
        for (const [location, fftInfo] of Object.entries(FFT_HOURS)) {
            if (fftFoundForLocation.has(location)) continue;

            const calendarName = locationToCalendar.get(location);
            if (!calendarName || !calendars[calendarName]) continue;

            const timezone = ripper.config.calendars.find(c => c.name === calendarName)?.timezone;
            if (!timezone) continue;

            // Generate Free First Thursday events for the next 3 months
            const today = LocalDate.now();
            for (let i = 0; i < 3; i++) {
                const monthStart = today.plusMonths(i).withDayOfMonth(1);
                const firstThursday = monthStart.with(TemporalAdjusters.firstInMonth(DayOfWeek.THURSDAY));
                if (firstThursday.isBefore(today)) continue;

                const eventDate = ZonedDateTime.of(
                    LocalDateTime.of(firstThursday.year(), firstThursday.monthValue(), firstThursday.dayOfMonth(), fftInfo.startHour, 0),
                    timezone
                );

                const event: RipperCalendarEvent = {
                    id: `sam-fft-${location.replace(/\s+/g, '-').toLowerCase()}-${firstThursday.toString()}`,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofHours(fftInfo.durationHours),
                    summary: `Free First Thursday`,
                    description: `Free admission at ${location}.`,
                    location: LOCATION_ADDRESSES[location] || location,
                    url: "https://www.seattleartmuseum.org/whats-on/programs/free-first-thursday",
                };

                calendars[calendarName].events.push(event);
            }
        }
    }

    public parseHtml(html: string): ParsedArticle[] {
        const root = parse(html);
        const articleElements = root.querySelectorAll("article[data-start-date]");
        const articles: ParsedArticle[] = [];
        const seen = new Set<string>();

        for (const el of articleElements) {
            const article = parseArticle(el);
            if (!article) continue;

            // Deduplicate by URL
            if (article.url && seen.has(article.url)) continue;
            if (article.url) seen.add(article.url);

            articles.push(article);
        }

        return articles;
    }

    private async fetchPage(url: string): Promise<string> {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`SAM events page returned HTTP ${res.status}`);
        }
        return res.text();
    }
}

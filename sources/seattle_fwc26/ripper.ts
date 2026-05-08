import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

const BASE_URL = "https://www.seattlefwc26.org";
const LIST_PATH = "/event-calendar-list";
const PAGE_PARAM = "d3b84e3c_page";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const MAX_PAGES = 20;

const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DOW_INDEX: Record<string, number> = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

interface ListEntry {
    slug: string;
    dayOfWeek: string;
    month: number;
    day: number;
}

export interface ParsedEvent {
    title: string;
    host?: string;
    startMonth: number;
    startDay: number;
    endMonth?: number;
    endDay?: number;
    startHour?: number;
    startMinute?: number;
    endHour?: number;
    endMinute?: number;
    location?: string;
    description?: string;
    image?: string;
    externalUrl?: string;
    categories: string[];
    tags: string[];
}

export default class SeattleFwc26Ripper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const listEntries = await this.fetchAllListEntries();
        const events = await this.fetchAndParseDetails(listEntries);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: events.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: events.filter((e): e is RipperError => 'type' in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    private async fetchAllListEntries(): Promise<ListEntry[]> {
        const seen = new Set<string>();
        const entries: ListEntry[] = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
            const url = page === 1 ? `${BASE_URL}${LIST_PATH}` : `${BASE_URL}${LIST_PATH}?${PAGE_PARAM}=${page}`;
            const res = await this.fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!res.ok) {
                throw new Error(`List page ${page} returned HTTP ${res.status}`);
            }
            const html = await res.text();
            const pageEntries = this.parseListEntries(html);
            if (pageEntries.length === 0) break;
            let added = 0;
            for (const e of pageEntries) {
                if (seen.has(e.slug)) continue;
                seen.add(e.slug);
                entries.push(e);
                added++;
            }
            if (added === 0) break;
        }
        return entries;
    }

    parseListEntries(html: string): ListEntry[] {
        const root = parse(html);
        const entries: ListEntry[] = [];
        for (const item of root.querySelectorAll('.calendar_citem')) {
            const link = item.querySelector('a[href^="/full-event-calendar/"]');
            const href = link?.getAttribute('href');
            if (!href) continue;
            const slug = href.replace('/full-event-calendar/', '');
            const bigDates = item.querySelectorAll('.date-big-text').map(el => el.text.trim());
            if (bigDates.length < 2) continue;
            const dow = bigDates[0].slice(0, 3);
            const md = bigDates[1].match(/^(\w{3})\s+(\d{1,2})$/);
            if (!md) continue;
            const month = MONTHS[md[1].toLowerCase()];
            if (!month) continue;
            const day = parseInt(md[2], 10);
            entries.push({ slug, dayOfWeek: dow, month, day });
        }
        return entries;
    }

    private async fetchAndParseDetails(listEntries: ListEntry[]): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        for (const entry of listEntries) {
            const url = `${BASE_URL}/full-event-calendar/${entry.slug}`;
            try {
                const res = await this.fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (!res.ok) {
                    events.push({ type: 'ParseError', reason: `HTTP ${res.status} fetching ${entry.slug}`, context: entry.slug });
                    continue;
                }
                const html = await res.text();
                const result = this.parseEventHtml(html, url, entry);
                events.push(result);
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                events.push({ type: 'ParseError', reason: `Failed to fetch/parse ${entry.slug}: ${errorMsg}`, context: entry.slug });
            }
        }
        return events;
    }

    parseEventHtml(html: string, url: string, listEntry: ListEntry): RipperCalendarEvent | RipperError {
        const root = parse(html);
        const headerEl = root.querySelector('header.section_transp-header');
        if (!headerEl) {
            return { type: 'ParseError', reason: 'No event header section found', context: url };
        }

        const parsed = this.parseEventDetails(headerEl);
        if (!parsed) {
            return { type: 'ParseError', reason: 'Could not parse event details from header', context: url };
        }

        const year = this.resolveYear(parsed.startMonth, parsed.startDay, listEntry.dayOfWeek);
        if (year === null) {
            return { type: 'ParseError', reason: `Could not resolve year for ${parsed.startMonth}/${parsed.startDay} (${listEntry.dayOfWeek})`, context: url };
        }

        const startHour = parsed.startHour ?? 12;
        const startMinute = parsed.startMinute ?? 0;
        const startLdt = LocalDateTime.of(year, parsed.startMonth, parsed.startDay, startHour, startMinute);
        const startZdt = ZonedDateTime.of(startLdt, TIMEZONE);

        // When a time range is given, treat it as the daily hours: even for
        // multi-day exhibits ("May 1 – Nov 1, 10am – 4pm"), the calendar event
        // is the opening-day window. A literal 6-month duration would mark the
        // event as "happening" every day for the whole run, which is wrong.
        let duration = Duration.ofHours(1);
        const endMonth = parsed.endMonth ?? parsed.startMonth;
        const endDay = parsed.endDay ?? parsed.startDay;
        const isMultiDay = endMonth !== parsed.startMonth || endDay !== parsed.startDay;

        if (parsed.endHour !== undefined && parsed.endMinute !== undefined) {
            const startMins = startHour * 60 + startMinute;
            let endMins = parsed.endHour * 60 + parsed.endMinute;
            // Times like "11:00 PM - 1:00 AM" wrap past midnight
            if (endMins < startMins) endMins += 24 * 60;
            if (endMins > startMins) {
                duration = Duration.ofMinutes(endMins - startMins);
            }
        } else if (isMultiDay) {
            let endYear = year;
            if (endMonth < parsed.startMonth) endYear = year + 1;
            const endLdt = LocalDateTime.of(endYear, endMonth, endDay, 23, 59);
            const millis = endLdt.atZone(TIMEZONE).toInstant().toEpochMilli() - startZdt.toInstant().toEpochMilli();
            const days = millis / (1000 * 60 * 60 * 24);
            if (millis > 0 && days <= 7) {
                duration = Duration.ofMillis(millis);
            }
        }

        const descriptionParts: string[] = [];
        if (parsed.host) descriptionParts.push(`Hosted by ${parsed.host}.`);
        if (parsed.description) descriptionParts.push(parsed.description);
        const description = descriptionParts.join('\n\n') || undefined;

        return {
            id: url,
            ripped: new Date(),
            date: startZdt,
            duration,
            summary: parsed.title,
            description,
            location: parsed.location,
            url,
            image: parsed.image,
        };
    }

    parseEventDetails(header: HTMLElement): ParsedEvent | null {
        const titleEl = header.querySelector('h1');
        if (!titleEl) return null;
        const title = decodeEntities(titleEl.text).trim();
        if (!title) return null;

        let host: string | undefined;
        const hostEl = header.querySelector('.calendar-host_wrap .text-weight-semibold');
        if (hostEl) host = decodeEntities(hostEl.text).trim() || undefined;

        let dateText = '';
        let timeText = '';
        let location: string | undefined;
        for (const wrap of header.querySelectorAll('.calendar-event-info_wrap')) {
            const wrapHtml = wrap.innerHTML;
            const isClock = wrapHtml.includes('lucide-clock');
            const isPin = wrapHtml.includes('lucide-map-pin');
            const isCalendar = wrapHtml.includes('lucide-calendar') && !isClock;
            const texts = extractWrapTexts(wrap);
            if (isCalendar && !dateText) dateText = texts.join(' ');
            else if (isClock && !timeText) timeText = texts.join(' ');
            else if (isPin && !location) location = texts.join(', ').trim() || undefined;
        }

        const dateRange = parseDateRange(dateText);
        if (!dateRange) return null;

        const timeRange = parseTimeRange(timeText);

        const categories: string[] = [];
        for (const el of header.querySelectorAll('[fs-list-field="category"]')) {
            const v = decodeEntities(el.text).trim();
            if (v && !categories.includes(v)) categories.push(v);
        }

        const tags: string[] = [];
        for (const el of header.querySelectorAll('[fs-list-field="tags"]')) {
            const v = decodeEntities(el.text).trim();
            if (v && !tags.includes(v)) tags.push(v);
        }

        let image: string | undefined;
        const imgEl = header.querySelector('img.image-rounded.is-event');
        if (imgEl) {
            const src = imgEl.getAttribute('src');
            if (src && src.startsWith('https://cdn.prod.website-files.com/')) image = src;
        }

        let externalUrl: string | undefined;
        const buttonGroup = header.querySelector('.button-group');
        if (buttonGroup) {
            for (const a of buttonGroup.querySelectorAll('a')) {
                const href = a.getAttribute('href');
                if (href && /^https?:\/\//.test(href)) {
                    externalUrl = href;
                    break;
                }
            }
        }

        let description: string | undefined;
        const richtext = header.querySelector('.w-richtext');
        if (richtext) {
            description = decodeEntities(richtext.text).replace(/\s+/g, ' ').trim() || undefined;
        }

        return {
            title,
            host,
            startMonth: dateRange.startMonth,
            startDay: dateRange.startDay,
            endMonth: dateRange.endMonth,
            endDay: dateRange.endDay,
            startHour: timeRange?.startHour,
            startMinute: timeRange?.startMinute,
            endHour: timeRange?.endHour,
            endMinute: timeRange?.endMinute,
            location,
            description,
            image,
            externalUrl,
            categories,
            tags,
        };
    }

    /**
     * Find the year that makes the (month, day) fall on the given dayOfWeek
     * abbreviation. Tries the current year first, then ±1 and ±2 years.
     * Skip years where the date doesn't exist (e.g. Feb 29 on a non-leap
     * year) — `new Date(Date.UTC(2025, 1, 29))` silently rolls over to Mar 1.
     */
    resolveYear(month: number, day: number, dayOfWeek: string): number | null {
        const target = DOW_INDEX[dayOfWeek.slice(0, 3).toLowerCase()];
        if (target === undefined) return null;
        const currentYear = new Date().getFullYear();
        for (const offset of [0, 1, -1, 2, -2]) {
            const y = currentYear + offset;
            const d = new Date(Date.UTC(y, month - 1, day));
            if (d.getUTCFullYear() !== y || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
                continue;
            }
            if (d.getUTCDay() === target) return y;
        }
        return null;
    }
}

function decodeEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/ /g, ' ');
}

function extractWrapTexts(wrap: HTMLElement): string[] {
    const out: string[] = [];
    for (const child of wrap.querySelectorAll('div')) {
        const t = decodeEntities(child.text).trim();
        if (!t || t === '-' || t === ':') continue;
        if (/^hosted\s+by:?$/i.test(t)) continue;
        // Skip parent divs that contain other divs we'll visit separately
        if (child.querySelector('div')) continue;
        out.push(t);
    }
    return out;
}

interface DateRange {
    startMonth: number;
    startDay: number;
    endMonth?: number;
    endDay?: number;
}

export function parseDateRange(text: string): DateRange | null {
    if (!text) return null;
    const re = /(\w{3})\w*\s+(\d{1,2})/g;
    const matches: Array<{ month: number; day: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const month = MONTHS[m[1].toLowerCase()];
        if (!month) continue;
        const day = parseInt(m[2], 10);
        if (day < 1 || day > 31) continue;
        matches.push({ month, day });
    }
    if (matches.length === 0) return null;
    const start = matches[0];
    const end = matches.length > 1 ? matches[matches.length - 1] : undefined;
    return {
        startMonth: start.month,
        startDay: start.day,
        endMonth: end?.month,
        endDay: end?.day,
    };
}

interface TimeRange {
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
}

export function parseTimeRange(text: string): TimeRange | null {
    if (!text) return null;
    const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/g;
    const matches: Array<{ hour: number; minute: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        let hour = parseInt(m[1], 10);
        const minute = parseInt(m[2] ?? '0', 10);
        const ampm = m[3].toLowerCase();
        if (ampm === 'pm' && hour !== 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) continue;
        matches.push({ hour, minute });
    }
    if (matches.length < 2) return null;
    return {
        startHour: matches[0].hour,
        startMinute: matches[0].minute,
        endHour: matches[matches.length - 1].hour,
        endMinute: matches[matches.length - 1].minute,
    };
}

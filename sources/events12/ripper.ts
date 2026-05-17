import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { HTMLElement, parse } from 'node-html-parser';
import { ZonedDateTime, Duration, ZoneId, LocalDate } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";

// events12.com rarely lists explicit start times. When a time isn't
// known we still emit an event so it shows up on the calendar (using
// these placeholders), and the infrastructure layer pairs it with an
// UncertaintyError so the event-uncertainty-resolver skill can fill in
// the real time on a later build. See docs/event-uncertainty.md.
const DEFAULT_UNKNOWN_TIME_HOUR = 12;
const DEFAULT_UNKNOWN_TIME_MINUTE = 0;
const DEFAULT_UNKNOWN_DURATION = Duration.ofHours(2);

interface ParsedTime {
    hour: number;
    minute: number;
    duration: Duration;
}

interface ParsedDates {
    // One entry per (day × time-slot) occurrence the source page lists.
    occurrences: { date: ZonedDateTime; duration: Duration; slot: string | null }[];
    // True when the source page gave no explicit time — emit
    // UncertaintyError for the slots below.
    timeUnknown: boolean;
    // Days covered by the source's date range (used for fingerprinting
    // and reasoning about how many events get expanded).
    dayCount: number;
}

export default class Events12Ripper extends HTMLRipper {
    private seenEvents = new Set<string>();
    private rawHtml = '';

    protected preprocessHtml(html: string): string {
        // Store raw HTML so parseEvents can extract articles via regex.
        // events12.com uses unclosed <p>, <td>, and <li> tags inside articles
        // that contain tables. When node-html-parser processes the full
        // document, these cause cascading nesting that swallows articles
        // (especially those near the bottom). Parsing each article individually
        // avoids this problem entirely.
        this.rawHtml = html;
        return html;
    }

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        // Extract each article via regex and parse individually to avoid
        // node-html-parser nesting issues with the full document.
        const articleRegex = /<article\s[^>]*id="[^"]*"[^>]*>[\s\S]*?<\/article>/g;
        const source = this.rawHtml || html.outerHTML;
        let match;

        while ((match = articleRegex.exec(source)) !== null) {
            // Guard against zero-length matches to prevent infinite loops
            if (match[0].length === 0) {
                articleRegex.lastIndex++;
                continue;
            }
            try {
                const article = parse(match[0]);

                // Get the event title from the H3 element
                const titleElement = article.querySelector('h3');
                if (!titleElement) continue;

                const title = titleElement.text.trim().replace(/\s*FREE\s*$/, '').trim();
                if (!title) continue;

                let location = '';
                let description = '';
                let url = '';

                // Find date element
                const dateElement = article.querySelector('p.date');
                if (!dateElement) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not find date element`,
                        context: title,
                    });
                    continue;
                }
                const dateText = dateElement.text.trim();
                const parsed = this.parseDateField(dateText, date.zone());

                // Find location element and map link
                const locationElement = article.querySelector('p.miles');
                const mapLink = article.querySelector('a[href*="google.com/maps"]');
                if (locationElement) {
                    const locationText = locationElement.text.trim();
                    if (mapLink) {
                        location = mapLink.getAttribute('href') || '';
                        description = locationText + '\n\n';
                    } else {
                        location = locationText;
                    }
                }

                // Find description element
                const descElement = article.querySelector('p.event');
                if (descElement) {
                    description += descElement.text.trim();
                }

                // Find event URL
                const links = article.querySelectorAll('a');
                for (const link of links) {
                    const href = link.getAttribute('href');
                    if (href && !href.includes('google.com/maps') && !href.includes('facebook.com') && !href.includes('youtube.com')) {
                        url = href.startsWith('http') ? href : `https://www.events12.com${href}`;
                        break;
                    }
                }

                if (!parsed || parsed.occurrences.length === 0) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse event date`,
                        context: `${title} — "${dateText}"`,
                    });
                    continue;
                }

                // Fingerprint the parsed data so cache entries are invalidated
                // if the source page changes (e.g., upstream later adds a
                // start time). Includes title + dayCount + timeUnknown so
                // both "the run got longer" and "they finally posted a time"
                // bust the cache.
                const fingerprint = this.fingerprint(title, parsed);

                for (const { date: d, duration: dur, slot } of parsed.occurrences) {
                    const eventId = this.generateEventId(title, d, slot);

                    // Skip if we've already seen this event in this rip
                    if (this.seenEvents.has(eventId)) continue;
                    this.seenEvents.add(eventId);

                    const event: RipperCalendarEvent = {
                        id: eventId,
                        ripped: new Date(),
                        date: d,
                        duration: dur,
                        summary: title,
                        description: description,
                        location: location,
                        url: url || undefined,
                    };
                    events.push(event);

                    if (parsed.timeUnknown) {
                        const unknownFields: UncertaintyField[] = ["startTime", "duration"];
                        const uncertainty: UncertaintyError = {
                            type: "Uncertainty",
                            reason: `events12 listing did not include a start time (raw: "${dateText}")`,
                            source: "events12",
                            unknownFields,
                            event,
                            partialFingerprint: fingerprint,
                        };
                        events.push(uncertainty);
                    }
                }

            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${error}`,
                    context: match[0].substring(0, 100),
                });
            }
        }

        return events;
    }

    // Parse the events12 date-line text into a fully-expanded list of
    // (day × time-slot) occurrences. Handles:
    //   - "December 3, 2025 (7 to 8:30 p.m.)"      — single day, single slot
    //   - "January 1 - 11, 2026"                    — multi-day, no time
    //   - "January 1 - Dec. 31, 2026 (4:30 to 10 p.m.)" — multi-day, single slot
    //   - "February 21 & 28, 2026 (8 to 10 p.m.)"  — listed days, single slot
    //   - "February 12 - 15, 2026 (5 & 8 p.m.)"    — multi-day, multi slot
    private parseDateField(dateText: string, timezone: ZoneId): ParsedDates | null {
        const days = this.parseDayList(dateText);
        if (days.length === 0) return null;

        const times = this.parseTimeList(dateText);
        const timeUnknown = times.length === 0;
        const slots: ParsedTime[] = timeUnknown
            ? [{
                hour: DEFAULT_UNKNOWN_TIME_HOUR,
                minute: DEFAULT_UNKNOWN_TIME_MINUTE,
                duration: DEFAULT_UNKNOWN_DURATION,
              }]
            : times;

        const occurrences: ParsedDates['occurrences'] = [];
        for (const day of days) {
            for (const t of slots) {
                const d = ZonedDateTime.of(day.year(), day.monthValue(), day.dayOfMonth(), t.hour, t.minute, 0, 0, timezone);
                const slot = slots.length > 1
                    ? `${String(t.hour).padStart(2, '0')}${String(t.minute).padStart(2, '0')}`
                    : null;
                occurrences.push({ date: d, duration: t.duration, slot });
            }
        }
        return { occurrences, timeUnknown, dayCount: days.length };
    }

    // Expand the date portion of the text into one LocalDate per day.
    // Handles single days, hyphen-separated ranges (same-month or cross-
    // month), and the "& day" listed-day pattern.
    private parseDayList(dateText: string): LocalDate[] {
        // "Month Day1 & Day2, Year" — two separate occurrences of the same date
        const ampersandMatch = dateText.match(
            /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*&\s*(\d{1,2}),?\s+(\d{4})/
        );
        if (ampersandMatch) {
            const month = monthMap[ampersandMatch[1]];
            const day1 = parseInt(ampersandMatch[2], 10);
            const day2 = parseInt(ampersandMatch[3], 10);
            const year = parseInt(ampersandMatch[4], 10);
            if (!month) return [];
            return [LocalDate.of(year, month, day1), LocalDate.of(year, month, day2)];
        }

        // "Month Day1 - Month Day2, Year" — cross-month range (e.g.
        // "January 1 - Dec. 31, 2026"). The trailing ", YYYY" applies
        // to both ends.
        const crossMonthMatch = dateText.match(
            /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*[-–]\s*([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/
        );
        if (crossMonthMatch) {
            const startMonthName = crossMonthMatch[1];
            const startDay = parseInt(crossMonthMatch[2], 10);
            const endMonthName = expandMonthName(crossMonthMatch[3]);
            const endDay = parseInt(crossMonthMatch[4], 10);
            const year = parseInt(crossMonthMatch[5], 10);
            const startMonth = monthMap[startMonthName];
            const endMonth = endMonthName ? monthMap[endMonthName] : undefined;
            if (!startMonth || !endMonth) return [];
            const start = LocalDate.of(year, startMonth, startDay);
            const end = LocalDate.of(year, endMonth, endDay);
            return expandRange(start, end);
        }

        // "Month Day1 - Day2, Year" — same-month range
        const sameMonthRangeMatch = dateText.match(
            /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s+(\d{4})/
        );
        if (sameMonthRangeMatch) {
            const month = monthMap[sameMonthRangeMatch[1]];
            const startDay = parseInt(sameMonthRangeMatch[2], 10);
            const endDay = parseInt(sameMonthRangeMatch[3], 10);
            const year = parseInt(sameMonthRangeMatch[4], 10);
            if (!month) return [];
            return expandRange(LocalDate.of(year, month, startDay), LocalDate.of(year, month, endDay));
        }

        // Single day
        const singleMatch = dateText.match(
            /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/
        );
        if (singleMatch) {
            const month = monthMap[singleMatch[1]];
            const day = parseInt(singleMatch[2], 10);
            const year = parseInt(singleMatch[3], 10);
            if (!month) return [];
            return [LocalDate.of(year, month, day)];
        }

        return [];
    }

    // Parse the parenthesized time portion. Returns one ParsedTime per
    // distinct slot the listing exposes:
    //   "(7 p.m.)"               → 1 entry
    //   "(4 to 7 p.m.)"          → 1 entry, 3h duration
    //   "(5 & 8 p.m.)"           → 2 entries
    //   "(noon)"                 → 1 entry
    // Returns [] when no parenthesized time is present (the caller treats
    // this as "time unknown" rather than an error).
    private parseTimeList(dateText: string): ParsedTime[] {
        // "(5 & 8 p.m.)" — two same-meridiem showings on each day
        const ampersandTimeMatch = dateText.match(
            /\((\d{1,2})(?::(\d{2}))?\s*&\s*(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)\)/i
        );
        if (ampersandTimeMatch) {
            const ampm = ampersandTimeMatch[5];
            return [
                {
                    hour: this.convertTo24Hour(parseInt(ampersandTimeMatch[1], 10), ampm),
                    minute: ampersandTimeMatch[2] ? parseInt(ampersandTimeMatch[2], 10) : 0,
                    duration: DEFAULT_UNKNOWN_DURATION,
                },
                {
                    hour: this.convertTo24Hour(parseInt(ampersandTimeMatch[3], 10), ampm),
                    minute: ampersandTimeMatch[4] ? parseInt(ampersandTimeMatch[4], 10) : 0,
                    duration: DEFAULT_UNKNOWN_DURATION,
                },
            ];
        }

        // Time range: "(4 to 7 p.m.)" or "(9 a.m. to 9 p.m.)" or "(4:30 to 10 p.m.)"
        const rangeMatch = dateText.match(
            /\((\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)?\s*to\s*(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)\)/i
        );
        if (rangeMatch) {
            const endAmPm = rangeMatch[6];
            const startAmPm = rangeMatch[3] || endAmPm;
            const startHour = this.convertTo24Hour(parseInt(rangeMatch[1], 10), startAmPm);
            const startMinute = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : 0;
            const endHour = this.convertTo24Hour(parseInt(rangeMatch[4], 10), endAmPm);
            const endMinute = rangeMatch[5] ? parseInt(rangeMatch[5], 10) : 0;
            const startTotal = startHour * 60 + startMinute;
            const endTotal = endHour * 60 + endMinute;
            const duration = endTotal > startTotal ? Duration.ofMinutes(endTotal - startTotal) : DEFAULT_UNKNOWN_DURATION;
            return [{ hour: startHour, minute: startMinute, duration }];
        }

        // Single time: "(7 p.m.)" or "(7:30 p.m.)"
        const singleMatch = dateText.match(
            /\((\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)\)/i
        );
        if (singleMatch) {
            return [{
                hour: this.convertTo24Hour(parseInt(singleMatch[1], 10), singleMatch[3]),
                minute: singleMatch[2] ? parseInt(singleMatch[2], 10) : 0,
                duration: DEFAULT_UNKNOWN_DURATION,
            }];
        }

        if (/\(noon\)/i.test(dateText)) {
            return [{ hour: 12, minute: 0, duration: DEFAULT_UNKNOWN_DURATION }];
        }

        return [];
    }

    private convertTo24Hour(hour: number, ampm: string | undefined): number {
        if (!ampm) return hour;
        const isPm = ampm.toLowerCase().includes('p');
        const isAm = ampm.toLowerCase().includes('a');
        if (isPm && hour !== 12) return hour + 12;
        if (isAm && hour === 12) return 0;
        return hour;
    }

    // Stable id from source content only (no Date.now / no randomness).
    // Format: <title-slug>-YYYY-MM-DD[-HHMM].  The optional slot keeps
    // multi-showing days (e.g. "5 & 8 p.m.") unique without disturbing
    // ids on single-showing days, which keeps existing cache keys stable.
    private generateEventId(title: string, date: ZonedDateTime, slot: string | null): string {
        const titleSlug = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const dateStr = date.toLocalDate().toString();
        return slot ? `${titleSlug}-${dateStr}-${slot}` : `${titleSlug}-${dateStr}`;
    }

    // Compact deterministic fingerprint of the parsed source data.
    // Cached resolutions are dropped when this changes — e.g., if
    // upstream later publishes a real time, timeUnknown flips and the
    // old "we guessed noon" resolution is invalidated.
    private fingerprint(title: string, parsed: ParsedDates): string {
        const titleHash = simpleHash(title);
        return `${titleHash}-d${parsed.dayCount}-${parsed.timeUnknown ? 'tu' : 'tk'}`;
    }
}

const monthMap: { [key: string]: number } = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12,
};

// "Dec" / "Dec." / "December" → "December". Returns undefined for unknown input.
function expandMonthName(raw: string): string | undefined {
    const cleaned = raw.replace(/\./g, '').trim();
    if (monthMap[cleaned] !== undefined) return cleaned;
    const match = Object.keys(monthMap).find(m => m.toLowerCase().startsWith(cleaned.toLowerCase()));
    return match;
}

function expandRange(start: LocalDate, end: LocalDate): LocalDate[] {
    const days: LocalDate[] = [];
    let cursor = start;
    // Bound the expansion so a malformed range can't generate a runaway
    // event list; events12 ranges in practice are at most a few months.
    const HARD_LIMIT = 400;
    let count = 0;
    while (!cursor.isAfter(end) && count < HARD_LIMIT) {
        days.push(cursor);
        cursor = cursor.plusDays(1);
        count++;
    }
    return days;
}

// Cheap deterministic hash; we only need stability, not crypto strength.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { HTMLElement } from 'node-html-parser';
import { ZonedDateTime, Duration, ZoneId, LocalDate, LocalDateTime } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";
import '@js-joda/timezone';

const ICM_ADDRESS = "Interim Computer Museum, 998 Industry Dr, Tukwila, WA 98188";
const ICM_URL = "https://icm.museum/?events";

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
}

const MONTH_MAP: Record<string, number> = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12
};

interface ParsedDate {
    year: number | null;
    month: number;
    day: number;
    startHour: number;
    startMinute: number;
    durationHours: number;
}

function parseDateText(text: string): ParsedDate | null {
    // Normalize ordinal suffixes: "20th" → "20", "21st" → "21", etc.
    const normalized = text.replace(/(\d+)(?:st|nd|rd|th)/gi, '$1');

    const monthMatch = normalized.toLowerCase().match(
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/
    );
    if (!monthMatch) return null;
    const monthName = monthMatch[1];
    const month = MONTH_MAP[monthName];

    const yearMatch = normalized.match(/\b(202\d)\b/);
    const year = yearMatch ? parseInt(yearMatch[1]) : null;

    // First day number immediately following the month name
    const afterMonth = normalized.toLowerCase().slice(
        normalized.toLowerCase().indexOf(monthName) + monthName.length
    );
    const dayMatch = afterMonth.match(/^\s+(\d{1,2})/);
    if (!dayMatch) return null;
    const day = parseInt(dayMatch[1]);

    let startHour = 10;
    let startMinute = 0;
    let durationHours = 2;

    // Time range: "10am to 4pm", "4:30pm - 8:30pm"
    const timeRangeMatch = normalized.match(
        /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i
    );
    if (timeRangeMatch) {
        const sh = parseInt(timeRangeMatch[1]);
        const sm = timeRangeMatch[2] ? parseInt(timeRangeMatch[2]) : 0;
        const sap = timeRangeMatch[3].toLowerCase();
        const eh = parseInt(timeRangeMatch[4]);
        const em = timeRangeMatch[5] ? parseInt(timeRangeMatch[5]) : 0;
        const eap = timeRangeMatch[6].toLowerCase();

        startHour = sap === 'pm' && sh !== 12 ? sh + 12 : (sap === 'am' && sh === 12 ? 0 : sh);
        startMinute = sm;
        const endHour = eap === 'pm' && eh !== 12 ? eh + 12 : (eap === 'am' && eh === 12 ? 0 : eh);
        const endMinute = em;

        const diffMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
        if (diffMinutes > 0) durationHours = diffMinutes / 60;
    } else {
        // Single time: "7pm", "10:30am"
        const singleTimeMatch = normalized.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
        if (singleTimeMatch) {
            const sh = parseInt(singleTimeMatch[1]);
            const sm = singleTimeMatch[2] ? parseInt(singleTimeMatch[2]) : 0;
            const sap = singleTimeMatch[3].toLowerCase();
            startHour = sap === 'pm' && sh !== 12 ? sh + 12 : (sap === 'am' && sh === 12 ? 0 : sh);
            startMinute = sm;
        }
    }

    return { year, month, day, startHour, startMinute, durationHours };
}

export default class ICMRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, _config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        // Keep events starting no earlier than yesterday to handle multi-day events in progress
        const cutoff = date.toLocalDate().minusDays(1);

        const eventEntries = html.querySelectorAll('div.event-entry');

        for (const entry of eventEntries) {
            const h2 = entry.querySelector('h2');
            if (!h2) continue;

            // Strip <s> strikethrough content, then remaining HTML tags, then decode entities
            const title = decodeHtmlEntities(
                h2.innerHTML
                    .replace(/<s[^>]*>[\s\S]*?<\/s>/gi, '')
                    .replace(/<[^>]+>/g, '')
                    .replace(/\s+/g, ' ')
                    .trim()
            );

            if (!title || /\(COMPLETED\)/i.test(title)) continue;

            const datePara = entry.querySelector('p.date');
            if (!datePara) {
                events.push({ type: "ParseError", reason: "No date element found", context: title });
                continue;
            }

            const dateText = datePara.textContent.trim();
            const parsed = parseDateText(dateText);

            if (!parsed) {
                events.push({ type: "ParseError", reason: `Could not parse date: "${dateText}"`, context: title });
                continue;
            }

            // Infer year from context when the page omits it
            let year = parsed.year;
            if (!year) {
                try {
                    const thisYearDate = LocalDate.of(date.year(), parsed.month, parsed.day);
                    year = thisYearDate.isBefore(cutoff) ? date.year() + 1 : date.year();
                } catch {
                    year = date.year();
                }
            }

            // Resolve location: "Interim Computer Museum" and "at the museum" → known address
            let location = ICM_ADDRESS;
            for (const p of entry.querySelectorAll('p')) {
                const text = p.textContent.trim();
                if (/^location:\s*/i.test(text)) {
                    const loc = text.replace(/^location:\s*/i, '').trim();
                    if (loc && !/^(interim computer museum|at the museum)$/i.test(loc)) {
                        location = loc;
                    }
                    break;
                }
            }

            // Use first external link as the event URL
            let url: string | undefined;
            for (const link of entry.querySelectorAll('a')) {
                const href = link.getAttribute('href');
                if (href?.startsWith('http') && !href.includes('icm.museum/?visit')) {
                    url = href;
                    break;
                }
            }
            if (!url) url = ICM_URL;

            let eventDate: ZonedDateTime;
            try {
                eventDate = ZonedDateTime.of(
                    LocalDateTime.of(year, parsed.month, parsed.day, parsed.startHour, parsed.startMinute),
                    ZoneId.of('America/Los_Angeles')
                );
            } catch {
                events.push({
                    type: "ParseError",
                    reason: `Invalid date: year=${year} month=${parsed.month} day=${parsed.day}`,
                    context: title
                });
                continue;
            }

            if (eventDate.toLocalDate().isBefore(cutoff)) continue;

            const id = `icm-${title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}-${year}-${parsed.month}-${parsed.day}`;

            if (this.seenEvents.has(id)) continue;
            this.seenEvents.add(id);

            const event: RipperCalendarEvent = {
                id,
                ripped: new Date(),
                date: eventDate,
                duration: Duration.ofMinutes(Math.round(parsed.durationHours * 60)),
                summary: title,
                location,
                url
            };

            events.push(event);
        }

        return events;
    }
}

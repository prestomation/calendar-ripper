import { Duration, LocalDate, LocalTime, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

export const LOCATION = "Theatre Off Jackson, 409 7th Ave S, Seattle, WA 98104";
const HOMEPAGE = "https://theatreoffjackson.org/";

const MONTHS: Record<string, number> = {
    January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
    July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

// Matches: "Friday, May 29, 2026, 7:30PM"
const DATE_RE = /^\s*\w+,\s+(\w+)\s+(\d+),\s+(\d{4}),\s+(\d+):(\d{2})(AM|PM)\s*$/;

export function parseEventDate(text: string): LocalDateTime | null {
    const m = DATE_RE.exec(text);
    if (!m) return null;
    const [, monthName, day, year, hourStr, minStr, ampm] = m;
    const month = MONTHS[monthName];
    if (!month) return null;
    let hour = parseInt(hourStr, 10);
    const minute = parseInt(minStr, 10);
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    try {
        return LocalDateTime.of(
            LocalDate.of(parseInt(year, 10), month, parseInt(day, 10)),
            LocalTime.of(hour, minute),
        );
    } catch {
        return null;
    }
}

export function parseHomepage(html: string): string[] {
    const root = parse(html);
    const seen = new Set<string>();
    // VEM plugin renders event links in both .vem-more-details and .vem-calendar-thumbnail
    for (const el of root.querySelectorAll('.vem-more-details a, .vem-calendar-thumbnail a')) {
        const href = el.getAttribute('href');
        if (href && /\/event\/[^/]+\/?$/.test(href)) seen.add(href);
    }
    return [...seen];
}

export function parseShowPage(html: string, showUrl: string): {
    title: string | null;
    dates: LocalDateTime[];
    errors: RipperError[];
} {
    const root = parse(html);
    const title = root.querySelector('.vem-single-event-title')?.text?.trim() ?? null;
    const dates: LocalDateTime[] = [];
    const errors: RipperError[] = [];

    for (const el of root.querySelectorAll('.vem-single-event-date-start')) {
        const dt = parseEventDate(el.text ?? '');
        if (dt) {
            dates.push(dt);
        } else {
            errors.push({
                type: 'ParseError',
                reason: `Cannot parse date: "${el.text.trim()}"`,
                context: title ?? showUrl,
            });
        }
    }
    return { title, dates, errors };
}

export default class TheatreOffJacksonRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const zone = ZoneId.of(calConfig.timezone.toString());
        const now = ZonedDateTime.now(zone);
        const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' };

        const homeRes = await fetchFn(HOMEPAGE, { headers });
        if (!homeRes.ok) throw new Error(`TOJ homepage returned ${homeRes.status}`);
        const showUrls = parseHomepage(await homeRes.text());

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const url of showUrls) {
            const showRes = await fetchFn(url, { headers });
            if (!showRes.ok) {
                errors.push({ type: 'ParseError', reason: `HTTP ${showRes.status} fetching show page`, context: url });
                continue;
            }
            const { title, dates, errors: pageErrors } = parseShowPage(await showRes.text(), url);
            errors.push(...pageErrors);
            if (!title) continue;

            for (const dt of dates) {
                const eventDate = ZonedDateTime.of(dt, zone);
                if (eventDate.isBefore(now)) continue;
                events.push({
                    id: `toj-${title.replace(/\s+/g, '-').toLowerCase()}-${dt.toString()}`,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofHours(2),
                    summary: title,
                    location: LOCATION,
                    url,
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
}

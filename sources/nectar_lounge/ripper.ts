import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

const VENUE_NAME = "Nectar Lounge";
const LOCATION = "Nectar Lounge, 412 N 36th St, Seattle, WA 98103";

interface TixrEvent {
    "@type": string;
    name: string;
    description?: string;
    image?: string;
    url: string;
    startDate: string;
    endDate?: string;
    location?: {
        "@type"?: string;
        name?: string;
    };
}

function cleanHtml(encoded: string): string {
    return decode(encoded).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractTixrEvents(html: string): { tixrEvents: TixrEvent[]; parseError?: RipperError } {
    const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(html)) !== null) {
        try {
            const data: unknown = JSON.parse(match[1]);
            if (Array.isArray(data) && data.length > 0 && (data[0] as TixrEvent)?.["@type"] === "Event") {
                return { tixrEvents: data as TixrEvent[] };
            }
        } catch {}
    }
    return {
        tixrEvents: [],
        parseError: { type: "ParseError", reason: "No Tixr events JSON-LD found on page", context: "nectar-lounge" },
    };
}

export function parseNectarEvents(
    tixrEvents: TixrEvent[],
    now: ZonedDateTime,
    timezone: ZoneId,
): { events: RipperCalendarEvent[]; errors: RipperError[] } {
    const events: RipperCalendarEvent[] = [];
    const errors: RipperError[] = [];
    const seen = new Set<string>();

    for (const event of tixrEvents) {
        if (event["@type"] !== "Event") continue;
        if (event.location?.name !== VENUE_NAME) continue;
        if (seen.has(event.url)) continue;
        seen.add(event.url);

        let startZdt: ZonedDateTime;
        try {
            startZdt = ZonedDateTime.parse(event.startDate).withZoneSameInstant(timezone);
        } catch {
            errors.push({ type: "ParseError", reason: `Invalid startDate: ${event.startDate}`, context: event.name });
            continue;
        }

        if (startZdt.isBefore(now)) continue;

        let duration = Duration.ofHours(3);
        if (event.endDate) {
            try {
                const endZdt = ZonedDateTime.parse(event.endDate).withZoneSameInstant(timezone);
                const diffMinutes = Duration.between(startZdt, endZdt).toMinutes();
                if (diffMinutes > 0) duration = Duration.ofMinutes(diffMinutes);
            } catch {}
        }

        const slug = event.url.split("/").filter(Boolean).pop() ?? "";
        const description = event.description ? cleanHtml(event.description).substring(0, 1000) : undefined;

        events.push({
            id: `nectar-lounge-${slug}`,
            ripped: new Date(),
            date: startZdt,
            duration,
            summary: decode(event.name),
            description: description || undefined,
            location: LOCATION,
            url: event.url,
            image: event.image,
        });
    }

    return { events, errors };
}

export default class NectarLoungeRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!res.ok) throw new Error(`Nectar Lounge returned HTTP ${res.status}`);

        const html = await res.text();
        const { tixrEvents, parseError } = extractTixrEvents(html);
        const errors: RipperError[] = parseError ? [parseError] : [];
        const { events, errors: parseErrors } = parseNectarEvents(tixrEvents, now, timezone);

        const calConfig = ripper.config.calendars[0];
        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors: [...errors, ...parseErrors],
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}

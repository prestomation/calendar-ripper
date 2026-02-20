import { Duration, LocalDate, LocalDateTime, LocalTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import "@js-joda/timezone";

const API_URL = "https://api.ovationtix.com/public/events/client(37019)";
const CLIENT_ID = "37019";
const ORIGIN = "https://taproottheatre.org";
const LOCATION = "Taproot Theatre, 204 N 85th St, Seattle, WA 98103";
const TICKET_BASE_URL = "https://web.ovationtix.com/trs/pe.c/37019";
const SEATTLE_TZ = ZoneId.of("America/Los_Angeles");

export default class TaprootRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const res = await fetchFn(API_URL, {
            headers: {
                clientId: CLIENT_ID,
                Origin: ORIGIN,
                Accept: "application/json",
            },
        });

        if (!res.ok) {
            throw new Error(`OvationTix API error: ${res.status} ${res.statusText}`);
        }

        const json = await res.json();
        const events = this.parseEvents(json);

        return ripper.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: cal.tags || [],
        }));
    }

    public parseEvents(json: any): RipperEvent[] {
        if (!json || !Array.isArray(json.performances)) {
            return [{
                type: "ParseError",
                reason: "Invalid API response: expected object with performances array",
                context: JSON.stringify(json).substring(0, 200),
            }];
        }

        const events: RipperEvent[] = [];
        const seen = new Set<number>();

        for (const perf of json.performances) {
            try {
                const id = perf.performanceId;
                const name = perf.productionName;

                if (!id || !name || !perf.performanceDate || !perf.performanceTime24) {
                    continue;
                }

                if (seen.has(id)) {
                    continue;
                }
                seen.add(id);

                const date = this.parseDateTime(perf.performanceDate, perf.performanceTime24);
                if (!date) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date/time: ${perf.performanceDate} ${perf.performanceTime24}`,
                        context: `performanceId=${id}`,
                    });
                    continue;
                }

                const description = perf.productionDescription
                    ? this.stripHtml(perf.productionDescription)
                    : undefined;

                const event: RipperCalendarEvent = {
                    id: String(id),
                    ripped: new Date(),
                    date,
                    duration: Duration.ofMinutes(150),
                    summary: name,
                    description,
                    location: LOCATION,
                    url: `${TICKET_BASE_URL}/${id}`,
                    image: perf.productionLogoLink || undefined,
                };

                events.push(event);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse performance: ${error}`,
                    context: `performanceId=${perf.performanceId}`,
                });
            }
        }

        return events;
    }

    // Parse "MM/DD/YYYY" + "HH:mm:ss" into a Pacific-timezone ZonedDateTime
    private parseDateTime(dateStr: string, timeStr: string): ZonedDateTime | null {
        const dateMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const timeMatch = timeStr.match(/^(\d{2}):(\d{2}):(\d{2})$/);
        if (!dateMatch || !timeMatch) {
            return null;
        }
        try {
            const localDate = LocalDate.of(
                parseInt(dateMatch[3]),
                parseInt(dateMatch[1]),
                parseInt(dateMatch[2])
            );
            const localTime = LocalTime.of(
                parseInt(timeMatch[1]),
                parseInt(timeMatch[2]),
                parseInt(timeMatch[3])
            );
            return LocalDateTime.of(localDate, localTime).atZone(SEATTLE_TZ);
        } catch {
            return null;
        }
    }

    private stripHtml(html: string): string {
        return html
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/\r\n/g, "\n")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&nbsp;/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }
}

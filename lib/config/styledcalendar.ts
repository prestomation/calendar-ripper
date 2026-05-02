import { Duration, Instant, LocalDate, OffsetDateTime, ZoneId } from "@js-joda/core";
import LZString from "lz-string";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "./schema.js";
import "@js-joda/timezone";

interface StyledCalendarApiResponse {
    compressedEventsAndIds: {
        compressedEvents: string;
        sourceCalendarGoogleId: string;
    }[];
}

interface StyledCalendarRawEvent {
    id?: string;
    title: string;
    start: string;
    end?: string;
    allDay?: boolean;
    timeZone?: string;
    recurrence?: string;
    exdate?: string;
    extendedProps?: {
        description?: string;
    };
}

function parseEventDate(dateStr: string, timezone: ZoneId): { dt: ReturnType<typeof OffsetDateTime.parse> extends never ? never : import("@js-joda/core").ZonedDateTime, isAllDay: boolean } {
    if (dateStr.length === 10) {
        // All-day: "YYYY-MM-DD"
        return { dt: LocalDate.parse(dateStr).atStartOfDay(timezone), isAllDay: true };
    }
    // Timed event with offset: "2026-05-08T19:00:00-07:00"
    const offsetDT = OffsetDateTime.parse(dateStr);
    return { dt: offsetDT.atZoneSameInstant(timezone), isAllDay: false };
}

/**
 * Ripper for sites using the Styled Calendar embed widget.
 *
 * Fetches events from the Styled Calendar public API, which returns
 * LZ-String compressed JSON arrays of event objects.
 *
 * Each calendar entry in ripper.yaml must include a `config` block with:
 *   - styledCalendarId: the ID from the Styled Calendar embed URL
 */
export class StyledCalendarRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const results: RipperCalendar[] = [];

        for (const cal of ripper.config.calendars) {
            const calConfig = cal.config as { styledCalendarId?: string } | undefined;
            const calendarId = calConfig?.styledCalendarId;

            if (!calendarId) {
                results.push({
                    name: cal.name,
                    friendlyname: cal.friendlyname,
                    events: [],
                    errors: [{
                        type: "ParseError" as const,
                        reason: "Missing styledCalendarId in calendar config",
                        context: cal.name,
                    }],
                    parent: ripper.config,
                    tags: cal.tags ?? ripper.config.tags ?? [],
                });
                continue;
            }

            const apiUrl = `https://embed.styledcalendar.com/api/get-styled-calendar-events-data/?styledCalendarId=${encodeURIComponent(calendarId)}`;
            let apiResponse: StyledCalendarApiResponse;

            try {
                const res = await fetch(apiUrl);
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                }
                apiResponse = await res.json() as StyledCalendarApiResponse;
            } catch (err) {
                results.push({
                    name: cal.name,
                    friendlyname: cal.friendlyname,
                    events: [],
                    errors: [{
                        type: "ParseError" as const,
                        reason: `Failed to fetch Styled Calendar API: ${err}`,
                        context: apiUrl,
                    }],
                    parent: ripper.config,
                    tags: cal.tags ?? ripper.config.tags ?? [],
                });
                continue;
            }

            const events: RipperCalendarEvent[] = [];
            const errors: RipperError[] = [];
            const nowInstant = Instant.now();
            const timezone = cal.timezone;

            for (const entry of apiResponse.compressedEventsAndIds ?? []) {
                let rawEvents: StyledCalendarRawEvent[];
                try {
                    const decompressed = LZString.decompressFromUTF16(entry.compressedEvents);
                    if (!decompressed) {
                        errors.push({
                            type: "ParseError" as const,
                            reason: "LZ-String decompression returned null (possibly corrupted data)",
                            context: entry.sourceCalendarGoogleId,
                        });
                        continue;
                    }
                    rawEvents = JSON.parse(decompressed) as StyledCalendarRawEvent[];
                } catch (err) {
                    errors.push({
                        type: "ParseError" as const,
                        reason: `Failed to decompress/parse event data: ${err}`,
                        context: entry.sourceCalendarGoogleId,
                    });
                    continue;
                }

                for (const event of rawEvents) {
                    if (!event.title || !event.start) {
                        errors.push({
                            type: "ParseError" as const,
                            reason: "Event missing title or start",
                            context: event.id ?? "(unknown)",
                        });
                        continue;
                    }

                    // Filter closures
                    if (event.title.toUpperCase().includes("CLOSED")) {
                        continue;
                    }

                    try {
                        const { dt: startDT, isAllDay } = parseEventDate(event.start, timezone);

                        let endDT: import("@js-joda/core").ZonedDateTime;
                        if (event.end) {
                            endDT = parseEventDate(event.end, timezone).dt;
                        } else if (isAllDay) {
                            endDT = startDT.plusDays(1);
                        } else {
                            endDT = startDT.plusHours(2);
                        }

                        // Filter past events
                        if (endDT.toInstant().isBefore(nowInstant)) {
                            continue;
                        }

                        const duration = Duration.between(startDT, endDT);
                        const safeDuration = duration.isNegative() || duration.isZero()
                            ? (isAllDay ? Duration.ofHours(24) : Duration.ofHours(2))
                            : duration;

                        const description = event.extendedProps?.description ?? undefined;

                        events.push({
                            id: event.id,
                            ripped: new Date(),
                            date: startDT,
                            duration: safeDuration,
                            summary: event.title,
                            description,
                        });
                    } catch (err) {
                        errors.push({
                            type: "ParseError" as const,
                            reason: `Failed to parse event dates: ${err}`,
                            context: event.title,
                        });
                    }
                }
            }

            results.push({
                name: cal.name,
                friendlyname: cal.friendlyname,
                events,
                errors,
                parent: ripper.config,
                tags: cal.tags ?? ripper.config.tags ?? [],
            });
        }

        return results;
    }
}

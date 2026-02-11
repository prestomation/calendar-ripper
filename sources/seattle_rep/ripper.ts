import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";

export default class SeattleRepRipper extends JSONRipper {
    private seenPerformances = new Set<string>();

    public async parseEvents(jsonData: any, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        if (!Array.isArray(jsonData)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: expected an array of performances",
                context: JSON.stringify(jsonData).substring(0, 200)
            }];
        }

        for (const perf of jsonData) {
            try {
                if (!perf.perf_no || !perf.perf_date || !perf.title) {
                    continue;
                }

                if (!perf.show_in_listings) {
                    continue;
                }

                const perfId = perf.perf_no.toString();

                if (this.seenPerformances.has(perfId)) {
                    continue;
                }
                this.seenPerformances.add(perfId);

                // Parse ISO 8601 date: "2026-02-13T19:30:00-08:00"
                const eventDate = this.parseDate(perf.perf_date);
                if (!eventDate) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse perf_date: ${perf.perf_date}`,
                        context: `perf_no=${perfId}`
                    });
                    continue;
                }

                // Build summary with optional prefix
                const summary = perf.prefix
                    ? `${perf.prefix} ${perf.title}`
                    : perf.title;

                // Build description from available metadata
                const descParts: string[] = [];
                if (perf.date_description) {
                    descParts.push(perf.date_description);
                }
                if (perf.min_price != null && perf.max_price != null) {
                    descParts.push(`$${perf.min_price}–$${perf.max_price}`);
                }
                const accessibilityKeywords = (perf.keywords || [])
                    .filter((k: any) => k.category?.trim() === "Accessibility")
                    .map((k: any) => k.keyword);
                if (accessibilityKeywords.length > 0) {
                    descParts.push(`Accessibility: ${accessibilityKeywords.join(", ")}`);
                }
                const description = descParts.length > 0 ? descParts.join("\n") : undefined;

                const location = perf.facility
                    ? `${perf.facility}, Seattle Center`
                    : "Seattle Rep, Seattle Center";

                const event: RipperCalendarEvent = {
                    id: perfId,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofMinutes(150),
                    summary,
                    description,
                    location,
                    url: perf.event_url || undefined,
                    image: perf.image_url || undefined
                };

                events.push(event);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse performance: ${error}`,
                    context: `perf_no=${perf.perf_no}`
                });
            }
        }

        return events;
    }

    private parseDate(isoString: string): ZonedDateTime | null {
        // Parse "2026-02-13T19:30:00-08:00"
        const match = isoString.match(
            /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2})$/
        );
        if (!match) return null;

        const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
        const localDateTime = LocalDateTime.of(
            parseInt(yearStr),
            parseInt(monthStr),
            parseInt(dayStr),
            parseInt(hourStr),
            parseInt(minuteStr),
            parseInt(secondStr)
        );

        return localDateTime.atZone(ZoneId.of("America/Los_Angeles"));
    }
}

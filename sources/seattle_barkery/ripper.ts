import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { Duration, ZonedDateTime, LocalDateTime, ZoneId } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";

export default class SeattleBarkeryRipper extends JSONRipper {
    private seenIds = new Set<string>();

    public async parseEvents(jsonData: any, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        if (!jsonData.events || !Array.isArray(jsonData.events)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: missing events array",
                context: JSON.stringify(jsonData).substring(0, 100) + "..."
            }];
        }

        for (const event of jsonData.events) {
            const eventId = event.id?.toString();
            if (!eventId || this.seenIds.has(eventId)) continue;
            this.seenIds.add(eventId);

            try {
                const startDetails = event.start_date_details;
                if (!startDetails?.year || !startDetails?.month || !startDetails?.day) {
                    events.push({
                        type: "ParseError",
                        reason: `Event ${eventId} missing start_date_details`,
                        context: JSON.stringify(event).substring(0, 100) + "..."
                    });
                    continue;
                }

                const endDetails = event.end_date_details;
                if (!endDetails?.year || !endDetails?.month || !endDetails?.day) {
                    events.push({
                        type: "ParseError",
                        reason: `Event ${eventId} missing end_date_details`,
                        context: JSON.stringify(event).substring(0, 100) + "..."
                    });
                    continue;
                }

                let eventZone: string;
                try {
                    eventZone = event.timezone || date.zone().toString();
                    ZoneId.of(eventZone);
                } catch {
                    eventZone = date.zone().toString();
                }

                const eventLocalDateTime = LocalDateTime.of(
                    parseInt(startDetails.year),
                    parseInt(startDetails.month),
                    parseInt(startDetails.day),
                    parseInt(startDetails.hour || "0"),
                    parseInt(startDetails.minutes || "0"),
                    parseInt(startDetails.seconds || "0")
                );

                const eventDate = eventLocalDateTime.atZone(ZoneId.of(eventZone));

                const endLocalDateTime = LocalDateTime.of(
                    parseInt(endDetails.year),
                    parseInt(endDetails.month),
                    parseInt(endDetails.day),
                    parseInt(endDetails.hour || "0"),
                    parseInt(endDetails.minutes || "0"),
                    parseInt(endDetails.seconds || "0")
                );

                const startEpochSecond = eventLocalDateTime.atZone(ZoneId.of(eventZone)).toEpochSecond();
                const endEpochSecond = endLocalDateTime.atZone(ZoneId.of(eventZone)).toEpochSecond();
                const durationSeconds = Math.max(0, endEpochSecond - startEpochSecond);
                const durationHours = Math.floor(durationSeconds / 3600);
                const durationMinutes = Math.floor((durationSeconds % 3600) / 60);
                const duration = Duration.ofHours(durationHours).plusMinutes(durationMinutes);

                // Format location from venue
                let location = undefined;
                if (event.venue && typeof event.venue === 'object' && !Array.isArray(event.venue)) {
                    const v = event.venue;
                    const parts = [v.venue, v.address, v.city, v.stateprovince, v.zip].filter(Boolean);
                    if (parts.length > 0) {
                        location = this.decodeHtmlEntities(parts.join(', '));
                    }
                }

                // Build description
                let description = event.description ? this.stripHtml(event.description) : undefined;
                if (event.cost) {
                    const costText = `Cost: ${this.decodeHtmlEntities(event.cost)}`;
                    description = description ? `${description}\n\n${costText}` : costText;
                }

                const imageUrl = event.image?.url || undefined;
                if (imageUrl && description) {
                    description += `\n\nEvent image: ${imageUrl}`;
                } else if (imageUrl) {
                    description = `Event image: ${imageUrl}`;
                }

                const calendarEvent: RipperCalendarEvent = {
                    id: eventId,
                    ripped: new Date(),
                    date: eventDate,
                    duration: duration,
                    summary: this.decodeHtmlEntities(event.title),
                    description: description,
                    location: location,
                    url: event.url,
                    image: imageUrl
                };

                events.push(calendarEvent);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${error}`,
                    context: JSON.stringify(event).substring(0, 100) + "..."
                });
            }
        }

        return events;
    }

    private stripHtml(html: string): string {
        return html.replace(/<\/?[^>]+(>|$)/g, "").trim();
    }

    private decodeHtmlEntities(text: string): string {
        return text
            .replace(/&#8211;/g, "\u2013")  // en dash
            .replace(/&#8212;/g, "\u2014")  // em dash
            .replace(/&#8217;/g, "\u2019")  // right single quote
            .replace(/&#8216;/g, "\u2018")  // left single quote
            .replace(/&#8220;/g, "\u201C")  // left double quote
            .replace(/&#8221;/g, "\u201D")  // right double quote
            .replace(/&#038;/g, "&")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, "\"")
            .replace(/&nbsp;/g, " ");
    }
}

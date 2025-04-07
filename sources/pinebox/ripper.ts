import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { Duration, Instant, ZonedDateTime } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";

export default class PineboxRipper extends JSONRipper {
    public async parseEvents(jsonData: any, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        
        // Check if the JSON data is an array
        if (!Array.isArray(jsonData)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: expected an array of events",
                context: JSON.stringify(jsonData).substring(0, 100) + "..."
            }];
        }
        
        for (const item of jsonData) {
            try {
                // Check if the item has the required fields
                if (!item.structuredContent || 
                    !item.structuredContent._type || 
                    item.structuredContent._type !== "CalendarEvent" ||
                    !item.structuredContent.startDate ||
                    !item.structuredContent.endDate ||
                    !item.title) {
                    events.push({
                        type: "ParseError",
                        reason: "Event missing required fields",
                        context: JSON.stringify(item).substring(0, 100) + "..."
                    });
                    continue;
                }
                
                // Parse start date and time
                const startTimestamp = item.structuredContent.startDate;
                const startDate = new Date(startTimestamp);
                
                // Convert to ZonedDateTime with the calendar's timezone
                const eventDate: ZonedDateTime = ZonedDateTime.ofInstant(Instant.ofEpochMilli(startTimestamp), date.zone());
                
                // Calculate duration using end date
                const endTimestamp = item.structuredContent.endDate;
                const endDate = new Date(endTimestamp);
                const durationMs = endDate.getTime() - startDate.getTime();
                const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
                const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                const duration = Duration.ofHours(durationHours).plusMinutes(durationMinutes);
                
                // Extract location if available
                let location = undefined;
                if (item.location) {
                    const loc = item.location;
                    // Format location if coordinates are available
                    if (loc.markerLat && loc.markerLng) {
                        location = `Latitude: ${loc.markerLat}, Longitude: ${loc.markerLng}`;
                    }
                }
                
                // Build description with available information
                let description = "";
                if (item.body) {
                    description += item.body;
                }
                if (item.excerpt && item.excerpt.trim() !== "") {
                    if (description) description += "\n\n";
                    description += item.excerpt;
                }
                
                // Add image URL to description if available
                let imageUrl = undefined;
                if (item.assetUrl) {
                    imageUrl = item.assetUrl;
                    if (description) {
                        description += "\n\n";
                    }
                    description += `Event image: ${imageUrl}`;
                }
                
                // Create event object
                const calendarEvent: RipperCalendarEvent = {
                    id: item.id,
                    ripped: new Date(),
                    date: eventDate,
                    duration: duration,
                    summary: item.title,
                    description: description || undefined,
                    location: location,
                    url: item.sourceUrl || item.fullUrl ? `https://pinebox.com${item.fullUrl}` : undefined,
                    image: imageUrl
                };
                
                events.push(calendarEvent);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${error}`,
                    context: JSON.stringify(item).substring(0, 100) + "..."
                });
            }
        }
        
        return events;
    }
}

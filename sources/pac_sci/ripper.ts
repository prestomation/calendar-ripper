import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { Duration, ZonedDateTime, LocalDateTime, ZoneId } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";
import { decode } from "html-entities";

export default class PacificScienceCenterRipper extends JSONRipper {
    public async parseEvents(jsonData: any, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        
        // Check if the JSON data has the expected structure
        if (!Array.isArray(jsonData)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: expected an array of events",
                context: JSON.stringify(jsonData).substring(0, 100) + "..."
            }];
        }
        
        // Filter events based on configuration
        let filteredEvents = jsonData;
        
        // Filter by location if specified in config
        if (config && config.location_id) {
            filteredEvents = filteredEvents.filter((event: any) => 
                event.location && event.location.includes(parseInt(config.location_id))
            );
        }
        
        // Filter by event series if specified in config
        if (config && config.event_series_id) {
            filteredEvents = filteredEvents.filter((event: any) => 
                event.event_series && event.event_series.includes(parseInt(config.event_series_id))
            );
        }
        
        for (const event of filteredEvents) {
            try {
                // Extract event date from the date field
                // The date is in ISO format like "2025-04-03T10:29:59"
                if (!event.date) {
                    events.push({
                        type: "ParseError",
                        reason: "Missing date field in event",
                        context: JSON.stringify(event).substring(0, 100) + "..."
                    });
                    continue;
                }
                
                // Parse the date
                // Convert ISO string to LocalDateTime first, then apply the timezone
                const localDateTime = LocalDateTime.parse(event.date);
                const eventDate = localDateTime.atZone(date.zone());
                
                // Extract event duration - since the API doesn't provide end times,
                // we'll use a default duration of 2 hours for most events
                const duration = Duration.ofHours(2);
                
                // Extract event title and decode HTML entities
                const title = event.title?.rendered ? this.decodeHtmlEntities(event.title.rendered) : "Untitled Event";
                
                // Extract event description, stripping HTML tags and decoding HTML entities
                let description = event.excerpt?.rendered ? this.decodeHtmlEntities(this.stripHtml(event.excerpt.rendered)) : undefined;
                
                // Extract event location and decode HTML entities
                let location = undefined;
                if (event.location && event.location.length > 0) {
                    // Try to get location name from class_list which often contains location info
                    const locationClass = event.class_list?.find((cls: string) => cls.startsWith("location-"));
                    if (locationClass) {
                        location = locationClass.replace("location-", "").replace(/-/g, " ");
                        location = location.charAt(0).toUpperCase() + location.slice(1);
                        location = this.decodeHtmlEntities(location);
                    }
                }
                
                // Extract event URL
                const url = event.link;
                
                // Extract image if available
                let imageUrl = undefined;
                if (event.yoast_head_json?.og_image && event.yoast_head_json.og_image.length > 0) {
                    imageUrl = event.yoast_head_json.og_image[0].url;
                    
                    // Append image URL to description
                    if (description) {
                        description += `\n\nEvent image: ${imageUrl}`;
                    } else {
                        description = `Event image: ${imageUrl}`;
                    }
                }
                
                // Create event object
                const calendarEvent: RipperCalendarEvent = {
                    id: event.id.toString(),
                    ripped: new Date(),
                    date: eventDate,
                    duration: duration,
                    summary: title,
                    description: description,
                    location: location,
                    url: url,
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
    
    // Helper method to strip HTML tags from description
    private stripHtml(html: string): string {
        return html.replace(/<\/?[^>]+(>|$)/g, "").trim();
    }
    
    // Helper method to decode HTML entities
    private decodeHtmlEntities(text: string): string {
        try {
            return decode(text);
        } catch (error) {
            console.error("Error decoding HTML entities:", error);
            return text;
        }
    }
}

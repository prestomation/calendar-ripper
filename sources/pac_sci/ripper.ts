import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { Duration, ZonedDateTime, LocalDateTime } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";
import { decode } from "html-entities";

export default class PacificScienceCenterRipper extends JSONRipper {
    public async parseEvents(jsonData: any, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        
        if (!Array.isArray(jsonData)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: expected an array of events",
                context: JSON.stringify(jsonData).substring(0, 100) + "..."
            }];
        }
        
        // Filter events based on configuration
        let filteredEvents = jsonData;
        
        if (config && config.location_id) {
            filteredEvents = filteredEvents.filter((event: any) => 
                event.location && event.location.includes(parseInt(config.location_id))
            );
        }
        
        if (config && config.event_series_id) {
            filteredEvents = filteredEvents.filter((event: any) => 
                event.event_series && event.event_series.includes(parseInt(config.event_series_id))
            );
        }
        
        for (const event of filteredEvents) {
            try {
                if (!event.date) {
                    events.push({
                        type: "ParseError",
                        reason: "Missing date field in event",
                        context: JSON.stringify(event).substring(0, 100) + "..."
                    });
                    continue;
                }
                
                // Parse the publication date as event date (since actual event dates aren't available in API)
                const localDateTime = LocalDateTime.parse(event.date);
                const eventDate = localDateTime.atZone(date.zone());
                
                const duration = Duration.ofHours(2);
                const title = event.title?.rendered ? this.decodeHtmlEntities(event.title.rendered) : "Untitled Event";
                let description = event.excerpt?.rendered ? this.decodeHtmlEntities(this.stripHtml(event.excerpt.rendered)) : undefined;
                
                // Extract location from class_list
                let location = undefined;
                if (event.class_list) {
                    const locationClass = event.class_list.find((cls: string) => cls.startsWith("location-"));
                    if (locationClass) {
                        location = locationClass.replace("location-", "").replace(/-/g, " ");
                        location = location.charAt(0).toUpperCase() + location.slice(1);
                        location = this.decodeHtmlEntities(location);
                    }
                }
                
                const url = event.link;
                
                // Extract image from yoast_head_json
                let imageUrl = undefined;
                if (event.yoast_head_json?.og_image && event.yoast_head_json.og_image.length > 0) {
                    imageUrl = event.yoast_head_json.og_image[0].url;
                    if (description) {
                        description += `\n\nEvent image: ${imageUrl}`;
                    } else {
                        description = `Event image: ${imageUrl}`;
                    }
                }
                
                const calendarEvent: RipperCalendarEvent = {
                    id: event.id.toString(),
                    ripped: new Date(),
                    date: eventDate,
                    duration: duration,
                    summary: title,
                    description: description,
                    location: location,
                    url: url
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
        try {
            return decode(text);
        } catch (error) {
            return text;
        }
    }
    
    private extractEventDate(event: any, fallbackDate: ZonedDateTime): ZonedDateTime {
        // Try to extract actual event date from content
        const content = event.content?.rendered || '';
        const excerpt = event.excerpt?.rendered || '';
        const title = event.title?.rendered || '';
        
        // Look for date patterns in content
        const datePatterns = [
            // "December 17", "Dec 17", etc.
            /(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})/gi,
            // "12/17", "12-17", etc.
            /(\d{1,2})[\/\-](\d{1,2})/g,
            // Look for specific dates in showtimes
            /(\d{1,2})\s*(?:a\.m\.|p\.m\.|am|pm)/gi
        ];
        
        const textToSearch = `${title} ${excerpt} ${content}`;
        
        // For now, use publication date but add a note that this needs improvement
        // TODO: Implement proper date extraction from content
        return fallbackDate;
    }
}

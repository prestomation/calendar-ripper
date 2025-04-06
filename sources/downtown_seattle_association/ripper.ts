import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { Duration, ZonedDateTime, LocalDateTime, ZoneId } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";

export default class DowntownSeattleRipper extends JSONRipper {
    public async parseEvents(jsonData: any, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        
        // Check if the JSON data has the expected structure
        if (!jsonData.events || !Array.isArray(jsonData.events)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: missing events array",
                context: JSON.stringify(jsonData).substring(0, 100) + "..."
            }];
        }
        
        // Filter events by venue if specified in config
        let filteredEvents = jsonData.events;
        if (config && config.venue_id) {
            filteredEvents = filteredEvents.filter((event: any) => 
                event.venue && event.venue.id === parseInt(config.venue_id)
            );
        }
        
        for (const event of filteredEvents) {
            try {
                // Parse start date and time using the event's date details
                const startDetails = event.start_date_details;
                const eventZone = event.timezone || date.zone().toString();
                
                // Create a LocalDateTime from the components
                const eventLocalDateTime = LocalDateTime.of(
                    parseInt(startDetails.year),
                    parseInt(startDetails.month),
                    parseInt(startDetails.day),
                    parseInt(startDetails.hour),
                    parseInt(startDetails.minutes),
                    parseInt(startDetails.seconds)
                );
                
                // Convert to ZonedDateTime with the event's timezone
                const eventDate = eventLocalDateTime.atZone(ZoneId.of(eventZone));
                
                // Calculate duration using end date details
                const endDetails = event.end_date_details;
                const endLocalDateTime = LocalDateTime.of(
                    parseInt(endDetails.year),
                    parseInt(endDetails.month),
                    parseInt(endDetails.day),
                    parseInt(endDetails.hour),
                    parseInt(endDetails.minutes),
                    parseInt(endDetails.seconds)
                );
                
                // Calculate duration in hours and minutes
                const startEpochSecond = eventLocalDateTime.atZone(ZoneId.of(eventZone)).toEpochSecond();
                const endEpochSecond = endLocalDateTime.atZone(ZoneId.of(eventZone)).toEpochSecond();
                const durationSeconds = endEpochSecond - startEpochSecond;
                const durationHours = Math.floor(durationSeconds / 3600);
                const durationMinutes = Math.floor((durationSeconds % 3600) / 60);
                const duration = Duration.ofHours(durationHours).plusMinutes(durationMinutes);
                
                // Format location with all available venue information
                let location = undefined;
                if (event.venue) {
                    const venue = event.venue;
                    location = `${venue.venue}, ${venue.address}, ${venue.city}, ${venue.stateprovince} ${venue.zip}`;
                }
                
                // Process image if available
                let imageUrl = undefined;
                let description = event.description ? this.stripHtml(event.description) : undefined;
                
                if (event.image && event.image.url) {
                    // Get the full image URL (handle relative URLs)
                    imageUrl = event.image.url.startsWith('http') 
                        ? event.image.url 
                        : `https://downtownseattle.org${event.image.url}`;
                    
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
                    summary: event.title,
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
    
    // Helper method to strip HTML tags from description
    private stripHtml(html: string): string {
        return html.replace(/<\/?[^>]+(>|$)/g, "");
    }
}

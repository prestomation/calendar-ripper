import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from 'node-html-parser';

/**
 * Ripper for Dogwood Play Park events
 * Extracts events from both JSON-LD data and wix-warmup-data in the HTML
 */
export default class DogwoodPlayParkRipper extends HTMLRipper {
    // Default location for all events
    private DEFAULT_LOCATION = "Dogwood Play Park, 12568 33rd Ave NE, Seattle, WA 98125";
    
    /**
     * Parse events from the Dogwood Play Park HTML page
     * The events are embedded in both JSON-LD script tag and wix-warmup-data script tag
     */
    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        try {
            // First try to extract detailed event data from wix-warmup-data
            const warmupEvents = this.extractEventsFromWarmupData(html);
            
            // If we got events from warmup data, return those
            if (warmupEvents.length > 0 && warmupEvents.some(e => 'summary' in e)) {
                return warmupEvents;
            }
            
            // Fallback to JSON-LD data if warmup data extraction failed
            return this.extractEventsFromJsonLd(html, date);
        } catch (error) {
            return [{
                type: "ParseError",
                reason: `Error parsing events: ${error}`,
                context: "HTML document"
            }];
        }
    }
    
    /**
     * Extract events from the wix-warmup-data script tag
     * This contains more detailed event information including actual dates and times
     */
    private extractEventsFromWarmupData(html: HTMLElement): RipperEvent[] {
        try {
            // Find the wix-warmup-data script tag
            const warmupDataTag = html.querySelector('script#wix-warmup-data');
            if (!warmupDataTag || !warmupDataTag.textContent) {
                return [];
            }
            
            // Parse the JSON data
            const warmupData = JSON.parse(warmupDataTag.textContent);
            
            // Navigate to the events data
            // The path to events data in the warmup data structure
            const eventsData = warmupData?.appsWarmupData?.['140603ad-af8d-84a5-2c80-a0f60cb47351']?.['widgetcomp-kp1kqz5a']?.events?.events;
            
            if (!eventsData || !Array.isArray(eventsData) || eventsData.length === 0) {
                return [];
            }
            
            // Process each event
            const events: RipperEvent[] = [];
            for (const eventData of eventsData) {
                try {
                    // Extract event details
                    const id = eventData.id;
                    const title = eventData.title?.trim();
                    const description = eventData.description || '';
                    const url = `https://www.dogwoodplaypark.com/event-details/${eventData.slug}`;
                    const imageUrl = eventData.mainImage?.url;
                    
                    // Extract location details
                    let location = this.DEFAULT_LOCATION;
                    if (eventData.location?.fullAddress?.formattedAddress) {
                        location = `Dogwood Play Park, ${eventData.location.fullAddress.formattedAddress}`;
                    }
                    
                    // Extract date and time
                    if (!eventData.scheduling?.config) {
                        continue;
                    }
                    
                    const startDateStr = eventData.scheduling.config.startDate;
                    const endDateStr = eventData.scheduling.config.endDate;
                    const timeZoneId = eventData.scheduling.config.timeZoneId || 'America/Los_Angeles';
                    
                    if (!startDateStr || !endDateStr) {
                        continue;
                    }
                    
                    // Parse dates
                    const startDate = new Date(startDateStr);
                    const endDate = new Date(endDateStr);
                    
                    // Calculate duration in minutes
                    const durationMs = endDate.getTime() - startDate.getTime();
                    const durationMinutes = Math.floor(durationMs / (1000 * 60));
                    
                    // Create ZonedDateTime for the event start
                    // Parse the ISO date string and convert to ZonedDateTime
                    const isoDate = startDateStr.replace('Z', '');
                    const year = parseInt(isoDate.substring(0, 4));
                    const month = parseInt(isoDate.substring(5, 7));
                    const day = parseInt(isoDate.substring(8, 10));
                    const hour = parseInt(isoDate.substring(11, 13));
                    const minute = parseInt(isoDate.substring(14, 16));
                    const second = parseInt(isoDate.substring(17, 19));
                    
                    const eventDate = ZonedDateTime.of(
                        year, month, day, hour, minute, second, 0, 
                        ZoneId.of(timeZoneId)
                    );
                    
                    // Create the event
                    const event: RipperCalendarEvent = {
                        id: id,
                        summary: title,
                        description: this.createDescription(title, description, url, imageUrl),
                        location: location,
                        date: eventDate,
                        duration: Duration.ofMinutes(durationMinutes),
                        url: url,
                        ripped: new Date()
                    };
                    
                    events.push(event);
                } catch (error) {
                    events.push({
                        type: "ParseError",
                        reason: `Failed to parse event from warmup data: ${error}`,
                        context: JSON.stringify(eventData).substring(0, 100)
                    });
                }
            }
            
            return events;
        } catch (error) {
            return [{
                type: "ParseError",
                reason: `Error extracting events from warmup data: ${error}`,
                context: "wix-warmup-data"
            }];
        }
    }
    
    /**
     * Extract events from the JSON-LD script tag (fallback method)
     */
    private extractEventsFromJsonLd(html: HTMLElement, date: ZonedDateTime): RipperEvent[] {
        try {
            // Find the JSON-LD script tag
            const scriptTags = html.querySelectorAll('script[type="application/ld+json"]');
            if (!scriptTags || scriptTags.length === 0) {
                return [{
                    type: "ParseError",
                    reason: "No JSON-LD script tag found",
                    context: "HTML document"
                }];
            }

            // Parse the JSON data from the script tag
            const jsonLdContent = scriptTags[0].textContent;
            if (!jsonLdContent) {
                return [{
                    type: "ParseError",
                    reason: "Empty JSON-LD content",
                    context: scriptTags[0].toString()
                }];
            }

            const jsonData = JSON.parse(jsonLdContent);
            
            // Check if we have the expected structure
            if (!jsonData.itemListElement || !Array.isArray(jsonData.itemListElement)) {
                return [{
                    type: "ParseError",
                    reason: "Invalid JSON-LD structure: missing itemListElement array",
                    context: jsonLdContent.substring(0, 100)
                }];
            }

            // Process each event in the itemListElement array
            const events: RipperEvent[] = [];
            for (const listItem of jsonData.itemListElement) {
                try {
                    if (!listItem.item || listItem.item["@type"] !== "Event") {
                        continue; // Skip non-event items
                    }

                    const eventItem = listItem.item;
                    
                    // Extract event details
                    const name = eventItem.name?.trim();
                    const url = eventItem.url;
                    const image = eventItem.image;
                    
                    // Since the JSON-LD doesn't include date/time information directly,
                    // we'll use the position to calculate a time (for fallback purposes only)
                    const position = listItem.position || 1;
                    const hour = 10 + (position % 12); // Events start at 10 AM, spaced throughout the day
                    const minute = ((position * 15) % 60); // Stagger start times
                    
                    // Create the event date with the calculated time
                    const eventDate = date
                        .withHour(hour)
                        .withMinute(minute)
                        .withSecond(0)
                        .withNano(0);
                    
                    // Set a duration based on the event type
                    let duration = Duration.ofHours(2);
                    if (name.toLowerCase().includes("meet up") || name.toLowerCase().includes("meet-up")) {
                        duration = Duration.ofHours(1).plusMinutes(30); // Meet-ups are 1.5 hours
                    }
                    
                    const event: RipperCalendarEvent = {
                        id: url,
                        summary: name,
                        description: this.createDescription(name, "", url, image),
                        location: this.DEFAULT_LOCATION,
                        date: eventDate,
                        duration: duration,
                        url: url,
                        ripped: new Date()
                    };
                    
                    events.push(event);
                } catch (error) {
                    events.push({
                        type: "ParseError",
                        reason: `Failed to parse event from JSON-LD: ${error}`,
                        context: JSON.stringify(listItem).substring(0, 100)
                    });
                }
            }
            
            return events;
        } catch (error) {
            return [{
                type: "ParseError",
                reason: `Error extracting events from JSON-LD: ${error}`,
                context: "JSON-LD data"
            }];
        }
    }
    
    /**
     * Create a rich description for the event
     */
    private createDescription(name: string, description: string, url: string, image?: string): string {
        let result = `${name}\n\n`;
        
        if (description) {
            result += `${description}\n\n`;
        } else {
            // Add default descriptions based on event type if no description is provided
            if (name.toLowerCase().includes("small dog")) {
                result += "A special event for small dogs to play together in a safe environment.\n\n";
            } else if (name.toLowerCase().includes("doodle")) {
                result += "Calling all Doodles! Come play with other Doodles in this breed-specific event.\n\n";
            } else if (name.toLowerCase().includes("golden retriever")) {
                result += "Golden Retrievers gather for playtime and socialization.\n\n";
            } else if (name.toLowerCase().includes("samoyed")) {
                result += "Samoyed breed meet-up for these fluffy friends to play together.\n\n";
            } else if (name.toLowerCase().includes("hound")) {
                result += "A special event for hound breeds to play and socialize together.\n\n";
            }
        }
        
        result += "Dogwood Play Park is Seattle's indoor/outdoor off-leash dog park and bar!\n\n";
        
        if (image) {
            result += `Event image: ${image}\n\n`;
        }
        
        result += `More information: ${url}`;
        
        return result;
    }
}

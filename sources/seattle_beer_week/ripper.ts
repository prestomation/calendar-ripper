import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { Duration, ZonedDateTime, LocalDateTime, ZoneId } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";

export default class SeattleBeerWeekRipper extends JSONRipper {
    public async parseEvents(jsonData: any, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        
        try {
            // Extract events from the widgets structure
            if (jsonData?.data?.widgets) {
                const widgetKeys = Object.keys(jsonData.data.widgets);
                
                for (const key of widgetKeys) {
                    const widget = jsonData.data.widgets[key];
                    
                    if (widget?.data?.settings?.events) {
                        const eventsList = widget.data.settings.events;
                        
                        for (const event of eventsList) {
                            try {
                                // Skip empty events (the JSON has some empty objects)
                                if (!event.id || !event.name || !event.start) {
                                    continue;
                                }
                                
                                // Parse start date and time
                                const startDate = event.start.date;
                                const startTime = event.start.time;
                                
                                if (!startDate || !startTime) {
                                    continue;
                                }
                                
                                // Parse the date components
                                const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
                                
                                // Parse the time components (handle both "17:00" and "17:00:00" formats)
                                const timeParts = startTime.split(':').map(Number);
                                const startHour = timeParts[0];
                                const startMinute = timeParts[1];
                                const startSecond = timeParts[2] || 0;
                                
                                // Create the date object
                                const eventLocalDateTime = LocalDateTime.of(
                                    startYear,
                                    startMonth,
                                    startDay,
                                    startHour,
                                    startMinute,
                                    startSecond
                                );
                                
                                // Use the event's timezone or default to the calendar's timezone
                                const timezone = event.timeZone || "America/Los_Angeles";
                                const eventDate = eventLocalDateTime.atZone(ZoneId.of(timezone));
                                
                                // Calculate duration
                                let duration = Duration.ofHours(2); // Default duration
                                
                                if (event.end && event.end.date && event.end.time) {
                                    const [endYear, endMonth, endDay] = event.end.date.split('-').map(Number);
                                    const endTimeParts = event.end.time.split(':').map(Number);
                                    const endHour = endTimeParts[0];
                                    const endMinute = endTimeParts[1];
                                    const endSecond = endTimeParts[2] || 0;
                                    
                                    const endLocalDateTime = LocalDateTime.of(
                                        endYear,
                                        endMonth,
                                        endDay,
                                        endHour,
                                        endMinute,
                                        endSecond
                                    );
                                    
                                    const startEpochSecond = eventLocalDateTime.atZone(ZoneId.of(timezone)).toEpochSecond();
                                    const endEpochSecond = endLocalDateTime.atZone(ZoneId.of(timezone)).toEpochSecond();
                                    const durationSeconds = endEpochSecond - startEpochSecond;
                                    
                                    duration = Duration.ofSeconds(durationSeconds);
                                }
                                
                                // Process description
                                let description = event.description;
                                if (description) {
                                    // Strip HTML tags
                                    description = this.stripHtml(description);
                                }
                                
                                // Get location information
                                // In this data format, location is just an ID reference
                                // We could look it up in the locations array if needed
                                let location = undefined;
                                if (event.location) {
                                    // For now, just use the location ID as a placeholder
                                    // In a real implementation, we would look up the location details
                                    location = `Location ID: ${event.location}`;
                                }
                                
                                // Get URL from button link if available
                                let url = undefined;
                                if (event.buttonVisible && event.buttonLink && event.buttonLink.value) {
                                    url = event.buttonLink.value;
                                }
                                
                                // Create the event object
                                const calendarEvent: RipperCalendarEvent = {
                                    id: event.id.toString(),
                                    ripped: new Date(),
                                    date: eventDate,
                                    duration: duration,
                                    summary: event.name,
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
                    }
                }
            }
        } catch (error) {
            events.push({
                type: "ParseError",
                reason: `Failed to parse JSON data: ${error}`,
                context: JSON.stringify(jsonData).substring(0, 100) + "..."
            });
        }
        
        return events;
    }
    
    // Helper method to strip HTML tags from description
    private stripHtml(html: string): string {
        if (!html) return "";
        return html.replace(/<\/?[^>]+(>|$)/g, "");
    }
}

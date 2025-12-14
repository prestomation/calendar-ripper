import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { HTMLElement } from 'node-html-parser';
import { ZonedDateTime, Duration } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";

export default class Events12Ripper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        
        // Find all article elements that contain events
        const eventArticles = html.querySelectorAll('article[id]');
        
        for (const article of eventArticles) {
            try {
                // Get the event title from the H3 element
                const titleElement = article.querySelector('h3');
                if (!titleElement) continue;
                
                const title = titleElement.text.trim().replace(/\s*FREE\s*$/, '').trim();
                if (!title) continue;
                
                let eventDate: ZonedDateTime | null = null;
                let location = '';
                let description = '';
                let url = '';
                
                // Find date element
                const dateElement = article.querySelector('p.date');
                if (dateElement) {
                    eventDate = this.parseEventDate(dateElement.text.trim(), date.zone());
                }
                
                // Find location element and map link
                const locationElement = article.querySelector('p.miles');
                const mapLink = article.querySelector('a[href*="google.com/maps"]');
                if (locationElement) {
                    const locationText = locationElement.text.trim();
                    if (mapLink) {
                        location = mapLink.getAttribute('href') || '';
                        description = locationText + '\n\n';
                    } else {
                        location = locationText;
                    }
                }
                
                // Find description element
                const descElement = article.querySelector('p.event');
                if (descElement) {
                    description += descElement.text.trim();
                }
                
                // Find event URL
                const links = article.querySelectorAll('a');
                for (const link of links) {
                    const href = link.getAttribute('href');
                    if (href && !href.includes('google.com/maps') && !href.includes('facebook.com') && !href.includes('youtube.com')) {
                        url = href.startsWith('http') ? href : `https://www.events12.com${href}`;
                        break;
                    }
                }
                
                // Only create event if we have a valid date
                if (eventDate && title) {
                    const eventId = this.generateEventId(title, eventDate);
                    
                    // Skip if we've already seen this event
                    if (this.seenEvents.has(eventId)) {
                        continue;
                    }
                    this.seenEvents.add(eventId);
                    
                    const event: RipperCalendarEvent = {
                        id: eventId,
                        ripped: new Date(),
                        date: eventDate,
                        duration: Duration.ofHours(2),
                        summary: title,
                        description: description,
                        location: location,
                        url: url || undefined
                    };
                    events.push(event);
                }
                
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${error}`,
                    context: article.innerHTML.substring(0, 100)
                });
            }
        }
        
        return events;
    }
    
    private parseEventDate(dateText: string, timezone: ZoneId): ZonedDateTime | null {
        try {
            // Extract date components from text like "December 3, 2025 (7 to 8:30 p.m.)"
            const dateMatch = dateText.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/);
            if (!dateMatch) return null;
            
            const monthName = dateMatch[1];
            const day = parseInt(dateMatch[2]);
            const year = parseInt(dateMatch[3]);
            
            const monthMap: { [key: string]: number } = {
                'January': 1, 'February': 2, 'March': 3, 'April': 4,
                'May': 5, 'June': 6, 'July': 7, 'August': 8,
                'September': 9, 'October': 10, 'November': 11, 'December': 12
            };
            
            const month = monthMap[monthName];
            if (!month) return null;
            
            // Extract time if present
            let hour = 12; // Default to noon
            let minute = 0;
            
            const timeMatch = dateText.match(/\((\d{1,2}):?(\d{2})?\s*(a\.m\.|p\.m\.|AM|PM)\)/i) || 
                             dateText.match(/\((\d{1,2})\s*(a\.m\.|p\.m\.|AM|PM)\)/i);
            
            if (timeMatch) {
                hour = parseInt(timeMatch[1]);
                minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
                const ampm = timeMatch[3] || timeMatch[2];
                
                if (ampm && ampm.toLowerCase().includes('p') && hour !== 12) {
                    hour += 12;
                } else if (ampm && ampm.toLowerCase().includes('a') && hour === 12) {
                    hour = 0;
                }
            }
            
            // Get the actual ZoneId from the ZonedDateTime
            const zoneId = typeof timezone === 'function' ? timezone() : timezone;
            return ZonedDateTime.of(year, month, day, hour, minute, 0, 0, zoneId);
            
        } catch (error) {
            return null;
        }
    }
    
    private generateEventId(title: string, date: ZonedDateTime): string {
        // Create a simple ID from title and date
        const titleSlug = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const dateStr = date.toLocalDate().toString();
        return `${titleSlug}-${dateStr}`;
    }
}

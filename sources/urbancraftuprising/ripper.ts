import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { ZonedDateTime, Duration, ZoneId } from "@js-joda/core";
import { RipperEvent } from "../../lib/config/schema.js";
import { validateTags } from "../../lib/config/tags.js";

export default class UrbanCraftUprisingRipper extends JSONRipper {
    public async parseEvents(jsonData: any, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        
        // Validate tags from config
        const ripperTags = ["MakersMarket", "Art"];
        const tagValidation = validateTags(ripperTags);
        if (tagValidation.invalid.length > 0) {
            console.warn(`Invalid tags found: ${tagValidation.invalid.join(', ')}`);
        }
        
        // Filter for actual event pages (not vendor lists or resources)
        const eventPages = jsonData.filter((page: any) => {
            const title = page.title.rendered.toLowerCase();
            return (title.includes('market') || title.includes('show') || title.includes('uprising')) &&
                   !title.includes('vendor') && !title.includes('resource') &&
                   !title.includes('selling at shows'); // Filter out problematic page
        });
        
        for (const page of eventPages) {
            try {
                const event = this.parseEventFromPage(page, date.zone);
                if (event) {
                    events.push(event);
                }
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${error}`,
                    context: `Title: ${page.title.rendered}`
                });
            }
        }
        
        return events;
    }
    
    private parseEventFromPage(page: any, timezone: any): RipperEvent | null {
        try {
            const title = page.title.rendered;
            const content = page.content.rendered;
            const url = page.link;
            
            // Extract date from content
            const dateText = this.extractDateFromContent(content);
            
            if (!dateText) {
                return {
                    type: "ParseError",
                    reason: "No date found in page content",
                    context: `Title: ${title}`
                };
            }
            
            const eventDate = this.parseDate(dateText);
            if (!eventDate) {
                return {
                    type: "ParseError",
                    reason: `Could not parse date: ${dateText}`,
                    context: `Title: ${title}`
                };
            }
            
            // Extract location and description
            const location = this.extractLocation(content);
            const description = this.extractDescription(content);
            
            return {
                id: page.slug,
                ripped: new Date(),
                date: eventDate,
                duration: Duration.ofHours(6),
                summary: title,
                description: description,
                location: location,
                url: url
            };
        } catch (error) {
            return {
                type: "ParseError",
                reason: `Error parsing page: ${error}`,
                context: `Title: ${page.title.rendered}`
            };
        }
    }
    
    private extractDateFromContent(content: string): string | null {
        // Remove HTML tags for cleaner text processing
        const cleanText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
        
        // Look for date patterns
        const datePatterns = [
            // "FRIDAY, DECEMBER 19TH – SUNDAY, DECEMBER 21ST"
            /([A-Z]+DAY,\s+[A-Z]+\s+\d{1,2}(?:ST|ND|RD|TH)?)\s*[–-]\s*([A-Z]+DAY,\s+[A-Z]+\s+\d{1,2}(?:ST|ND|RD|TH)?)/i,
            // "December 19 – December 21"
            /([A-Z]+\s+\d{1,2}(?:ST|ND|RD|TH)?)\s*[–-]\s*([A-Z]+\s+\d{1,2}(?:ST|ND|RD|TH)?)/i,
            // "Friday, December 19th"
            /[A-Z]+DAY,\s+([A-Z]+\s+\d{1,2}(?:ST|ND|RD|TH)?)/i,
            // "December 19"
            /\b([A-Z]+\s+\d{1,2}(?:ST|ND|RD|TH)?)\b/i
        ];
        
        for (const pattern of datePatterns) {
            const match = cleanText.match(pattern);
            if (match) {
                return match[1];
            }
        }
        
        return null;
    }
    
    private parseDate(dateText: string): ZonedDateTime | null {
        try {
            // Clean up the date text - remove ordinal suffixes ONCE
            const cleanDate = dateText
                .replace(/^[A-Z]+DAY,?\s+/i, '')
                .replace(/(\d+)(ST|ND|RD|TH)/gi, '$1');
            
            const currentYear = new Date().getFullYear();
            const now = new Date();
            
            // Add current year if not present
            let dateWithYear = cleanDate;
            if (!/\d{4}/.test(cleanDate)) {
                dateWithYear = cleanDate + ', ' + currentYear;
            }
            
            let date = new Date(dateWithYear);
            
            // If the date is more than 7 days in the past, assume it's next year
            if (!isNaN(date.getTime())) {
                const daysDiff = (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
                if (daysDiff < -7) {
                    // Use the already cleaned date text, don't re-process ordinals
                    dateWithYear = cleanDate + ', ' + (currentYear + 1);
                    date = new Date(dateWithYear);
                }
            }
            
            if (isNaN(date.getTime())) {
                return null;
            }
            
            // Convert to ZonedDateTime with Pacific timezone
            const pacificZone = ZoneId.of('America/Los_Angeles');
            return ZonedDateTime.of(
                date.getFullYear(),
                date.getMonth() + 1,
                date.getDate(),
                12, 0, 0, 0,
                pacificZone
            );
        } catch (error) {
            return null;
        }
    }
    
    private extractLocation(content: string): string | undefined {
        // Look for location patterns in the content
        const locationPatterns = [
            /PACIFIC PLACE/i,
            /MAGNUSON PARK/i,
            /SEATTLE CENTER/i,
            /EXHIBITION HALL/i,
            /(\d+\s+[^<\n]+(?:street|st|avenue|ave|road|rd|boulevard|blvd)[^<\n]*)/i
        ];
        
        for (const pattern of locationPatterns) {
            const match = content.match(pattern);
            if (match) {
                return match[0].replace(/<[^>]*>/g, '').trim();
            }
        }
        
        return undefined;
    }
    
    private extractDescription(content: string): string | undefined {
        // Extract first meaningful paragraph from content
        const cleanText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        
        // Look for sentences that describe the event
        const sentences = cleanText.split(/[.!?]+/);
        for (const sentence of sentences) {
            const trimmed = sentence.trim();
            if (trimmed.length > 50 && 
                !trimmed.includes('©') && 
                !trimmed.includes('info@') &&
                !trimmed.includes('vc_')) {
                return trimmed + '.';
            }
        }
        
        return undefined;
    }
}

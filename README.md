# iCalendar Ripper

A data-driven web scraping tool that generates iCalendar (.ics) files from various websites.

## Overview

iCalendar Ripper allows you to define calendar sources using configuration files and custom "rippers" that extract event information from websites. The tool then generates standardized iCalendar files that can be imported into any calendar application.

## Core Concepts

### Rippers

A "ripper" is a module that knows how to extract calendar events from a specific website or data source. Each ripper consists of:

1. A configuration file (`ripper.yaml`)
2. An implementation file (`ripper.ts`) that extends one of the base ripper classes

### Directory Structure

```
sources/
  ├── source1/
  │   ├── ripper.yaml  # Configuration
  │   └── ripper.ts    # Implementation
  ├── source2/
  │   ├── ripper.yaml
  │   └── ripper.ts
  └── ...
```

## Configuration Schema

Each ripper must have a `ripper.yaml` file with the following schema:

```yaml
name: source-name            # Unique identifier (alphanumeric, dots, hyphens only)
description: "Description"   # Human-readable description
url: "https://example.com"   # Base URL for scraping (can include date templates)
lookahead: P1M               # Optional: ISO-8601 period for how far ahead to look (e.g., P1M = 1 month)
tags: ["Music", "Arts"]      # Optional: Tags for all calendars in this ripper
calendars:                   # Array of calendars to generate from this source
  - name: calendar1          # Unique identifier for this calendar
    friendlyname: "Calendar 1" # Human-readable name
    timezone: America/Los_Angeles # IANA timezone identifier
    tags: ["Jazz", "Live"]   # Optional: Tags specific to this calendar
    config:                  # Optional: Custom configuration passed to the ripper implementation
      key1: value1
      key2: value2
  - name: calendar2
    # ...
```

### URL Templates

The `url` field supports date templates in the format `{yyyy-MM-dd}` which will be replaced with the appropriate date when scraping.

## Implementing a Ripper

To create a new ripper, you need to:

1. Create a directory under `sources/` with your ripper name
2. Create a `ripper.yaml` file following the schema above
3. Create a `ripper.ts` file that implements the `IRipper` interface

### Basic Ripper Implementation

You can implement a ripper by extending either the `HTMLRipper` class for HTML scraping or the `JSONRipper` class for JSON API endpoints:

#### HTML Ripper

```typescript
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { HTMLElement } from 'node-html-parser';
import { ZonedDateTime } from "@js-joda/core";
import { RipperEvent } from "../../lib/config/schema.js";

export default class MyHtmlRipper extends HTMLRipper {
    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        // Extract events from the HTML and return them
        // 'config' contains the calendar-specific configuration from ripper.yaml
        // 'date' is the current date being processed with the timezone from the calendar config
        
        // Return an array of RipperEvent objects
        return [];
    }
}
```

#### JSON Ripper

```typescript
import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { ZonedDateTime, Duration } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";

export default class MyJsonRipper extends JSONRipper {
    public async parseEvents(jsonData: any, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        
        // Extract events from the JSON data
        // 'jsonData' contains the parsed JSON response from the API
        // 'config' contains the calendar-specific configuration from ripper.yaml
        // 'date' is the current date being processed with the timezone from the calendar config
        
        // Process each event in the JSON data
        for (const item of jsonData.events) {
            try {
                const event: RipperCalendarEvent = {
                    id: item.id.toString(),
                    ripped: new Date(),
                    date: ZonedDateTime.parse(item.start_date),
                    duration: Duration.ofHours(2), // Example duration
                    summary: item.title,
                    description: item.description,
                    location: item.location,
                    url: item.url
                };
                events.push(event);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${error}`,
                    context: JSON.stringify(item).substring(0, 100)
                });
            }
        }
        
        return events;
    }
}
```

### Event Interface

Each event must conform to either `RipperCalendarEvent` or `RipperError`:

```typescript
interface RipperCalendarEvent {
    id?: string;             // Optional unique identifier
    ripped: Date;            // When the event was extracted
    date: ZonedDateTime;     // Start date/time of the event
    duration: Duration;      // Duration of the event
    summary: string;         // Event title/summary
    description?: string;    // Optional description
    location?: string;       // Optional location
    url?: string;            // Optional URL
}
```

## Running the Tool

```bash
npm run generate-calendars
```

This will:
1. Load all rippers from the `sources/` directory
2. Process each ripper to extract events
3. Generate .ics files in the `output/` directory
4. Create an `index.html` file with links to all calendars

## Current Limitations

- No support for recurring events
- No support for event updates/deletions (each run creates new .ics files)
- Limited error handling and reporting
- No authentication support for protected websites
- No rate limiting or throttling for API calls
- URL templates only support the `yyyy-MM-dd` format

## Future calendars to add:
- https://www.hotstovesociety.com/classes/
- https://www.events12.com/seattle/
## External Calendars

In addition to scraping websites, you can also include external iCalendar (.ics) URLs directly. To add external calendars:

1. Create or edit the `sources/external.yaml` file
2. Add entries following this format:

```yaml
- name: calendar-name            # Unique identifier (alphanumeric, dots, hyphens only)
  friendlyname: "Calendar Name"  # Human-readable name
  icsUrl: "https://example.com/calendar.ics"  # Direct URL to the .ics file
  infoUrl: "https://example.com"  # Optional: URL to the calendar's website
  description: "Description"     # Optional: Description of the calendar
  disabled: false                # Optional: Set to true to disable this calendar
  tags: ["Music", "Arts"]        # Optional: Tags for this calendar
```

These external calendars will be included in the generated `index.html` file alongside your scraped calendars.
## Tag-Based Aggregation

The system supports tag-based calendar aggregation. Tags can be applied at three levels:

1. **Ripper-level tags**: Applied to all calendars from a specific ripper
2. **Calendar-specific tags**: Applied to a specific calendar within a ripper
3. **External calendar tags**: Applied to external calendars

When the system generates calendars, it will:

1. Generate individual calendar files as usual
2. Create "aggregate calendars" that combine events from all calendars sharing the same tag
3. Include external calendar events in the appropriate aggregate calendars

For example, if you have:
- A "NW Metal Calendar" with the tag "Music"
- A "Seattle Symphony" calendar with the tag "Music"
- An external "Local Bands" calendar with the tag "Music"

The system will generate a "Music" aggregate calendar that includes events from all three sources.

### Tag Inheritance

Calendar-specific tags are combined with ripper-level tags. For example:

```yaml
name: music-events
description: "Music Events"
url: "https://example.com"
tags: ["Music", "Entertainment"]  # Ripper-level tags
calendars:
  - name: jazz
    friendlyname: "Jazz Events"
    timezone: America/Los_Angeles
    tags: ["Jazz"]  # Calendar-specific tags
```

The "jazz" calendar will have the tags: "Music", "Entertainment", and "Jazz".

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
calendars:                   # Array of calendars to generate from this source
  - name: calendar1          # Unique identifier for this calendar
    friendlyname: "Calendar 1" # Human-readable name
    timezone: America/Los_Angeles # IANA timezone identifier
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

The simplest way to implement a ripper is to extend the `HTMLRipper` class:

```typescript
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { HTMLElement } from 'node-html-parser';
import { ZonedDateTime } from "@js-joda/core";
import { RipperEvent } from "../../lib/config/schema.js";

export default class MyRipper extends HTMLRipper {
    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        // Extract events from the HTML and return them
        // 'config' contains the calendar-specific configuration from ripper.yaml
        // 'date' is the current date being processed with the timezone from the calendar config
        
        // Return an array of RipperEvent objects
        return [];
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

- Only HTML scraping is fully supported via the `HTMLRipper` base class
- No support for recurring events
- No support for event updates/deletions (each run creates new .ics files)
- Limited error handling and reporting
- No authentication support for protected websites
- No rate limiting or throttling for API calls
- URL templates only support the `yyyy-MM-dd` format

## Future calendars to add:
- https://www.hotstovesociety.com/classes/
- https://www.events12.com/seattle/

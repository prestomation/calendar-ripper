# Downtown Seattle Association Calendar Ripper

This module parses events from the Downtown Seattle Association website for different venues:

- Occidental Square (venue_id: 53729)
- Pioneer Park (venue_id: 53757)
- Westlake Park (venue_id: 53732)

## Implementation

The ripper extracts event data from JSON-LD structured data embedded in the HTML. It filters events based on the venue ID specified in the configuration.

## Usage

```typescript
import DSARipper from './ripper.js';
import { ZonedDateTime, ZoneRegion } from '@js-joda/core';

const dsaRipper = new DSARipper();
const events = await dsaRipper.parseEvents(
    htmlElement, 
    ZonedDateTime.now(ZoneRegion.of("America/Los_Angeles")), 
    { venue_id: 53729 } // For Occidental Square
);
```

## Event Structure

Each event contains:
- summary: Event title
- date: Start date and time with timezone
- duration: Event duration
- location: Venue name
- description: Event description (HTML tags removed)
- url: Link to event page
- ripped: Timestamp when the event was extracted

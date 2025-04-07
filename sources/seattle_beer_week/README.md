# Seattle Beer Week Ripper

This ripper extracts events from the Seattle Beer Week calendar.

## Overview

Seattle Beer Week is an annual celebration of craft beer in the Seattle area, featuring special events, tastings, and collaborations at breweries, bars, and restaurants throughout the city.

## Configuration

The ripper is configured to extract all events from the Seattle Beer Week API and organize them into a single calendar.

## Data Structure

The API returns events in a nested JSON format with the following structure:

```json
{
  "status": 1,
  "data": {
    "widgets": {
      "e1dc4a9d-c151-4186-b122-c66305fcb381": {
        "status": 1,
        "data": {
          "app": "event-calendar",
          "settings": {
            "events": [
              {
                "id": 12345,
                "title": "Event Title",
                "description": "<p>HTML description</p>",
                "start_date": "2025-05-07 17:00:00",
                "end_date": "2025-05-07 22:00:00",
                "timezone": "America/Los_Angeles",
                "start_date_details": { ... },
                "end_date_details": { ... },
                "venue": {
                  "id": 1001,
                  "venue": "Venue Name",
                  "address": "Street Address",
                  "city": "City",
                  "stateprovince": "State",
                  "zip": "Zip"
                },
                "url": "https://example.com/event",
                "image": {
                  "url": "https://example.com/image.jpg"
                }
              }
            ]
          }
        }
      }
    }
  }
}
```

## Implementation Details

The ripper:
1. Navigates the nested JSON structure to find the events array
2. Extracts event details including title, description, date/time, location, and images
3. Calculates event duration based on start and end times
4. Strips HTML tags from descriptions
5. Includes image URLs in the event description

## Testing

The ripper includes unit tests that verify:
- Correct parsing of event details from the nested JSON structure
- Proper calculation of event durations
- HTML stripping from descriptions
- Image URL handling

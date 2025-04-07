# Pinebox Events Calendar Ripper

This ripper extracts event information from Pinebox's event calendar.

## Data Structure

The Pinebox events data is provided in JSON format with the following structure:

```json
[
  {
    "id": "67be45bf431e4e4f9d2f8556",
    "title": "Tarot Card Reading",
    "fullUrl": "/events/2025/2/28/tarot-card-reading-dl5kh-y7nck",
    "assetUrl": "https://images.squarespace-cdn.com/content/v1/59ce7d1c29f1875fd4041366/1740522898198-5FUL2XMHW80YYXBUW40N/IMG_1549.jpg",
    "structuredContent": {
      "_type": "CalendarEvent",
      "startDate": 1744416000559,
      "endDate": 1744430400559
    },
    "location": {
      "mapZoom": 12,
      "mapLat": 40.7207559,
      "mapLng": -74.0007613,
      "markerLat": 40.7207559,
      "markerLng": -74.0007613
    }
  }
]
```

## Implementation Details

The ripper extracts the following information from each event:

- Event ID
- Title (summary)
- Start date and time
- Duration (calculated from start and end times)
- Location (if available)
- Description (compiled from body and excerpt fields)
- URL (either sourceUrl or constructed from fullUrl)
- Image URL (if available)

## Configuration

The ripper is configured to look ahead 3 months and categorizes events with the tags "Entertainment", "Events", and "Nightlife".

## Sample Data

Sample data is provided in the `pinebox-2025-04-06.json` file.

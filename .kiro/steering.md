# iCalendar Ripper - Project Steering

## Project Overview

iCalendar Ripper is a data-driven web scraping tool that generates iCalendar (.ics) files from various websites. It uses a modular "ripper" architecture to extract event information from different sources and convert them into standardized calendar files.

## Core Architecture

### Rippers
- Modular components that extract events from specific websites
- Each ripper has a `ripper.yaml` config and `ripper.ts` implementation
- Two base classes: `HTMLRipper` for HTML scraping, `JSONRipper` for API endpoints
- Located in `sources/` directory with subdirectories per source

### Configuration Schema
- `ripper.yaml` defines source metadata, calendars, and custom config
- Supports URL templates with `{yyyy-MM-dd}` date placeholders
- Calendar-specific configuration passed to ripper implementations
- Tag-based organization for calendar aggregation

### Event Processing
- Events conform to `RipperCalendarEvent` interface with required fields: `id`, `ripped`, `date`, `duration`, `summary`
- Optional fields: `description`, `location`, `url`
- Error handling via `RipperError` type for parse failures

## Key Components

### Directory Structure
```
sources/           # Ripper implementations
lib/              # Core library code
output/           # Generated .ics files
sources/external.yaml  # External calendar URLs
```

### Base Classes
- `HTMLRipper`: Extends for HTML scraping with `parseEvents(html, date, config)`
- `JSONRipper`: Extends for JSON APIs with `parseEvents(jsonData, date, config)`

### Tag System
- Ripper-level tags apply to all calendars in that ripper
- Calendar-specific tags combine with ripper tags
- Automatic aggregate calendar generation by tag
- External calendars support tags for aggregation

## Development Workflow

1. Create ripper directory under `sources/`
2. Define `ripper.yaml` with source configuration
3. Implement `ripper.ts` extending appropriate base class
4. Run `npm run generate-calendars` to process all sources
5. Output generates individual and aggregate .ics files plus index.html

## Adding New Sources - Best Practices

### 1. API Discovery (Preferred)
Always check for APIs before HTML scraping:
- Look for WordPress REST API: `/wp-json/wp/v2/`
- Check for custom APIs in network requests or page source
- Search for JSON endpoints: `grep -i "api\|json\|endpoint"`
- APIs provide structured data and are more reliable than HTML parsing

### 2. Choose Ripper Type
- **JSONRipper**: For APIs, RSS feeds, or JSON endpoints (preferred)
- **HTMLRipper**: Only when no API is available

### 3. Date Inference Strategy
Implement smart date parsing:
```typescript
// Check if date is more than 7 days in past, assume next year
const daysDiff = (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
if (daysDiff < -7) {
    // Move to next year
}
```

### 4. Location Filtering
For multi-region sources, implement location filtering:
- Define location keywords (seattle, pacific place, magnuson park, etc.)
- Filter events based on title, location, and description content
- Only apply if filtering is deterministic and reliable
- Consider separate calendars for different regions

### 5. Tag Validation
Use the tag validation system:
```typescript
import { validateTags } from "../../lib/config/tags.js";
const tagValidation = validateTags(allTags);
```
All tags must be defined in `lib/config/tags.ts`

### 6. Error Handling
Return structured errors for debugging:
```typescript
return {
    type: "ParseError",
    reason: "Specific error description",
    context: "Additional context for debugging"
};
```

### 7. Testing Strategy
- Test with `npm run generate-calendars`
- Verify event count and error messages
- Check generated .ics file content
- Validate dates are in correct year/timezone

### 8. Unit Testing Requirements
Every ripper must include a unit test file (`ripper.test.ts`) with:
- Mock data representing the expected API/HTML response format
- Tests for successful event parsing with valid data
- Tests for error handling with invalid/missing data
- Tests for filtering logic (if applicable)
- Validation of parsed event fields (date, title, location, etc.)

Example test structure:
```typescript
describe('MyRipper', () => {
    it('should parse events from mock data', async () => {
        const mockData = /* realistic mock response */;
        const events = await ripper.parseEvents(mockData, testDate, {});
        expect(events).toHaveLength(expectedCount);
        expect(events[0]).toHaveProperty('summary', 'Expected Title');
    });
});
```

## Current Limitations
- No recurring event support
- No event updates/deletions (full regeneration each run)
- No authentication for protected sites
- No rate limiting
- Limited URL template format support

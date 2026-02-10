# AI Agent Guidelines

## Project Context

This repository contains steering files to help AI agents understand the project structure and architecture:

- **`.kiro/steering.md`** - Comprehensive project overview including architecture, core components, development workflow, and current limitations

## For AI Agents

When working with this codebase, please review the steering file first to understand:
- The ripper-based architecture for web scraping
- Configuration schema and directory structure  
- Base classes for HTML and JSON scraping
- Event processing and tag-based aggregation
- Current development workflow and limitations

The steering file provides essential context for making informed decisions about code changes, new feature implementations, and maintaining consistency with the existing architecture.

### Development Workflow

**NEVER push directly to main branch.** Always:
1. Create a feature branch for changes
2. Make commits to the feature branch
3. Open a Pull Request to merge into main
4. Wait for review and approval before merging

This ensures proper code review and prevents breaking the production deployment.

## Calendar Integration Strategy

When adding a new calendar source to the project, follow this priority order:

### 1. ICS/iCal Feed (Best Case)

Look for existing ICS/iCal calendar feeds first. This is the preferred method because:
- Standard calendar format with well-defined schema
- Minimal maintenance required
- No parsing logic needed
- Add to `sources/external.yaml` with the ICS URL

**How to find ICS feeds:**
- Check for "Subscribe" or "Export Calendar" links on the website
- Look for `webcal://` or `.ics` URLs
- Check calendar widgets for export options
- Search the page source for "ics", "ical", or "calendar"

### 2. API (Second Best)

If no ICS feed exists, look for a public API:
- Check browser Network tab for API calls
- Look for API documentation or developer portals
- Search for API endpoints that return event data
- Most commonly implement a `JSONRipper` subclass in `sources/<name>/ripper.ts`
- For other data formats, create appropriate base Ripper classes as needed (e.g., XMLRipper, CSVRipper)

**Common API patterns:**
- REST endpoints: `/api/events`, `/events.json`
- Calendar platforms: Localist, Eventbrite, Tribe Events
- Check if site uses a known calendar platform (they often have APIs)

### 3. HTML Scraping (Last Resort)

Only implement HTML parsing if no ICS feed or API is available:
- More fragile and requires ongoing maintenance
- Implement an `HTMLRipper` subclass in `sources/<name>/ripper.ts`
- Include `sample-data.html` for testing
- Document any preprocessing needed for the HTML

**When scraping HTML:**
- Use CSS selectors to target event data
- Handle missing fields gracefully
- Test thoroughly with sample data
- Add comments explaining the HTML structure

### Investigation Process

Before implementing, always:
1. Check **`ideas.md`** first — it contains pre-researched calendar sources with feed URLs, platform details, and implementation notes
2. Check the website for ICS/calendar export options
3. Inspect network traffic for API endpoints
4. Search for the calendar platform being used (e.g., CitySpark, Localist)
5. Check if the platform has public API documentation
6. Only fall back to HTML scraping if the above fail

When you implement a source from `ideas.md`, remove its entry from the file so the list stays current.

## Tags

Tags drive the aggregate calendar system — each unique tag produces a `tag-<name>.ics` file that combines events from every source sharing that tag. The build **fails** if any tag is not in the allowlist.

### Adding a new tag

1. Check `lib/config/tags.ts` (`VALID_TAGS`) for an existing tag that fits. Use it if one exists.
2. Before creating a new tag, search all config files for similar names to avoid duplicates (e.g., `"Capitol Hill"` vs `"CapitolHill"`, `"Queen Anne"` vs `"QueenAnne"`). The tag name becomes part of the ICS URL (`tag-<lowercased>.ics`), so different spellings create separate calendars.
3. If no existing tag fits, add the new tag to `VALID_TAGS` in `lib/config/tags.ts` in the appropriate category section (Neighborhood, Activity, Market, or Community).
4. Use the tag in the source's `tags` array in its YAML config.

### Tag naming conventions

- Neighborhood tags use natural casing with spaces: `"Capitol Hill"`, `"West Seattle"`, `"Pioneer Square"`
- Activity/type tags use PascalCase without spaces: `"FarmersMarket"`, `"MakersMarket"`
- Single-word tags are capitalized: `"Music"`, `"Beer"`, `"Dogs"`

### Validation

Tag validation runs at build time in `lib/calendar_ripper.ts`. It collects all unique tags from rippers, external calendars, and recurring calendars, then checks them against `VALID_TAGS`. Invalid tags cause the build to fail with the offending tag names listed in the error message.

## Unit Tests

Unit tests for rippers are located in the individual ripper directories alongside the implementation files:

```
sources/
  ├── ripper-name/
  │   ├── ripper.yaml      # Configuration
  │   ├── ripper.ts        # Implementation  
  │   ├── ripper.test.ts   # Unit tests
  │   └── sample-data.html # Test data (optional)
```

### Test Framework
- Uses **Vitest** as the test framework
- Tests should cover:
  - Event extraction from sample HTML/JSON data
  - Error handling for malformed data
  - Deduplication logic (if applicable)
  - Date/time parsing accuracy
  - Event property validation

### Test Guidelines
- Include sample HTML/JSON files for realistic testing
- Test both success and failure scenarios
- Verify event properties (summary, date, duration, location, etc.)
- Test deduplication across multiple parseEvents calls
- Ensure graceful handling of missing or malformed data

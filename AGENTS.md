# AI Agent Guidelines

## Skills

Agent skills live in `skills/` in this repo. These define the operational procedures for maintaining 206.events:

- **`skills/build-report/SKILL.md`** — Daily build health check, error fixing, and geo error resolution
- **`skills/source-discovery/SKILL.md`** — Find, evaluate, and add new Seattle event sources
- **`skills/geo-resolver/SKILL.md`** — Resolve geocode errors in the geo-cache and fill OpenStreetMap IDs on venues
- **`skills/calendar-verification/SKILL.md`** — Verify recurring calendars and `expectEmpty` sources against their live URLs and auto-fix safe drift via PR
- **`skills/event-uncertainty-resolver/SKILL.md`** — Resolve outstanding `UncertaintyError` entries (typically unknown start times) by investigating the source page and writing values into `event-uncertainty-cache.json`

## Adding New Calendar Sources

**Always follow `skills/source-discovery/SKILL.md`** when adding a new calendar source — do not do it ad-hoc. The skill includes a mandatory quality-gate checklist (step 4) that checks whether the source already exists under `sources/external/`, `sources/recurring/`, or `sources/*/ripper.yaml`. Skipping the skill risks duplicating existing sources, missing the "check existing sources" step, and bypassing other guardrails (event volume verification, Amazon Q iteration, etc.).

## Source Candidate Tracking

Source discovery findings are stored **one file per candidate** under
**`docs/source-candidates/<slug>.md`**. Each file has YAML frontmatter
with the candidate's status (`candidate`, `investigating`, `added`,
`proxy`, `blocked`, `notviable`, `dead`) and freeform notes in the body.
See `docs/source-candidates/README.md` for the schema.

The chronological discovery log (date-stamped entries from daily scans)
lives in `docs/source-candidates.md` — that file is now log-only.

When implementing a candidate, flip its `status:` frontmatter and add
the PR number. The daily cron reads `docs/source-candidates/` to avoid
re-proposing the same sources.

**Feature ideas** (not source-specific) live in `ideas.md` in the repo root.

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
3. Open a Pull Request — the harness creates it as a **draft** by default; that's fine
4. Immediately subscribe to PR activity: `mcp__github__subscribe_pr_activity`
5. Monitor `<github-webhook-activity>` events for CI results and Amazon Q review. When **all** of the following are true:
   - All CI checks pass
   - All of Amazon Q's comments are confidently addressed (fixed or replied to with clear reasoning)
   …then in a single turn:
   a. Convert draft → ready: `mcp__github__update_pull_request` with `draft: false`
   b. Merge the PR directly: `mcp__github__merge_pull_request` (squash method)

**Do not use `enable_pr_auto_merge`** — unresolved conversation threads block auto-merge, and the GraphQL thread node IDs needed to resolve them programmatically are not available via the MCP tools. Merge directly once you are confident all feedback has been addressed.

**After pushing follow-up commits to a PR, you MUST post a top-level PR comment that re-triggers Amazon Q with explicit feedback asks.** The bare `/q review` trigger has proven unreliable — Q sometimes parses it as a non-command. Always include a concrete prompt asking Q to evaluate the new commits against the following dimensions:

- Repository standards (conventions documented in AGENTS.md, CLAUDE.md, and `.kiro/steering.md`)
- Correctness (logic bugs, edge cases, off-by-one, missing null checks)
- Security (input validation, auth, secrets handling, injection, supply-chain)
- Performance (hot loops, N+1s, unnecessary allocations, bundle size)
- Maintainability (clarity, naming, separation of concerns, test coverage)
- Anything else the contributor thinks Q should weigh in on (call this out by name)

Template:

```
/q review

Please re-review the latest commit(s) on this PR with feedback on:
- Repository standards (AGENTS.md / CLAUDE.md / steering)
- Correctness
- Security
- Performance
- Maintainability
- <any PR-specific area worth highlighting>
```

Without an explicit re-review trigger, Q's review stays anchored to the original commit and you'll never know whether your fixes addressed its feedback.

**After addressing a review comment, reply to the thread with your reasoning** (fix pushed or explanation of why no action is needed). Thread resolution via `mcp__github__resolve_review_thread` requires GraphQL node IDs that are not exposed by the current MCP tools — skip the formal resolve step and proceed to merge once all comments are addressed.

## Calendar Integration Strategy

When adding a new calendar source to the project, follow this priority order:

### 1. ICS/iCal Feed (Best Case)

Look for existing ICS/iCal calendar feeds first. This is the preferred method because:
- Standard calendar format with well-defined schema
- Minimal maintenance required
- No parsing logic needed
- Add a new file `sources/external/<name>.yaml` with the ICS URL (one entry per file)

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

**Built-in rippers for common platforms:**

If the site uses one of these platforms, use the corresponding `type` in `ripper.yaml` instead of writing a custom ripper:

| Platform | `type` value | Config fields (per calendar) |
|---|---|---|
| DICE | `dice` | `venueName` (required, as shown on DICE), `defaultLocation`, `defaultDurationHours` (optional, default 3) |
| Eventbrite | `eventbrite` | `organizerId` (required), `defaultLocation`, `defaultDurationHours` (optional, default 2) |
| Squarespace | `squarespace` | see `lib/config/squarespace.ts` |
| Ticketmaster | `ticketmaster` | see `lib/config/ticketmaster.ts` |
| AXS | `axs` | `venueId`, `venueSlug`, `venueName`, `venueAddress` |

Example `ripper.yaml` for an Eventbrite organizer:
```yaml
name: my-venue
type: eventbrite
description: "My Venue"
url: "https://www.my-venue.com/events"
friendlyLink: https://www.my-venue.com/events
tags: ["Music", "Capitol Hill"]
calendars:
  - name: my-venue
    friendlyname: "My Venue Events"
    timezone: America/Los_Angeles
    config:
      organizerId: "12345678901"
      defaultLocation: "123 Main St, Seattle, WA 98101"
      defaultDurationHours: 3   # optional, defaults to 2
```

Tests for built-in rippers live alongside the implementation in `lib/config/` (e.g., `lib/config/eventbrite.test.ts`) and draw on sample data from the source directories they were developed against.

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
1. Check **`docs/source-candidates.md`** first — it contains pre-researched calendar sources with feed URLs, platform details, and implementation notes
2. Check the website for ICS/calendar export options
3. Inspect network traffic for API endpoints
4. Search for the calendar platform being used (e.g., CitySpark, Localist)
5. Check if the platform has public API documentation
6. Only fall back to HTML scraping if the above fail

When you implement a source from `ideas.md`, remove its entry from the file so the list stays current.

### Free First Thursday

Many Seattle area museums offer free admission on the first Thursday of each month. There is a catch-all recurring entry (`free-first-thursday`) in `sources/recurring/free-first-thursday.yaml` that covers museums without their own ripper. Museum rippers that **do** exist should also surface this event:

1. If the source website lists a "Free First Thursday" event with a concrete date, include it normally.
2. If the website lists it with a vague recurring description (e.g., "First Thursday of each month") or doesn't list it at all, the ripper should **synthesize** concrete dated Free First Thursday events for the next few first Thursdays.

Examples:
- **Burke Museum** (`sources/burke_museum/ripper.ts`): detects "first \w+ of each month" pattern and synthesizes dated events with the hours from the page.
- **SAM** (`sources/sam/ripper.ts`): after parsing, checks if any Free First Thursday event was found per venue; if not, synthesizes events using known FFT hours.

When adding a new museum source, check whether it participates in Free First Thursday (most do). If so, add synthesis logic following the patterns above. Also update the `free-first-thursday` recurring entry description in `sources/recurring/free-first-thursday.yaml` if the museum is not already listed there.

## Expected-Empty Calendars (`expectEmpty`)

Some calendars legitimately produce zero events — small venues with intermittent programming, seasonal sources, or individual branches of a larger system (e.g., one SPL branch out of 26). By default, the build warns about any calendar with 0 events. The `expectEmpty` flag suppresses this warning so that only genuinely broken sources surface as problems.

### Usage

Add `expectEmpty: true` at the **ripper level** (applies to all calendars in that ripper) or at the **calendar level** (per-calendar override):

```yaml
# Ripper-level: all calendars in this ripper may be empty
name: seattle-barkery
expectEmpty: true
calendars:
  - name: all-events
    friendlyname: "The Seattle Barkery"
    timezone: America/Los_Angeles
```

```yaml
# Calendar-level: only one specific calendar may be empty
name: spl
calendars:
  - name: central-library
    friendlyname: "SPL - Central Library"
    timezone: America/Los_Angeles
  - name: university
    friendlyname: "SPL - University Branch"
    timezone: America/Los_Angeles
    expectEmpty: true  # Small branch; may have no events in a given window
```

External calendars in `sources/external/<name>.yaml` also support `expectEmpty: true`.

### Behavior

- Calendars with `expectEmpty: true` that produce 0 events are **not** flagged with `::warning::` in CI
- They appear in `build-errors.json` under `expectedEmptyCalendars` instead of `zeroEventCalendars`
- The GitHub Actions summary shows them as "0 (expected)" rather than "⚠️ 0"

### When to use

- Small venues or organizations with intermittent events
- Individual branches/locations of a larger source where some may have no upcoming events
- Sources with seasonal programming (e.g., outdoor markets in winter)
- Ticketmaster/API sources that may not list events far enough ahead

### When NOT to use

- Sources that are broken (404, 403, API changes) — these should be investigated or disabled
- Sources that should always have events — leave them without the flag so problems are caught

## Tags

Tags drive the aggregate calendar system — each unique tag produces a `tag-<name>.ics` file that combines events from every source sharing that tag. **Tags don't need to be pre-registered**: any string a source uses in its `tags:` field is valid. The build only fails on **near-duplicate spellings** (e.g. `"Capitol Hill"` vs `"CapitolHill"`), since those produce divergent ICS URLs and are almost always typos.

### Adding a new tag

1. Check `lib/config/tags.ts` (`TAG_CATEGORIES`) for an existing tag that fits. Use it if one exists.
2. Before introducing a new tag, search all config files for similar names to avoid near-duplicates. The tag name becomes part of the ICS URL (`tag-<lowercased>.ics`), so different spellings create separate calendars.
3. Use the tag in the source's `tags` array in its YAML config — that's it. Optionally add it to `TAG_CATEGORIES` so the website sidebar groups it under a real category instead of "Other"; uncategorized tags still appear in the UI.

### Tag naming conventions

- Neighborhood tags use natural casing with spaces: `"Capitol Hill"`, `"West Seattle"`, `"Pioneer Square"`
- Activity/type tags use PascalCase without spaces: `"FarmersMarket"`, `"MakersMarket"`
- Single-word tags are capitalized: `"Music"`, `"Beer"`, `"Dogs"`

### Validation

Tag validation runs at build time in `lib/calendar_ripper.ts`. It collects all tags from rippers, external calendars, and recurring calendars, then runs `detectTagDuplicates` from `lib/config/tags.ts`. The build fails when two tags collapse to the same case- and whitespace-stripped form, with the offending spellings listed in the error.

### Removing or renaming a calendar URL

The CI runs `scripts/check-missing-urls.ts` which compares the new build's manifest against the deployed site. If any existing calendar URL would disappear (e.g., renaming a tag changes the `tag-*.ics` filename), the check fails.

To intentionally remove a URL, create an empty file `allowed-removals/<filename>` (one file per removal — splitting per-file avoids merge conflicts when multiple PRs add removals concurrently). Delete the file after the change has been deployed.

## Discovery API

Every build publishes a set of HATEOAS-style JSON files under `output/` that
programmatic consumers (LLMs, scripts, downstream apps) can use to enumerate
everything without scraping the HTML site. The builders live in
`lib/discovery.ts` (pure functions, unit-tested in `lib/discovery.test.ts`)
and are invoked from `lib/calendar_ripper.ts` near the end of the build.

### Files

- **`index.json`** — entry point. Contains a `links` object pointing at every
  other data file with a relative href.
- **`tags.json`** — one entry per tag with its category, event count,
  calendar count, and the hrefs of its `tag-<slug>.ics` / `.rss` aggregate
  feeds.
- **`venues.json`** — one entry per source with a fixed physical `geo`.
  Includes rippers, external feeds, and recurring events whose `geo` is
  not `null`. The way events are sourced is orthogonal to whether the
  place is a venue.
- **`llms.txt`** — static usage info at the site root following the
  llmstxt.org convention. Source lives at `lib/templates/llms.txt`.
- **`sitemap.xml`** — points crawlers at the discovery entry points.

### The required `geo` field

Every ripper (`configSchema.geo`), external calendar (`externalCalendarSchema.geo`),
and recurring event (`recurringEventSchema.geo`) must explicitly declare
`geo` as either a `{lat, lng, label?}` object (the source has a single
fixed physical location) or `null` (the source is a community calendar,
multi-neighborhood art walk, or other non-venue). There is no default —
the build fails if `geo` is missing, so every source is an explicit
decision about whether it belongs in `venues.json`.

Multi-branch rippers like `spl` may set ripper-level `geo: null` and then
provide a per-calendar `geo` on each branch that resolves to a non-null
object. The venues builder emits one venue entry per branch in that case.

### Validation

`scripts/check-discovery-api.ts` runs in CI after the build. It parses
each discovery doc against its Zod schema, crawls every href to assert
the target exists on disk, enforces PNW bounding-box sanity on venue
coordinates, budgets `venues.json` at 100 KB, and asserts tag-slug
parity with `lib/tag_aggregator.ts`. Run locally with
`npm run check-discovery-api`.

`scripts/check-missing-urls.ts` additionally enforces that the set of
required discovery data files (`index.json`, `llms.txt`, `tags.json`,
`venues.json`, `manifest.json`, `events-index.json`, `build-errors.json`,
`geo-cache.json`, `sitemap.xml`) is present on disk.

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

### Running Tests
- Run **`npm run test:all`** to execute both calendar generation tests and web tests in one command. This is the same target used in CI.
- `npm run test` runs only the calendar/ripper tests; `npm run test:web` runs only the web UI tests.

### Test Framework
- Uses **Vitest** as the test framework
- Tests should cover:
  - Event extraction from sample HTML/JSON data
  - Error handling for malformed data
  - Deduplication logic (if applicable)
  - Date/time parsing accuracy
  - Event property validation

### Sample Data
- **Always fetch live data** from the actual API/URL before writing the parser. Do not rely solely on documentation or assumptions about the data format.
- Save a representative response as `sample-data.json` (or `sample-data.html`) and use it for tests.
- Ensure the sample covers format variations present in the real data (e.g., dates with and without timezone offsets, optional fields that are sometimes null).

### Test Guidelines
- Include sample HTML/JSON files for realistic testing
- Test both success and failure scenarios
- Verify event properties (summary, date, duration, location, etc.)
- Test deduplication across multiple parseEvents calls
- Ensure graceful handling of missing or malformed data

## Authenticated Proxy

Some upstream sites (e.g., AXS, AMC) block requests from GitHub Actions runner IPs with 403 errors. An authenticated Lambda proxy in AWS forwards these requests from non-blocked IPs.

See **`infra/authenticated-proxy/README.md`** for deployment and architecture details.

### Enabling the proxy for a ripper

Add `proxy: true` to the ripper's `ripper.yaml`:

```yaml
name: amc
proxy: true
url: "https://graph.amctheatres.com/graphql"
```

When `proxy: true` and the `PROXY_URL` environment variable is set, all fetch calls for that ripper are routed through the Lambda proxy. If `PROXY_URL` is not set (local development), requests go directly to the upstream.

### How it works

- `lib/config/proxy-fetch.ts` exports `proxyFetch` and `getFetchForConfig` utilities
- Base classes (`HTMLRipper`, `JSONRipper`) and built-in rippers (`AXS`, `Squarespace`, `Ticketmaster`) automatically use the proxy when the config flag is set
- Custom rippers that implement `IRipper` directly should use `getFetchForConfig(ripper.config)` to get a proxy-aware fetch function

### Enabling the proxy for an external ICS calendar

External calendars (`sources/external/<name>.yaml`) can also be marked
`proxy: outofband` when their ICS URL 403s from GitHub Actions:

```yaml
# sources/external/example.yaml
- name: example
  friendlyname: "Example Blocked Feed"
  icsUrl: "https://example.com/calendar.ics"
  proxy: outofband
  geo: null
```

The out-of-band runner (`scripts/generate-outofband.ts`) fetches the ICS
from its residential IP, writes it to `output/external-<name>.ics`, and
records an entry under `report.externalCalendars` in `outofband-report.json`.
The main GitHub Actions build skips the live fetch for these calendars and
picks up the pre-fetched ICS file via `download-outofband.ts`. If the
outofband report is missing or has no entry for the calendar (e.g. on a
fork PR with no S3 credentials), the calendar is silently absent from the
build — same as outofband rippers.

## Parse Methods Must Never Return Null

Parse methods (like `parseProduct`, `parseProductHtml`, `parseEventPage`) **must return `RipperCalendarEvent | RipperError`** — never `null`.

TypeScript enforces this at compile time: if a parse method's return type doesn't include `null`, the compiler will catch any code path that silently drops an item.

**Required pattern — parse method signature:**
```typescript
parseProductHtml(html: string, url: string): RipperCalendarEvent | RipperError
```

**Required pattern — caller:**
```typescript
const result = this.parseProductHtml(html, url);
if ('date' in result) events.push(result);
else errors.push(result); // It's a ParseError
```

**Filters and dedup belong in the caller, not the parse method.** Move these out:
- **Deduplication** (`seen.has(key)`) — check after parsing, skip in caller
- **Intentional content filters** (e.g., "members free RSVP" titles) — check before calling parse, skip in caller
- **Type checks** (e.g., `@type !== 'Event'`) — check in caller or return ParseError with clear reason

**Why:** If parse methods can return `null`, someone will forget to check it, and items get silently dropped. By making the return type `RipperCalendarEvent | RipperError`, TypeScript guarantees every code path either produces an event or reports why it couldn't. The build report then surfaces every gap: "8 events, 2 errors" instead of "8 events, 0 errors".

**Existing rippers still returning `null`** (events12, dogwoodplaypark, spectrum_dance, etc.) should be migrated to this pattern incrementally.

## Ripper Design: Stable Event IDs

Every ripper must populate `RipperCalendarEvent.id` with a value
**derived deterministically from the source content**. The id is the
join key for the event-uncertainty-cache, for client-side dedup, and
for cross-build identity — anything that derives it from non-source
state (timestamps, array indices, randomness) silently invalidates
cache entries on every build and breaks identity-tracking downstream.

**Required:** id = some stable hash of source content. Title + date
works for most sources. Upstream event ids are even better when
available.

```ts
// ✅ Stable across builds
const id = `${slugify(title)}-${date.toLocalDate().toString()}`;

// ❌ Different every build — breaks the uncertainty cache
const id = `event-${Date.now()}-${Math.random()}`;

// ❌ Depends on iteration order, which can shift when source data changes
const id = `${source}-${index}`;
```

When a single day has multiple showings (e.g. a "5 & 8 p.m." double
feature), include a deterministic slot suffix (`-1700` / `-2000`) so
the showings get distinct ids without disturbing ids on single-showing
days.

## Event Uncertainty System

Rippers signal uncertainty about an event's fields (start time,
duration, location, image) by emitting an `UncertaintyError` alongside
the event — both share the same `event.id`. The infrastructure
(`lib/uncertainty-merge.ts`) merges these against
`event-uncertainty-cache.json` between rip and ICS write:

- Cache hit "resolved" → apply the cached fields, drop the error.
- Cache hit "unresolvable" → drop the error, append a "could not be
  verified" note to the event description.
- Cache miss → keep the error, append an "approximate — pending"
  note to the event description.

The cache itself is populated by the **event-uncertainty-resolver
skill**, which fetches the upstream source page, extracts the missing
field, and writes a resolution into S3. Same plumbing as the
geo-cache: empty file committed, live data lives in S3, GitHub Actions
artifact serves as backup.

**Why it exists:** Quietly defaulting unknown values (e.g. "no time on
the page → set to noon") publishes a guess that looks like a fact.
This system makes the uncertainty explicit, surfaces it in every
reporting channel, and lets an LLM resolve it across builds without
re-doing the work each time.

**Outstanding uncertain events count toward `totalErrors`** so they
don't get forgotten, but they're **not fatal** — they don't block CI.
The resolver drains the queue across builds.

The full design lives in `docs/event-uncertainty.md`. When opting a
ripper into this system, see `sources/events12/ripper.ts` for the
canonical pattern (emit event + `UncertaintyError` with same id, with
a `partialFingerprint` so the cache invalidates if source content
changes).

## Reporting Parity

`output/build-errors.json` is the single source of truth for build
health. Every other reporting surface reads from it: the PR comment
(`.github/workflows/pr-preview.yml`), the main build step summary
(`lib/calendar_ripper.ts` writing to `$GITHUB_STEP_SUMMARY`), the
Discord notification (`.github/workflows/notify-discord.yml`), the
website health dashboard (`web/src/App.jsx`), and the build-report
skill (`skills/build-report/`).

**Hard rule: when you add a new error category or counter, you MUST
plumb it through every reporting surface in the same PR.** Surfaces
that don't see a category effectively don't enforce it, so a missing
reporter means the category accumulates silently.

The existing categories — parse errors, geocode errors, zero-event
calendars, expected-empty, uncertain events, OSM gaps — are all
plumbed through every surface. Use them as templates.

## Writing Descriptions

The `description` field is used as the `<h2>` section heading on the website for rippers, and as supplementary info for external calendars.

- **`ripper.yaml`** — Use just the name of the venue or organization. The heading should be short and recognizable.
  - **Good:** `"Stoup Brewing"`, `"BBYC Ballard (Bale Breaker & Yonder Cider)"`, `"Seattle Theatre Group - Paramount, Moore, and Neptune Theatres"`
  - **Bad:** `"Major Seattle brewery in Fremont with food trucks, beer releases, and community events"`

- **`sources/external/<name>.yaml`** — A sentence or two describing what the source covers is appropriate and encouraged. Help a reader understand what kinds of events to expect.
  - **Good:** `"GeekWire Events attract thousands of people to network, learn, recruit, and do business across the Pacific Northwest tech community"`
  - **Good:** `"Seattle's online hub for dance events, classes, and performances - covering contemporary, ballet, hip-hop, and more"`

Don't mention APIs, scraping methods, or other implementation details in either case.

**Never rename or reformat the `name` field of an existing source.** The `name` drives the output filename (e.g. `external-Geekwire.ics`). Changing it silently removes the old URL from the deployed site, requiring an entry under `allowed-removals/` and breaking any subscribers. If you think a name is wrong, ask first.

## Geo-Cache (`geo-cache.json`)

`geo-cache.json` is committed to the repository and stores resolved geographic coordinates for event locations. It is the source of truth for geocoding and is used by both the main calendar build and the out-of-band ripper.

### How it works

- **Venue-level coords** — Sources with a fixed address set `geo: { lat, lng }` in `ripper.yaml`. These are applied to all events for that source without any network call.
- **Per-event geocoding** — For sources with variable event locations (e.g., community calendars), each `event.location` string is looked up via Nominatim and cached here. Cache entries include `lat`, `lng`, `geocodedAt`, and `source: "nominatim"`. Unresolvable locations are stored with `unresolvable: true` so they are not retried.
- **Out-of-band** — `scripts/generate-outofband.ts` loads and saves `geo-cache.json` the same way as the main build, and also uploads it to S3 (`latest/geo-cache.json`) so the main GH Actions build can fall back to it if the GH Actions cache is cold.

### Cache strategy (S3 as source of truth)

S3 is the live store for `geo-cache.json`. The build and outofband scripts both download from S3 at start and upload back on completion. The committed file is an empty baseline — **never commit a populated cache to the repo**.

1. **S3** (`$OUTOFBAND_BUCKET/latest/geo-cache.json`) — primary live store. Both `build-calendars.yml` and `generate-outofband.ts` download at start and upload on completion. Requires the GH Actions IAM role to have `s3:PutObject` on the outofband bucket (in addition to `GetObject`).
2. **GH Actions artifact** (`geo-cache` artifact, 90-day retention) — reliable fallback uploaded by every build with `if: always()`. Useful if S3 upload is unavailable.
3. **Committed file** — empty cold-start baseline only. Used when both S3 and credentials are unavailable (e.g. fork PRs with no secrets). Never populate and commit this file — let S3 and artifacts handle persistence.

### Manually fixing or adding entries

To fix a bad geocode result or manually add a location, edit `geo-cache.json` directly:

```json
{
  "version": 1,
  "entries": {
    "123 main st, seattle, wa": {
      "lat": 47.6062,
      "lng": -122.3321,
      "geocodedAt": "2026-03-26",
      "source": "nominatim"
    },
    "some unresolvable place": {
      "unresolvable": true,
      "geocodedAt": "2026-03-26",
      "source": "nominatim"
    }
  }
}
```

Keys are the **lowercased, trimmed** location string (matching what `normalizeLocationKey()` in `lib/geocoder.ts` produces). After editing, commit the file and open a PR — the change will take effect on the next build.

To mark a previously-unresolvable location as now-valid, simply delete its entry so it will be re-tried, or set the correct `lat`/`lng` and remove `unresolvable`.

## Build Errors JSON

Every build writes `output/build-errors.json` with a consolidated report of all errors that occurred during calendar generation. This file is deployed alongside the website artifacts, so it can be read programmatically after a PR preview without needing access to the build logs.

### Accessing from a PR preview

PR previews are deployed to the `gh-pages` branch under `/preview/{PR_NUMBER}/`. Given a PR number, fetch the errors file at:

```
https://raw.githubusercontent.com/prestomation/calendar-ripper/gh-pages/preview/{PR_NUMBER}/build-errors.json
```

For example, PR #42:
```
https://raw.githubusercontent.com/prestomation/calendar-ripper/gh-pages/preview/42/build-errors.json
```

### Schema

```json
{
  "buildTime": "2026-02-21T17:00:00.000Z",
  "totalErrors": 5,
  "configErrors": [
    { "type": "FileParseError", "reason": "...", "path": "..." },
    { "type": "ImportError", "reason": "...", "error": "...", "path": "..." }
  ],
  "sources": [
    {
      "source": "ripper-name",
      "calendar": "calendar-name",
      "type": "Ripper | Recurring",
      "errorCount": 3,
      "errors": [
        { "type": "ParseError", "reason": "...", "context": "..." }
      ]
    }
  ],
  "externalCalendarFailures": [
    {
      "name": "calendar-name",
      "friendlyName": "Friendly Name",
      "url": "https://example.com/cal.ics",
      "error": "HTTP 404: Not Found"
    }
  ],
  "zeroEventCalendars": ["ripper-calendar", "external-calendar"],
  "expectedEmptyCalendars": ["calendar-with-expect-empty-flag"]
}
```

- **`configErrors`** — errors loading ripper configs (missing `ripper.yaml`, import failures)
- **`sources`** — per-calendar parse errors from Ripper and Recurring calendars (only entries with errors are included). Aggregate (`tag-*`) calendars are intentionally excluded — every error there is a duplicate of an upstream ripper error, and counting them inflates the build error count by the number of tags each broken source belongs to.
- **`externalCalendarFailures`** — external ICS feeds that failed to fetch
- **`zeroEventCalendars`** — calendar names that produced 0 events **unexpectedly** (may indicate a problem)
- **`expectedEmptyCalendars`** — calendar names with `expectEmpty: true` that produced 0 events (not a problem)
- **`fatal`** — present only when the build crashed entirely; contains the fatal error message

## Troubleshooting Production Errors

### Finding the Error Report

The production `build-errors.json` is deployed with the site at:

```
https://206.events/build-errors.json
```

For PR previews, use:
```
https://raw.githubusercontent.com/prestomation/calendar-ripper/gh-pages/preview/{PR_NUMBER}/build-errors.json
```

### Common Error Patterns and Fixes

#### HTTP 403 Forbidden from Rippers

**Symptom:** `Ripper crashed: Error: ... returned HTTP 403` in `sources[].errors`

**Cause:** The upstream website is blocking requests from GitHub Actions runner IPs.

**Fix:**
1. Add `proxy: true` to the ripper's `ripper.yaml`
2. If the ripper uses direct `fetch()` calls (custom `IRipper` implementations), refactor to use the proxy-aware fetch:
   ```typescript
   import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";

   export default class MyRipper implements IRipper {
       private fetchFn: FetchFn = fetch;

       public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
           this.fetchFn = getFetchForConfig(ripper.config);
           // Use this.fetchFn() instead of fetch() for all requests
       }
   }
   ```
3. Base classes (`HTMLRipper`, `JSONRipper`) and built-in rippers already handle proxy automatically — just add `proxy: true` to the YAML.

#### HTTP 403 from External Calendars

**Symptom:** Entry in `externalCalendarFailures` with `HTTP 403`

**Cause:** The ICS feed URL is blocked or has been removed. External calendars do not currently support the proxy.

**Fix:** Verify the URL is still valid by testing from multiple sources. If the feed has been removed or permanently blocked, consider deleting the entry's file under `sources/external/` or finding an alternative URL.

#### Unknown Venue Errors (seattle-showlists)

**Symptom:** `Unknown venue "X" not in VENUE_CONFIG — add it so events are routed to a calendar`

**Fix:**
1. Add the venue to `VENUE_CONFIG` in `sources/seattle_showlists/ripper.ts` with its address
2. Add a calendar entry in `sources/seattle_showlists/ripper.yaml` with the correct neighborhood tag
3. Use `expectEmpty: true` for small or intermittent venues

#### Zero-Event Calendars

**Symptom:** Calendar name appears in `zeroEventCalendars`

**Investigation:**
1. Check if the upstream source simply has no upcoming events (legitimate — add `expectEmpty: true`)
2. Check if the URL is still valid and returning data
3. Check if the data format has changed (may need ripper updates)
4. If it's a small venue with intermittent programming, add `expectEmpty: true`

#### Aggregate Tag Errors

**Symptom:** Errors in `tag-*` aggregate calendars

**Cause:** These are always downstream from ripper errors. Fix the underlying ripper and the tag errors resolve automatically.

**Reporting:** Aggregate errors are intentionally excluded from `totalErrors`, `errorCount.txt`, and `build-errors.json#sources`. The per-aggregate `<calendar>-errors.txt` file is still written if you want the raw list, but the headline error count tracks only the upstream rippers that need fixing.

## Favorites Filter Parity Rule

The personal ICS feed is assembled **server-side** in the Cloudflare Worker (`infra/favorites-worker/src/feed.ts`). The web UI performs the **same filtering client-side** using `events-index.json` — for live preview, the "Happening Soon" view, attribution chips, and the events map.

**These two implementations must stay in sync.** Any change to filtering logic must be applied to both:

| Concern | Server (Worker) | Client (Web UI) |
|---|---|---|
| Search filters | Fuse.js in `event-search.ts` | Fuse.js in `App.jsx` (`searchFilterMatchSummaries`) |
| Geo filters | Haversine in `feed.ts` | Haversine in `App.jsx` (`geoFilterMatchMap`) |
| Deduplication | UID-based in `ics-merge.ts` | UID-based in display logic |

### Keeping them in sync

- The Fuse.js threshold, keys, and matching logic must be identical between `event-search.ts` and `App.jsx`
- The haversine formula must be identical between `feed.ts` and `App.jsx`
- When changing either implementation, always update the other in the same PR

### Tests for alignment

`web/src/App.test.jsx` (or a dedicated `web/src/filter-parity.test.jsx`) must include tests that:
1. Run the same filter input through both the client-side and server-side logic using shared fixtures
2. Assert that the resulting matched event sets are identical
3. Cover: search filter matches, geo filter matches, multi-match events, edge cases (no location, null coords)

These tests are the contract that prevents silent divergence.

## Documentation Convention

Feature designs, architecture write-ups, and build/site decisions should be written to the **`docs/`** directory in the repo root. This keeps them versioned alongside the code for posterity.

Examples:
- `docs/design-offline-mode.md` — offline mode design
- `docs/outofband.md` — out-of-band calendar source architecture

When designing a new feature or documenting a non-obvious architectural decision, create a `docs/<feature>.md` file as part of the same PR.

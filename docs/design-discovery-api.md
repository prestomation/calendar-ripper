# Discovery API (HATEOAS-style data files)

## Goal

Make the calendar build emit a small, stable set of JSON files that let
programmatic consumers (LLMs, scripts, downstream apps) discover everything
the site publishes without scraping HTML or guessing filenames. Plus an
`llms.txt` at the root with human-readable usage instructions.

This is **not** a real HTTP API. It is a flat set of JSON files served from
the existing GitHub Pages site, linked together by URL — a poor man's HATEOAS.

## Files we will publish

All paths are relative to `output/` (the deployed site root).

### `index.json` — the entry point

The single URL a consumer needs to bookmark. Everything else is reachable from
here. **Pure links, no counts** — counts live in the linked files where they
naturally belong.

```json
{
  "generated": "2026-04-13T17:00:00.000Z",
  "site": "https://prestomation.github.io/calendar-ripper/",
  "links": {
    "self":           { "href": "index.json" },
    "llms":           { "href": "llms.txt",            "type": "text/plain" },
    "tags":           { "href": "tags.json",           "type": "application/json" },
    "venues":         { "href": "venues.json",         "type": "application/json" },
    "calendars":      { "href": "manifest.json",       "type": "application/json" },
    "events":         { "href": "events-index.json",   "type": "application/json" },
    "buildErrors":    { "href": "build-errors.json",   "type": "application/json" },
    "geoCache":       { "href": "geo-cache.json",      "type": "application/json" }
  }
}
```

Notes:
- `manifest.json` already exists and is the canonical calendar list — we
  don't duplicate it, we just point at it from `index.json`.
- `events-index.json` already exists; we link it too.
- Every link is **relative** so the file works under `/preview/<PR>/` and the
  production root without rewriting.

### `tags.json`

One entry per tag in `VALID_TAGS`. Includes the category (Neighborhood /
Activity / Market / Community), event count, calendar count, and a link to
the aggregate ICS/RSS for that tag.

```json
{
  "generated": "2026-04-13T17:00:00.000Z",
  "tags": [
    {
      "name": "Capitol Hill",
      "slug": "capitol-hill",
      "category": "Neighborhood",
      "eventCount": 312,
      "calendarCount": 14,
      "links": {
        "ics":  { "href": "tag-capitol-hill.ics" },
        "rss":  { "href": "tag-capitol-hill.rss" }
      }
    }
  ]
}
```

The `slug` must match the actual `tag-<slug>.ics` filename produced by
`lib/tag_aggregator.ts`. Action item during implementation: read that file
and confirm the exact slugification rule (lowercase only? hyphenate spaces?)
so `tags.json` can mirror it byte-for-byte. The post-build test enforces
parity.

### `venues.json`

A venue is a **place with a fixed physical location**. The way we *get* the
events (ripper / recurring / external feed) is orthogonal to whether the
source is a venue. Examples:

- Barboza (ripper) — venue ✓
- Free First Thursday at SAM (recurring) — venue ✓ (always at SAM)
- Some single-venue external ICS feed — venue ✓
- A community calendar that aggregates events at many locations (ripper) —
  **not** a venue ✗

```json
{
  "generated": "2026-04-13T17:00:00.000Z",
  "venues": [
    {
      "name": "barboza",
      "friendlyName": "Barboza",
      "description": "Intimate Capitol Hill music venue located below Neumos",
      "url": "https://www.neumos.com/barboza",
      "tags": ["Music", "Capitol Hill"],
      "geo": {
        "lat": 47.6134,
        "lng": -122.3203,
        "label": "Barboza, 925 E Pike St, Seattle, WA 98122"
      },
      "calendars": [
        { "name": "barboza", "friendlyName": "Barboza",
          "links": { "ics": { "href": "barboza-barboza.ics" },
                     "rss": { "href": "barboza-barboza.rss" } } }
      ]
    }
  ]
}
```

A source appears in `venues.json` iff its declared `geo` is non-null. See the
schema-change section below.

### `llms.txt`

Plain-text file at the site root, following the
[llms.txt convention](https://llmstxt.org/). Fully **static** — committed at
`lib/templates/llms.txt`, copied verbatim to `output/llms.txt` at build time.
No counts, no templating.

Sketch:

```
# Calendar Ripper

> Calendar Ripper is a build-time aggregator that pulls events from
> Seattle-area venues, museums, and community sources and republishes
> them as ICS calendars, RSS feeds, and JSON.

## Discovery

Start at /index.json — it links to every other data file.

## Data files

- /index.json          Entry point. Links to all other files.
- /tags.json           All tags with counts and aggregate-feed URLs.
- /venues.json         All venues (places with a fixed location).
- /manifest.json       Full calendar manifest (rippers, recurring, external).
- /events-index.json   Flat index of every event (search/geo).
- /build-errors.json   Last build's error report.
- /llms.txt            This file.

## Subscribing

Every calendar is published as both an .ics file (RFC 5545) and an .rss
feed at the URL you'll find in manifest.json or tags.json. Aggregate
feeds for each tag live at /tag-<slug>.ics.

## Freshness and caching

The build runs daily. GitHub Pages is the host and serves with permissive
CORS, so browser apps can fetch these files cross-origin without a proxy.

## Licensing & attribution

Source: <repo URL>, <license>. Event data is owned by the upstream venues;
please link back to each venue's `url` from venues.json when re-publishing.

## Contact

File an issue at <repo URL>/issues.
```

## Schema change: every source must declare its venue status

Combining decisions #3 and #4, **every source must explicitly state whether
it's a venue.** No more sparsely-populated optional `geo` — that hides
unknowns and gives `venues.json` a fuzzy contract.

The change:

- `geoSchema` is unchanged.
- `configSchema.geo` becomes **required and nullable** (was optional). Every
  ripper.yaml must contain either:
  - `geo: { lat: ..., lng: ..., label: ... }` (it's a venue), or
  - `geo: null` (explicitly not a single venue, e.g. community calendars,
    multi-location sources).
- Same change applied to `externalCalendarSchema` (`sources/external.yaml`)
  and the recurring config schema.
- Multi-branch rippers like SPL: today `geo` is at the ripper level. For SPL
  every branch has its own location, so `geo` should be expressible **per
  calendar** within a ripper, overriding any ripper-level value. Concretely:
  - Add `geo: geoSchema.nullable().optional()` to `calendarConfigSchema`.
  - Resolution rule: calendar `geo` if set, otherwise ripper `geo`. The
    *resolved* value is what must be non-null/null explicitly — i.e. one of
    the two layers must declare it.
  - Schema-level enforcement: `configSchema.refine(...)` that walks each
    calendar and asserts at least one layer declared `geo`.

### Backfill plan

This touches every existing config file. Mechanical but large:

1. Script `scripts/backfill-geo-schema.ts` walks `sources/**/ripper.yaml`,
   `sources/external.yaml`, and `sources/recurring.yaml`. For each entry
   that does **not** currently have `geo`, insert `geo: null` (preserving
   YAML formatting via the `yaml` package's AST mode). Run once, commit the
   result, delete the script (or keep it as a one-shot under `scripts/` if
   it's tiny).
2. PR review surfaces every entry that got `geo: null` — reviewers can
   upgrade obvious venues (the brewery, the single-venue museum) to a real
   `geo: {lat,lng,label}` in the same PR.
3. `lib/calendar_ripper.ts` already prefers ripper-level `geo` over per-event
   geocoding (see lines ~922–926). That logic is unchanged — null just
   means "fall through to per-event nominatim" exactly like the current
   `optional` behaviour.

The only behavioural change is: builds now **fail** if a new ripper PR forgets
to declare `geo`. That's the point — it forces an explicit decision per source.

## Where this code lives

- `lib/discovery.ts` — new module. Pure functions:
  - `buildTagsJson(manifest, eventCounts) → TagsDoc`
  - `buildVenuesJson(configs, externals, recurring) → VenuesDoc`
  - `buildIndexJson(generated) → IndexDoc`
- `lib/calendar_ripper.ts` — call the builders right after `manifest.json` is
  written (~line 890). One block, three `writeFile` calls (plus copying
  `llms.txt`).
- `lib/templates/llms.txt` — static file, copied to `output/llms.txt`.
- `lib/discovery.test.ts` — unit tests on the builder functions (pure data in,
  data out — no fs).
- `scripts/check-discovery-api.ts` — **post-build** validator that runs
  against the actual `output/` directory.

## Post-build tests

Two layers:

1. **Unit tests** (`lib/discovery.test.ts`, vitest):
   - Build the docs from fixture configs.
   - Assert shape, required fields, relative URLs, no `undefined` leaking
     into JSON, every tag is in `VALID_TAGS`, every `geo` passes `geoSchema`.
   - Assert sources with `geo: null` are excluded from `venues.json`.
   - Assert sources with `geo: {...}` are included regardless of how their
     events are sourced (ripper, recurring, external).

2. **Post-build integration tests** (`scripts/check-discovery-api.ts`):
   - Read the real `output/index.json`, `tags.json`, `venues.json`,
     `llms.txt`.
   - Validate each file against a Zod schema (define schemas in
     `lib/discovery.ts` and reuse).
   - **Crawl the links**: for every `href` in every file, assert the target
     file exists on disk under `output/`. This is the HATEOAS contract — if
     a link is dead, the build fails.
   - Reject any href starting with `http` (preview-safety).
   - Assert `tags.json` slugs match the existing `tag-<slug>.ics` filenames
     produced by the build (overlaps with `check-missing-urls.ts` but
     catches it earlier and with a clearer error).
   - Assert every venue with `geo` has lat/lng inside the Pacific Northwest
     bounding box (sanity — catches swapped lat/lng).
   - Assert `venues.json` is under 100 KB (size budget — same pattern as the
     existing 500 KB warning on `events-index.json`).

   Wired into `build-calendars.yml` as a step *after* the build but *before*
   deploy, so a malformed discovery file fails CI.

## Status page wiring

`web/src/App.jsx` already renders a health dashboard. Add a small "Discovery
API" section near the top with two links:

- `./llms.txt` (open in new tab)
- `./index.json` (open in new tab)

No fetched counts — keep it dead simple, the linked files speak for
themselves.

## Other items (decided)

- **Stable IDs:** `name` is the stable ID. Already enforced indirectly:
  renaming a ripper changes its ICS filename, which `check-missing-urls.ts`
  rejects. No `id` field needed.
- **Schema versioning:** dropped. No `version` field on any of the new files.
  We'll deal with breakage if/when it happens.
- **`allowed-removals.txt` parity:** add `index.json`, `tags.json`,
  `venues.json`, and `llms.txt` to the required-files list in
  `scripts/check-missing-urls.ts` so we don't accidentally stop publishing
  them.
- **`sitemap.xml`:** generate one in the same build step. Includes the site
  root, `index.json`, `tags.json`, `venues.json`, `manifest.json`, and
  `llms.txt`. Cheap and gives search engines the same discovery story.
- **Tag slug rule:** confirm exact slugification in `lib/tag_aggregator.ts`
  during implementation; mirror it in `tags.json` and assert parity in the
  post-build test.

## Implementation order

1. Schema change: `geo` becomes nullable-required across ripper / external /
   recurring / calendar-level. Update `lib/config/schema.ts` + tests.
2. Backfill script + commit `geo: null` (and obvious real `geo` upgrades)
   across every existing source config. Builds should still pass after this
   step with no behavioural change.
3. `lib/discovery.ts` + `lib/discovery.test.ts` — pure builders, full unit
   coverage. No fs, no build wiring.
4. Wire into `lib/calendar_ripper.ts` (one block of `writeFile`s near the
   existing `manifest.json` write) + copy `llms.txt`.
5. `lib/templates/llms.txt` — static content.
6. `scripts/check-discovery-api.ts` + a `test:discovery` npm script that
   runs after `npm run test`.
7. Update `package.json` `test:all` to run discovery checks last; wire into
   `build-calendars.yml` between build and deploy.
8. `sitemap.xml` generation in the same write block as the discovery files.
9. Update `web/src/App.jsx` to add the Discovery section to the health
   dashboard (just two links).
10. Add the new files to `scripts/check-missing-urls.ts`'s required list.
11. Update `AGENTS.md` with a short "Discovery API" section pointing at this
    doc, and document the new required `geo:` field in the "Calendar
    Integration Strategy" section.

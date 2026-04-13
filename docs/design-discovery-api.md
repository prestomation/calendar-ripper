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
here.

```json
{
  "version": 1,
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
  },
  "counts": {
    "venues": 142,
    "tags": 31,
    "calendars": 187,
    "events": 4321
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
Activity / Market / Community), event count, and a link to the aggregate
ICS/RSS for that tag.

```json
{
  "version": 1,
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

### `venues.json`

One entry per **ripper source** (each ripper represents a venue or org).
Includes `geo` when present in the ripper config, the friendly name, the
upstream URL, the tags, and links to the calendar(s) it produces.

```json
{
  "version": 1,
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
        {
          "name": "barboza",
          "friendlyName": "Barboza",
          "links": {
            "ics": { "href": "barboza-barboza.ics" },
            "rss": { "href": "barboza-barboza.rss" }
          }
        }
      ]
    }
  ]
}
```

Open question: should external calendars (`sources/external.yaml`) appear in
`venues.json`? They aren't venues exactly — they're upstream feeds. Proposal:
include them with `"kind": "external"` and a top-level `kind: "venue" |
"external" | "recurring"` discriminator. Same for the `recurring.yaml`
synthesised calendars.

### `llms.txt`

Plain-text file at the site root, following the
[llms.txt convention](https://llmstxt.org/). Lives in
`lib/templates/llms.txt` and is copied verbatim to `output/llms.txt` at build
time (no templating needed — content is static; counts come from
`index.json`).

Contents (sketch):

```
# Calendar Ripper

> Calendar Ripper is a build-time aggregator that pulls events from
> ~150 Seattle-area venues, museums, and community sources and republishes
> them as ICS calendars, RSS feeds, and JSON.

## Discovery

Start at /index.json — it links to every other data file.

## Data files

- /index.json          Entry point. Links to all other files.
- /tags.json           All tags with counts and aggregate-feed URLs.
- /venues.json         All venues with geo coords (when known), tags, calendars.
- /manifest.json       Full calendar manifest (rippers, recurring, external).
- /events-index.json   Flat index of every event (search/geo).
- /build-errors.json   Last build's error report.
- /llms.txt            This file.

## Subscribing

Every calendar is published as both an .ics file (RFC 5545) and an .rss
feed at the URL you'll find in manifest.json or tags.json. Aggregate
feeds for each tag live at /tag-<slug>.ics.

## Licensing & attribution

Source code: <repo URL>, <license>.
Event data is owned by the upstream venues; please link back to the
friendlyLink in venues.json when re-publishing.

## Contact

File an issue at <repo URL>/issues.
```

## Where this code lives

- `lib/discovery.ts` — new module. Pure functions:
  - `buildTagsJson(manifest, eventCounts) → TagsDoc`
  - `buildVenuesJson(configs, externals, recurring) → VenuesDoc`
  - `buildIndexJson(generated, counts) → IndexDoc`
- `lib/calendar_ripper.ts` — call the builders right after `manifest.json` is
  written (~line 890). One block, four `writeFile` calls.
- `lib/templates/llms.txt` — static template, copied to `output/llms.txt`.
- `lib/discovery.test.ts` — unit tests on the builder functions (pure data in,
  data out — no fs).
- `scripts/check-discovery-api.ts` — **post-build** validator that runs
  against the actual `output/` directory. Wired into `npm run test:all` via a
  new `test:discovery` script that runs after the main build.

## Post-build tests

The user explicitly asked for these. Two layers:

1. **Unit tests** (`lib/discovery.test.ts`, vitest):
   - Build the docs from fixture configs.
   - Assert shape, required fields, relative URLs, no `undefined` leaking
     into JSON, every tag in `VALID_TAGS`, every `geo` passes the same Zod
     schema as `geoSchema`.

2. **Post-build integration tests** (`scripts/check-discovery-api.ts`):
   - Read the real `output/index.json`, `tags.json`, `venues.json`,
     `llms.txt`.
   - Validate each file against a Zod schema (define schemas in
     `lib/discovery.ts` and reuse).
   - **Crawl the links**: for every `href` in every file, assert the target
     file exists on disk under `output/`. This is the HATEOAS contract — if a
     link is dead, the build fails.
   - Assert counts in `index.json` match the actual array lengths in the
     linked files.
   - Assert `tags.json` slugs match the existing `tag-<slug>.ics` filenames
     produced by the build (this catches the same class of bug as
     `check-missing-urls.ts`).
   - Assert every venue with `geo` has lat/lng inside the Pacific Northwest
     bounding box (sanity check — catches swapped lat/lng).

   Wire this into the `build-calendars.yml` workflow as a step *after* the
   build but *before* deploy, so a malformed discovery file fails CI.

## Status page wiring

`web/src/App.jsx` already renders a health dashboard. Add a small "Discovery
API" section near the top that:

- Links to `./llms.txt` (open in new tab).
- Links to `./index.json` (open in new tab).
- Shows the four count cards (venues / tags / calendars / events) read from
  `index.json` — cheap to fetch and renders even if `build-errors.json` is
  stale.

The status page already fetches `manifest.json` and `build-errors.json`; add
a third `fetch('./index.json')` alongside them.

## What you haven't thought about

These are the gaps I'd flag before writing code. None are blockers, but each
needs a decision:

1. **Schema versioning.** Once an LLM or downstream tool ingests these files,
   breaking the shape silently is bad. Every file should carry a top-level
   `"version": 1` integer and we should bump it intentionally on breaking
   changes. Add a one-paragraph "Versioning policy" section to `llms.txt`
   stating that `version` is a major version and additive fields don't
   require a bump. The post-build test asserts the version is exactly the
   value the validator expects, so a forgotten bump fails CI.

2. **Stable IDs vs. friendly names.** `venues.json` keys on `name` (the
   ripper slug). Renaming a ripper directory will silently change the venue's
   identity for any consumer that bookmarked it. Either:
   - Document that `name` is the stable ID and renames are breaking, or
   - Add an explicit `id` field that we promise never changes (and rename
     `name` → `slug`).
   Recommend the first (simpler), but document it in `llms.txt`.

3. **Geo coverage is incomplete.** Only ~half the rippers have a `geo:` block
   in their YAML — the rest rely on per-event nominatim geocoding cached in
   `geo-cache.json`. So `venues.json` will be sparsely populated. Options:
   - (a) Just emit `geo` when the ripper has it. Honest, but useless for the
     map use case.
   - (b) For venues without ripper-level `geo`, derive a "best-guess" venue
     coord by picking the most-common geocoded location among that venue's
     events. Mark it `"geoSource": "derived"` vs `"declared"`.
   - (c) Backfill more `geo:` blocks by hand. Slow but highest quality.
   Recommend (a) for v1 + (b) as a follow-up, with `geoSource` from day one
   so consumers can filter.

4. **External calendars and recurring calendars.** They aren't "venues" in the
   strict sense. Either give them their own files (`external-calendars.json`,
   `recurring-calendars.json`) or unify them under `venues.json` with a
   `kind` discriminator. Recommend the unified approach — fewer files for
   consumers to learn — and call the file `sources.json` instead of
   `venues.json` to make the broader scope obvious. (Will rename below if you
   agree.)

5. **PR previews break absolute URLs.** `manifest.json` already uses relative
   paths so previews work. We must keep that discipline in the new files —
   no `https://prestomation.github.io/...` hardcoded. The post-build test
   should reject any href starting with `http`.

6. **`llms.txt` is static, but counts aren't.** The llmstxt convention
   doesn't require dynamic counts, but if we want them in the prose ("indexes
   ~150 venues"), we either:
   - Hardcode and let it drift, or
   - Treat `llms.txt` as a tiny template and substitute counts at build time.
   Recommend the template approach, sub `{{venueCount}}` etc. via a trivial
   string replace in `lib/calendar_ripper.ts`.

7. **CORS / fetch from third parties.** GitHub Pages serves with permissive
   CORS, so JS apps can `fetch()` these files cross-origin. Worth one line in
   `llms.txt` so consumers know they don't need a proxy.

8. **Caching headers.** GitHub Pages doesn't let us set them. Document that
   the files are regenerated on every build (~hourly) and that consumers
   should not cache aggressively. One line in `llms.txt`.

9. **`allowed-removals.txt` parity.** `check-missing-urls.ts` enforces that
   URLs don't disappear between builds. The new files (`index.json`,
   `tags.json`, `venues.json`, `llms.txt`) should be added to that script's
   "must exist" list so we don't accidentally stop publishing them.

10. **Robots / discoverability.** Add the new files to `sitemap.xml` if one
    exists, or generate one as part of this change. `llms.txt` is the LLM
    discovery story; `sitemap.xml` is the search-engine one. Cheap to do
    both.

11. **Size budget for `venues.json`.** ~150 venues × small object = a few KB,
    fine. But `events-index.json` already has a 500 KB warning. We should
    add a similar warning for `venues.json` (say 100 KB) so a future bug
    that inlines events into venues gets caught.

12. **Tag slugs.** `tag-<lowercased>.ics` is the existing filename
    convention, but lowercasing isn't slugifying — `"Capitol Hill"` becomes
    `tag-capitol hill.ics` (literal space) under the current logic, or
    `tag-capitol-hill.ics` if there's a hyphen step. Need to confirm and
    document in `tags.json` so the link is correct. (Action item: read
    `lib/tag_aggregator.ts` to confirm.)

## Implementation order

1. `lib/discovery.ts` + `lib/discovery.test.ts` — pure builders, full unit
   coverage. No fs, no build wiring.
2. Wire into `lib/calendar_ripper.ts` (one block of `writeFile`s near the
   existing `manifest.json` write).
3. `lib/templates/llms.txt` + the trivial template substitution.
4. `scripts/check-discovery-api.ts` + a `test:discovery` npm script that
   runs after `npm run test`.
5. Update `package.json` `test:all` to run discovery checks last.
6. Update `web/src/App.jsx` to fetch `index.json` and add the Discovery
   section to the health dashboard.
7. Add the new files to `scripts/check-missing-urls.ts`'s required list.
8. Update `AGENTS.md` with a short "Discovery API" section pointing at this
   doc.

## Decisions needed before I start coding

- Unify under `sources.json` with a `kind` discriminator, or keep
  `venues.json` + separate files? **(recommend unified)**
- v1 geo: declared-only, or include derived-from-events? **(recommend
  declared-only + add `geoSource` field for forward compat)**
- Stable-ID story: document `name` as stable, or add explicit `id`?
  **(recommend document `name`)**
- Should `llms.txt` be static or templated for counts? **(recommend
  templated)**

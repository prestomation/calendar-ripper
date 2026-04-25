# OpenStreetMap IDs

Venue and event entries in the public data files carry an OpenStreetMap
feature identifier when one is available, so downstream consumers can
join 206.events data to OSM (Overpass, tile servers, address/amenity
lookups) without re-geocoding.

## Shape

Whenever they appear, OSM fields show up as a pair on any `geo` block:

```json
{
  "lat": 47.6134,
  "lng": -122.3203,
  "label": "Barboza, 925 E Pike St, Seattle, WA 98122",
  "osmType": "way",
  "osmId": 123456789
}
```

- `osmType` is always one of `node`, `way`, or `relation`.
- `osmId` is a positive integer.
- Both fields are set together or both are absent — the schema enforces
  this, so you can treat their presence as atomic.

To build a URL, concatenate: `https://www.openstreetmap.org/<osmType>/<osmId>`.
For Overpass queries, use the same pair as the feature filter.

## Where they appear

| File | When populated |
|------|----------------|
| `venues.json` | When the venue's declared `geo` in its YAML source has OSM fields (via the backfill script, see below). |
| `events-index.json` | For each event, either inherited from the venue geo, or captured from Nominatim when that event's `location` string was geocoded. |
| `geo-cache.json` | Cached alongside `lat`/`lng` whenever Nominatim returned a feature. |

## Why some entries lack OSM IDs

The fields are optional. They are absent in a few legitimate cases:

- **Manually positioned venues** — many rippers declare `geo` from a
  coordinate we picked off Google Maps, without running it through
  Nominatim. No lookup, no OSM ID. Run the backfill script to fill them
  in (see below).
- **Fallback geocode sources** — when Nominatim fails, the resolver
  falls back to hardcoded tables for Seattle neighborhoods, SPL
  branches, UW building codes, and well-known venues. These tables only
  store `lat`/`lng`, so the resulting events carry no OSM ID.
- **Unresolvable events** — community-calendar events with locations
  like "TBA" or "Various locations" never get a coordinate at all.
- **Non-venue sources** — community calendars and cross-neighborhood
  art walks declare `geo: null` and do not appear in `venues.json`
  regardless.

## Provenance notes

OSM IDs are snapshots at geocoding time. OSM features can be edited,
split, or deleted, so a stored ID may go stale. We do **not** re-verify
IDs against OSM on each build — consumers who care about strict
accuracy should tolerate the possibility of a dangling ID (e.g. render
the URL but degrade gracefully if the target 404s).

Nominatim occasionally returns the building envelope (a `way`) rather
than the venue node, or a nearby address node rather than the venue
itself. The backfill script is interactive for exactly this reason:
each proposed OSM feature is shown with its display name and a URL so a
human can spot-check the match.

## Backfilling existing venues

`scripts/backfill-osm-ids.ts` walks every `ripper.yaml`, `external.yaml`,
and `recurring.yaml` entry with a `geo: {lat, lng}` block but no
`osmId` / `osmType`. For each one it reverse-geocodes via Nominatim and
prompts for confirmation before writing the result back to the YAML.

```bash
# Dry run — see what would be looked up
node --loader ts-node/esm scripts/backfill-osm-ids.ts --dry-run

# Spot-check one source
node --loader ts-node/esm scripts/backfill-osm-ids.ts --source barboza

# Sweep the whole repo (still interactive — use Ctrl-C to abort)
node --loader ts-node/esm scripts/backfill-osm-ids.ts
```

The script respects Nominatim's 1 req/sec rate limit. Commit the
resulting YAML changes as a normal PR.

## Daily reconciliation

Venues whose `geo` is populated but missing an OSM ID are surfaced in
`build-errors.json` under the `osmGaps` key — parallel to
`zeroEventCalendars`, not mixed in with `geocodeErrors`. The two are
conceptually different: a geocode error means *no coords at all* (the
event can't render on the map); an OSM gap means *coords are fine, but
we lack the OSM feature id* (enrichment opportunity, not a problem).

A daily skill (`skills/geo-resolver/SKILL.md`) reads that list, runs
the backfill report, classifies candidates using the A–F rubric, and
auto-applies the strong matches. Weaker matches are flagged in the
skill's reply for human judgment.

Tier D/F rejections are persisted by adding an `osmChecked: "YYYY-MM-DD"`
marker inside the `geo` block so we don't re-propose the same wrong
match every day. `buildOsmGaps` skips venues whose `osmChecked` is
within the last `OSM_CHECKED_COOLDOWN_DAYS` days (defined in
`lib/config/schema.ts`, currently 60). After the cooldown the venue
re-surfaces in the gap list — OSM grows over time and a feature
missing six months ago may exist today.

## Manually overriding an ID

If Nominatim picks the wrong feature, edit the `geo` block in the
source YAML directly:

```yaml
geo:
  lat: 47.6134
  lng: -122.3203
  label: "Barboza"
  osmType: node
  osmId: 987654321
```

The schema enforces that both fields are present or both absent; CI
will reject a PR that sets only one.

## Recording a rejection

When Nominatim has no good candidate for a venue (Tier D/F in the
skill's rubric — wrong feature, or no result at all), record the
rejection so the daily skill doesn't re-propose the same bad match
every run:

```yaml
geo:
  lat: 47.6091
  lng: -122.3416
  label: "Pike Place Market, 85 Pike St, Seattle, WA 98101"
  # Brief reason — helps a future agent re-evaluate when the cooldown lapses.
  osmChecked: "2026-04-24"
```

`osmChecked` must be a `YYYY-MM-DD` string (the schema enforces the
format). Venues with a fresh `osmChecked` are silenced from
`build-errors.json#osmGaps` for `OSM_CHECKED_COOLDOWN_DAYS` days
(see `lib/config/schema.ts`), then automatically re-surface so the
skill can retry.

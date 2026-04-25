# 206.events Geo Resolver

Resolve missing geocode entries in the 206.events geo-cache.

## Workflow

### 1. Check live geo stats and errors

```bash
python3 skills/geo-resolver/scripts/geo-cache.py stats
```

Note the current coverage % — this is your **baseline to beat**.

### 2. Analyze the geo-cache for misses

```bash
python3 skills/geo-resolver/scripts/geo-cache.py analyze
```

This downloads the cache from S3 and prints a categorized breakdown of unresolvable entries:
- Virtual/TBA (correct — no action needed)
- Dirty keys (stale — need purge)
- Truncated strings (stale — need purge)
- Has street address (potentially fixable)
- Venue name only (may need known-venue lookup)

### 3. Identify the fix

Based on the analysis, determine what's actionable:

| Pattern | Action |
|---|---|
| Dirty keys (`\,`, `<br>`, `&amp;`) | Purge from cache — will re-resolve with clean key next build |
| Truncated strings | Purge — source data is being cut off, may need ripper fix |
| Virtual/Zoom/TBA | Ignore — correct to be unresolvable |
| Known venue name, no address | Add to `lookupKnownVenue()` in `lib/geocoder.ts` |
| UW building code `(HUB)` etc. | Already handled — if still failing, purge stale cache entry |
| SPL branch + room suffix | Already handled — if still failing, purge stale cache entry |
| Neighborhood vague | Already handled via centroid — if still failing, purge stale cache entry |

**Stale cache entries are the most common issue.** When new geocoder logic is added, old `unresolvable: true` entries with dirty/matching keys prevent retries. Always check if a purge is needed before adding new code.

### 4. Purge stale unresolvable entries (if needed)

```bash
python3 skills/geo-resolver/scripts/geo-cache.py purge
```

This purges dirty-key and truncated-string entries from the cache and uploads the updated version to S3.

### 5. Resolve via geocoder changes

Make the appropriate change to `lib/geocoder.ts` based on the fix type:

**Data-only changes → push direct to main:**

| Change type | Push direct? | Rationale |
|---|---|---|
| Add entry to `KNOWN_VENUE_COORDS` | ✅ Yes | Pure data, no logic change |
| Add entry to `lookupKnownVenue()` | ✅ Yes | String→coords mapping, no logic |
| Add SPL branch / UW building lookup entry | ✅ Yes | Lookup table entry |

For data-only changes: commit and push direct to main with a message like `fix(geo): add <venue> to KNOWN_VENUE_COORDS`. No PR, no Q review needed.

**Logic changes → open a PR:**

| Change type | PR required? | Rationale |
|---|---|---|
| New strategy in `geocodeLocation()` | ✅ Yes | Logic change, could break things |
| Changes to `stripSuiteFloorSuffixes()` etc | ✅ Yes | Normalization logic affects all lookups |
| New fallback chain or reordering | ✅ Yes | Changes resolution for all venues |

For logic changes: cut a feature branch, open a PR, iterate with Q. See the **Merge gate** section below.

### 6. Re-trigger build

After pushing any geo fix to main (data or logic), re-trigger the GitHub Actions build so the fix takes effect immediately:

```bash
gh workflow run "Generate Calendars and Publish to GitHub Pages" --ref main
```

Then verify the build succeeds and geo coverage improved.

### 7. Upload updated cache to S3 (if needed)

If you made manual changes to the cache file (not via the purge command):

```bash
aws s3 cp /tmp/geo-cache.json "s3://calendar-ripper-outofband-220483515252/latest/geo-cache.json" --region us-west-2
```

### 8. Report results

Summarize:
- Geo coverage before vs after (%)
- How many entries purged
- How many new venues added to geocoder (with commit link for data-only pushes or PR link for logic changes)
- Remaining unresolvable count and breakdown

## Merge gate for geocoder logic changes

When implementing a **logic change** to `lib/geocoder.ts` (new strategy, normalization improvement, etc.) that goes through a PR, **do not merge on green CI alone**. The merge condition is:

1. ✅ All CI checks pass
2. ✅ Amazon Q has no blocking comments
3. ✅ **Geo hit rate in the PR preview build is higher than before the change**

Check geo coverage from the PR preview:

```bash
python3 skills/geo-resolver/scripts/geo-cache.py coverage "https://206.events/preview/<PR_NUMBER>/build-errors.json"
```

Compare against the live site baseline:

```bash
python3 skills/geo-resolver/scripts/geo-cache.py coverage
```

If the PR preview shows equal or lower geo coverage → **do not merge**, investigate why the strategy isn't working before proceeding.

**Data-only changes** (pushed direct to main) do not need a merge gate check — they are verified by the next daily build instead.

## ⚠️ Never read geo-cache.json directly into context

`geo-cache.json` is ~120KB (~30k tokens) and will blow your context budget. **Always use the `geo-cache.py` script** to summarize or manipulate it — run it as a subprocess and read only the printed output.

✅ OK: `python3 skills/geo-resolver/scripts/geo-cache.py stats` — only the summary hits context
✅ OK: `python3 skills/geo-resolver/scripts/geo-cache.py analyze` — prints a categorized summary
✅ OK: `python3 skills/geo-resolver/scripts/geo-cache.py purge` — modifies and uploads, no raw JSON in context
❌ Never: `cat geo-cache.json` — too large
❌ Never: Iterate entries in an agent reasoning loop — use the script instead

If you need to inspect a specific entry:
```bash
python3 -c "import json; d=json.load(open('/tmp/geo-cache.json')); print(d['entries'].get('the key you want'))"
```

## OSM ID reconciliation

The same daily pass should also fill in OpenStreetMap feature IDs on
venues that already have coords. Missing OSM IDs appear in the
`osmGaps` array of `build-errors.json` — same file you already pull
for geocode errors.

OSM IDs enable downstream consumers of `venues.json` and
`events-index.json` to join our data to OSM (Overpass, tile servers)
without re-geocoding. See `docs/osm-ids.md` for the full shape.

### 1. Pull the current gap list

```bash
curl -s https://206.events/build-errors.json | jq '.osmGaps'
```

Each entry has `source`, `name`, declared `lat`/`lng`, and `label` —
the exact input the report tool accepts.

### 2. Run the Nominatim report

```bash
node --loader ts-node/esm scripts/backfill-osm-ids.ts \
  --report /tmp/osm-backfill-report.json
```

The script walks every source YAML, queries Nominatim once per gap,
and writes a report JSON with the proposed `osmType` / `osmId`, the
Nominatim `display_name`, the feature's `class`/`type`, and the
haversine distance between declared and returned coords. It is
rate-limited to 1 req/sec — ~80 venues takes ~3 minutes. Reuses the
same Nominatim budget as the geo-cache workflow, so don't run both in
parallel.

### 3. Classify each candidate (A–F rubric)

| Tier | Rule | Action |
|------|------|--------|
| **A** | name-match ≥50% AND distance ≤500m AND class ∈ {tourism, leisure, amenity, shop, historic, craft, building, office} | Auto-apply |
| **B** | name-match 100% AND distance 500m–1km on a venue-like class | Apply — OSM is probably more accurate than our coords |
| **C** | Result is an address-only match (`place/house` or `building/yes`) whose street number matches our label | Apply — useful even if not a named venue |
| **D** | Result is clearly a different feature (wrong name, wrong address, >1km) | Reject — mark `osmChecked`, cite the evidence |
| **E** | Ambiguous (name partially matches but different location) | Flag in reply, do not auto-apply |
| **F** | No result from any query strategy | Mark `osmChecked`, move on |

**Name-match heuristic:** strip the label (everything before the
first comma), normalize to lowercase alphanumerics, count how many
tokens >2 chars appear in the Nominatim `display_name`.

### 4. Apply accepted matches

```bash
node --loader ts-node/esm scripts/apply-osm-ids.ts \
  --report /tmp/osm-backfill-report.json \
  --accept 1,3,5-12,17,22
```

Round-trips YAML (preserves comments via the `yaml` lib's Document
API). Refuses to overwrite an `osmId`/`osmType` that is already set.

### 5. Mark Tier D / F gaps as checked

For rejections, run the apply script in `--reject` mode and pass the
report indices that should be silenced. The script writes a dated
`osmChecked` marker into each YAML's `geo` block:

```bash
node --loader ts-node/esm scripts/apply-osm-ids.ts \
  --report /tmp/osm-backfill-report.json \
  --reject 4,9,11
```

Or, for a one-off, edit the YAML directly:

```yaml
geo:
  lat: 47.6134
  lng: -122.3203
  label: "Venue Name, 123 Main St, Seattle, WA"
  # Brief reason — what came back, why it was wrong.
  osmChecked: "2026-04-24"
```

`buildOsmGaps` skips venues whose `osmChecked` is within
`OSM_CHECKED_COOLDOWN_DAYS` (60 days as of writing — see
`lib/config/schema.ts`). After the cooldown the venue re-surfaces
automatically — OSM grows, and venues that weren't indexed last
quarter may be there now.

### 6. Rules of thumb

- **Only Tier A auto-applies.** Tier B/C need human eyes because a
  stale `osmId` is worse than a missing one — consumers will trust
  whatever we publish.
- **Tier D marks must cite the evidence** (e.g. "Nominatim returned
  'Alibi Room' at 132m — a bar inside Pike Place Market, not the
  market"). Without the reasoning, a future agent can't evaluate
  whether the rejection still holds.
- **OSM IDs drift.** Features get renumbered when split or merged. If
  a build surfaces an `osmGaps` entry for a venue that previously had
  an id, the id was probably deleted upstream — drop the stale id
  from the YAML and let the next run re-resolve.

## Key references

- **S3 bucket:** `calendar-ripper-outofband-220483515252`
- **S3 key:** `latest/geo-cache.json`
- **Live errors:** `https://206.events/build-errors.json`
- **Geocoder source:** `lib/geocoder.ts`
- **OSM backfill scripts:** `scripts/backfill-osm-ids.ts`, `scripts/apply-osm-ids.ts`
- **OSM field docs:** `docs/osm-ids.md`
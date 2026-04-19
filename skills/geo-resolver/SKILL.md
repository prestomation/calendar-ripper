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

### 5. Resolve via geocoder code changes (if needed)

If new venue patterns or location formats need to be added to `lib/geocoder.ts`, open a PR. See the **Merge gate** section — always verify geo rate improves before merging.

### 6. Upload updated cache to S3

If you made manual changes to the cache file (not via the purge command):

```bash
aws s3 cp /tmp/geo-cache.json "s3://calendar-ripper-outofband-220483515252/latest/geo-cache.json" --region us-west-2
```

### 7. Report results

Summarize:
- Geo coverage before vs after (%)
- How many entries purged
- How many new venues added to geocoder
- Remaining unresolvable count and breakdown

## Merge gate for geocoder changes

When implementing a fix to `lib/geocoder.ts` (new strategy, normalization improvement, etc.), **do not merge on green CI alone**. The merge condition is:

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

## Key references

- **S3 bucket:** `calendar-ripper-outofband-220483515252`
- **S3 key:** `latest/geo-cache.json`
- **Live errors:** `https://206.events/build-errors.json`
- **Geocoder source:** `lib/geocoder.ts`
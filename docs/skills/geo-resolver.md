# 206.events Geo Resolver

Resolve missing geocode entries in the 206.events geo-cache.

## Workflow

### 1. Check live geo stats and errors

Fetch the latest `build-errors.json` from the live site:

```bash
curl -s https://206.events/build-errors.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
gs = d.get('geoStats', {})
errs = d.get('geocodeErrors', [])
total = gs.get('totalEvents', 0)
with_geo = gs.get('eventsWithGeo', 0)
pct = round(with_geo / total * 100) if total else 0
print(f'Geo coverage: {with_geo} / {total} events ({pct}%)')
print(f'Geocode errors: {len(errs)}')
for e in errs:
    print(f'  [{e[\"source\"]}] {e[\"location\"]} — {e[\"reason\"]}')
"
```

Note the current coverage % — this is your **baseline to beat**.

### 2. Analyze the geo-cache for misses

Download the cache and categorize unresolvable entries:

```bash
BUCKET="calendar-ripper-outofband-220483515252"
aws s3 cp "s3://${BUCKET}/latest/geo-cache.json" /tmp/geo-cache.json --region us-west-2

python3 - << 'EOF'
import json
from collections import Counter

with open('/tmp/geo-cache.json') as f:
    cache = json.load(f)

unresolvable = {k: v for k, v in cache['entries'].items() if v.get('unresolvable')}
print(f"Total unresolvable: {len(unresolvable)}")

# Group by likely cause
virtual = [k for k in unresolvable if any(x in k for x in ['zoom','online','virtual','tba','tbd','webinar','http'])]
dirty = [k for k in unresolvable if any(x in k for x in ['\\,','\\;','<br','&amp','&#'])]
truncated = [k for k in unresolvable if len(k) > 40 and k[-1].isalpha() and k[-2].isalpha()]
has_address = [k for k in unresolvable if any(c.isdigit() for c in k[:8]) and k not in virtual]
venue_only = [k for k in unresolvable if not any(c.isdigit() for c in k) and k not in virtual + dirty]

print(f"  Virtual/TBA (correct): {len(virtual)}")
print(f"  Dirty keys (stale, need purge): {len(dirty)}")
print(f"  Truncated strings (stale): {len(truncated)}")
print(f"  Has street address (fixable?): {len(has_address)}")
print(f"  Venue name only: {len(venue_only)}")

print("\nVenue-only sample:")
for k in sorted(venue_only)[:20]:
    print(f"  {k!r}")
EOF
```

### 3. Identify the fix

Based on the analysis, determine what's actionable:

| Pattern | Action |
|---|---|
| Dirty keys (`\\,`, `<br>`, `&amp;`) | Purge from cache — will re-resolve with clean key next build |
| Truncated strings | Purge — source data is being cut off, may need ripper fix |
| Virtual/Zoom/TBA | Ignore — correct to be unresolvable |
| Known venue name, no address | Add to `lookupKnownVenue()` in `lib/geocoder.ts` |
| UW building code `(HUB)` etc. | Already handled — if still failing, purge stale cache entry |
| SPL branch + room suffix | Already handled — if still failing, purge stale cache entry |
| Neighborhood vague | Already handled via centroid — if still failing, purge stale cache entry |

**Stale cache entries are the most common issue.** When new geocoder logic is added, old `unresolvable: true` entries with dirty/matching keys prevent retries. Always check if a purge is needed before adding new code.

### 4. Purge stale unresolvable entries (if needed)

```python
import json, re, boto3

BUCKET = "calendar-ripper-outofband-220483515252"
KEY = "latest/geo-cache.json"

with open('/tmp/geo-cache.json') as f:
    cache = json.load(f)

to_purge = []
for k, v in cache['entries'].items():
    if not v.get('unresolvable'):
        continue
    if any(x in k for x in ['\\,', '\\;', '<br', '&amp', '&#']):
        to_purge.append(k)
    elif len(k) > 40 and k[-1].isalpha() and k[-2].isalpha():
        to_purge.append(k)

for k in to_purge:
    del cache['entries'][k]

print(f"Purged {len(to_purge)} entries")

with open('/tmp/geo-cache-purged.json', 'w') as f:
    json.dump(cache, f, indent=2)

s3 = boto3.client('s3', region_name='us-west-2')
s3.upload_file('/tmp/geo-cache-purged.json', BUCKET, KEY,
               ExtraArgs={'ContentType': 'application/json'})
print("Uploaded")
```

### 5. Resolve via geocoder code changes (if needed)

If new venue patterns or location formats need to be added to `lib/geocoder.ts`, open a PR. See the **Merge gate** section — always verify geo rate improves before merging.

### 6. Upload updated cache to S3

```bash
BUCKET="calendar-ripper-outofband-220483515252"
aws s3 cp /tmp/geo-cache.json "s3://${BUCKET}/latest/geo-cache.json" --region us-west-2
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

Check geo coverage from the PR preview's `build-errors.json`:
```bash
curl -s https://206.events/preview/<PR_NUMBER>/build-errors.json | \
  python3 -c "import json,sys; gs=json.load(sys.stdin).get('geoStats',{}); print(f\"{gs.get('eventsWithGeo','?')} / {gs.get('totalEvents','?')} ({round(gs.get('eventsWithGeo',0)/gs.get('totalEvents',1)*100)}%)\")"
```

Compare against the live site baseline:
```bash
curl -s https://206.events/build-errors.json | \
  python3 -c "import json,sys; gs=json.load(sys.stdin).get('geoStats',{}); print(f\"{gs.get('eventsWithGeo','?')} / {gs.get('totalEvents','?')} ({round(gs.get('eventsWithGeo',0)/gs.get('totalEvents',1)*100)}%)\")"
```

If the PR preview shows equal or lower geo coverage → **do not merge**, investigate why the strategy isn't working before proceeding.

## ⚠️ Never read geo-cache.json directly into context

`geo-cache.json` is ~120KB (~30k tokens) and will blow your context budget. **Always use Python scripts to summarize or manipulate it** — run them as subprocesses and read only the printed output.

✅ OK: `python3 -c "import json; d=json.load(open('/tmp/geo-cache.json')); print(len(d['entries']))"` — only the number hits context
✅ OK: The analysis script in step 2 — prints a summary, not raw JSON
✅ OK: The purge script in step 4 — modifies and uploads, no raw JSON in context
❌ Never: `cat geo-cache.json` — too large
❌ Never: Iterate entries in an agent reasoning loop — use a script instead

If you need to inspect a specific entry, use a targeted lookup:
```bash
python3 -c "import json; d=json.load(open('/tmp/geo-cache.json')); print(d['entries'].get('the key you want'))"
```

## Key paths

- **Repo:** `/root/.openclaw/workspace/channels/1482476559465189426/`
- **S3 bucket:** `calendar-ripper-outofband-220483515252`
- **S3 key:** `latest/geo-cache.json`
- **Live errors:** `https://206.events/build-errors.json`
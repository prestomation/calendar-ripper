# 206.events Build Report

Fetch and analyze the 206.events build health report, fix broken rippers, and post a morning summary.

## Steps

### 1. Fetch Build Errors

```bash
curl -s https://206.events/build-errors.json
```

Parse the JSON response. Key fields to check:
- `configErrors` — ripper configuration problems
- `externalCalendarFailures` — external calendar fetch failures
- `zeroEventCalendars` — calendars that returned 0 events
- `expectedEmptyCalendars` — calendars intentionally expected to be empty
- `eventCounts` — map of calendar name → event count
- `geocodeErrors` — events that couldn't be geocoded
- `buildTimestamp` — when the build ran

### 2. Reply with Build Health Report

Include the report in your reply text — the delivery system will route it to the correct channel. Do NOT try to use a Discord/message tool.

Format the report with:
- **Total errors** prominently at the top
- List of `configErrors` (if any)
- List of `externalCalendarFailures` (if any)
- List of `zeroEventCalendars` (if any)
- Build timestamp at the bottom

**expectedEmptyCalendars cross-check:** For every calendar in `expectedEmptyCalendars`, check its value in `eventCounts`. If any has `eventCounts[name] > 0`:
> ⚠️ `[calendar-name]` is marked expectEmpty but now has N events — consider removing the expectEmpty flag.

### 3. Error Handling Decision Tree

For each error, apply this logic:

#### 🔧 Fix It (spawn subagent)
If a **previously-working ripper** now errors because the source site changed (new HTML structure, new date format, new API shape, new data variants):
- Fetch the live URL to see what it currently returns
- Understand the new structure
- Spawn a subagent to fix the parser:
  ```
  sessions_spawn(runtime="subagent", mode="run", 
    cwd="/root/.openclaw/workspace/channels/1482476559465189426",
    task="Fix the <ripper-name> ripper in 206.events. The source at <URL> has changed. Current error: <error>. Fetch the URL, understand the new structure, update the parser. Commit directly to main.")
  ```
- The subagent commits directly to main.
- After the subagent reports back, include the commit link in your reply:
  e.g. `🔗 [fix(ripper): update <source> parser](https://github.com/prestomation/206events/commit/<sha>)`

#### ⚠️ Gracefully Skip Bad Items
If only specific events within a ripper are unparseable but the ripper otherwise works:
- Note the issue with a warning
- Don't disable the ripper — let it skip bad items

#### ⏭️ Transient Errors
If the error looks transient (network timeout, temporary 5xx):
- Do nothing, it'll resolve on its own

#### 🚫 HTTP 403 from Runner IPs
If a source returns 403 specifically for the CI runner's IPs:
- Flag it in the report
- Note: this source needs `proxy: true` added to its `ripper.yaml`
- Do NOT disable the ripper

#### ❌ Only Disable if Source is Clearly Gone
Disable a ripper only if:
- Consistent 404 across multiple builds
- Source site explicitly says they no longer publish
- Source is permanently blocked

**Default: keep rippers running.**

### 4. Geo Error Check

Check the `geocodeErrors` array from the build JSON.

**If empty:**
```
🗺️ Geo coverage: N/M events (X%) — no geocode errors ✅
```
(Calculate N = geocoded events, M = total events, X = percentage)

**If errors exist:**
Read `docs/skills/geo-resolver.md` and follow it completely to resolve the geocode errors.

After the geo resolver completes, include a geo fix summary in your reply including:
- How many errors were resolved vs. remain unresolvable
- For each code fix made (new known venue, new lookup rule, etc.): link the commit on GitHub
  e.g. `🔗 [fix(geo): add Peace of Mind Brewing](https://github.com/prestomation/206events/commit/<sha>)`
- Updated geo coverage % after fixes

**After any code fixes** (geocoder or ripper changes pushed to main), re-fetch `build-errors.json` by triggering a fresh GitHub Actions build:
```bash
cd /root/.openclaw/workspace/channels/1482476559465189426
gh workflow run build-calendars.yml --repo prestomation/206events 2>&1 || true
```
Then wait ~5 minutes and re-fetch the live `build-errors.json` to verify the errors are gone. Include the before/after error counts in your reply.

### 5. Source Discovery (if no actionable errors)

If there are **no actionable errors** (0 config errors, 0 external failures, all geocode errors are virtual/TBA/unresolvable), read `docs/skills/source-discovery.md` and follow it completely.
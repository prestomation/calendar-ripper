# 206.events Build Report

Fetch and analyze the 206.events build health report, fix broken rippers, and post a summary.

## Steps

### 1. Fetch Build Errors

Run the build health script:

```bash
python3 skills/build-report/scripts/build-health.py
```

This fetches `https://206.events/build-errors.json` and prints a structured summary including:
- Total error count
- Config errors, external failures, zero-event calendars
- expectedEmpty cross-check (flags calendars marked empty that now have events)
- Geo coverage stats and geocode errors
- Build timestamp

### 2. Reply with Build Health Report

Include the report in your reply text — the delivery system will route it to the correct channel.

### 3. Error Handling Decision Tree

For each error, apply this logic:

#### 🔧 Fix It
If a **previously-working ripper** now errors because the source site changed (new HTML structure, new date format, new API shape, new data variants):
- Fetch the live URL to see what it currently returns
- Understand the new structure
- Delegate a fix to a coding agent on a feature branch
- The fix must go through a PR — never commit directly to main

#### ⚠️ Report Skipped Items (ParseErrors)
If a source reports `ParseError` entries alongside successful events (e.g., "8 events, 2 errors"), these indicate items the parser couldn't handle. **This is not a build failure** — the source is working — but the skipped items must be investigated before deciding on action.

**Required: look up the actual item before drawing conclusions.** Fetch the source URL and find the item matching the `context` field. Don't assume it's "not a real event" just from the title — check what date text the item actually has and whether the parser should be able to handle it.

Triage:
- **Item has a date in a format the parser doesn't handle** → delegate a parser fix (e.g., day-of-week-only date "Saturday & Sunday" means no specific calendar date; add a pre-parse filter to skip it silently rather than emitting noise every build)
- **Item genuinely has no date and is not a calendar event** → add a pre-parse filter by title/type so it stops appearing as a ParseError
- **Item has a valid date the parser should handle but doesn't** → fix the regex/parser

Do not disable the ripper for ParseErrors — they're working as intended (graceful failure + visibility).

Include a summary in the report: `⏭️ ParseErrors: source-name: 2 items skipped — "Event Title 1" (day-of-week only, filtered), "Event Title 2" (unparseable format)`

#### ⏭️ Transient Errors
If the error looks transient (network timeout, temporary 5xx):
- Do nothing, it'll resolve on its own

#### 🚫 HTTP 403 / Persistent Fetch Failures
If a source returns 403 or consistently fails to fetch:
- Flag it in the report
- If the source works when fetched from outside CI (e.g., locally or out-of-band), it likely needs `proxy: true` or conversion to an out-of-band ripper
- After 10+ consecutive failures, consider adding it as an out-of-band source
- Do NOT disable the ripper without human approval

#### ❌ Only Disable if Source is Clearly Gone
Disable a ripper only if:
- Consistent 404 across multiple builds
- Source site explicitly says they no longer publish
- Source is permanently blocked

**Default: keep rippers running.**

### 4. Zero-Event Calendars

For each entry in `zeroEventCalendars`, decide whether it is broken or legitimately empty.

**Key rule: only act on calendars listed directly in `zeroEventCalendars` by their own name.**

`tag-*` aggregate calendars appear in the list when all upstream sources for that tag have 0 events. Do **not** trace a `tag-*` zero back to its upstream sources and add `expectEmpty` to them — the aggregate being zero may be transient (the source calendar had no events at build time but events are added between builds). Only add `expectEmpty` to an upstream source if that source's own calendar name appears in `zeroEventCalendars`.

#### Decision tree per calendar

| Pattern | Action |
|---|---|
| `tag-*` aggregate | Skip — transient; do not chase upstream sources |
| Sub-category filter (e.g. `seatoday-nightlife`) | Add `expectEmpty` if the parent ripper is healthy |
| SPL / multi-branch ripper, one branch zero | Add `expectEmpty` at the calendar level |
| Small venue with intermittent programming | Add `expectEmpty` at ripper or calendar level |
| Major venue that should always have events | Investigate — check the live URL before adding `expectEmpty` |
| Source in `sources` errors list (fetch/parse failures) | Fix the ripper, don't just silence with `expectEmpty` |

#### Required live-check before adding `expectEmpty`

**Always verify the source is actually working before silencing it.** Adding `expectEmpty` to a broken source hides the breakage permanently — the calendar disappears from the site without any warning.

For each zero-event calendar, before adding `expectEmpty`:

1. **Fetch the source URL** (the `url` or `icsUrl` in the ripper/external YAML) and confirm it returns the expected format (JSON, ICS, HTML).
2. **Check the source for UPCOMING events specifically** — not just that it's accessible and has historical data. An ICS feed that returns 75 events but all are in the past is legitimately empty. What matters is whether there are future-dated events in the feed right now.
3. **Check the venue's own website** for upcoming events — not just the upstream aggregator. A showlists entry might drop a venue; an ICS feed might go stale; the ripper's upstream may no longer list the source. The venue's own site is ground truth.
4. **If events exist on the venue website but the ripper/feed returns 0 upcoming events**, the source has diverged from reality. Do **not** add `expectEmpty` — replace or supplement the source so those events are captured. `expectEmpty` on a working venue with events silently removes it from the calendar.
5. Only add `expectEmpty` if both the source URL is healthy **and** the venue's own website confirms there are no specific upcoming events right now.

**Do not treat "CI showed N events" as proof the source is healthy.** CI runs at a point in time; if N events were all in the past by the time of the production build, the ripper correctly returned 0. Always verify what the live feed contains *right now*, not what a past build found.

If the source URL is returning errors (403, 404, unexpected format) and there are no fetch errors in `sources[]`, it likely means the build didn't even attempt the fetch (e.g., a config error upstream). Investigate before silencing.

#### When the upstream source is stale but the venue has events

If a venue has events on its own site but the upstream source (showlists, an aggregator ICS, etc.) no longer carries them:

1. Identify the best direct source for the venue (their own website, Squarespace JSON endpoint, Eventbrite, etc.)
2. Follow `skills/source-discovery/SKILL.md` to add the venue as a new direct source
3. Remove or keep the old upstream entry depending on whether it ever adds value (if an aggregator occasionally lists the venue, keep it with `expectEmpty`; if it never does, remove the calendar entry)

#### Adding `expectEmpty`

Add `expectEmpty: true` at the **ripper level** (all calendars) or **calendar level** (one calendar). See `AGENTS.md` for schema.

Commit these YAML-only changes on the feature branch as part of the build-report PR.

### 5. Geo Error Check

Check the geocode errors from the build health output.

**If no errors:**
```
🗺️ Geo coverage: N/M events (X%) — no geocode errors ✅
```

**If errors exist:**
Read `skills/geo-resolver/SKILL.md` and follow it completely to resolve the geocode errors.

After the geo resolver completes, include a geo fix summary in your reply including:
- How many errors were resolved vs. remain unresolvable
- For data-only fixes (KNOWN_VENUE_COORDS entries, lookup table additions): link the commit pushed direct to main
- For logic fixes: link the PR
- Updated geo coverage % after fixes

**After any code fixes** (geocoder or ripper changes), re-trigger a build and re-fetch `build-errors.json` to verify the errors are gone. Include the before/after error counts in your reply.

Note: data-only geo fixes (known venues, lookup entries) are pushed direct to main — no PR needed. Logic changes still require a PR.

### 6. Source Discovery (if no actionable errors)

If there are **no actionable errors** (0 config errors, 0 external failures, all geocode errors are virtual/TBA/unresolvable), read `skills/source-discovery/SKILL.md` and follow it completely.
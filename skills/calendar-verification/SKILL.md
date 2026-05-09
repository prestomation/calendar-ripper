# 206.events Calendar Verification

Verify calendar sources that don't have natural error feedback — recurring events and sources flagged `expectEmpty` — and refresh their geo coordinates from OpenStreetMap when locations change. Auto-correct safe drift, flag risky changes, all through a PR.

## Why this skill exists

Most sources self-report breakage (HTTP errors, ParseErrors, the zero-event warning). Two categories don't:

| Source | File pattern | Why no feedback |
|---|---|---|
| Recurring calendars | `sources/recurring/*.yaml` | Hand-coded; emit events forever even after the venue closes or the schedule changes |
| `expectEmpty: true` sources | `sources/external/*.yaml`, `sources/<name>/ripper.yaml` | The zero-event warning is intentionally suppressed; could be silently dead |

This skill walks through them on a rotation, verifies each against the live source, and applies confident fixes via PR.

## When to run

Whenever — daily, weekly, manually. Each run picks the 10 oldest-verified entries (skipping anything verified in the last 14 days), so cadence only affects how fast the catalog gets covered.

## State: in-file verification stamps

Verification status lives in a YAML comment at the top of each candidate file. No separate state file:

```yaml
# verified: 2026-05-09 ok
geo: null
name: hitc-trivia-stoup-ballard
...
```

Status values:
- `ok` — page confirmed everything matches
- `drift-fixed (field A→B, field C→D)` — listed fields were updated this run
- `flagged (reason)` — needs human review; no edits made beyond the stamp
- `unverifiable` — page exists but doesn't confirm or deny the schedule

YAML parsers strip comments, so the stamp has no effect on the build.

## Steps

### 1. Pick the next 10 entries

```bash
python3 skills/calendar-verification/scripts/pick-batch.py
```

Outputs the 10 oldest-stamped (or never-stamped) candidate paths, one per line as `<date>\t<relpath>`. Skips anything verified within the last 14 days. Exits non-zero if nothing is due — in that case, stop.

### 2. For each file, fetch and verify

For each path in the batch:

1. Read the YAML to get the current `friendlyname`, `schedule`, `start_time`, `duration`, `location`, `url`, and (where present) `geo`.
2. Fetch the `url` with WebFetch. If 404/410/connection-refused, also do a quick web search for the venue name to find a current URL or confirm closure.
3. Read the page. Extract anything that confirms or contradicts the YAML's fields.
4. Decide the outcome class (step 3).

### 3. Classify each outcome

| Class | Meaning | Action |
|---|---|---|
| **OK** | Page confirms event/venue, all checked fields match | Stamp `# verified: <today> ok` |
| **Drift, auto-fix** | Page confirms event but one or more fields are stale, page directly states the new values | Edit YAML, re-geocode if `location` changed, stamp `drift-fixed` |
| **URL changed** | Old URL 404s but you found the new canonical URL with high confidence (matches venue name + content) | Update `url` (and any other drifted fields), stamp `drift-fixed` |
| **Source gone** | High confidence the venue/event is permanently gone (closure announcement, social-media post, news article, or 404 + no replacement found) | Delete the YAML; if the deleted file produced a deployed feed, add an empty `allowed-removals/<filename>` per AGENTS.md |
| **Flag for review** | Something looks wrong but you're not sure (ambiguous schedule, partial confirmation, multiple plausible interpretations) | Stamp `flagged (<reason>)`, no edits |
| **Unverifiable** | Page loads, isn't broken, but doesn't say enough to confirm or deny | Stamp `unverifiable`, no edits |

### 4. Auto-fix rules — when to edit, when to flag

Edit a YAML when **all** are true:
- The page directly states the new value (not inferred from context)
- The change is unambiguous (no "every Monday or Tuesday depending on week" hedges)
- Only fields in the allowlist below are touched

**Auto-editable fields:** `friendlyname`, `schedule`, `start_time`, `duration`, `location`, `url`, `name`, `geo` (only when `location` changes — see step 5).

**Never auto-edit:** `tags`, `description`, `timezone`, `expectEmpty`. Flag those for review.

**`name` rename special case:** if you rename `name`, you MUST also create an empty file at `allowed-removals/<old-feed-filename>` (e.g. `recurring-old-name.ics` for a recurring entry, `external-OldName.ics` for an external feed). AGENTS.md requires this so the missing-URLs check accepts the rename. Subscribers of the old URL will break — only do this for clear typos, not preference renames. If unsure, flag instead.

**Deletion** is allowed when confidence is high. The PR is the human-review gate. Confidence is high when:
- URL is 404/410 AND a search confirms the venue closed or the event ended; or
- The page itself says "closed" / "permanently cancelled" / "no longer running"

If only the URL is dead but the venue clearly still operates, flag instead — the URL probably moved.

### 5. Geo updates — Nominatim only, never training data

When `location` changes, refresh `geo` by calling Nominatim:

```bash
python3 skills/calendar-verification/scripts/osm-geocode.py "1108 NW 52nd St, Seattle, WA 98107"
```

Output is `lat,lng` on a single line, or `unresolvable`. Use the result verbatim in the YAML:

```yaml
geo:
  lat: 47.6680
  lng: -122.3878
```

If `unresolvable`, set `geo: null` and include `geo unresolvable` in the drift-fix note. **Never write coordinates that didn't come from this script.** Training-data coordinates are out of date and silently wrong; the OSM API is the only sanctioned source.

`geo` can stay as-is when `location` did not change — don't churn it.

### 6. Stamp every file you touched (or read and confirmed OK)

Add or replace the `# verified: ...` line at the very top of each YAML — even files you didn't edit. This rotates them out of the next batch.

Example after a drift fix:
```yaml
# verified: 2026-05-09 drift-fixed (start_time 19:30→19:00)
geo: null
name: hitc-trivia-stoup-ballard
...
```

Example after a no-op:
```yaml
# verified: 2026-05-09 ok
geo: null
name: ballard-artwalk
...
```

For deleted files, no stamp — the file is gone and the batch picker won't re-select it.

### 7. Commit and push

The branch is already set in your environment (e.g. `claude/calendar-verification-...`). Commit with a verification-steps body so the reviewer can spot-check each entry without re-doing the work:

```bash
git add sources/ allowed-removals/ 2>/dev/null
git commit -m "$(cat <<'EOF'
chore: verify N calendar entries (X drifted, Y deleted, Z flagged, W ok)

Verification steps for reviewer:

1. ballard-artwalk
   URL: http://www.visitballard.com/artwalk/
   Status: ok
   Page confirms: 2nd Saturday 6-9pm in Ballard.

2. hitc-trivia-stoup-ballard
   URL: https://www.headinthecloudstrivia.com
   Status: drift-fixed (start_time 19:30→19:00)
   Page evidence: schedule lists "Stoup Brewing Ballard – Mondays at 7pm".

3. some-dead-venue
   URL: https://example.com/events  (404)
   Status: deleted + allowed-removals/recurring-some-dead-venue.ics
   Closure evidence: venue's IG post 2026-03-12 announcing permanent closure.

4. ambiguous-thing
   URL: https://example.com/calendar
   Status: flagged (page says "second or third Wednesday depending on month")
   No edits — needs human decision.

[…one entry per file touched, including OK ones…]
EOF
)"
git push -u origin <branch>
```

Each entry in the body MUST include:
- The YAML file's `name`
- The URL that was checked
- The status (matching the stamp)
- Evidence — a quote from the page, a closure announcement, or "page confirms unchanged"

The reviewer should be able to click each URL and confirm the stamp in under a minute.

## Safety rules

- **`name` rename → mandatory `allowed-removals/<old-filename>` entry.** Subscribers' ICS URLs break otherwise. AGENTS.md is strict on this.
- **`geo` only from `osm-geocode.py`.** Never guess, never use training-data lat/lng. If Nominatim says unresolvable, write `geo: null`.
- **Deletion needs evidence in the commit message**, not just a hunch.
- **One PR per batch**, draft, human-reviewable. Don't run two batches in parallel into the same branch.
- **Don't touch fields outside the allowlist** in step 4. Tag changes, description rewrites, and timezone shifts go through a separate PR with explicit review.
- **If uncertain, flag.** A flagged entry is cheap; a wrong auto-edit propagates to subscribers.

## Out of scope (for now)

- Hardcoded `geo` on rippers — venues rarely move; defer.
- External feeds without `expectEmpty` — their ICS feed is the source of truth and self-reports breakage.
- Tag/description audits — orthogonal concern.

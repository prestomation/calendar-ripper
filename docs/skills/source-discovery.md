# 206.events Source Discovery

Find and add new Seattle event sources to 206.events. Runs after the daily build report when there are no actionable errors to fix.

## When to run

This skill is triggered by the daily build report skill (`docs/skills/build-report.md`, step 5) when the build is healthy — 0 config errors, 0 external failures, all geocode errors are virtual/TBA/unresolvable. The build report skill will direct you here.

## Steps

### 1. Read existing candidates

Read `docs/source-candidates.md` to see what sources have already been evaluated. Skip any entry that already has a status (`💡 Candidate`, `🔍 Investigating`, `✅ Added`, `❌ Not Viable`, `⏸️ Blocked`) — these have already been triaged.

### 2. Check for dead sources

Before searching for new sources, check existing sources for signs of death:

```bash
curl -s https://206.events/build-errors.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
zeros = d.get('zeroEventCalendars', [])
ext_failures = d.get('externalCalendarFailures', [])
print(f'Zero-event calendars: {len(zeros)}')
for z in zeros:
    print(f'  {z}')
print(f'External failures: {len(ext_failures)}')
for f in ext_failures:
    print(f'  {f[\"name\"]}: {f[\"error\"]}')
"
```

For any source with **0 events for 30+ consecutive days** or returning **404/410 consistently**, flag it in `docs/source-candidates.md` under the "💀 Dead Source Investigation" section with the source name and symptoms. Do NOT disable it — just flag it for human review.

### 3. Search for new sources

Run 3-5 web searches using varied queries. **Rotate the focus daily** to avoid re-finding the same sources. Pick from these verticals in rotation:

- **Music venues**: `"Seattle live music venue calendar"`, `"Seattle concert calendar 2026"`, `"Capitol Hill music events"`, `"Ballard live music"`
- **Arts & culture**: `"Seattle art gallery events calendar"`, `"Seattle museum events 2026"`, `"Seattle theater calendar"`
- **Community**: `"Seattle community center events calendar"`, `"Seattle neighborhood events"`, `"Seattle block party 2026"`
- **Food & drink**: `"Seattle food festival 2026"`, `"Seattle beer release calendar"`, `"Seattle restaurant events"`
- **Comedy & nightlife**: `"Seattle comedy club calendar"`, `"Seattle open mic calendar"`, `"Seattle trivia night schedule"`
- **Outdoors & sports**: `"Seattle outdoor events calendar"`, `"Seattle running events 2026"`, `"Seattle farmers market schedule"`
- **Bookstores & libraries**: `"Seattle bookstore events calendar"`, `"Seattle author reading 2026"`
- **Festivals & seasonal**: `"Seattle festival 2026"`, `"Seattle summer events calendar"`, `"Seattle holiday market 2026"`

Also try discovery-oriented searches:
- `"site:seattle.gov calendar events"` — city events
- `"site:eventbrite.com Seattle events organizer"` — Eventbrite sources
- `"Seattle events ICS subscribe calendar"` — ICS feeds
- `"Seattle events RSS feed"` — RSS/ICS sources
- `"new Seattle venue 2026 events"` — recently opened venues

### 4. Quality gate each candidate

For each search result that looks like a Seattle event source, evaluate:

1. **Seattle-area?** Must be within Seattle city limits (no Bellevue, Kirkland, etc.)
2. **Has a public events page or feed?** Must have a URL with event listings
3. **Matches a known ripper type?** Must be one of:
   - ICS/iCal feed (add to `sources/external.yaml`)
   - Squarespace (built-in `squarespace` type)
   - Eventbrite (built-in `eventbrite` type — needs `organizerId`)
   - Ticketmaster (built-in `ticketmaster` type)
   - DICE (built-in `dice` type)
   - AXS (built-in `axs` type)
   - Simple HTML/JSON that could be scraped with a custom ripper
4. **Not already covered?** Check `sources/` directory and `sources/external.yaml`
5. **Not already in candidates?** Check `docs/source-candidates.md`
6. **Sufficient event volume?** Should have at least a few events, not a one-off

### 5. Implement viable sources

For each source that passes the quality gate:

1. **Investigate the source** — fetch its events page, check for ICS feeds, identify the platform (Squarespace, Eventbrite, etc.), determine the ripper type
2. **Spawn a coding subagent** to implement it:
   ```
   sessions_spawn(runtime="acp", agentId="claude", mode="run",
     cwd="/root/.openclaw/workspace/channels/1482476559465189426",
     task="Add a new event source to 206.events for [VENUE NAME]. Details: [URL], [ripper type], [tags], [address/geo]. Follow the AGENTS.md guidelines for adding new sources. Write tests. Open a PR on the current branch.")
   ```
3. **Steer the subagent** if needed via `subagents(action="steer", message="...")`
4. **Iterate on PR feedback** — if CI or Amazon Q has comments, steer the subagent to address them
5. **Report the PR link** in the daily message for human review

### 6. Update candidates file

For each source evaluated, update `docs/source-candidates.md`:

- **New candidate found**: Add entry with status `💡 Candidate`, the URL, platform/ripper type, tags, and investigation notes
- **Source implemented**: Update status to `✅ Added` with the PR number
- **Source not viable**: Update status to `❌ Not Viable` with the reason (e.g., "no public calendar", "not Seattle", "platform requires browser")
- **Source blocked**: Update status to `⏸️ Blocked` with the reason (e.g., "Cloudflare bot protection", "requires API key we don't have")

Add a date-stamped entry at the top of the Discovery Log section:
```markdown
### 2026-04-19
- ✅ Added: [venue name] — [ripper type] — PR #XXX
- 💡 Candidate: [venue name] — [ripper type] — [URL]
- ❌ Not Viable: [venue name] — [reason]
```

### 7. Report findings

Include a "🔍 Source Discovery" section in the daily report:

```
🔍 Source Discovery
  ✅ Added: venue name — type — N events — PR #XXX
  💡 Candidate: venue name — type — URL
  ❌ Not viable: venue name — reason
  💀 Dead source flagged: source name — symptom
```

## Important rules

- **Always open a PR** for new sources — never push direct to main
- **Always spawn a coding subagent** to implement the ripper — do not write code directly
- **Seattle city limits only** — no Eastside, no Kent, no Everett
- **Rotate search queries** — don't run the same searches every day
- **Check `docs/source-candidates.md` first** — avoid re-proposing evaluated sources
- **Flag dead sources** — but don't disable them without human approval
- **Respect the existing tag system** — check `lib/config/tags.ts` before proposing new tags
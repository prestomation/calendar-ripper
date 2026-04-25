# 206.events Source Discovery

Find and add new Seattle event sources to 206.events. Runs after the daily build report when there are no actionable errors to fix.

## When to run

This skill is triggered by the build report skill (`skills/build-report/SKILL.md`, step 5) when the build is healthy — 0 config errors, 0 external failures, all geocode errors are virtual/TBA/unresolvable. The build report skill will direct you here.

## Steps

### 1. Read existing candidates

Read `docs/source-candidates.md` to see what sources have already been evaluated. Skip any entry that already has a status (`💡 Candidate`, `🔍 Investigating`, `✅ Added`, `❌ Not Viable`, `⏸️ Blocked`) — these have already been triaged.

### 2. Check for dead sources

Before searching for new sources, check existing sources for signs of death:

```bash
python3 skills/source-discovery/scripts/dead-sources.py
```

For any source with **0 events for 30+ consecutive days** or returning **404/410 consistently**, flag it in `docs/source-candidates.md` under the "💀 Dead Source Investigation" section with the source name and symptoms. Do NOT disable it — just flag it for human review.

### 3. Search for new sources

Run 3-5 web searches using varied queries. **Rotate the focus daily** to avoid re-finding the same sources. Pick from these verticals in rotation:

- **Music venues**: `"Seattle live music venue calendar"`, `"Seattle concert calendar"`, `"Capitol Hill music events"`, `"Ballard live music"`
- **Arts & culture**: `"Seattle art gallery events calendar"`, `"Seattle museum events"`, `"Seattle theater calendar"`
- **Community**: `"Seattle community center events calendar"`, `"Seattle neighborhood events"`, `"Seattle block party"`
- **Food & drink**: `"Seattle food festival"`, `"Seattle beer release calendar"`, `"Seattle restaurant events"`
- **Comedy & nightlife**: `"Seattle comedy club calendar"`, `"Seattle open mic calendar"`, `"Seattle trivia night schedule"`
- **Outdoors & sports**: `"Seattle outdoor events calendar"`, `"Seattle running events"`, `"Seattle farmers market schedule"`
- **Bookstores & libraries**: `"Seattle bookstore events calendar"`, `"Seattle author reading"`
- **Festivals & seasonal**: `"Seattle festival"`, `"Seattle summer events calendar"`, `"Seattle holiday market"`

Also try discovery-oriented searches:
- `"site:seattle.gov calendar events"` — city events
- `"site:eventbrite.com Seattle events organizer"` — Eventbrite sources
- `"Seattle events ICS subscribe calendar"` — ICS feeds
- `"Seattle events RSS feed"` — RSS/ICS sources
- `"new Seattle venue events"` — recently opened venues

### 4. Quality gate each candidate

For each search result that looks like a Seattle event source, evaluate:

1. **Seattle-area?** Must be **Seattle-focused** — primarily serving Seattle audiences. Venues with a few events in nearby cities (Bellevue, Kirkland, etc.) are OK as long as most events are in Seattle proper.
2. **Has a public events page or feed?** Must have a URL with event listings
3. **Matches a known ripper type?** Must be one of:
   - ICS/iCal feed (add to `sources/external.yaml`)
   - Squarespace (built-in `squarespace` type — verify `?format=json` returns `itemCount > 0`)
   - Eventbrite (built-in `eventbrite` type — needs `organizerId`)
   - Ticketmaster (built-in `ticketmaster` type)
   - DICE (built-in `dice` type)
   - AXS (built-in `axs` type)
   - Shopify (built-in `shopify` type — verify `/products.json` returns events)
   - Custom HTML/JSON scraping (the repo has many custom rippers — this is viable, not "not viable")
4. **Not already covered?** Check `sources/` directory and `sources/external.yaml`
5. **Not already in candidates?** Check `docs/source-candidates.md`
6. **Sufficient event volume?** Should have at least a few events, not a one-off

### 5. Update candidates file and push to main

For each source evaluated, update `docs/source-candidates.md`:

- **New candidate found**: Add entry with status `💡 Candidate`, the URL, platform/ripper type, tags, and investigation notes
- **Source implemented**: Update status to `✅ Added` with the PR number
- **Source not viable**: Update status to `❌ Not Viable` with the reason (e.g., "no public calendar", "not Seattle", "platform requires browser")
- **Source blocked**: Update status to `⏸️ Blocked` with the reason (e.g., "Cloudflare bot protection", "requires API key we don't have")

Add a date-stamped entry at the top of the Discovery Log section:
```markdown
### YYYY-MM-DD
- ✅ Added: [venue name] — [ripper type] — PR #XXX
- 💡 Candidate: [venue name] — [ripper type] — [URL]
- ❌ Not Viable: [venue name] — [reason]
```

**Then commit `docs/source-candidates.md` and open a PR.** Even though this is reference data (not code), the repo requires all changes via PR. Use a branch like `chore/source-discovery-YYYY-MM-DD`. After CI passes and Amazon Q has no blocking comments, merge the PR. This ensures candidates are always up-to-date before we start implementing.

### 6. Implement the highest-confidence source

From the 💡 Candidate list, **always pick the source with the highest confidence**. Confidence tiers:

| Tier | Criteria | Examples |
|------|----------|---------|
| 🔥 **High** | Built-in type with **confirmed working API** — you've verified it returns data | Eventbrite with verified organizerId, Squarespace with confirmed `itemCount > 0`, ICS feed returning valid VCALENDAR, Shopify with confirmed `/products.json` |
| 🟡 **Medium** | Built-in type that *should* work but **unverified** | Eventbrite with untested org ID, WordPress/Tribe Events ICS endpoint, DICE venue ID |
| 🔴 **Low** | Requires **custom scraper code** | HTML table scraping, WordPress with custom REST endpoints |

**Only implement one source per cycle.** Pick the highest-confidence 💡 candidate that hasn't been attempted. If multiple have the same tier, pick the one with the most expected events.

**🔴 Low does not mean "not viable".** The repo has many custom scrapers (frye_art_museum, royal_room, cobys_cafe, seatoday, etc.). A 🔴 Low source is still worth implementing — it just takes more work and should be prioritized after higher-tier candidates. Only mark a source `❌ Not Viable` if it truly can't be scraped (no structured data at all, JS-rendered with no API, requires browser automation we don't have).

To implement:
1. **Cut a feature branch**: `scripts/new_feature_branch.sh`
2. **Spawn a coding agent**: `sessions_spawn(runtime="acp", agentId="claude", cwd=<repo_path>)` with the full implementation spec including ripper type, URL, config details, geo coordinates, and tags
3. **Push and open PR**: `scripts/push_and_pr.sh`

### 7. Verify events and iterate with Q

After the PR is open:

1. **Check event count in CI** — Read the PR's GitHub Actions build log. Find the new source's event count. **If 0 events**, revert the source addition, move it to `❌ Not Viable` in `source-candidates.md`, and stop — do not request human review for a dead source.

2. **Poll for Amazon Q review** — Check the PR for Amazon Q code review comments.

3. **If Q has blocking comments** → Steer the coding agent to fix them (`subagents(action="steer", message="...")`) → Push fixes → Re-poll.

4. **Repeat** until Q is clean and no blocking comments remain.

5. **When Q is clean + events confirmed (>0)** → Update the source status to `✅ Added` in `docs/source-candidates.md` and commit the update to the PR branch.

### 8. Report findings and request review

Include a "🔍 Source Discovery" section in the daily report:

```
🔍 Source Discovery
  ✅ Added: venue name — type — N events — PR #XXX (Q clean, ready for review)
  💡 Candidate: venue name — type — URL
  ❌ Not viable: venue name — reason
  💀 Dead source flagged: source name — symptom
```

**When a source PR is Q-clean with confirmed events**, explicitly tag Preston for review:
> 🚀 **PR #XXX is ready for review** — [venue name], [type], [N events]. Amazon Q clean, events confirmed in CI.

## Important rules

- **Always open a PR** for new sources — never push ripper code direct to main
- **Open a PR for `docs/source-candidates.md`** — even reference data changes need a PR (repo requires it)
- **Always implement highest-confidence source first** — don't skip to low-confidence custom scrapers when a verified built-in type is available
- **One source per cycle** — implement, verify, iterate with Q, then report. Don't stack multiple sources in one cycle.
- **Always delegate to a coding agent** to implement the ripper — do not write code directly
- **Seattle-focused only** — sources must primarily serve Seattle audiences. A few events outside city limits is OK (e.g., Seattle Uncorked with some Eastside events). Venues entirely outside Seattle (Edmonds, Everett, Kent) are not appropriate.
- **Rotate search queries** — don't run the same searches every day
- **Check `docs/source-candidates.md` first** — avoid re-proposing evaluated sources
- **Flag dead sources** — but don't disable them without human approval
- **Respect the existing tag system** — check `lib/config/tags.ts` before proposing new tags
- **Never add a source that returns 0 events** — new sources must produce at least 1 event in CI before merging. A source with 0 events has no proven data pipeline and may have the wrong ripper type, wrong URL, or a dead API. Sources that go from events→0 later are fine (they may recover), but a source that has never produced events should not be added.
- **Verify events in CI before requesting review** — check the PR build log for the source's event count. If 0 events, move the source to `❌ Not Viable` instead of requesting review.
- **Iterate with Q until clean** — don't request human review until Amazon Q has no blocking comments.
- **Parse methods must never return null** — new custom rippers must have parse methods that return `RipperCalendarEvent | RipperError` (never `null`). Filters and dedup belong in the caller, not the parse method. TypeScript enforces this at compile time. See AGENTS.md "Parse Methods Must Never Return Null" for the required pattern.

## Goals and Directives

### Goal: Add One New Source Every Run

**The primary goal of this skill is to add at least one new working source to the calendar every time it runs.** This is not optional — if the build is healthy, you must find and add a source.

- **Event count is NOT a criteria for rejection.** A source with 3 events is as valid as one with 300. Volume doesn't determine viability.
- **Any working source is better than no source.** Don't hold out for "better" candidates.
- **If you find a working source, implement it.** Don't leave it in the candidates file for "next time."

### Directive: Treat Local Checkout as Ephemeral

**All work must reach GitHub.** The local checkout is temporary — commits that don't get pushed are lost.

- **Always cut a feature branch** using `scripts/new_feature_branch.sh` or `git checkout -b feature/...`
- **Always push the branch** to origin
- **Always open a PR** — never leave changes local-only
- **Verify the PR URL** is returned to the user

### Directive: Low-Volume Sources Are Valid

Don't dismiss sources for having "only" a few events:

- **Shunpike (3 events)** — valid arts/community source
- **Book Larder (5 events)** — valid bookstore events
- **Cannonball Arts Center (6 events)** — valid new venue

Unique, curated events from small organizations are valuable. The calendar's strength is breadth and variety, not just volume.
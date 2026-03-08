# Source Health Dashboard — Implementation Plan

## Overview

Add a `/health` page to the web UI showing the operational status of all calendar sources. This lets maintainers quickly identify broken sources without digging through CI logs.

The dashboard will consume the existing `build-errors.json` (already generated at build time) and a new `health-history.json` file that accumulates snapshots over time.

---

## Phase 1: Health Page UI (Core)

### 1.1 Add `build-errors.json` to the web app's fetch layer

- In `App.jsx`, fetch `./build-errors.json` alongside `manifest.json` on app load
- Store in a new `buildErrors` state variable
- This file already exists in `output/` — no build changes needed

### 1.2 Add hash-based routing for the health page

The app uses hash-based URL state (`#view=happening-soon`, `#tag=Music`, etc.). Add a new view:

- URL: `#view=health`
- In `syncStateFromURL`, detect `view=health` and set a `showHealthDashboard` state flag
- In `updateURL`, support `view=health`

### 1.3 Build the `HealthDashboard` component

Create a new component (can live in `App.jsx` or a separate file) displaying:

**Summary cards at the top:**
- Total sources count
- Healthy sources (events > 0, no errors)
- Sources with errors
- Zero-event sources (unexpected)
- Expected-empty sources

**Source status table with columns:**
| Column | Source |
|--------|--------|
| Source name | `manifest.json` rippers + external + recurring |
| Status indicator | Derived: green (ok), yellow (0 events), red (errors) |
| Event count | From `manifest.json` or `build-errors.json` zero-event lists |
| Error count | From `build-errors.json` `.sources[].errorCount` |
| Error details (expandable) | From `build-errors.json` `.sources[].errors[]` |
| Type | Ripper / External / Recurring |
| Tags | From manifest |

**Additional sections:**
- Config errors list (from `build-errors.json` `.configErrors[]`)
- External calendar failures (from `.externalCalendarFailures[]`)
- Build timestamp (from `.buildTime`)

### 1.4 Add navigation entry

- Add a "Health" link/button in the sidebar header or footer area
- Navigates to `#view=health`

### 1.5 Styling

- Use the existing CSS variable system in `index.css`
- Status colors: green/yellow/red indicators
- Responsive: table on desktop, card-based on mobile
- Collapsible error details per source

---

## Phase 2: Event Count Enrichment

Currently `build-errors.json` tracks zero-event and expected-empty calendars by name, but doesn't include per-source event counts. The manifest also doesn't include counts.

### 2.1 Add event counts to `build-errors.json`

In `lib/calendar_ripper.ts`, add an `eventCounts` field to the build errors report:

```ts
const buildErrorsReport = {
  // ...existing fields...
  eventCounts: eventCounts.map(c => ({
    name: c.name,
    type: c.type,
    events: c.events,
    expectEmpty: c.expectEmpty || false
  }))
};
```

The `eventCounts` array is already computed in the build — this just serializes it.

### 2.2 Update dashboard to use event counts

- Display actual event count per source in the table
- Sort by status (errors first, then zero-events, then healthy)
- Add total events summary

---

## Phase 3: Historical Trend Tracking

Track source health over time so maintainers can see when a source broke.

### 3.1 Generate a health snapshot

After the build writes `build-errors.json`, generate a compact snapshot:

```json
{
  "timestamp": "2026-03-08T...",
  "sources": {
    "source-name": { "events": 42, "errors": 0, "status": "ok" },
    "broken-source": { "events": 0, "errors": 3, "status": "error" }
  }
}
```

### 3.2 Accumulate history in `output/health-history.json`

- In the build script or a new post-build step, read the existing `health-history.json` (if present from the deployed site), append the new snapshot, and write it back
- Keep a rolling window (e.g., last 30 builds / 30 days) to bound file size
- The CI workflow would need to fetch the current deployed `health-history.json` before the build so it can be appended to

### 3.3 CI workflow changes

In `.github/workflows/build-calendars.yml`:
- Before building, fetch the current `health-history.json` from the deployed site into `output/`
- The build appends to it automatically
- It gets deployed with the rest of the output

### 3.4 Trend UI in the dashboard

- Show a "History" column or expandable section per source
- Simple visual: colored dots for last N builds (green/yellow/red)
- "Broke N days ago" / "Broken for N builds" indicator
- Optional: sparkline-style mini chart of event counts over time

---

## Phase 4: Tests

### 4.1 Unit tests for the health dashboard component

In `web/src/App.test.jsx` (or a new `HealthDashboard.test.jsx`):
- Renders summary cards with correct counts
- Renders source table with correct statuses
- Handles missing `build-errors.json` gracefully (shows "unavailable")
- Expandable error details work
- Mobile responsive layout

### 4.2 Build-side tests

- Verify `eventCounts` field is written to `build-errors.json`
- Verify health history append logic (rolling window, dedup)

---

## File Changes Summary

| File | Change |
|------|--------|
| `web/src/App.jsx` | Add health view state, routing, nav link, `HealthDashboard` component |
| `web/src/index.css` | Health dashboard styles |
| `lib/calendar_ripper.ts` | Add `eventCounts` to build-errors report |
| `.github/workflows/build-calendars.yml` | Fetch existing `health-history.json` before build |
| `lib/health-history.ts` (new) | Health snapshot generation and history append logic |
| `web/src/App.test.jsx` | Health dashboard tests |

---

## Implementation Order

Recommended order to ship incrementally:

1. **Phase 1 + Phase 2** — Core dashboard with live build data. Immediately useful for triaging broken sources. Ship as first PR.
2. **Phase 3** — Historical tracking. Adds trend context but requires CI changes. Ship as follow-up PR.
3. **Phase 4** — Tests can be written alongside each phase.

---

## Out of Scope

- Alerting/notifications (Slack, email) for broken sources
- Auto-disabling broken sources
- Source-level configuration editing from the dashboard
- Authentication/access control on the health page

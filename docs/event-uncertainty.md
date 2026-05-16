# Event Uncertainty

A general-purpose system for rippers to signal that they couldn't
determine one or more fields of an event (a start time, a duration, a
location, an image), so the build can publish the event with a
placeholder while an LLM-driven resolver fills in the truth on a later
build.

Same shape as the geo-cache pattern: structured signals in
`build-errors.json` → an agent skill investigates → a JSON cache in S3
records resolutions → the next build applies them.

## Why

Roughly half of the events from `events12` had no time on the source
page. The old behavior silently defaulted to noon for 2 hours, so the
calendar quietly told subscribers the wrong time for ~50 events at a
time. Defaulting to noon is **a guess that looks like a fact**. The
choice was either:

1. Drop the events.
2. Keep guessing.
3. Publish a placeholder, signal the uncertainty, and let an LLM fix it.

This system is option 3.

## Anatomy

### Ripper output

A ripper that can't determine a field emits **two** items with the same
`event.id`:

1. The `RipperCalendarEvent` itself, with whatever placeholder it picked.
2. An `UncertaintyError` carrying the **full event** (not a subset of
   fields) plus a `unknownFields` array and an optional
   `partialFingerprint`.

Keeping the embedded event whole means that if `RipperCalendarEvent`
grows new fields, the resolver agent automatically sees them — no
schema migration here.

### Infrastructure merge

`lib/calendar_ripper.ts` calls `applyUncertaintyResolutions` for every
ripper after rip but before write. It:

- looks up `{source}:{event.id}` in `event-uncertainty-cache.json`,
- if **resolved**: applies the cached fields, drops the error,
- if **unresolvable**: drops the error, appends a "could not be verified"
  note to `description`,
- if **miss**: keeps the error, appends an "approximate — verification
  pending" note.

The pure function lives in `lib/uncertainty-merge.ts`; rippers don't
touch the cache, so no per-ripper plumbing is needed when new rippers
opt into the system.

### Cache

`event-uncertainty-cache.json` — committed empty, lives in S3 at
`s3://${OUTOFBAND_BUCKET}/latest/event-uncertainty-cache.json`, mirrors
geo-cache plumbing exactly (download at build start, upload after,
artifact backup with 90-day retention).

Schema:

```json
{
  "version": 1,
  "entries": {
    "events12:family-christmas-2025-12-01": {
      "fields": { "startTime": "16:00", "duration": 10800 },
      "resolvedAt": "2026-05-17",
      "source": "agent",
      "evidence": "https://events12.com/seattle/event/118800/",
      "partialFingerprint": "abc-d6-tu"
    },
    "events12:some-gone-event-2026-03-01": {
      "unresolvable": true,
      "reason": "Source page no longer lists this event",
      "resolvedAt": "2026-05-17",
      "source": "agent"
    }
  }
}
```

### Reporting

The system is only useful if every reporting surface knows about it.
`build-errors.json` carries the canonical data; everything else reads
from there:

| Surface | Output |
|---|---|
| `build-errors.json` | `uncertainEvents[]` (work queue), `uncertaintyStats` (counters), errors with `type: "Uncertainty"` per source |
| PR comment | `❓ Uncertain events:` line + collapsible breakdown of up to 20 entries |
| Main build step summary | Same line in `$GITHUB_STEP_SUMMARY` |
| Discord (main build success) | Inline count + nudge to run the resolver skill |
| Website health dashboard | "Uncertain Events" card + per-entry table with links to source pages |
| Daily build-report skill | Hands off to `event-uncertainty-resolver` when outstanding > 0 |

**Rule of thumb**: any new error category must be plumbed through all
of these in the same PR. See AGENTS.md → "Reporting parity".

### The resolver skill

`skills/event-uncertainty-resolver/SKILL.md` plus
`skills/event-uncertainty-resolver/scripts/uncertainty-cache.py` (a
mirror of `geo-cache.py`). The agent's loop:

1. `stats` — get the counts
2. `outstanding` — pull the work queue
3. For each entry: `WebFetch` the source URL, find the field, call
   `resolve` with the verified value (or `--unresolvable` with a
   reason)
4. Trigger a new build (or wait for the daily cron); the next build
   shows the corrected event.

### Cache invalidation

The `partialFingerprint` is a hash of whatever the ripper *did* parse
from the source. When upstream content changes (e.g., a real start time
finally gets published), the fingerprint changes and the cached
resolution is treated as a miss — the resolver re-investigates against
the new content. Without this, stale resolutions would silently
overwrite correct upstream values.

## Counting and CI

Outstanding uncertain events **count toward `totalErrors`** so they
don't get forgotten, but every reporting surface breaks them out as
their own category. They are **not fatal** — they don't block CI.

Rationale: uncertainty errors are todos, not failures. Letting them
fail CI would gate every PR on an out-of-band agent run. Treating them
as silent / informational would let them accumulate forever. The middle
ground (visible in every report but non-fatal) keeps the queue
shrinking without blocking development.

## Stable event IDs

Every ripper that opts into this system must produce **stable event
IDs derived from source content only** (no `Date.now()`, no array
indices, no randomness). The id is the cache join key — if it changes
between builds, all prior resolutions become orphans.

See AGENTS.md → "Ripper design: stable event IDs" for the rule.

## When to opt in

Opt a ripper into the system when:
- the upstream source legitimately omits a field on some events, and
- the alternative is silently guessing (e.g., defaulting time to noon).

Don't opt in when:
- the field is genuinely unrecoverable (e.g., the source page is
  cryptic and even a human couldn't tell).
- the missing field doesn't affect the event's usefulness (e.g., a
  missing image is fine; don't burn cache entries on it unless you
  want one).

## Future fields

Adding a new uncertain field (e.g. `description`):

1. Add it to `UncertaintyField` in `lib/config/schema.ts`.
2. Add the apply logic in `applyResolution` in `lib/uncertainty-merge.ts`.
3. Add the CLI flag in `skills/event-uncertainty-resolver/scripts/uncertainty-cache.py`.
4. Document the field shape in `SKILL.md`'s field reference table.

The embedded-event design in `UncertaintyError` means the new field is
already visible to the resolver agent without further schema changes.

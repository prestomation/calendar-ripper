# Source candidates

One file per candidate. Adding, evaluating, or flipping the status of a
candidate touches exactly one file, so two PRs working on different
candidates never conflict — which is the whole point of the split.

## Layout

```
docs/source-candidates/
├── README.md              ← you are here
├── <slug>.md              ← one per candidate
└── ...
```

The chronological discovery log (which day-by-day entries the daily skill
appends to) still lives in [`../source-candidates.md`](../source-candidates.md);
that file is now log-only.

## Filename

`<slug>.md` where `<slug>` is the candidate name lowercased with non-alpha
runs collapsed to `-` (e.g. `Julia's on Broadway` → `julias-on-broadway.md`).

If the candidate later becomes a real source, the corresponding ripper
directory under `sources/` may use a different slug — that's fine. The
candidate file's name is just the discovery-side identifier.

## File format

YAML frontmatter, then free-form Markdown notes.

```markdown
---
name: Julia's on Broadway
status: candidate          # candidate | investigating | added | proxy | blocked | notviable | dead
platform: Eventbrite       # ICS / Squarespace / Tribe Events / Custom HTML / etc.
url: https://www.juliasonbroadway.com/
tags: [Nightlife, Capitol Hill]
firstSeen: 2026-05-06
lastChecked: 2026-05-06
pr:                        # optional, set when implementation is in flight
---

Drag dinner theater at 300 Broadway E, Capitol Hill. Weekly shows
(Fri/Sat evenings, Sat/Sun brunch). Eventbrite organizer `80473185523`
shows 3 upcoming, but primary ticketing is SimpleTix...
```

### Status values

| Status         | When to use                                                          |
| -------------- | -------------------------------------------------------------------- |
| `candidate`    | Identified but not yet implemented                                   |
| `investigating`| Actively being researched                                            |
| `added`        | Implemented and merged. Keep the file as a historical record.        |
| `proxy`        | Implemented with `proxy: "outofband"` because GH Actions IPs blocked |
| `blocked`      | Site is hard-blocked (Cloudflare, CAPTCHA) — needs new approach      |
| `notviable`    | Evaluated and rejected (low volume, outside Seattle, no API, etc.)   |
| `dead`         | Was working, now broken / silent. Needs investigation.               |

When you flip a status, also bump `lastChecked`. The frontmatter is the
source of truth; don't restate the status emoji in the prose.

## Conventions

- **Don't rename files.** Even if the candidate gets renamed upstream,
  keep the existing slug so links from the discovery log still work.
- **Don't delete `notviable` files.** Future skill runs check the
  directory to avoid re-proposing the same candidate. Marking it
  `notviable` (with a one-line reason) is what stops re-discovery.
- **Tags follow `lib/config/tags.ts` conventions** — see that file for
  preferred spellings of neighborhood and activity tags.

## Why per-file?

`docs/source-candidates.md` was the highest-churn file in the repo. Two
PRs editing the file's status sections (e.g., one flipping a candidate
to `✅ Added`, another adding a new candidate) collided constantly. With
one file per candidate, each change is isolated.

# Discovery Log

One file per day of source discovery. Filename format: `YYYY-MM-DD.md`.

New entries are appended as new files — never edited into an existing file —
so two PRs that run discovery on different days never conflict here.

## How to add an entry

Create a new file `YYYY-MM-DD.md` with content:

```markdown
## Source discovery: <verticals searched>

- ✅ Added: [venue name] — [ripper type] — PR #XXX
- 💡 Candidate: [venue name] — [ripper type] — [URL]
- ❌ Not Viable: [venue name] — [reason]
- 🔄 Status fix: [venue name] — [what changed]
- 🔍 Investigating: [venue name] — [what's being looked at]
- ⛔ Blocked: [venue name] — [reason]
- 💀 Dead source flagged: [source name] — [symptom]
```

## Browsing

- By date: files sort chronologically by filename
- All at once: `ls docs/discovery-log/*.md | sort`

## Dead source reference

Static reference tables (disabled sources, confirmed-gone sources) live in
`docs/discovery-log/dead-sources.md`.

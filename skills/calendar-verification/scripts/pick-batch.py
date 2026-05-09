#!/usr/bin/env python3
"""Pick the next batch of calendar entries to verify.

Reads the `# verified: YYYY-MM-DD ...` comment at the top of each candidate
YAML and prints the 10 oldest (or never-stamped) paths. Excludes anything
verified within the last 14 days.

Candidates:
    - sources/recurring/*.yaml
    - sources/external/*.yaml with `expectEmpty: true`
    - sources/<name>/ripper.yaml with `expectEmpty: true`

Output: one row per candidate as `<date_or_never>\t<relpath>`, oldest first.
Exits 1 with a stderr message if nothing is due.
"""
import datetime
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parents[3]
BATCH_SIZE = 10
SKIP_WITHIN_DAYS = 14
STAMP_RE = re.compile(r"^#\s*verified:\s*(\d{4}-\d{2}-\d{2})", re.M)
EXPECT_EMPTY_RE = re.compile(r"^\s*expectEmpty:\s*true\b", re.M)


def head(path: pathlib.Path, n: int = 20) -> str:
    with path.open() as f:
        return "".join(f.readline() for _ in range(n))


def has_expect_empty(path: pathlib.Path) -> bool:
    return bool(EXPECT_EMPTY_RE.search(path.read_text()))


def candidate_files() -> list[pathlib.Path]:
    files: list[pathlib.Path] = []
    files.extend(sorted((REPO / "sources" / "recurring").glob("*.yaml")))
    for ext in sorted((REPO / "sources" / "external").glob("*.yaml")):
        if has_expect_empty(ext):
            files.append(ext)
    for rip in sorted((REPO / "sources").glob("*/ripper.yaml")):
        if has_expect_empty(rip):
            files.append(rip)
    return files


def stamp_date(path: pathlib.Path) -> datetime.date | None:
    m = STAMP_RE.search(head(path))
    if not m:
        return None
    try:
        return datetime.date.fromisoformat(m.group(1))
    except ValueError:
        return None


def main() -> int:
    today = datetime.date.today()
    cutoff = today - datetime.timedelta(days=SKIP_WITHIN_DAYS)

    rows: list[tuple[datetime.date, pathlib.Path]] = []
    for p in candidate_files():
        d = stamp_date(p)
        if d is not None and d > cutoff:
            continue
        rows.append((d or datetime.date.min, p))

    rows.sort(key=lambda r: (r[0], str(r[1])))
    selected = rows[:BATCH_SIZE]

    if not selected:
        print("No candidates due for verification.", file=sys.stderr)
        return 1

    for date, path in selected:
        rel = path.relative_to(REPO)
        stamp = date.isoformat() if date != datetime.date.min else "never"
        print(f"{stamp}\t{rel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

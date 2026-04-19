#!/usr/bin/env python3
"""206.events geo-cache operations.

Usage:
    geo-cache.py stats           — print geo coverage and error list from build-errors.json
    geo-cache.py analyze         — download geo-cache from S3 and categorize unresolvable entries
    geo-cache.py purge           — purge stale unresolvable entries from the S3 geo-cache
    geo-cache.py coverage URL    — print geo coverage from a build-errors.json URL

Environment:
    AWS credentials for S3 access (profile/role/env vars)
"""

import json
import sys
import subprocess
import tempfile
import os

BUCKET = "calendar-ripper-outofband-220483515252"
KEY = "latest/geo-cache.json"
REGION = "us-west-2"
DEFAULT_ERRORS_URL = "https://206.events/build-errors.json"


def fetch_json(url):
    """Fetch JSON from a URL."""
    import urllib.request
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read())


def get_build_errors(url=None):
    """Fetch build-errors.json from the live site or a custom URL."""
    return fetch_json(url or DEFAULT_ERRORS_URL)


def cmd_stats():
    """Print geo coverage and geocode error list."""
    d = get_build_errors()
    gs = d.get("geoStats", {})
    errs = d.get("geocodeErrors", [])
    total = gs.get("totalEvents", 0)
    with_geo = gs.get("eventsWithGeo", 0)
    pct = round(with_geo / total * 100) if total else 0
    print(f"Geo coverage: {with_geo} / {total} events ({pct}%)")
    print(f"Geocode errors: {len(errs)}")
    for e in errs:
        print(f"  [{e['source']}] {e['location']} — {e['reason']}")


def cmd_analyze():
    """Download geo-cache from S3 and categorize unresolvable entries."""
    cache_path = os.path.join(tempfile.gettempdir(), "geo-cache.json")

    # Download from S3
    subprocess.run(
        ["aws", "s3", "cp", f"s3://{BUCKET}/{KEY}", cache_path, "--region", REGION],
        check=True,
    )

    with open(cache_path) as f:
        cache = json.load(f)

    unresolvable = {k: v for k, v in cache["entries"].items() if v.get("unresolvable")}
    print(f"Total unresolvable: {len(unresolvable)}")

    # Group by likely cause
    virtual = [k for k in unresolvable if any(x in k for x in ["zoom", "online", "virtual", "tba", "tbd", "webinar", "http"])]
    dirty = [k for k in unresolvable if any(x in k for x in ["\\,", "\\;", "<br", "&amp", "&#"])]
    truncated = [k for k in unresolvable if len(k) > 40 and k[-1].isalpha() and k[-2].isalpha()]
    has_address = [k for k in unresolvable if any(c.isdigit() for c in k[:8]) and k not in virtual]
    venue_only = [k for k in unresolvable if not any(c.isdigit() for c in k) and k not in virtual + dirty]

    print(f"  Virtual/TBA (correct): {len(virtual)}")
    print(f"  Dirty keys (stale, need purge): {len(dirty)}")
    print(f"  Truncated strings (stale): {len(truncated)}")
    print(f"  Has street address (fixable?): {len(has_address)}")
    print(f"  Venue name only: {len(venue_only)}")

    print("\nVenue-only sample:")
    for k in sorted(venue_only)[:20]:
        print(f"  {k!r}")

    print(f"\nCache saved to: {cache_path}")


def cmd_purge():
    """Purge stale unresolvable entries from the S3 geo-cache and re-upload."""
    cache_path = os.path.join(tempfile.gettempdir(), "geo-cache.json")
    purged_path = os.path.join(tempfile.gettempdir(), "geo-cache-purged.json")

    if not os.path.exists(cache_path):
        print("No local geo-cache found. Run 'analyze' first to download it.", file=sys.stderr)
        sys.exit(1)

    with open(cache_path) as f:
        cache = json.load(f)

    to_purge = []
    for k, v in cache["entries"].items():
        if not v.get("unresolvable"):
            continue
        if any(x in k for x in ["\\,", "\\;", "<br", "&amp", "&#"]):
            to_purge.append(k)
        elif len(k) > 40 and k[-1].isalpha() and k[-2].isalpha():
            to_purge.append(k)

    for k in to_purge:
        del cache["entries"][k]

    print(f"Purged {len(to_purge)} entries")

    with open(purged_path, "w") as f:
        json.dump(cache, f, indent=2)

    # Upload to S3
    subprocess.run(
        [
            "aws", "s3", "cp", purged_path,
            f"s3://{BUCKET}/{KEY}", "--region", REGION,
            "--content-type", "application/json",
        ],
        check=True,
    )
    print("Uploaded to S3")


def cmd_coverage(url):
    """Print geo coverage from a build-errors.json URL."""
    d = fetch_json(url)
    gs = d.get("geoStats", {})
    total = gs.get("totalEvents", 0)
    with_geo = gs.get("eventsWithGeo", 0)
    pct = round(with_geo / total * 100) if total else 0
    print(f"{with_geo} / {total} ({pct}%)")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "stats":
        cmd_stats()
    elif cmd == "analyze":
        cmd_analyze()
    elif cmd == "purge":
        cmd_purge()
    elif cmd == "coverage":
        url = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_ERRORS_URL
        cmd_coverage(url)
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
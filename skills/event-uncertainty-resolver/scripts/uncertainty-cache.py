#!/usr/bin/env python3
"""206.events event-uncertainty-cache operations.

Usage:
    uncertainty-cache.py stats
        Print outstanding / resolved / unresolvable counts from the
        live build-errors.json.

    uncertainty-cache.py outstanding [--limit N]
        Print the work queue (uncertainEvents) with source, title, date,
        missing fields, and URL.

    uncertainty-cache.py resolve --key KEY [--start-time HH:MM]
                                 [--duration SECONDS] [--location STR]
                                 [--image URL] [--evidence URL]
                                 [--unresolvable [--reason STR]]
                                 [--force]
        Resolve a single cache entry. Downloads the cache from S3,
        applies the entry, and uploads back. Refuses to overwrite an
        existing entry unless --force.

Environment:
    AWS credentials for S3 access (profile / role / env vars).
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
from datetime import date

BUCKET = "calendar-ripper-outofband-220483515252"
KEY = "latest/event-uncertainty-cache.json"
REGION = "us-west-2"
DEFAULT_ERRORS_URL = "https://206.events/build-errors.json"

CACHE_PATH = os.path.join(tempfile.gettempdir(), "event-uncertainty-cache.json")


def fetch_json(url):
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read())


def download_cache():
    subprocess.run(
        ["aws", "s3", "cp", f"s3://{BUCKET}/{KEY}", CACHE_PATH, "--region", REGION],
        check=False,  # OK if the cache doesn't exist yet — start fresh
    )
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH) as f:
            return json.load(f)
    return {"version": 1, "entries": {}}


def upload_cache(cache):
    with open(CACHE_PATH, "w") as f:
        json.dump(cache, f, indent=2)
    subprocess.run(
        ["aws", "s3", "cp", CACHE_PATH, f"s3://{BUCKET}/{KEY}", "--region", REGION],
        check=True,
    )


def cmd_stats(args):
    errors = fetch_json(args.url or DEFAULT_ERRORS_URL)
    s = errors.get("uncertaintyStats", {})
    outstanding = s.get("outstanding", 0)
    resolved = s.get("resolvedFromCache", 0)
    unresolvable = s.get("acknowledgedUnresolvable", 0)
    queue = errors.get("uncertainEvents", [])
    print(f"Uncertain events outstanding: {outstanding}")
    print(f"Resolved from cache this build: {resolved}")
    print(f"Marked unresolvable: {unresolvable}")
    print(f"Work queue size (uncertainEvents): {len(queue)}")
    by_source = {}
    for u in queue:
        by_source.setdefault(u["source"], 0)
        by_source[u["source"]] += 1
    if by_source:
        print("\nBreakdown by source:")
        for src, n in sorted(by_source.items(), key=lambda x: -x[1]):
            print(f"  {src}: {n}")


def cmd_outstanding(args):
    errors = fetch_json(args.url or DEFAULT_ERRORS_URL)
    queue = errors.get("uncertainEvents", [])
    if not queue:
        print("No outstanding uncertain events.")
        return
    limit = args.limit or len(queue)
    for u in queue[:limit]:
        ev = u.get("event", {})
        key = f"{u['source']}:{ev.get('id', '?')}"
        print(f"[{key}]")
        print(f"  title:   {ev.get('summary', '?')}")
        print(f"  date:    {ev.get('date', '?')}")
        print(f"  missing: {', '.join(u.get('unknownFields', []))}")
        print(f"  url:     {ev.get('url', '(none)')}")
        if u.get("partialFingerprint"):
            print(f"  fp:      {u['partialFingerprint']}")
        print()
    if len(queue) > limit:
        print(f"... and {len(queue) - limit} more (use --limit to show more)")


def cmd_resolve(args):
    if not args.key:
        print("--key is required", file=sys.stderr)
        sys.exit(2)

    cache = download_cache()
    existing = cache["entries"].get(args.key)
    if existing and not args.force:
        print(f"Entry {args.key!r} already exists. Use --force to overwrite.", file=sys.stderr)
        print(json.dumps(existing, indent=2), file=sys.stderr)
        sys.exit(1)

    today = date.today().isoformat()

    if args.unresolvable:
        entry = {
            "unresolvable": True,
            "resolvedAt": today,
            "source": "agent",
        }
        if args.reason:
            entry["reason"] = args.reason
    else:
        fields = {}
        if args.start_time:
            fields["startTime"] = args.start_time
        if args.duration is not None:
            fields["duration"] = args.duration
        if args.location is not None:
            fields["location"] = args.location
        if args.image is not None:
            fields["image"] = args.image
        if not fields:
            print("Need at least one field (or --unresolvable).", file=sys.stderr)
            sys.exit(2)
        entry = {
            "fields": fields,
            "resolvedAt": today,
            "source": "agent",
        }
        if args.evidence:
            entry["evidence"] = args.evidence

    if args.fingerprint:
        entry["partialFingerprint"] = args.fingerprint

    cache["entries"][args.key] = entry
    upload_cache(cache)
    print(f"Resolved {args.key} →")
    print(json.dumps(entry, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_stats = sub.add_parser("stats")
    p_stats.add_argument("--url", help="Override build-errors.json URL (default: live site)")
    p_stats.set_defaults(func=cmd_stats)

    p_out = sub.add_parser("outstanding")
    p_out.add_argument("--url", help="Override build-errors.json URL (default: live site)")
    p_out.add_argument("--limit", type=int, help="Max entries to print")
    p_out.set_defaults(func=cmd_outstanding)

    p_res = sub.add_parser("resolve")
    p_res.add_argument("--key", required=True, help="Cache key, e.g. events12:family-christmas-2025-12-01")
    p_res.add_argument("--start-time", help="HH:MM or HH:MM:SS in the event's local timezone")
    p_res.add_argument("--duration", type=int, help="Duration in seconds")
    p_res.add_argument("--location", help="Location string")
    p_res.add_argument("--image", help="Image URL")
    p_res.add_argument("--evidence", help="URL the resolver verified against")
    p_res.add_argument("--unresolvable", action="store_true", help="Mark as unresolvable")
    p_res.add_argument("--reason", help="Reason text (only with --unresolvable)")
    p_res.add_argument("--fingerprint", help="partialFingerprint to record (copy from outstanding listing)")
    p_res.add_argument("--force", action="store_true", help="Overwrite existing entry")
    p_res.set_defaults(func=cmd_resolve)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

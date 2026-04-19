#!/usr/bin/env python3
"""206.events build health check.

Usage:
    build-health.py [URL]   — fetch build-errors.json and print a health summary

Defaults to https://206.events/build-errors.json
"""

import json
import sys
import urllib.request

DEFAULT_URL = "https://206.events/build-errors.json"


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    with urllib.request.urlopen(url) as resp:
        d = json.loads(resp.read())

    config_errors = d.get("configErrors", [])
    ext_failures = d.get("externalCalendarFailures", [])
    zero_event = d.get("zeroEventCalendars", [])
    expected_empty = d.get("expectedEmptyCalendars", [])
    event_counts = d.get("eventCounts", {})
    geo_stats = d.get("geoStats", {})
    geo_errors = d.get("geocodeErrors", [])
    timestamp = d.get("buildTimestamp", "unknown")

    total_errors = len(config_errors) + len(ext_failures) + len(geo_errors)

    print(f"Total errors: {total_errors}")
    print()

    if config_errors:
        print(f"Config errors ({len(config_errors)}):")
        for e in config_errors:
            print(f"  {e}")
        print()

    if ext_failures:
        print(f"External failures ({len(ext_failures)}):")
        for f in ext_failures:
            print(f"  {f['name']}: {f['error']}")
        print()

    if zero_event:
        print(f"Zero-event calendars ({len(zero_event)}):")
        for z in zero_event:
            print(f"  {z}")
        print()

    # expectedEmpty cross-check
    for cal in expected_empty:
        count = event_counts.get(cal, 0)
        if count > 0:
            print(f"⚠️  {cal} is marked expectEmpty but has {count} events — consider removing the expectEmpty flag")

    # Geo stats
    total_events = geo_stats.get("totalEvents", 0)
    with_geo = geo_stats.get("eventsWithGeo", 0)
    pct = round(with_geo / total_events * 100) if total_events else 0
    print(f"🗺️  Geo coverage: {with_geo} / {total_events} events ({pct}%)")
    if geo_errors:
        print(f"Geocode errors: {len(geo_errors)}")
        for e in geo_errors[:10]:
            print(f"  [{e['source']}] {e['location']} — {e['reason']}")
        if len(geo_errors) > 10:
            print(f"  ... and {len(geo_errors) - 10} more")
    else:
        print("No geocode errors ✅")

    print(f"\nBuild timestamp: {timestamp}")


if __name__ == "__main__":
    main()
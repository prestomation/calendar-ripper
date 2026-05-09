#!/usr/bin/env python3
"""Resolve an address or place name via OpenStreetMap Nominatim.

Usage:
    osm-geocode.py "1108 NW 52nd St, Seattle, WA 98107"

Prints "lat,lng" on a single line, or "unresolvable" if no result.

This is the ONLY sanctioned source of geo coordinates for the calendar
verification skill. Never substitute model-internal coordinates — they are
silently wrong and not maintained.
"""
import json
import sys
import urllib.parse
import urllib.request

USER_AGENT = "206events-calendar-verification/1.0 (https://206.events)"


def geocode(query: str) -> tuple[float, float] | None:
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": query, "format": "json", "limit": 1}
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    if not data:
        return None
    return float(data[0]["lat"]), float(data[0]["lon"])


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: osm-geocode.py <address-or-place>", file=sys.stderr)
        return 2
    result = geocode(sys.argv[1])
    if result is None:
        print("unresolvable")
        return 0
    lat, lng = result
    print(f"{lat},{lng}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

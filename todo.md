# 206.events — Outstanding Work

Operational follow-ups that don't fit `ideas.md` (which is for new content/features).
Move items to `ideas.md` if they grow into proper feature designs.

## OSM Integration Follow-ups

Out of the original "what's next" list from PR #206, these are deferred:

### Surface OSM links in the web UI
`venues.json` and `events-index.json` carry `osmType`/`osmId` for every venue
that resolved cleanly via Nominatim, but the web app doesn't render them
anywhere. Add a "View on OpenStreetMap" link to:
- Venue popups in the events map (`web/src/components/EventMap.jsx` or wherever
  the popup renders)
- The venue detail / "Happening Soon" cards if there's room
- Build the URL with `https://www.openstreetmap.org/<osmType>/<osmId>` —
  pair is atomic, so render iff both are present.

Small UX win, proves the downstream contract works end-to-end.

### Backfill the hardcoded fallback tables in `lib/geocoder.ts`
`KNOWN_VENUE_COORDS`, `SPL_BRANCH_COORDS`, and `UW_BUILDING_COORDS` are
hand-curated lat/lng tables — none of them carry OSM ids today, so any
event resolved through these tables ships without `osmType`/`osmId`. Two
options:
1. Promote these entries into proper ripper/external/recurring `geo` blocks
   where applicable, then run the backfill script — cleanest, but most disruptive.
2. Extend `GeoCoords` and the lookup tables to support optional
   `osmId`/`osmType`, then enrich the table values themselves over time
   (one Nominatim query per entry, cached).

These are some of the most stable venues in the corpus (libraries,
universities, well-known music venues), so they're high-value targets
for OSM enrichment once a path is chosen.

### Stale-ID detection
OSM features can be split, merged, or deleted upstream. Today we never
re-verify a stored `osmId`/`osmType` — a 404 will silently sit in our
data until someone notices. Add a low-priority periodic check (monthly?)
that hits Nominatim's `/lookup` with the stored id and drops + re-resolves
on miss. Keep it off the critical path; a stale id is degraded UX, not a
broken build.

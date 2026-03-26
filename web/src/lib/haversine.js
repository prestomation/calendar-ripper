/**
 * Haversine distance formula — shared between App.jsx, EventsMap.jsx, and filter-parity tests.
 * NOTE: The Cloudflare Worker (infra/favorites-worker/src/feed.ts) maintains its own copy
 * as a separate deploy target, but this file is the single source of truth for all
 * client-side usage.
 *
 * This function MUST stay byte-for-byte identical to infra/favorites-worker/src/feed.ts haversineKm.
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.min(1, Math.max(0,
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  ))
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

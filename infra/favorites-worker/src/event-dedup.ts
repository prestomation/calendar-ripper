import type { EventsIndexEntry } from './types.js'

/** Jaccard token similarity between two strings */
export function titleSimilarity(a: string, b: string): number {
  const tokA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean))
  const tokB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean))
  if (tokA.size === 0 || tokB.size === 0) return 0
  const intersection = [...tokA].filter(t => tokB.has(t)).length
  const union = new Set([...tokA, ...tokB]).size
  return intersection / union
}

/** Haversine distance in km */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  const aClamped = Math.min(1, Math.max(0, a))
  return R * 2 * Math.atan2(Math.sqrt(aClamped), Math.sqrt(1 - aClamped))
}

export interface DeduplicatedEvent extends EventsIndexEntry {
  dedupedSources?: string[]
}

/**
 * Deduplicate a list of EventsIndexEntry items using:
 *   same date-bucket + geocoords ≤50m + title token Jaccard similarity ≥0.6
 *
 * Returns a new array with dupes removed. The kept event gets `dedupedSources`
 * populated with the icsUrl(s) of any suppressed duplicates.
 *
 * Events without lat/lng are never matched as duplicates (pass through unchanged).
 *
 * When two events are considered duplicates, the one with the longer description
 * is kept; ties go to the first encountered (stable).
 */
export function deduplicateEvents(events: EventsIndexEntry[]): DeduplicatedEvent[] {
  // suppressed[i] = true means event[i] was absorbed by an earlier winner
  const suppressed = new Array<boolean>(events.length).fill(false)
  // accumulated deduped sources for each winner index
  const dedupedSourcesMap = new Map<number, string[]>()

  for (let i = 0; i < events.length; i++) {
    if (suppressed[i]) continue

    const a = events[i]
    const aDate = a.date.slice(0, 10)

    // Skip events without coordinates — they can't participate in geo-dedup
    if (a.lat == null || a.lng == null) continue

    for (let j = i + 1; j < events.length; j++) {
      if (suppressed[j]) continue

      const b = events[j]

      // 1. Same date bucket (YYYY-MM-DD)
      if (b.date.slice(0, 10) !== aDate) continue

      // 2. Both must have coords, within 50m
      if (b.lat == null || b.lng == null) continue
      if (haversineKm(a.lat, a.lng, b.lat, b.lng) > 0.05) continue

      // 3. Title Jaccard similarity ≥ 0.6
      if (titleSimilarity(a.summary, b.summary) < 0.6) continue

      // They're duplicates. Loser is the one with shorter description (ties: j loses).
      const aDescLen = (a.description ?? '').length
      const bDescLen = (b.description ?? '').length

      if (bDescLen > aDescLen) {
        // b wins: suppress i, attribute i's source to j
        suppressed[i] = true
        const sources = dedupedSourcesMap.get(j) ?? []
        sources.push(a.icsUrl)
        // Also carry over any sources already accumulated for i
        const iSources = dedupedSourcesMap.get(i)
        if (iSources) {
          sources.push(...iSources)
          dedupedSourcesMap.delete(i)
        }
        dedupedSourcesMap.set(j, sources)
        break // i is suppressed; move to next i
      } else {
        // a wins (or tie): suppress j
        suppressed[j] = true
        const sources = dedupedSourcesMap.get(i) ?? []
        sources.push(b.icsUrl)
        // Carry over any sources accumulated for j
        const jSources = dedupedSourcesMap.get(j)
        if (jSources) {
          sources.push(...jSources)
          dedupedSourcesMap.delete(j)
        }
        dedupedSourcesMap.set(i, sources)
        // i is still alive; continue scanning for more dupes of i
      }
    }
  }

  // Emit all non-suppressed events, attaching dedupedSources where applicable
  const result: DeduplicatedEvent[] = []
  for (let i = 0; i < events.length; i++) {
    if (suppressed[i]) continue
    const entry: DeduplicatedEvent = { ...events[i] }
    const sources = dedupedSourcesMap.get(i)
    if (sources && sources.length > 0) {
      entry.dedupedSources = sources
    }
    result.push(entry)
  }

  return result
}

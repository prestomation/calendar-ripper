import Fuse from 'fuse.js'
import type { EventsIndexEntry } from './types.js'

const FUSE_THRESHOLD = 0.1

interface CachedResource<T> {
  data: T
  fetchedAt: number
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

const eventsIndexCache = new Map<string, CachedResource<EventsIndexEntry[]>>()
const allIcsCache = new Map<string, CachedResource<string>>()

export async function fetchEventsIndex(baseUrl: string): Promise<EventsIndexEntry[]> {
  const now = Date.now()
  const cached = eventsIndexCache.get(baseUrl)
  if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.data
  }

  const res = await fetch(`${baseUrl}/events-index.json`)
  if (!res.ok) throw new Error(`Failed to fetch events-index.json: HTTP ${res.status}`)
  let data: EventsIndexEntry[]
  try {
    data = await res.json() as EventsIndexEntry[]
  } catch {
    throw new Error('Failed to parse events-index.json: invalid JSON')
  }
  eventsIndexCache.set(baseUrl, { data, fetchedAt: now })
  return data
}

export async function fetchAllIcs(baseUrl: string): Promise<string> {
  const now = Date.now()
  const cached = allIcsCache.get(baseUrl)
  if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.data
  }

  const res = await fetch(`${baseUrl}/tag-all.ics`)
  if (!res.ok) throw new Error(`Failed to fetch tag-all.ics: HTTP ${res.status}`)
  const data = await res.text()
  allIcsCache.set(baseUrl, { data, fetchedAt: now })
  return data
}

// Exported for testing
export function _clearCaches() {
  eventsIndexCache.clear()
  allIcsCache.clear()
}

export function searchEventsIndex(
  eventsIndex: EventsIndexEntry[],
  searchFilters: string[]
): Set<string> {
  const fuse = new Fuse(eventsIndex, {
    keys: ['summary', 'description', 'location'],
    threshold: FUSE_THRESHOLD,
  })

  const matchingSummaries = new Set<string>()
  for (const filter of searchFilters) {
    const results = fuse.search(filter)
    for (const result of results) {
      // Use summary to identify matching events in ICS
      matchingSummaries.add(result.item.summary)
    }
  }
  return matchingSummaries
}

export function extractMatchingVEvents(
  allIcs: string,
  matchingSummaries: Set<string>
): string[] {
  const eventBlocks: string[] = []
  const events = allIcs.split('BEGIN:VEVENT')

  for (let i = 1; i < events.length; i++) {
    const block = events[i].split('END:VEVENT')[0]
    const summaryMatch = block.match(/^SUMMARY:(.+)$/m)
    if (!summaryMatch) continue

    const summary = summaryMatch[1].trim()
    if (matchingSummaries.has(summary)) {
      eventBlocks.push(`BEGIN:VEVENT${block}END:VEVENT`)
    }
  }

  return eventBlocks
}

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

  const matchingKeys = new Set<string>()
  for (const filter of searchFilters) {
    const results = fuse.search(filter)
    for (const result of results) {
      // Use summary+date composite key, consistent with the web UI
      matchingKeys.add(result.item.summary + '|' + result.item.date)
    }
  }
  return matchingKeys
}

/**
 * Unfold ICS content lines per RFC 5545 §3.1:
 * Long lines may be folded by inserting a CRLF followed by a single
 * whitespace character (space or tab). This reverses that folding.
 */
function unfoldIcsLines(text: string): string {
  return text.replace(/\r?\n[ \t]/g, '')
}

/**
 * Extract a property value from an unfolded ICS block.
 * Handles properties with parameters (e.g., DTSTART;TZID=America/Los_Angeles:20260320T190000).
 */
function getIcsProperty(block: string, prop: string): string | null {
  const regex = new RegExp(`^${prop}[;:](.+)$`, 'm')
  const match = block.match(regex)
  if (!match) return null
  // If the match includes parameters (;), extract just the value after the last ':'
  const value = match[1]
  if (match[0].charAt(prop.length) === ';') {
    const colonIdx = value.indexOf(':')
    return colonIdx >= 0 ? value.slice(colonIdx + 1).trim() : value.trim()
  }
  return value.trim()
}

/**
 * Convert an ICS DTSTART value (e.g., "20260320T190000Z" or "20260320T190000")
 * into the ISO-like date format used in events-index.json (e.g., "2026-03-20T19:00").
 */
function icsDateToIndexDate(dtstart: string): string | null {
  // Expect at least YYYYMMDDTHHMMSS (15 chars)
  const digits = dtstart.replace('Z', '')
  if (digits.length < 15 || digits[8] !== 'T') return null
  const y = digits.slice(0, 4)
  const m = digits.slice(4, 6)
  const d = digits.slice(6, 8)
  const hh = digits.slice(9, 11)
  const mm = digits.slice(11, 13)
  return `${y}-${m}-${d}T${hh}:${mm}`
}

export function extractMatchingVEvents(
  allIcs: string,
  matchingKeys: Set<string>
): string[] {
  const eventBlocks: string[] = []
  const events = allIcs.split('BEGIN:VEVENT')

  for (let i = 1; i < events.length; i++) {
    const rawBlock = events[i].split('END:VEVENT')[0]
    const unfolded = unfoldIcsLines(rawBlock)

    const summary = getIcsProperty(unfolded, 'SUMMARY')
    if (!summary) continue

    const dtstart = getIcsProperty(unfolded, 'DTSTART')
    const dateKey = dtstart ? icsDateToIndexDate(dtstart) : null

    // Match on summary+date composite key (consistent with web UI)
    // Fall back to summary-only if we can't parse the date
    const compositeKey = dateKey ? summary + '|' + dateKey : null
    if ((compositeKey && matchingKeys.has(compositeKey)) || (!compositeKey && matchingKeys.has(summary))) {
      eventBlocks.push(`BEGIN:VEVENT${rawBlock}END:VEVENT`)
    }
  }

  return eventBlocks
}

import { Hono } from 'hono'
import type { Env, FeedTokenRecord, FavoritesRecord } from './types.js'
import { mergeIcsFiles } from './ics-merge.js'
import { fetchEventsIndex, fetchAllIcs, searchEventsIndex, extractMatchingVEvents } from './event-search.js'

export const feedRoutes = new Hono<{ Bindings: Env }>()

feedRoutes.get('/:filename', async (c) => {
  const filename = c.req.param('filename')
  if (!filename.endsWith('.ics')) return c.text('Not found', 404)
  const token = filename.slice(0, -4)

  const tokenRaw = await c.env.FEED_TOKENS.get(token)
  if (!tokenRaw) return c.text('Not found', 404)

  const tokenRecord = JSON.parse(tokenRaw) as FeedTokenRecord

  const favRaw = await c.env.FAVORITES.get(tokenRecord.userId)
  const favorites: FavoritesRecord = favRaw
    ? JSON.parse(favRaw)
    : { icsUrls: [], updatedAt: new Date().toISOString() }

  const searchFilters = favorites.searchFilters || []
  const hasIcsFavorites = favorites.icsUrls.length > 0
  const hasSearchFilters = searchFilters.length > 0

  if (!hasIcsFavorites && !hasSearchFilters) {
    const emptyIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Calendar Ripper//Favorites//EN',
      'X-WR-CALNAME:Seattle Calendar Ripper — Favorites',
      'END:VCALENDAR',
    ].join('\r\n')

    return new Response(emptyIcs, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }

  const baseUrl = c.env.GITHUB_PAGES_BASE_URL
  const icsContents: string[] = []

  // Fetch favorited calendar ICS files
  if (hasIcsFavorites) {
    const fetches = favorites.icsUrls.map(async (icsUrl) => {
      try {
        // Validate URL is a safe relative .ics path (no protocol, no traversal)
        if (!icsUrl.endsWith('.ics') || icsUrl.includes('://') || icsUrl.includes('..')) {
          return
        }
        const res = await fetch(`${baseUrl}/${icsUrl}`)
        if (res.ok) {
          icsContents.push(await res.text())
        }
      } catch {
        // Skip failed fetches
      }
    })
    await Promise.all(fetches)
  }

  // Search for events matching search filters
  let searchMatchedVEvents: string[] = []
  if (hasSearchFilters) {
    try {
      const [eventsIndex, allIcs] = await Promise.all([
        fetchEventsIndex(baseUrl),
        fetchAllIcs(baseUrl),
      ])
      const matchingSummaries = searchEventsIndex(eventsIndex, searchFilters)
      searchMatchedVEvents = extractMatchingVEvents(allIcs, matchingSummaries)
    } catch {
      // If search data fetch fails, continue with just favorites
    }
  }

  const merged = mergeIcsFiles(icsContents, searchMatchedVEvents)

  return new Response(merged, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

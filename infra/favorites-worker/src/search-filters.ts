import { Hono } from 'hono'
import type { Env } from './types.js'
import { requireAuth, getFavorites } from './favorites-helpers.js'

export const searchFiltersRoutes = new Hono<{ Bindings: Env }>()

const MAX_SEARCH_FILTERS = 25
const MAX_FILTER_LENGTH = 200

function isValidFilter(filter: unknown): filter is string {
  return typeof filter === 'string' && filter.trim().length > 0 && filter.length <= MAX_FILTER_LENGTH && !filter.includes('/')
}

searchFiltersRoutes.get('/', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const record = await getFavorites(c.env.FAVORITES, userId)
  return c.json({ searchFilters: record.searchFilters, updatedAt: record.updatedAt })
})

searchFiltersRoutes.put('/', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  let body: { searchFilters: string[] }
  try {
    body = await c.req.json() as { searchFilters: string[] }
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  if (!Array.isArray(body.searchFilters)) {
    return c.json({ error: 'searchFilters must be an array' }, 400)
  }
  if (body.searchFilters.length > MAX_SEARCH_FILTERS) {
    return c.json({ error: `Too many search filters (max ${MAX_SEARCH_FILTERS})` }, 400)
  }

  const trimmed: string[] = []
  const seen = new Set<string>()
  for (const f of body.searchFilters) {
    if (!isValidFilter(f)) {
      return c.json({ error: 'Invalid search filter: must be a non-empty string (max 200 chars)' }, 400)
    }
    const key = f.trim().toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      trimmed.push(f.trim())
    }
  }

  const record = await getFavorites(c.env.FAVORITES, userId)
  record.searchFilters = trimmed
  record.updatedAt = new Date().toISOString()
  await c.env.FAVORITES.put(userId, JSON.stringify(record))
  return c.json({ searchFilters: record.searchFilters, updatedAt: record.updatedAt })
})

searchFiltersRoutes.post('/', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  let body: { filter: string }
  try {
    body = await c.req.json() as { filter: string }
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  if (!isValidFilter(body.filter)) {
    return c.json({ error: 'Invalid search filter' }, 400)
  }

  const filter = body.filter.trim()
  const record = await getFavorites(c.env.FAVORITES, userId)
  if (record.searchFilters.length >= MAX_SEARCH_FILTERS) {
    return c.json({ error: 'Maximum search filters limit reached' }, 400)
  }

  const exists = record.searchFilters.some(f => f.toLowerCase() === filter.toLowerCase())
  if (!exists) {
    record.searchFilters.push(filter)
    record.updatedAt = new Date().toISOString()
    await c.env.FAVORITES.put(userId, JSON.stringify(record))
  }

  return c.json({ searchFilters: record.searchFilters, updatedAt: record.updatedAt })
})

searchFiltersRoutes.delete('/:filter', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const filter = decodeURIComponent(c.req.param('filter'))
  const record = await getFavorites(c.env.FAVORITES, userId)

  record.searchFilters = record.searchFilters.filter(
    f => f.toLowerCase() !== filter.toLowerCase()
  )
  record.updatedAt = new Date().toISOString()
  await c.env.FAVORITES.put(userId, JSON.stringify(record))

  return c.json({ searchFilters: record.searchFilters, updatedAt: record.updatedAt })
})

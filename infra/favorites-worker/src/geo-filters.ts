import { Hono } from 'hono'
import type { Env, GeoFilter } from './types.js'
import { requireAuth, getFavorites } from './favorites-helpers.js'

export const geoFiltersRoutes = new Hono<{ Bindings: Env }>()

const MAX_GEO_FILTERS = 10
const MAX_RADIUS_KM = 100
const MAX_LABEL_LENGTH = 100

function isValidGeoFilter(f: unknown): f is GeoFilter {
  if (typeof f !== 'object' || f === null) return false
  const obj = f as Record<string, unknown>
  if (typeof obj.lat !== 'number' || obj.lat < -90 || obj.lat > 90) return false
  if (typeof obj.lng !== 'number' || obj.lng < -180 || obj.lng > 180) return false
  if (typeof obj.radiusKm !== 'number' || obj.radiusKm <= 0 || obj.radiusKm > MAX_RADIUS_KM) return false
  if (obj.label !== undefined) {
    if (typeof obj.label !== 'string') return false
    if (obj.label.length > MAX_LABEL_LENGTH) return false
  }
  return true
}

geoFiltersRoutes.get('/', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const record = await getFavorites(c.env.FAVORITES, userId)
  return c.json({ geoFilters: record.geoFilters, updatedAt: record.updatedAt })
})

geoFiltersRoutes.post('/', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (!isValidGeoFilter(body)) {
    return c.json({ error: 'Invalid geo filter: lat (-90..90), lng (-180..180), radiusKm (0..100) required' }, 400)
  }

  const record = await getFavorites(c.env.FAVORITES, userId)
  if (record.geoFilters.length >= MAX_GEO_FILTERS) {
    return c.json({ error: `Maximum geo filters limit reached (max ${MAX_GEO_FILTERS})` }, 400)
  }

  const filter: GeoFilter = {
    lat: body.lat,
    lng: body.lng,
    radiusKm: body.radiusKm,
    ...(body.label !== undefined ? { label: body.label } : {}),
  }

  record.geoFilters.push(filter)
  record.updatedAt = new Date().toISOString()
  await c.env.FAVORITES.put(userId, JSON.stringify(record))

  return c.json({ geoFilters: record.geoFilters, updatedAt: record.updatedAt })
})

geoFiltersRoutes.put('/', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (!Array.isArray(body)) {
    return c.json({ error: 'Body must be an array of geo filters' }, 400)
  }

  if (body.length > MAX_GEO_FILTERS) {
    return c.json({ error: `Too many geo filters (max ${MAX_GEO_FILTERS})` }, 400)
  }

  for (const f of body) {
    if (!isValidGeoFilter(f)) {
      return c.json({ error: 'Invalid geo filter: lat (-90..90), lng (-180..180), radiusKm (0..100) required' }, 400)
    }
  }

  const filters: GeoFilter[] = body.map((f: GeoFilter) => ({
    lat: f.lat,
    lng: f.lng,
    radiusKm: f.radiusKm,
    ...(f.label !== undefined ? { label: f.label } : {}),
  }))

  const record = await getFavorites(c.env.FAVORITES, userId)
  record.geoFilters = filters
  record.updatedAt = new Date().toISOString()
  await c.env.FAVORITES.put(userId, JSON.stringify(record))

  return c.json({ geoFilters: record.geoFilters, updatedAt: record.updatedAt })
})

geoFiltersRoutes.delete('/:index', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const indexParam = c.req.param('index')
  const index = parseInt(indexParam, 10)

  if (isNaN(index)) {
    return c.json({ error: 'Invalid index' }, 400)
  }

  const record = await getFavorites(c.env.FAVORITES, userId)

  if (index < 0 || index >= record.geoFilters.length) {
    return c.json({ error: 'Index out of bounds' }, 400)
  }

  record.geoFilters.splice(index, 1)
  record.updatedAt = new Date().toISOString()
  await c.env.FAVORITES.put(userId, JSON.stringify(record))

  return c.json({ geoFilters: record.geoFilters, updatedAt: record.updatedAt })
})

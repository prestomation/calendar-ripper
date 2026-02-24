import { Hono } from 'hono'
import type { Env, FavoritesRecord } from './types.js'
import { extractUserId } from './auth-middleware.js'

export const favoritesRoutes = new Hono<{ Bindings: Env }>()

async function requireAuth(c: any): Promise<string | null> {
  const userId = await extractUserId(c.req.header('Cookie'), c.env.JWT_SECRET)
  if (!userId) {
    return null
  }
  return userId
}

async function getFavorites(kv: KVNamespace, userId: string): Promise<FavoritesRecord> {
  const raw = await kv.get(userId)
  if (!raw) return { icsUrls: [], updatedAt: new Date().toISOString() }
  return JSON.parse(raw) as FavoritesRecord
}

favoritesRoutes.get('/', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const record = await getFavorites(c.env.FAVORITES, userId)
  return c.json({ favorites: record.icsUrls, updatedAt: record.updatedAt })
})

favoritesRoutes.put('/', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json() as { favorites: string[] }
  if (!Array.isArray(body.favorites)) {
    return c.json({ error: 'favorites must be an array' }, 400)
  }

  const record: FavoritesRecord = {
    icsUrls: body.favorites,
    updatedAt: new Date().toISOString(),
  }
  await c.env.FAVORITES.put(userId, JSON.stringify(record))
  return c.json({ favorites: record.icsUrls, updatedAt: record.updatedAt })
})

favoritesRoutes.post('/:icsUrl', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const icsUrl = c.req.param('icsUrl')
  const record = await getFavorites(c.env.FAVORITES, userId)

  if (!record.icsUrls.includes(icsUrl)) {
    record.icsUrls.push(icsUrl)
    record.updatedAt = new Date().toISOString()
    await c.env.FAVORITES.put(userId, JSON.stringify(record))
  }

  return c.json({ favorites: record.icsUrls, updatedAt: record.updatedAt })
})

favoritesRoutes.delete('/:icsUrl', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const icsUrl = c.req.param('icsUrl')
  const record = await getFavorites(c.env.FAVORITES, userId)

  record.icsUrls = record.icsUrls.filter(u => u !== icsUrl)
  record.updatedAt = new Date().toISOString()
  await c.env.FAVORITES.put(userId, JSON.stringify(record))

  return c.json({ favorites: record.icsUrls, updatedAt: record.updatedAt })
})

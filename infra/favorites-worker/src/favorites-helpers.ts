import type { FavoritesRecord } from './types.js'
import { extractUserId } from './auth-middleware.js'

export async function requireAuth(c: any): Promise<string | null> {
  const userId = await extractUserId(c.req.header('Cookie'), c.env.JWT_SECRET)
  return userId || null
}

// NOTE: Both favorites.ts and search-filters.ts do read-modify-write on
// the same KV key. Concurrent mutations for the same user can race (last
// write wins). KV does not support CAS. This is acceptable given low
// per-user concurrency; Durable Objects would be needed for true atomicity.
export async function getFavorites(kv: KVNamespace, userId: string): Promise<FavoritesRecord> {
  const raw = await kv.get(userId)
  if (!raw) return { icsUrls: [], searchFilters: [], updatedAt: new Date().toISOString() }
  try {
    const record = JSON.parse(raw) as FavoritesRecord
    if (!record.searchFilters) record.searchFilters = []
    return record
  } catch {
    return { icsUrls: [], searchFilters: [], updatedAt: new Date().toISOString() }
  }
}

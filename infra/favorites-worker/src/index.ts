import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env, QueueBatchMessage } from './types.js'
import { authRoutes } from './auth.js'
import { favoritesRoutes } from './favorites.js'
import { searchFiltersRoutes } from './search-filters.js'
import { geoFiltersRoutes } from './geo-filters.js'
import { feedRoutes } from './feed.js'
import { notificationRoutes } from './notifications.js'
import { processNotificationBatch } from './notifications.js'

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return ''
    if (origin === 'https://prestomation.github.io') return origin
    if (origin.startsWith('http://localhost')) return origin
    if (origin.startsWith('http://127.0.0.1')) return origin
    return ''
  },
  credentials: true,
}))

app.get('/health', (c) => c.json({ ok: true }))
app.route('/auth', authRoutes)
app.route('/favorites', favoritesRoutes)
app.route('/search-filters', searchFiltersRoutes)
app.route('/geo-filters', geoFiltersRoutes)
app.route('/feed', feedRoutes)
app.route('/notifications', notificationRoutes)

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<QueueBatchMessage>, env: Env): Promise<void> {
    await processNotificationBatch(batch, env)
  },
}

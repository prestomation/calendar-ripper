import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types.js'
import { authRoutes } from './auth.js'
import { favoritesRoutes } from './favorites.js'
import { feedRoutes } from './feed.js'

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return ''
    if (origin === 'https://prestomation.github.io') return origin
    if (origin === 'https://htmlpreview.github.io') return origin
    if (origin.startsWith('http://localhost')) return origin
    if (origin.startsWith('http://127.0.0.1')) return origin
    return ''
  },
  credentials: true,
}))

app.get('/health', (c) => c.json({ ok: true }))
app.route('/auth', authRoutes)
app.route('/favorites', favoritesRoutes)
app.route('/feed', feedRoutes)

export default app

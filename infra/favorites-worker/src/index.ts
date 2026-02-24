import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types.js'

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return ''
    if (origin.includes('prestomation.github.io')) return origin
    if (origin.includes('localhost')) return origin
    return ''
  },
  credentials: true,
}))

app.get('/health', (c) => c.json({ ok: true }))

export default app

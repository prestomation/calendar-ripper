import { Hono } from 'hono'
import type { Env, UserRecord } from './types.js'
import { signJWT } from './jwt.js'
import { extractUserId } from './auth-middleware.js'

export const authRoutes = new Hono<{ Bindings: Env }>()

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

authRoutes.get('/login', (c) => {
  const provider = c.req.query('provider')
  if (provider !== 'google') {
    return c.json({ error: 'Unsupported provider' }, 400)
  }

  const callbackUrl = new URL('/auth/callback', c.req.url).toString()
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
  })

  return c.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`)
})

authRoutes.get('/callback', async (c) => {
  const code = c.req.query('code')
  if (!code) return c.json({ error: 'Missing code' }, 400)

  const callbackUrl = new URL('/auth/callback', c.req.url).toString()

  // Exchange code for access token
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) return c.json({ error: 'Token exchange failed' }, 502)
  const tokenData = await tokenRes.json() as { access_token: string }

  // Fetch user profile
  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  if (!userRes.ok) return c.json({ error: 'User info fetch failed' }, 502)
  const profile = await userRes.json() as { id: string; email: string; name: string; picture: string }

  const userId = `user:google:${profile.id}`
  const now = new Date().toISOString()

  // Check if user already exists
  let user: UserRecord | null = null
  const existingRaw = await c.env.USERS.get(userId)
  if (existingRaw) {
    user = JSON.parse(existingRaw) as UserRecord
    user.lastLoginAt = now
    user.email = profile.email
    user.name = profile.name
    user.picture = profile.picture
  } else {
    // New user — generate feed token
    const feedToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    user = {
      id: userId,
      provider: 'google',
      providerId: profile.id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      feedToken,
      createdAt: now,
      lastLoginAt: now,
    }
    // Store reverse lookup: token → userId
    await c.env.FEED_TOKENS.put(feedToken, JSON.stringify({ userId }))
  }

  await c.env.USERS.put(userId, JSON.stringify(user))

  // Create session JWT
  const token = await signJWT({ sub: userId }, c.env.JWT_SECRET, SESSION_MAX_AGE)

  // Redirect back to site with session cookie
  return new Response(null, {
    status: 302,
    headers: {
      Location: c.env.SITE_URL,
      'Set-Cookie': `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`,
    },
  })
})

authRoutes.get('/me', async (c) => {
  const userId = await extractUserId(c.req.header('Cookie'), c.env.JWT_SECRET)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const userRaw = await c.env.USERS.get(userId)
  if (!userRaw) return c.json({ error: 'User not found' }, 404)

  const user = JSON.parse(userRaw) as UserRecord
  const workerUrl = new URL(c.req.url).origin
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      feedToken: user.feedToken,
      feedUrl: `${workerUrl}/feed/${user.feedToken}.ics`,
    },
  })
})

authRoutes.post('/logout', (c) => {
  return c.json({ ok: true }, 200, {
    'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
  })
})

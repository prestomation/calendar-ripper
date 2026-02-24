# Personalized ICS Favorites Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add server-side persistence and personalized ICS feed generation for user favorites via Cloudflare Workers, with Google OAuth login.

**Architecture:** Cloudflare Worker (Hono router) with 3 KV namespaces (USERS, FAVORITES, FEED_TOKENS). Google OAuth for auth, JWT sessions via HttpOnly cookies. Frontend syncs localStorage favorites with server on login. Feed endpoint merges favorited ICS files from GitHub Pages into a single subscribable calendar.

**Tech Stack:** Cloudflare Workers, Hono, KV, Vitest, Google OAuth 2.0, JWT (HS256), React 18 (existing Vite app)

**Design Doc:** `docs/design-personalized-ics-favorites.md`

---

## Task 1: Scaffold Cloudflare Worker Project

**Files:**
- Create: `infra/favorites-worker/package.json`
- Create: `infra/favorites-worker/tsconfig.json`
- Create: `infra/favorites-worker/wrangler.toml`
- Create: `infra/favorites-worker/src/index.ts`
- Create: `infra/favorites-worker/src/types.ts`

**Step 1: Create package.json**

```json
{
  "name": "calendar-ripper-favorites",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "hono": "^4.0.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240208.0",
    "vitest": "^1.3.0",
    "wrangler": "^3.28.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

**Step 3: Create wrangler.toml**

```toml
name = "calendar-ripper-favorites"
main = "src/index.ts"
compatibility_date = "2026-02-01"

[vars]
GITHUB_PAGES_BASE_URL = "https://prestomation.github.io/calendar-ripper"
SITE_URL = "https://prestomation.github.io/calendar-ripper"

[[kv_namespaces]]
binding = "USERS"
id = "placeholder-create-via-wrangler"

[[kv_namespaces]]
binding = "FAVORITES"
id = "placeholder-create-via-wrangler"

[[kv_namespaces]]
binding = "FEED_TOKENS"
id = "placeholder-create-via-wrangler"
```

**Step 4: Create `src/types.ts`**

```typescript
export interface Env {
  USERS: KVNamespace
  FAVORITES: KVNamespace
  FEED_TOKENS: KVNamespace
  JWT_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GITHUB_PAGES_BASE_URL: string
  SITE_URL: string
}

export interface UserRecord {
  id: string
  provider: string
  providerId: string
  email: string
  name: string
  picture: string
  feedToken: string
  createdAt: string
  lastLoginAt: string
}

export interface FavoritesRecord {
  icsUrls: string[]
  updatedAt: string
}

export interface FeedTokenRecord {
  userId: string
}

export interface JWTPayload {
  sub: string
  exp: number
}
```

**Step 5: Create minimal `src/index.ts` router**

```typescript
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
```

**Step 6: Install dependencies**

Run: `cd infra/favorites-worker && npm install`

**Step 7: Verify TypeScript compiles**

Run: `cd infra/favorites-worker && npx tsc --noEmit`
Expected: No errors

**Step 8: Commit**

```
feat: scaffold Cloudflare Worker project for favorites API
```

---

## Task 2: JWT Utilities

**Files:**
- Create: `infra/favorites-worker/src/jwt.ts`
- Create: `infra/favorites-worker/test/jwt.test.ts`

**Step 1: Write failing tests for JWT sign/verify**

```typescript
// test/jwt.test.ts
import { describe, it, expect } from 'vitest'
import { signJWT, verifyJWT } from '../src/jwt.js'

const SECRET = 'test-secret-key-for-jwt-signing'

describe('JWT utilities', () => {
  it('signs and verifies a valid token', async () => {
    const payload = { sub: 'user:google:12345' }
    const token = await signJWT(payload, SECRET, 3600)
    const result = await verifyJWT(token, SECRET)
    expect(result).not.toBeNull()
    expect(result!.sub).toBe('user:google:12345')
  })

  it('returns null for an expired token', async () => {
    const payload = { sub: 'user:google:12345' }
    const token = await signJWT(payload, SECRET, -1)
    const result = await verifyJWT(token, SECRET)
    expect(result).toBeNull()
  })

  it('returns null for a tampered token', async () => {
    const payload = { sub: 'user:google:12345' }
    const token = await signJWT(payload, SECRET, 3600)
    const tampered = token.slice(0, -5) + 'XXXXX'
    const result = await verifyJWT(tampered, SECRET)
    expect(result).toBeNull()
  })

  it('returns null for a token signed with wrong secret', async () => {
    const payload = { sub: 'user:google:12345' }
    const token = await signJWT(payload, 'wrong-secret', 3600)
    const result = await verifyJWT(token, SECRET)
    expect(result).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd infra/favorites-worker && npx vitest run test/jwt.test.ts`
Expected: FAIL — cannot resolve `../src/jwt.js`

**Step 3: Implement JWT sign/verify using Web Crypto API**

```typescript
// src/jwt.ts
import type { JWTPayload } from './types.js'

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4)
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  )
}

export async function signJWT(payload: Omit<JWTPayload, 'exp'>, secret: string, expiresInSeconds: number): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload: JWTPayload = { ...payload, exp: now + expiresInSeconds }

  const enc = new TextEncoder()
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)))
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(fullPayload)))
  const signingInput = `${headerB64}.${payloadB64}`

  const key = await getKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput))
  const sigB64 = base64UrlEncode(new Uint8Array(sig))

  return `${signingInput}.${sigB64}`
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerB64, payloadB64, sigB64] = parts
    const signingInput = `${headerB64}.${payloadB64}`
    const enc = new TextEncoder()

    const key = await getKey(secret)
    const sig = base64UrlDecode(sigB64)
    const valid = await crypto.subtle.verify('HMAC', key, sig, enc.encode(signingInput))
    if (!valid) return null

    const payload: JWTPayload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)))
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp <= now) return null

    return payload
  } catch {
    return null
  }
}
```

**Step 4: Run tests**

Run: `cd infra/favorites-worker && npx vitest run test/jwt.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```
feat: add JWT sign/verify utilities using Web Crypto API
```

---

## Task 3: Auth Middleware

**Files:**
- Create: `infra/favorites-worker/src/auth-middleware.ts`
- Create: `infra/favorites-worker/test/auth-middleware.test.ts`

**Step 1: Write failing tests**

```typescript
// test/auth-middleware.test.ts
import { describe, it, expect } from 'vitest'
import { extractUserId } from '../src/auth-middleware.js'
import { signJWT } from '../src/jwt.js'

const SECRET = 'test-secret'

describe('extractUserId', () => {
  it('extracts userId from a valid session cookie', async () => {
    const token = await signJWT({ sub: 'user:google:123' }, SECRET, 3600)
    const cookie = `session=${token}`
    const result = await extractUserId(cookie, SECRET)
    expect(result).toBe('user:google:123')
  })

  it('returns null when no cookie header', async () => {
    const result = await extractUserId(undefined, SECRET)
    expect(result).toBeNull()
  })

  it('returns null when session cookie is missing', async () => {
    const result = await extractUserId('other=value', SECRET)
    expect(result).toBeNull()
  })

  it('returns null for invalid JWT', async () => {
    const result = await extractUserId('session=garbage', SECRET)
    expect(result).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd infra/favorites-worker && npx vitest run test/auth-middleware.test.ts`
Expected: FAIL

**Step 3: Implement**

```typescript
// src/auth-middleware.ts
import { verifyJWT } from './jwt.js'

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map(c => {
      const [key, ...rest] = c.trim().split('=')
      return [key, rest.join('=')]
    })
  )
}

export async function extractUserId(cookieHeader: string | undefined, secret: string): Promise<string | null> {
  const cookies = parseCookies(cookieHeader)
  const token = cookies['session']
  if (!token) return null
  const payload = await verifyJWT(token, secret)
  return payload?.sub ?? null
}
```

**Step 4: Run tests**

Run: `cd infra/favorites-worker && npx vitest run test/auth-middleware.test.ts`
Expected: All PASS

**Step 5: Commit**

```
feat: add auth middleware for session cookie extraction
```

---

## Task 4: Google OAuth Endpoints

**Files:**
- Create: `infra/favorites-worker/src/auth.ts`
- Create: `infra/favorites-worker/test/auth.test.ts`
- Modify: `infra/favorites-worker/src/index.ts`

**Step 1: Write tests for auth routes**

```typescript
// test/auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import app from '../src/index.js'

// Mock KV namespaces
function createMockKV() {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
    _store: store,
  }
}

const mockEnv = {
  USERS: createMockKV(),
  FAVORITES: createMockKV(),
  FEED_TOKENS: createMockKV(),
  JWT_SECRET: 'test-jwt-secret',
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  GITHUB_PAGES_BASE_URL: 'https://prestomation.github.io/calendar-ripper',
  SITE_URL: 'https://prestomation.github.io/calendar-ripper',
}

describe('Auth endpoints', () => {
  beforeEach(() => {
    mockEnv.USERS = createMockKV()
    mockEnv.FAVORITES = createMockKV()
    mockEnv.FEED_TOKENS = createMockKV()
  })

  it('GET /auth/login redirects to Google OAuth', async () => {
    const res = await app.request(
      '/auth/login?provider=google',
      { method: 'GET' },
      mockEnv
    )
    expect(res.status).toBe(302)
    const location = res.headers.get('Location')!
    expect(location).toContain('accounts.google.com/o/oauth2')
    expect(location).toContain('client_id=test-client-id')
    expect(location).toContain('scope=')
  })

  it('GET /auth/login returns 400 for unsupported provider', async () => {
    const res = await app.request(
      '/auth/login?provider=facebook',
      { method: 'GET' },
      mockEnv
    )
    expect(res.status).toBe(400)
  })

  it('GET /auth/me returns 401 without session cookie', async () => {
    const res = await app.request('/auth/me', { method: 'GET' }, mockEnv)
    expect(res.status).toBe(401)
  })

  it('POST /auth/logout clears session cookie', async () => {
    const res = await app.request('/auth/logout', { method: 'POST' }, mockEnv)
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('Set-Cookie')!
    expect(setCookie).toContain('session=')
    expect(setCookie).toContain('Max-Age=0')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd infra/favorites-worker && npx vitest run test/auth.test.ts`
Expected: FAIL

**Step 3: Implement auth routes**

```typescript
// src/auth.ts
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
```

**Step 4: Wire auth routes into index.ts**

Update `src/index.ts`:
```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types.js'
import { authRoutes } from './auth.js'

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
app.route('/auth', authRoutes)

export default app
```

**Step 5: Run tests**

Run: `cd infra/favorites-worker && npx vitest run test/auth.test.ts`
Expected: All PASS

**Step 6: Commit**

```
feat: add Google OAuth login/callback/logout/me endpoints
```

---

## Task 5: Favorites CRUD API

**Files:**
- Create: `infra/favorites-worker/src/favorites.ts`
- Create: `infra/favorites-worker/test/favorites.test.ts`
- Modify: `infra/favorites-worker/src/index.ts`

**Step 1: Write failing tests**

```typescript
// test/favorites.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import app from '../src/index.js'
import { signJWT } from '../src/jwt.js'

function createMockKV() {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
    _store: store,
  }
}

const JWT_SECRET = 'test-jwt-secret'

async function makeAuthCookie(userId = 'user:google:123') {
  const token = await signJWT({ sub: userId }, JWT_SECRET, 3600)
  return `session=${token}`
}

function createEnv() {
  return {
    USERS: createMockKV(),
    FAVORITES: createMockKV(),
    FEED_TOKENS: createMockKV(),
    JWT_SECRET,
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
    GITHUB_PAGES_BASE_URL: 'https://prestomation.github.io/calendar-ripper',
    SITE_URL: 'https://prestomation.github.io/calendar-ripper',
  }
}

describe('Favorites API', () => {
  let env: ReturnType<typeof createEnv>

  beforeEach(() => {
    env = createEnv()
  })

  it('GET /favorites returns empty list for new user', async () => {
    const cookie = await makeAuthCookie()
    const res = await app.request('/favorites', {
      headers: { Cookie: cookie },
    }, env)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.favorites).toEqual([])
  })

  it('GET /favorites returns 401 without auth', async () => {
    const res = await app.request('/favorites', {}, env)
    expect(res.status).toBe(401)
  })

  it('PUT /favorites replaces the full list', async () => {
    const cookie = await makeAuthCookie()
    const res = await app.request('/favorites', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorites: ['stoup_brewing-all-events.ics', 'tag-music.ics'] }),
    }, env)
    expect(res.status).toBe(200)

    const getRes = await app.request('/favorites', {
      headers: { Cookie: cookie },
    }, env)
    const data = await getRes.json()
    expect(data.favorites).toEqual(['stoup_brewing-all-events.ics', 'tag-music.ics'])
  })

  it('POST /favorites/:icsUrl adds a single favorite', async () => {
    const cookie = await makeAuthCookie()
    const res = await app.request('/favorites/stoup_brewing-all-events.ics', {
      method: 'POST',
      headers: { Cookie: cookie },
    }, env)
    expect(res.status).toBe(200)

    const getRes = await app.request('/favorites', {
      headers: { Cookie: cookie },
    }, env)
    const data = await getRes.json()
    expect(data.favorites).toContain('stoup_brewing-all-events.ics')
  })

  it('POST /favorites/:icsUrl does not duplicate', async () => {
    const cookie = await makeAuthCookie()
    await app.request('/favorites/stoup_brewing-all-events.ics', {
      method: 'POST',
      headers: { Cookie: cookie },
    }, env)
    await app.request('/favorites/stoup_brewing-all-events.ics', {
      method: 'POST',
      headers: { Cookie: cookie },
    }, env)

    const getRes = await app.request('/favorites', {
      headers: { Cookie: cookie },
    }, env)
    const data = await getRes.json()
    const count = data.favorites.filter((f: string) => f === 'stoup_brewing-all-events.ics').length
    expect(count).toBe(1)
  })

  it('DELETE /favorites/:icsUrl removes a favorite', async () => {
    const cookie = await makeAuthCookie()
    await app.request('/favorites/stoup_brewing-all-events.ics', {
      method: 'POST',
      headers: { Cookie: cookie },
    }, env)
    const delRes = await app.request('/favorites/stoup_brewing-all-events.ics', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    }, env)
    expect(delRes.status).toBe(200)

    const getRes = await app.request('/favorites', {
      headers: { Cookie: cookie },
    }, env)
    const data = await getRes.json()
    expect(data.favorites).not.toContain('stoup_brewing-all-events.ics')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd infra/favorites-worker && npx vitest run test/favorites.test.ts`
Expected: FAIL

**Step 3: Implement favorites routes**

```typescript
// src/favorites.ts
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
```

**Step 4: Wire favorites routes into index.ts**

Add to `src/index.ts`:
```typescript
import { favoritesRoutes } from './favorites.js'
// ...
app.route('/favorites', favoritesRoutes)
```

**Step 5: Run tests**

Run: `cd infra/favorites-worker && npx vitest run test/favorites.test.ts`
Expected: All PASS

**Step 6: Commit**

```
feat: add favorites CRUD API endpoints
```

---

## Task 6: ICS Merge Utility

**Files:**
- Create: `infra/favorites-worker/src/ics-merge.ts`
- Create: `infra/favorites-worker/test/ics-merge.test.ts`

**Step 1: Write failing tests**

```typescript
// test/ics-merge.test.ts
import { describe, it, expect } from 'vitest'
import { mergeIcsFiles } from '../src/ics-merge.js'

const ICS_A = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:event-a-1@test
DTSTART:20260301T100000Z
SUMMARY:Event A1
END:VEVENT
END:VCALENDAR`

const ICS_B = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-b-1@test
DTSTART:20260302T100000Z
SUMMARY:Event B1
END:VEVENT
BEGIN:VEVENT
UID:event-b-2@test
DTSTART:20260303T100000Z
SUMMARY:Event B2
END:VEVENT
END:VCALENDAR`

const ICS_DUPLICATE = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-a-1@test
DTSTART:20260301T100000Z
SUMMARY:Event A1 (duplicate)
END:VEVENT
END:VCALENDAR`

describe('mergeIcsFiles', () => {
  it('merges events from multiple ICS files', () => {
    const result = mergeIcsFiles([ICS_A, ICS_B])
    expect(result).toContain('BEGIN:VCALENDAR')
    expect(result).toContain('END:VCALENDAR')
    expect(result).toContain('Event A1')
    expect(result).toContain('Event B1')
    expect(result).toContain('Event B2')
    // Count VEVENT blocks
    const eventCount = (result.match(/BEGIN:VEVENT/g) || []).length
    expect(eventCount).toBe(3)
  })

  it('deduplicates events by UID', () => {
    const result = mergeIcsFiles([ICS_A, ICS_DUPLICATE])
    const eventCount = (result.match(/BEGIN:VEVENT/g) || []).length
    expect(eventCount).toBe(1)
  })

  it('returns valid empty calendar for no input', () => {
    const result = mergeIcsFiles([])
    expect(result).toContain('BEGIN:VCALENDAR')
    expect(result).toContain('END:VCALENDAR')
    expect(result).not.toContain('BEGIN:VEVENT')
  })

  it('sets correct calendar name and PRODID', () => {
    const result = mergeIcsFiles([ICS_A])
    expect(result).toContain('X-WR-CALNAME:Seattle Calendar Ripper')
    expect(result).toContain('PRODID:-//Calendar Ripper//Favorites//EN')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd infra/favorites-worker && npx vitest run test/ics-merge.test.ts`
Expected: FAIL

**Step 3: Implement ICS merge**

```typescript
// src/ics-merge.ts

export function mergeIcsFiles(icsContents: string[]): string {
  const seenUids = new Set<string>()
  const eventBlocks: string[] = []

  for (const ics of icsContents) {
    const events = ics.split('BEGIN:VEVENT')
    for (let i = 1; i < events.length; i++) {
      const block = events[i].split('END:VEVENT')[0]
      const uidMatch = block.match(/^UID:(.+)$/m)
      const uid = uidMatch ? uidMatch[1].trim() : null

      if (uid && seenUids.has(uid)) continue
      if (uid) seenUids.add(uid)

      eventBlocks.push(`BEGIN:VEVENT${block}END:VEVENT`)
    }
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calendar Ripper//Favorites//EN',
    'X-WR-CALNAME:Seattle Calendar Ripper — Favorites',
    ...eventBlocks,
    'END:VCALENDAR',
  ]

  return lines.join('\r\n')
}
```

**Step 4: Run tests**

Run: `cd infra/favorites-worker && npx vitest run test/ics-merge.test.ts`
Expected: All PASS

**Step 5: Commit**

```
feat: add ICS merge utility for favorites feed generation
```

---

## Task 7: Feed Endpoint

**Files:**
- Create: `infra/favorites-worker/src/feed.ts`
- Create: `infra/favorites-worker/test/feed.test.ts`
- Modify: `infra/favorites-worker/src/index.ts`

**Step 1: Write failing tests**

```typescript
// test/feed.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import app from '../src/index.js'

function createMockKV() {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
    _store: store,
  }
}

const ICS_CONTENT = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test-event-1\r\nDTSTART:20260301T100000Z\r\nSUMMARY:Test Event\r\nEND:VEVENT\r\nEND:VCALENDAR`

function createEnv() {
  return {
    USERS: createMockKV(),
    FAVORITES: createMockKV(),
    FEED_TOKENS: createMockKV(),
    JWT_SECRET: 'test',
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
    GITHUB_PAGES_BASE_URL: 'https://prestomation.github.io/calendar-ripper',
    SITE_URL: 'https://prestomation.github.io/calendar-ripper',
  }
}

describe('Feed endpoint', () => {
  let env: ReturnType<typeof createEnv>

  beforeEach(() => {
    env = createEnv()
  })

  it('returns 404 for unknown token', async () => {
    const res = await app.request('/feed/unknown-token.ics', {}, env)
    expect(res.status).toBe(404)
  })

  it('returns valid empty ICS for user with no favorites', async () => {
    env.FEED_TOKENS._store.set('valid-token', JSON.stringify({ userId: 'user:google:123' }))
    const res = await app.request('/feed/valid-token.ics', {}, env)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/calendar')
    const body = await res.text()
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).not.toContain('BEGIN:VEVENT')
  })

  it('fetches and merges ICS files for user favorites', async () => {
    env.FEED_TOKENS._store.set('valid-token', JSON.stringify({ userId: 'user:google:123' }))
    env.FAVORITES._store.set('user:google:123', JSON.stringify({
      icsUrls: ['stoup_brewing-all-events.ics'],
      updatedAt: '2026-01-01T00:00:00Z',
    }))

    // Mock global fetch to return ICS content
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      if (urlStr.includes('stoup_brewing-all-events.ics')) {
        return new Response(ICS_CONTENT, { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    }) as typeof fetch

    try {
      const res = await app.request('/feed/valid-token.ics', {}, env)
      expect(res.status).toBe(200)
      const body = await res.text()
      expect(body).toContain('Test Event')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd infra/favorites-worker && npx vitest run test/feed.test.ts`
Expected: FAIL

**Step 3: Implement feed route**

```typescript
// src/feed.ts
import { Hono } from 'hono'
import type { Env, FeedTokenRecord, FavoritesRecord } from './types.js'
import { mergeIcsFiles } from './ics-merge.js'

export const feedRoutes = new Hono<{ Bindings: Env }>()

feedRoutes.get('/:token.ics', async (c) => {
  const token = c.req.param('token')

  // Look up feed token
  const tokenRaw = await c.env.FEED_TOKENS.get(token)
  if (!tokenRaw) return c.text('Not found', 404)

  const tokenRecord = JSON.parse(tokenRaw) as FeedTokenRecord

  // Look up favorites
  const favRaw = await c.env.FAVORITES.get(tokenRecord.userId)
  const favorites: FavoritesRecord = favRaw
    ? JSON.parse(favRaw)
    : { icsUrls: [], updatedAt: new Date().toISOString() }

  if (favorites.icsUrls.length === 0) {
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

  // Fetch all favorited ICS files from GitHub Pages
  const baseUrl = c.env.GITHUB_PAGES_BASE_URL
  const icsContents: string[] = []

  const fetches = favorites.icsUrls.map(async (icsUrl) => {
    try {
      const res = await fetch(`${baseUrl}/${icsUrl}`)
      if (res.ok) {
        icsContents.push(await res.text())
      }
    } catch {
      // Skip failed fetches
    }
  })
  await Promise.all(fetches)

  const merged = mergeIcsFiles(icsContents)

  return new Response(merged, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})
```

**Step 4: Wire feed routes into index.ts**

Add to `src/index.ts`:
```typescript
import { feedRoutes } from './feed.js'
// ...
app.route('/feed', feedRoutes)
```

**Step 5: Run tests**

Run: `cd infra/favorites-worker && npx vitest run test/feed.test.ts`
Expected: All PASS

**Step 6: Run ALL worker tests**

Run: `cd infra/favorites-worker && npx vitest run`
Expected: All tests across all files PASS

**Step 7: Commit**

```
feat: add ICS feed endpoint for personalized calendar subscriptions
```

---

## Task 8: Frontend — Auth Context and Login UI

**Files:**
- Modify: `web/src/App.jsx`
- Modify: `web/src/index.css`
- Modify: `web/vite.config.js`

This task adds Google sign-in button, user dropdown, and auth state management.

**Step 1: Add env variable support to Vite config**

In `web/vite.config.js`, no changes needed — Vite auto-exposes `VITE_*` env vars via `import.meta.env`.

**Step 2: Add auth state and API helper to App.jsx**

Near the top of `App.jsx` (after the existing state declarations around line 93), add:

```javascript
// Auth state
const [authUser, setAuthUser] = useState(null)
const [authLoading, setAuthLoading] = useState(true)

const API_URL = import.meta.env.VITE_FAVORITES_API_URL || ''

// Check auth on mount
useEffect(() => {
  if (!API_URL) { setAuthLoading(false); return }
  fetch(`${API_URL}/auth/me`, { credentials: 'include' })
    .then(res => res.ok ? res.json() : null)
    .then(data => { if (data?.user) setAuthUser(data.user) })
    .catch(() => {})
    .finally(() => setAuthLoading(false))
}, [])

const handleLogin = () => {
  if (API_URL) window.location.href = `${API_URL}/auth/login?provider=google`
}

const handleLogout = async () => {
  if (API_URL) {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
  }
  setAuthUser(null)
}
```

**Step 3: Add login/user UI in the header area**

In the sidebar header section of `App.jsx` (around the area where the home button and search bar are rendered), add the auth UI. Locate the sidebar header area and add after it:

```jsx
{/* Auth section */}
<div className="auth-section">
  {authLoading ? null : authUser ? (
    <div className="auth-user-dropdown">
      <button className="auth-user-btn" title={authUser.email}>
        <img src={authUser.picture} alt="" className="auth-avatar" />
        <span className="auth-name">{authUser.name}</span>
      </button>
      <div className="auth-dropdown-menu">
        {authUser.feedUrl && (
          <button className="auth-dropdown-item" onClick={() => {
            navigator.clipboard.writeText(authUser.feedUrl)
          }}>
            Copy Feed URL
          </button>
        )}
        <button className="auth-dropdown-item" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </div>
  ) : API_URL ? (
    <button className="auth-login-btn" onClick={handleLogin}>
      Sign in
    </button>
  ) : null}
</div>
```

**Step 4: Add CSS for auth UI**

Append to `web/src/index.css`:

```css
/* Auth */
.auth-section {
  padding: 4px 12px;
  display: flex;
  justify-content: flex-end;
}

.auth-login-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 12px;
  color: var(--text);
  cursor: pointer;
  font-size: 0.85rem;
}

.auth-login-btn:hover {
  background: var(--hover);
}

.auth-user-dropdown {
  position: relative;
}

.auth-user-btn {
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 6px;
  color: var(--text);
}

.auth-user-btn:hover {
  background: var(--hover);
}

.auth-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
}

.auth-name {
  font-size: 0.85rem;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auth-dropdown-menu {
  display: none;
  position: absolute;
  right: 0;
  top: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  min-width: 160px;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.auth-user-dropdown:hover .auth-dropdown-menu,
.auth-user-dropdown:focus-within .auth-dropdown-menu {
  display: block;
}

.auth-dropdown-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 8px 12px;
  cursor: pointer;
  color: var(--text);
  font-size: 0.85rem;
}

.auth-dropdown-item:hover {
  background: var(--hover);
}
```

**Step 5: Run web tests**

Run: `cd web && npx vitest run`
Expected: Existing tests still pass (auth UI is conditional on `API_URL`)

**Step 6: Commit**

```
feat: add Google sign-in UI and auth state management
```

---

## Task 9: Frontend — Favorites Sync with Server

**Files:**
- Modify: `web/src/App.jsx`

This task makes `toggleFavorite()` call the server API when logged in, and syncs localStorage with server on login.

**Step 1: Add favorites sync logic**

After the auth state section in App.jsx, add sync logic:

```javascript
// Sync favorites on login
useEffect(() => {
  if (!authUser || !API_URL) return

  fetch(`${API_URL}/favorites`, { credentials: 'include' })
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      if (!data) return
      if (data.favorites.length === 0 && favorites.length > 0) {
        // First-time migration: push localStorage to server
        fetch(`${API_URL}/favorites`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ favorites }),
        })
      } else {
        // Server is source of truth
        setFavorites(data.favorites)
        try { localStorage.setItem('calendar-ripper-favorites', JSON.stringify(data.favorites)) } catch {}
      }
    })
    .catch(() => {})
}, [authUser])
```

**Step 2: Update toggleFavorite to call API**

Replace the existing `toggleFavorite` (lines 85-93) with:

```javascript
const toggleFavorite = useCallback((icsUrl) => {
  setFavorites(prev => {
    const isFav = prev.includes(icsUrl)
    const next = isFav
      ? prev.filter(u => u !== icsUrl)
      : [...prev, icsUrl]
    try { localStorage.setItem('calendar-ripper-favorites', JSON.stringify(next)) } catch {}

    // Fire-and-forget API call when logged in
    if (API_URL && authUser) {
      const method = isFav ? 'DELETE' : 'POST'
      fetch(`${API_URL}/favorites/${encodeURIComponent(icsUrl)}`, {
        method,
        credentials: 'include',
      }).catch(() => {})
    }

    return next
  })
}, [authUser])
```

Note: `authUser` is added to the dependency array.

**Step 3: Run web tests**

Run: `cd web && npx vitest run`
Expected: All PASS

**Step 4: Commit**

```
feat: sync favorites with server API when signed in
```

---

## Task 10: Frontend — Feed URL Display in Favorites View

**Files:**
- Modify: `web/src/App.jsx`
- Modify: `web/src/index.css`

**Step 1: Add feed URL display when viewing favorites**

In the main content area where the favorites view is rendered (search for `selectedTag === '__favorites__'` rendering logic), add above the events list:

```jsx
{selectedTag === '__favorites__' && authUser?.feedUrl && (
  <div className="feed-url-banner">
    <div className="feed-url-text">
      <strong>Subscribe to your favorites</strong>
      <span>Add this URL to any calendar app to see your favorites automatically.</span>
    </div>
    <div className="feed-url-actions">
      <input
        className="feed-url-input"
        readOnly
        value={authUser.feedUrl}
        onClick={(e) => e.target.select()}
      />
      <button className="feed-url-copy" onClick={() => navigator.clipboard.writeText(authUser.feedUrl)}>
        Copy
      </button>
    </div>
  </div>
)}
{selectedTag === '__favorites__' && !authUser && favorites.length > 0 && API_URL && (
  <div className="feed-url-banner feed-url-prompt">
    <span>Sign in to sync favorites across devices and get a calendar subscription link</span>
    <button className="auth-login-btn" onClick={handleLogin}>Sign in</button>
  </div>
)}
```

**Step 2: Add CSS for feed URL banner**

```css
/* Feed URL banner */
.feed-url-banner {
  padding: 12px 16px;
  background: var(--hover);
  border-radius: 8px;
  margin: 8px 16px;
}

.feed-url-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;
}

.feed-url-text span {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.feed-url-actions {
  display: flex;
  gap: 8px;
}

.feed-url-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.8rem;
  background: var(--bg);
  color: var(--text);
  font-family: monospace;
}

.feed-url-copy {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
  font-size: 0.85rem;
}

.feed-url-copy:hover {
  background: var(--hover);
}

.feed-url-prompt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.9rem;
}
```

**Step 3: Run web tests**

Run: `cd web && npx vitest run`
Expected: All PASS

**Step 4: Commit**

```
feat: show feed URL and sign-in prompt in favorites view
```

---

## Task 11: CI/CD — Worker Deployment Workflow

**Files:**
- Create: `.github/workflows/deploy-favorites-worker.yml`

**Step 1: Create the workflow**

```yaml
name: Deploy Favorites Worker

on:
  push:
    branches: [main]
    paths: ['infra/favorites-worker/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
        working-directory: infra/favorites-worker
      - name: Run tests
        run: npm test
        working-directory: infra/favorites-worker
      - name: Deploy to Cloudflare
        run: npx wrangler deploy
        working-directory: infra/favorites-worker
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

**Step 2: Update build-calendars workflow to inject API URL**

Modify `.github/workflows/build-calendars.yml` to add the env var to the web build step. Find the `web:build` step and add:

```yaml
      - name: Build web
        run: npm run web:build
        env:
          VITE_FAVORITES_API_URL: ${{ vars.FAVORITES_API_URL }}
```

Note: `vars.FAVORITES_API_URL` is a GitHub Actions variable (not secret) that should be set to the Worker URL (e.g., `https://calendar-ripper-favorites.<account>.workers.dev` or the custom domain).

**Step 3: Commit**

```
feat: add CI/CD workflow for favorites worker deployment
```

---

## Task 12: Final Integration Test and Verification

**Step 1: Run all worker tests**

Run: `cd infra/favorites-worker && npx vitest run`
Expected: All PASS

**Step 2: Run all web tests**

Run: `cd web && npx vitest run`
Expected: All PASS

**Step 3: Run full project test suite**

Run: `npm run test:all`
Expected: All PASS

**Step 4: Verify TypeScript compiles for worker**

Run: `cd infra/favorites-worker && npx tsc --noEmit`
Expected: No errors

**Step 5: Build web UI**

Run: `npm run web:build`
Expected: Builds successfully

**Step 6: Commit any remaining fixes**

```
chore: verify all tests pass for favorites feature
```

---

## Summary of Deliverables

| Task | What | Files |
|------|------|-------|
| 1 | Worker scaffold | `infra/favorites-worker/` project setup |
| 2 | JWT utilities | `src/jwt.ts` + tests |
| 3 | Auth middleware | `src/auth-middleware.ts` + tests |
| 4 | OAuth endpoints | `src/auth.ts` + tests |
| 5 | Favorites CRUD | `src/favorites.ts` + tests |
| 6 | ICS merge | `src/ics-merge.ts` + tests |
| 7 | Feed endpoint | `src/feed.ts` + tests |
| 8 | Frontend auth UI | `App.jsx` + `index.css` changes |
| 9 | Favorites sync | `App.jsx` toggleFavorite + sync changes |
| 10 | Feed URL display | `App.jsx` + `index.css` banner |
| 11 | CI/CD | GitHub Actions workflow |
| 12 | Verification | All tests pass |

## Post-Implementation (Manual Steps)

These require human action and are not automatable:

1. **Create KV namespaces:** `npx wrangler kv:namespace create USERS/FAVORITES/FEED_TOKENS`
2. **Update wrangler.toml** with real KV namespace IDs
3. **Set Worker secrets:** `npx wrangler secret put JWT_SECRET/GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET`
4. **Create Google OAuth app** in Google Cloud Console with callback URL
5. **Set GitHub Actions variable:** `FAVORITES_API_URL` pointing to deployed Worker
6. **Set GitHub Actions secret:** `CLOUDFLARE_API_TOKEN`
7. **Deploy Worker:** `npx wrangler deploy`

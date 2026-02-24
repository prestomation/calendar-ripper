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

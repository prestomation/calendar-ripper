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

describe('Search Filters API', () => {
  let env: ReturnType<typeof createEnv>

  beforeEach(() => {
    env = createEnv()
  })

  it('GET /search-filters returns empty list for new user', async () => {
    const cookie = await makeAuthCookie()
    const res = await app.request('/search-filters', {
      headers: { Cookie: cookie },
    }, env)
    expect(res.status).toBe(200)
    const data = await res.json() as { searchFilters: string[] }
    expect(data.searchFilters).toEqual([])
  })

  it('GET /search-filters returns 401 without auth', async () => {
    const res = await app.request('/search-filters', {}, env)
    expect(res.status).toBe(401)
  })

  it('PUT /search-filters replaces the full list', async () => {
    const cookie = await makeAuthCookie()
    const res = await app.request('/search-filters', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchFilters: ['jazz', 'trivia night'] }),
    }, env)
    expect(res.status).toBe(200)

    const getRes = await app.request('/search-filters', {
      headers: { Cookie: cookie },
    }, env)
    const data = await getRes.json() as { searchFilters: string[] }
    expect(data.searchFilters).toEqual(['jazz', 'trivia night'])
  })

  it('PUT /search-filters deduplicates case-insensitively', async () => {
    const cookie = await makeAuthCookie()
    await app.request('/search-filters', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchFilters: ['Jazz', 'jazz', 'JAZZ'] }),
    }, env)

    const getRes = await app.request('/search-filters', {
      headers: { Cookie: cookie },
    }, env)
    const data = await getRes.json() as { searchFilters: string[] }
    expect(data.searchFilters).toEqual(['Jazz'])
  })

  it('PUT /search-filters rejects non-array body', async () => {
    const cookie = await makeAuthCookie()
    const res = await app.request('/search-filters', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchFilters: 'not-an-array' }),
    }, env)
    expect(res.status).toBe(400)
  })

  it('PUT /search-filters rejects empty strings', async () => {
    const cookie = await makeAuthCookie()
    const res = await app.request('/search-filters', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchFilters: ['valid', '  '] }),
    }, env)
    expect(res.status).toBe(400)
  })

  it('PUT /search-filters rejects too many filters', async () => {
    const cookie = await makeAuthCookie()
    const filters = Array.from({ length: 26 }, (_, i) => `filter-${i}`)
    const res = await app.request('/search-filters', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchFilters: filters }),
    }, env)
    expect(res.status).toBe(400)
    const data = await res.json() as { error: string }
    expect(data.error).toContain('max 25')
  })

  it('POST /search-filters adds a single filter', async () => {
    const cookie = await makeAuthCookie()
    const res = await app.request('/search-filters', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: 'jazz' }),
    }, env)
    expect(res.status).toBe(200)

    const getRes = await app.request('/search-filters', {
      headers: { Cookie: cookie },
    }, env)
    const data = await getRes.json() as { searchFilters: string[] }
    expect(data.searchFilters).toContain('jazz')
  })

  it('POST /search-filters does not duplicate case-insensitively', async () => {
    const cookie = await makeAuthCookie()
    await app.request('/search-filters', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: 'jazz' }),
    }, env)
    await app.request('/search-filters', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: 'Jazz' }),
    }, env)

    const getRes = await app.request('/search-filters', {
      headers: { Cookie: cookie },
    }, env)
    const data = await getRes.json() as { searchFilters: string[] }
    expect(data.searchFilters.length).toBe(1)
  })

  it('POST /search-filters rejects empty filter', async () => {
    const cookie = await makeAuthCookie()
    const res = await app.request('/search-filters', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: '' }),
    }, env)
    expect(res.status).toBe(400)
  })

  it('DELETE /search-filters/:filter removes a filter', async () => {
    const cookie = await makeAuthCookie()
    await app.request('/search-filters', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: 'jazz' }),
    }, env)

    const delRes = await app.request(`/search-filters/${encodeURIComponent('jazz')}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    }, env)
    expect(delRes.status).toBe(200)

    const getRes = await app.request('/search-filters', {
      headers: { Cookie: cookie },
    }, env)
    const data = await getRes.json() as { searchFilters: string[] }
    expect(data.searchFilters).not.toContain('jazz')
  })

  it('DELETE /search-filters/:filter is case-insensitive', async () => {
    const cookie = await makeAuthCookie()
    await app.request('/search-filters', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: 'Jazz Night' }),
    }, env)

    await app.request(`/search-filters/${encodeURIComponent('jazz night')}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    }, env)

    const getRes = await app.request('/search-filters', {
      headers: { Cookie: cookie },
    }, env)
    const data = await getRes.json() as { searchFilters: string[] }
    expect(data.searchFilters.length).toBe(0)
  })

  it('search filters are stored alongside icsUrls without interference', async () => {
    const cookie = await makeAuthCookie()

    // Add a favorite
    await app.request('/favorites/stoup_brewing-all-events.ics', {
      method: 'POST',
      headers: { Cookie: cookie },
    }, env)

    // Add a search filter
    await app.request('/search-filters', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: 'jazz' }),
    }, env)

    // Verify both exist
    const favRes = await app.request('/favorites', {
      headers: { Cookie: cookie },
    }, env)
    const favData = await favRes.json() as { favorites: string[] }
    expect(favData.favorites).toContain('stoup_brewing-all-events.ics')

    const filterRes = await app.request('/search-filters', {
      headers: { Cookie: cookie },
    }, env)
    const filterData = await filterRes.json() as { searchFilters: string[] }
    expect(filterData.searchFilters).toContain('jazz')
  })
})

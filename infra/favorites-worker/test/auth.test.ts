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

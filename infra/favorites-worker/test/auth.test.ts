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

  it('GET /auth/login redirects to Google OAuth with CSRF nonce', async () => {
    const res = await app.request(
      '/auth/login?provider=google',
      { method: 'GET' },
      mockEnv
    )
    expect(res.status).toBe(302)
    const location = res.headers.get('Location')!
    expect(location).toContain('accounts.google.com/o/oauth2')
    expect(location).toContain('client_id=test-client-id')

    // Verify CSRF nonce cookie is set
    const setCookie = res.headers.get('Set-Cookie')!
    expect(setCookie).toContain('oauth_nonce=')
    expect(setCookie).toContain('HttpOnly')

    // Verify state parameter contains JSON with nonce
    const stateMatch = location.match(/state=([^&]+)/)
    expect(stateMatch).not.toBeNull()
    const state = JSON.parse(decodeURIComponent(stateMatch![1]))
    expect(state.nonce).toBeTruthy()
  })

  it('GET /auth/login includes return_to in state when valid', async () => {
    const returnTo = encodeURIComponent('https://htmlpreview.github.io/?https://github.com/prestomation/calendar-ripper/blob/pr-previews/pr-preview-106/index.html')
    const res = await app.request(
      `/auth/login?provider=google&return_to=${returnTo}`,
      { method: 'GET' },
      mockEnv
    )
    expect(res.status).toBe(302)
    const location = res.headers.get('Location')!
    const stateMatch = location.match(/state=([^&]+)/)
    const state = JSON.parse(decodeURIComponent(stateMatch![1]))
    expect(state.returnTo).toContain('htmlpreview.github.io')
  })

  it('GET /auth/callback rejects missing CSRF nonce', async () => {
    const state = JSON.stringify({ nonce: 'test-nonce', returnTo: '' })
    const res = await app.request(
      `/auth/callback?code=test-code&state=${encodeURIComponent(state)}`,
      { method: 'GET' },
      mockEnv
    )
    // No oauth_nonce cookie sent, so nonce validation should fail
    expect(res.status).toBe(403)
    const data = await res.json() as { error: string }
    expect(data.error).toContain('Invalid OAuth state')
  })

  it('GET /auth/callback rejects mismatched CSRF nonce', async () => {
    const state = JSON.stringify({ nonce: 'correct-nonce', returnTo: '' })
    const res = await app.request(
      `/auth/callback?code=test-code&state=${encodeURIComponent(state)}`,
      {
        method: 'GET',
        headers: { Cookie: 'oauth_nonce=wrong-nonce' },
      },
      mockEnv
    )
    expect(res.status).toBe(403)
    const data = await res.json() as { error: string }
    expect(data.error).toContain('Invalid OAuth state')
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

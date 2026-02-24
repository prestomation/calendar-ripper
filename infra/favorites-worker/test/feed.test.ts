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

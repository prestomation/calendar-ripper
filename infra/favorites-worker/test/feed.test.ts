import { describe, it, expect, vi, beforeEach } from 'vitest'
import app from '../src/index.js'
import { _clearCaches } from '../src/event-search.js'

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
    _clearCaches()
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

  it('skips favorites with protocol in URL (SSRF protection)', async () => {
    env.FEED_TOKENS._store.set('valid-token', JSON.stringify({ userId: 'user:google:123' }))
    env.FAVORITES._store.set('user:google:123', JSON.stringify({
      icsUrls: ['https://evil.com/steal.ics'],
      updatedAt: '2026-01-01T00:00:00Z',
    }))

    const originalFetch = globalThis.fetch
    const fetchedUrls: string[] = []
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      fetchedUrls.push(urlStr)
      // Allow trusted base-URL fetches (events-index for dedup)
      if (urlStr.startsWith('https://prestomation.github.io/calendar-ripper/')) {
        return new Response('[]', { status: 200 })
      }
      throw new Error(`Unexpected fetch to: ${urlStr}`)
    }) as typeof fetch

    try {
      const res = await app.request('/feed/valid-token.ics', {}, env)
      expect(res.status).toBe(200)
      // Should return an empty calendar since the malicious URL was skipped
      const body = await res.text()
      expect(body).toContain('BEGIN:VCALENDAR')
      expect(body).not.toContain('VEVENT')
      // The evil URL must never have been fetched
      expect(fetchedUrls).not.toContain('https://evil.com/steal.ics')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('skips favorites with path traversal (SSRF protection)', async () => {
    env.FEED_TOKENS._store.set('valid-token', JSON.stringify({ userId: 'user:google:123' }))
    env.FAVORITES._store.set('user:google:123', JSON.stringify({
      icsUrls: ['../../etc/passwd.ics'],
      updatedAt: '2026-01-01T00:00:00Z',
    }))

    const originalFetch = globalThis.fetch
    const fetchedUrls: string[] = []
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      fetchedUrls.push(urlStr)
      // Allow trusted base-URL fetches (events-index for dedup)
      if (urlStr.startsWith('https://prestomation.github.io/calendar-ripper/')) {
        return new Response('[]', { status: 200 })
      }
      throw new Error(`Unexpected fetch to: ${urlStr}`)
    }) as typeof fetch

    try {
      const res = await app.request('/feed/valid-token.ics', {}, env)
      expect(res.status).toBe(200)
      const body = await res.text()
      expect(body).toContain('BEGIN:VCALENDAR')
      expect(body).not.toContain('VEVENT')
      // The traversal URL must never have been fetched
      expect(fetchedUrls.some(u => u.includes('etc/passwd'))).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
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

  it('returns empty ICS when user has no favorites and no search filters', async () => {
    env.FEED_TOKENS._store.set('valid-token', JSON.stringify({ userId: 'user:google:123' }))
    env.FAVORITES._store.set('user:google:123', JSON.stringify({
      icsUrls: [],
      searchFilters: [],
      updatedAt: '2026-01-01T00:00:00Z',
    }))

    const res = await app.request('/feed/valid-token.ics', {}, env)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).not.toContain('BEGIN:VEVENT')
  })

  it('fetches events-index and tag-all.ics when user has search filters', async () => {
    env.FEED_TOKENS._store.set('valid-token', JSON.stringify({ userId: 'user:google:123' }))
    env.FAVORITES._store.set('user:google:123', JSON.stringify({
      icsUrls: [],
      searchFilters: ['Jazz'],
      updatedAt: '2026-01-01T00:00:00Z',
    }))

    const EVENTS_INDEX = JSON.stringify([
      { icsUrl: 'venue-a.ics', summary: 'Jazz Night', description: 'Live jazz', location: '123 Main', date: '2026-03-20T19:00' },
      { icsUrl: 'venue-b.ics', summary: 'Rock Concert', description: 'Live rock', location: '456 Oak', date: '2026-03-21T20:00' },
    ])

    const ALL_ICS = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:All Events\r\nBEGIN:VEVENT\r\nUID:jazz-1\r\nDTSTART:20260320T190000Z\r\nSUMMARY:Jazz Night\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:rock-1\r\nDTSTART:20260321T200000Z\r\nSUMMARY:Rock Concert\r\nEND:VEVENT\r\nEND:VCALENDAR`

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      if (urlStr.includes('events-index.json')) {
        return new Response(EVENTS_INDEX, { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (urlStr.includes('tag-all.ics')) {
        return new Response(ALL_ICS, { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    }) as typeof fetch

    try {
      const res = await app.request('/feed/valid-token.ics', {}, env)
      expect(res.status).toBe(200)
      const body = await res.text()
      expect(body).toContain('Jazz Night')
      expect(body).not.toContain('Rock Concert')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('deduplicates events from favorites and search filters', async () => {
    env.FEED_TOKENS._store.set('valid-token', JSON.stringify({ userId: 'user:google:123' }))
    env.FAVORITES._store.set('user:google:123', JSON.stringify({
      icsUrls: ['venue-a.ics'],
      searchFilters: ['Jazz'],
      updatedAt: '2026-01-01T00:00:00Z',
    }))

    const VENUE_ICS = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Venue A\r\nBEGIN:VEVENT\r\nUID:jazz-1\r\nDTSTART:20260320T190000Z\r\nSUMMARY:Jazz Night\r\nEND:VEVENT\r\nEND:VCALENDAR`

    const EVENTS_INDEX = JSON.stringify([
      { icsUrl: 'venue-a.ics', summary: 'Jazz Night', description: 'Live jazz', location: '123 Main', date: '2026-03-20T19:00' },
    ])

    const ALL_ICS = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:All Events\r\nBEGIN:VEVENT\r\nUID:jazz-1\r\nDTSTART:20260320T190000Z\r\nSUMMARY:Jazz Night\r\nEND:VEVENT\r\nEND:VCALENDAR`

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      if (urlStr.includes('venue-a.ics') && !urlStr.includes('tag-all')) {
        return new Response(VENUE_ICS, { status: 200 })
      }
      if (urlStr.includes('events-index.json')) {
        return new Response(EVENTS_INDEX, { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (urlStr.includes('tag-all.ics')) {
        return new Response(ALL_ICS, { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    }) as typeof fetch

    try {
      const res = await app.request('/feed/valid-token.ics', {}, env)
      expect(res.status).toBe(200)
      const body = await res.text()
      // Should have Jazz Night exactly once (deduped by UID)
      const matches = body.match(/UID:jazz-1/g)
      expect(matches?.length).toBe(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

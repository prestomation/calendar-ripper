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

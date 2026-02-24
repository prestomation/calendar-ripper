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

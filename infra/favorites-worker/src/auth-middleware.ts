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

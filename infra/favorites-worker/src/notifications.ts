import { Hono } from 'hono'
import type {
  Env,
  PushSubscriptionRecord,
  PushSubscriptionJSON,
  DispatchPayload,
  QueueBatchMessage,
  NotificationLogEntry,
  FavoritesRecord,
  EventsIndexEntry,
} from './types.js'
import { requireAuth } from './favorites-helpers.js'
import { matchEventsForUser, buildNotificationPayload } from './filter-match.js'

const MAX_SUBSCRIPTIONS_PER_USER = 5
const BATCH_SIZE = 50
const IDEMPOTENCY_TTL_SECONDS = 172800 // 48 hours
const SANITY_CAP = 500

export const notificationRoutes = new Hono<{ Bindings: Env }>()

// GET /notifications/vapid-key — public, returns the VAPID public key
notificationRoutes.get('/vapid-key', (c) => {
  const key = c.env.VAPID_PUBLIC_KEY
  if (!key) return c.json({ error: 'Push notifications not configured' }, 503)
  return c.json({ publicKey: key })
})

// GET /notifications/status — check if the user has push enabled
notificationRoutes.get('/status', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const raw = await c.env.PUSH_SUBSCRIPTIONS.get(userId)
  if (!raw) return c.json({ enabled: false, subscriptionCount: 0 })

  try {
    const record = JSON.parse(raw) as PushSubscriptionRecord
    return c.json({ enabled: record.subscriptions.length > 0, subscriptionCount: record.subscriptions.length })
  } catch {
    return c.json({ enabled: false, subscriptionCount: 0 })
  }
})

// POST /notifications/subscribe — register a push subscription
notificationRoutes.post('/subscribe', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  let body: { subscription: PushSubscriptionJSON }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const sub = body.subscription
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return c.json({ error: 'Invalid push subscription: requires endpoint and keys' }, 400)
  }

  const raw = await c.env.PUSH_SUBSCRIPTIONS.get(userId)
  let record: PushSubscriptionRecord
  if (raw) {
    try {
      record = JSON.parse(raw)
    } catch {
      record = { subscriptions: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    }
  } else {
    record = { subscriptions: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  }

  // Deduplicate by endpoint
  const existing = record.subscriptions.findIndex(s => s.endpoint === sub.endpoint)
  if (existing >= 0) {
    record.subscriptions[existing] = sub
  } else {
    if (record.subscriptions.length >= MAX_SUBSCRIPTIONS_PER_USER) {
      return c.json({ error: `Maximum ${MAX_SUBSCRIPTIONS_PER_USER} subscriptions per user` }, 409)
    }
    record.subscriptions.push(sub)
  }

  record.updatedAt = new Date().toISOString()
  await c.env.PUSH_SUBSCRIPTIONS.put(userId, JSON.stringify(record))
  return c.json({ ok: true, subscriptionCount: record.subscriptions.length })
})

// DELETE /notifications/subscribe — remove a push subscription
notificationRoutes.delete('/subscribe', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  let body: { endpoint: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (!body.endpoint) {
    return c.json({ error: 'endpoint is required' }, 400)
  }

  const raw = await c.env.PUSH_SUBSCRIPTIONS.get(userId)
  if (!raw) return c.json({ ok: true, subscriptionCount: 0 })

  try {
    const record = JSON.parse(raw) as PushSubscriptionRecord
    record.subscriptions = record.subscriptions.filter(s => s.endpoint !== body.endpoint)
    record.updatedAt = new Date().toISOString()
    if (record.subscriptions.length === 0) {
      await c.env.PUSH_SUBSCRIPTIONS.delete(userId)
    } else {
      await c.env.PUSH_SUBSCRIPTIONS.put(userId, JSON.stringify(record))
    }
    return c.json({ ok: true, subscriptionCount: record.subscriptions.length })
  } catch {
    return c.json({ ok: true, subscriptionCount: 0 })
  }
})

// POST /notifications/dispatch — called by GitHub Actions to trigger notifications
notificationRoutes.post('/dispatch', async (c) => {
  const apiKey = c.req.header('X-Dispatch-API-Key')
  if (!apiKey || apiKey !== c.env.DISPATCH_API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  let payload: DispatchPayload
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (!payload.dispatchId || !Array.isArray(payload.newEvents)) {
    return c.json({ error: 'Invalid payload: requires dispatchId and newEvents array' }, 400)
  }

  if (payload.newEvents.length === 0) {
    return c.json({ dispatchId: payload.dispatchId, batchesEnqueued: 0, totalUsers: 0, status: 'no_new_events' })
  }

  if (payload.newEvents.length > SANITY_CAP) {
    return c.json({
      error: `Too many new events (${payload.newEvents.length}), exceeds sanity cap of ${SANITY_CAP}. Likely a first deploy or data issue.`,
    }, 422)
  }

  // List all users with push subscriptions (paginated KV list)
  const userIds: string[] = []
  let cursor: string | undefined
  do {
    const result = await c.env.PUSH_SUBSCRIPTIONS.list({ cursor, limit: 1000 })
    for (const key of result.keys) {
      userIds.push(key.name)
    }
    cursor = result.list_complete ? undefined : result.cursor
  } while (cursor)

  if (userIds.length === 0) {
    return c.json({ dispatchId: payload.dispatchId, batchesEnqueued: 0, totalUsers: 0, status: 'no_subscribers' })
  }

  // Batch user IDs and enqueue
  let batchesEnqueued = 0
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batchUserIds = userIds.slice(i, i + BATCH_SIZE)
    const message: QueueBatchMessage = {
      dispatchId: payload.dispatchId,
      userIds: batchUserIds,
      newEvents: payload.newEvents,
    }
    await c.env.NOTIFICATION_QUEUE.send(message)
    batchesEnqueued++
  }

  return c.json({
    dispatchId: payload.dispatchId,
    batchesEnqueued,
    totalUsers: userIds.length,
    status: 'accepted',
  }, 202)
})

/**
 * Send a Web Push notification. Uses the Web Push protocol with VAPID.
 * Returns true if the push was sent successfully, false if the subscription is gone (410).
 * Throws on other errors.
 */
export async function sendWebPush(
  subscription: PushSubscriptionJSON,
  payload: object,
  env: Pick<Env, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'>
): Promise<boolean> {
  // Build JWT for VAPID authentication
  const audience = new URL(subscription.endpoint).origin

  const header = { typ: 'JWT', alg: 'ES256' }
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    aud: audience,
    exp: now + 86400, // 24 hours
    sub: env.VAPID_SUBJECT,
  }

  const headerB64 = base64urlEncode(JSON.stringify(header))
  const claimsB64 = base64urlEncode(JSON.stringify(claims))
  const unsignedToken = `${headerB64}.${claimsB64}`

  // Import VAPID private key and sign
  const privateKeyBytes = base64urlDecode(env.VAPID_PRIVATE_KEY)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  )
  const signatureB64 = base64urlEncodeBuffer(signature)
  const jwt = `${unsignedToken}.${signatureB64}`

  // Encrypt the payload using Web Push encryption (aes128gcm)
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const encrypted = await encryptPayload(
    payloadBytes,
    base64urlDecode(subscription.keys.p256dh),
    base64urlDecode(subscription.keys.auth)
  )

  const vapidPublicKeyBytes = base64urlDecode(env.VAPID_PUBLIC_KEY)

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${base64urlEncodeBuffer(vapidPublicKeyBytes)}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
    },
    body: encrypted,
  })

  if (response.status === 410 || response.status === 404) {
    return false // subscription is gone
  }

  if (!response.ok) {
    throw new Error(`Push service returned HTTP ${response.status}: ${await response.text()}`)
  }

  return true
}

/**
 * Process a batch of users from the notification queue.
 */
export async function processNotificationBatch(
  batch: MessageBatch<QueueBatchMessage>,
  env: Env
): Promise<void> {
  for (const message of batch.messages) {
    const { dispatchId, userIds, newEvents } = message.body

    for (const userId of userIds) {
      const logKey = `dispatch:${dispatchId}:user:${userId}`

      // Idempotency check
      const existingLog = await env.NOTIFICATION_LOG.get(logKey)
      if (existingLog) {
        message.ack()
        continue
      }

      try {
        // Load push subscription
        const subRaw = await env.PUSH_SUBSCRIPTIONS.get(userId)
        if (!subRaw) continue

        const subRecord = JSON.parse(subRaw) as PushSubscriptionRecord
        if (subRecord.subscriptions.length === 0) continue

        // Load favorites
        const favRaw = await env.FAVORITES.get(userId)
        const favorites: FavoritesRecord = favRaw
          ? JSON.parse(favRaw)
          : { icsUrls: [], searchFilters: [], geoFilters: [], updatedAt: '' }
        if (!favorites.searchFilters) favorites.searchFilters = []
        if (!favorites.geoFilters) favorites.geoFilters = []

        // Match events
        const result = matchEventsForUser(newEvents, favorites)

        if (result.matchedEvents.length === 0) {
          const logEntry: NotificationLogEntry = {
            sentAt: new Date().toISOString(),
            matchedEventCount: 0,
            status: 'skipped',
          }
          await env.NOTIFICATION_LOG.put(logKey, JSON.stringify(logEntry), {
            expirationTtl: IDEMPOTENCY_TTL_SECONDS,
          })
          continue
        }

        // Build and send notification
        const payload = buildNotificationPayload(result.matchedEvents)
        let anySent = false

        for (const sub of subRecord.subscriptions) {
          try {
            const success = await sendWebPush(sub, payload, env)
            if (success) {
              anySent = true
            } else {
              // 410 Gone — remove this subscription
              subRecord.subscriptions = subRecord.subscriptions.filter(s => s.endpoint !== sub.endpoint)
              subRecord.updatedAt = new Date().toISOString()
              if (subRecord.subscriptions.length === 0) {
                await env.PUSH_SUBSCRIPTIONS.delete(userId)
              } else {
                await env.PUSH_SUBSCRIPTIONS.put(userId, JSON.stringify(subRecord))
              }
            }
          } catch {
            // Individual push failures don't block other subscriptions
          }
        }

        const logEntry: NotificationLogEntry = {
          sentAt: new Date().toISOString(),
          matchedEventCount: result.matchedEvents.length,
          status: anySent ? 'sent' : 'failed',
        }
        await env.NOTIFICATION_LOG.put(logKey, JSON.stringify(logEntry), {
          expirationTtl: IDEMPOTENCY_TTL_SECONDS,
        })
      } catch {
        // Don't ack — let queue retry
        continue
      }
    }

    message.ack()
  }
}

// --- Crypto helpers for Web Push encryption ---

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlEncodeBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Encrypt a payload for Web Push using aes128gcm content encoding.
 * Implements RFC 8291 (Message Encryption for Web Push) and RFC 8188 (Encrypted Content-Encoding).
 */
async function encryptPayload(
  payload: Uint8Array,
  clientPublicKeyBytes: Uint8Array,
  authSecret: Uint8Array
): Promise<Uint8Array> {
  // Generate a local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )

  // Import the client's public key
  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )

  // Derive shared secret via ECDH
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: clientPublicKey },
      localKeyPair.privateKey,
      256
    )
  )

  // Export local public key (uncompressed point)
  const localPublicKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey('raw', localKeyPair.publicKey)
  )

  // Generate a 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // RFC 8291 key derivation
  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || client_pub || server_pub, 32)
  const authInfo = new Uint8Array([
    ...new TextEncoder().encode('WebPush: info\0'),
    ...clientPublicKeyBytes,
    ...localPublicKeyBytes,
  ])
  const ikm = await hkdf(authSecret, sharedSecret, authInfo, 32)

  // PRK = HMAC-SHA-256(salt, IKM)
  // CEK = HKDF(salt, IKM, "Content-Encoding: aes128gcm" || 0x00, 16)
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0')
  const contentEncryptionKey = await hkdf(salt, ikm, cekInfo, 16)

  // Nonce = HKDF(salt, IKM, "Content-Encoding: nonce" || 0x00, 12)
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0')
  const nonce = await hkdf(salt, ikm, nonceInfo, 12)

  // Pad the payload (add a delimiter byte 0x02 for the last record)
  const paddedPayload = new Uint8Array(payload.length + 1)
  paddedPayload.set(payload)
  paddedPayload[payload.length] = 2 // delimiter

  // Encrypt with AES-128-GCM
  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentEncryptionKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      aesKey,
      paddedPayload
    )
  )

  // Build the aes128gcm header:
  // salt (16) || rs (4, big-endian uint32) || idlen (1) || keyid (65 = uncompressed P-256 point)
  const recordSize = paddedPayload.length + 16 // payload + GCM tag
  const header = new Uint8Array(16 + 4 + 1 + localPublicKeyBytes.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, recordSize, false)
  header[20] = localPublicKeyBytes.length
  header.set(localPublicKeyBytes, 21)

  // Combine header + encrypted content
  const result = new Uint8Array(header.length + encrypted.length)
  result.set(header)
  result.set(encrypted, header.length)
  return result
}

/**
 * HKDF-SHA256: extract-then-expand
 */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  // Extract: PRK = HMAC-SHA-256(salt, IKM)
  const prkKey = await crypto.subtle.importKey(
    'raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, ikm))

  // Expand: T(1) = HMAC-SHA-256(PRK, info || 0x01)
  const expandKey = await crypto.subtle.importKey(
    'raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const input = new Uint8Array(info.length + 1)
  input.set(info)
  input[info.length] = 1
  const output = new Uint8Array(await crypto.subtle.sign('HMAC', expandKey, input))
  return output.slice(0, length)
}

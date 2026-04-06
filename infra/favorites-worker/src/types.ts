interface AnalyticsEngineDataset {
  writeDataPoint(event: {
    doubles?: number[]
    blobs?: string[]
    indexes?: string[]
  }): void
}

export interface Env {
  USERS: KVNamespace
  FAVORITES: KVNamespace
  FEED_TOKENS: KVNamespace
  PUSH_SUBSCRIPTIONS: KVNamespace
  NOTIFICATION_LOG: KVNamespace
  NOTIFICATION_QUEUE: Queue
  JWT_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GITHUB_PAGES_BASE_URL: string
  SITE_URL: string
  DISPATCH_API_KEY: string
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  ANALYTICS?: AnalyticsEngineDataset
}

export interface UserRecord {
  id: string
  provider: string
  providerId: string
  email: string
  name: string
  picture: string
  feedToken: string
  createdAt: string
  lastLoginAt: string
}

export interface GeoFilter {
  lat: number
  lng: number
  radiusKm: number
  label?: string
}

export interface FavoritesRecord {
  icsUrls: string[]
  searchFilters: string[]
  geoFilters: GeoFilter[]
  updatedAt: string
}

export interface EventsIndexEntry {
  icsUrl: string
  summary: string
  description?: string
  location?: string
  date: string
  endDate?: string
  url?: string
  lat?: number
  lng?: number
  geocodeSource?: 'ripper' | 'cached' | 'none'
  dedupedSources?: string[]
}

export interface FeedTokenRecord {
  userId: string
}

export interface JWTPayload {
  sub: string
  exp: number
}

export interface PushSubscriptionRecord {
  subscriptions: PushSubscriptionJSON[]
  createdAt: string
  updatedAt: string
}

export interface PushSubscriptionJSON {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export interface DispatchPayload {
  dispatchId: string
  detectedAt: string
  previousEventCount: number
  currentEventCount: number
  newEvents: EventsIndexEntry[]
}

export interface NotificationLogEntry {
  sentAt: string
  matchedEventCount: number
  status: 'sent' | 'skipped' | 'failed'
}

export interface QueueBatchMessage {
  dispatchId: string
  userIds: string[]
  newEvents: EventsIndexEntry[]
}

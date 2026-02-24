export interface Env {
  USERS: KVNamespace
  FAVORITES: KVNamespace
  FEED_TOKENS: KVNamespace
  JWT_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GITHUB_PAGES_BASE_URL: string
  SITE_URL: string
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

export interface FavoritesRecord {
  icsUrls: string[]
  updatedAt: string
}

export interface FeedTokenRecord {
  userId: string
}

export interface JWTPayload {
  sub: string
  exp: number
}

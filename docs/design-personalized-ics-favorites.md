# Design: Personalized ICS Favorites with Server-Side Persistence

## Status: Draft
## Date: 2026-02-22

---

## 1. Problem Statement

The favorites feature (PR #101) currently stores favorites in browser `localStorage`. This means:

- Favorites are lost when clearing browser data
- Favorites don't sync across devices
- There is no way to subscribe to a personalized ICS feed of favorites in an external calendar app (Google Calendar, Apple Calendar, Outlook, etc.)

## 2. Goals

1. **Social login** — Users authenticate via OAuth (Google, GitHub, etc.) so their identity persists across devices
2. **Server-side favorite persistence** — Favorites are stored server-side, keyed to the authenticated user
3. **Personalized ICS feed URL** — Each user gets a stable, unique URL (e.g. `https://favorites.seattlecalripper.com/feed/<token>.ics`) that aggregates their favorited calendars into a single ICS feed they can subscribe to from any calendar app
4. **Backward compatibility** — The site continues to work without login; `localStorage` favorites remain functional for anonymous users

## 3. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    GitHub Pages (existing)                       │
│  Static site: HTML/JS/CSS + pre-built .ics files                │
│  https://prestomation.github.io/calendar-ripper/                │
└──────────────────────┬───────────────────────────────────────────┘
                       │ JS client calls
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│              Cloudflare Workers (new)                            │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Auth Worker  │  │ Favorites    │  │ ICS Feed Worker        │  │
│  │             │  │ API Worker   │  │                        │  │
│  │ POST /auth/ │  │ GET/PUT/DEL  │  │ GET /feed/<token>.ics  │  │
│  │ login       │  │ /favorites   │  │                        │  │
│  │ callback    │  │              │  │ Reads user favorites,  │  │
│  │ logout      │  │ CRUD ops on  │  │ fetches source .ics    │  │
│  │ me          │  │ user's       │  │ files from GH Pages,   │  │
│  │             │  │ favorite set │  │ merges into single ICS │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬────────────┘  │
│         │                │                      │               │
│         ▼                ▼                      ▼               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                 Cloudflare KV                            │   │
│  │                                                          │   │
│  │  Namespace: USERS                                        │   │
│  │    key: user:<provider>:<provider_id>                    │   │
│  │    val: { email, name, picture, feedToken, createdAt }   │   │
│  │                                                          │   │
│  │  Namespace: FAVORITES                                    │   │
│  │    key: user:<provider>:<provider_id>                    │   │
│  │    val: { icsUrls: ["stoup_brewing.ics", ...],           │   │
│  │           updatedAt }                                    │   │
│  │                                                          │   │
│  │  Namespace: FEED_TOKENS                                  │   │
│  │    key: <token>                                          │   │
│  │    val: { userId: "user:google:12345" }                  │   │
│  │    (reverse lookup: token → user)                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Why Cloudflare Workers + KV

- **No server to manage** — Workers are serverless and globally distributed
- **KV is simple** — Favorites are a classic key-value problem: one user → one set of ICS URLs. No relational queries needed
- **Low cost** — The Workers free tier includes 100K requests/day; KV free tier includes 100K reads/day and 1K writes/day. This project's scale is well within free-tier limits
- **Fast globally** — KV is eventually consistent with global edge caching, which is fine for favorites that change infrequently
- **Custom domain** — Workers can be bound to a subdomain (e.g., `favorites.seattlecalripper.com`) for clean feed URLs

### Why not D1 (Cloudflare SQL)?

KV is sufficient. The data model is simple key-value lookups — no joins, no queries across users, no aggregation. D1 would add complexity without benefit.

## 4. Authentication

### OAuth Flow (PKCE)

```
Browser                    Worker                     Google/GitHub
  │                          │                              │
  ├─ GET /auth/login ───────►│                              │
  │  ?provider=google        │                              │
  │                          ├─ 302 redirect ──────────────►│
  │◄─────── redirect ────────┤  to provider authorize URL   │
  │                          │                              │
  │  (user logs in at provider)                             │
  │                          │                              │
  │◄──────────── redirect back with code ──────────────────►│
  │  /auth/callback?code=X   │                              │
  │                          ├─ exchange code for tokens ──►│
  │                          │◄──── access token ───────────┤
  │                          │                              │
  │                          ├─ fetch user profile ────────►│
  │                          │◄──── email, name, picture ───┤
  │                          │                              │
  │◄── Set-Cookie: session   │  (create/update user in KV)  │
  │    302 redirect to site  │                              │
```

### Providers

Start with **Google** only. GitHub can be added later. Google covers the vast majority of users and is the most common calendar provider.

### Session Management

- Worker issues an **HttpOnly, Secure, SameSite=Lax** cookie containing a signed JWT (HS256 with a secret stored in Workers Secrets)
- JWT payload: `{ sub: "user:google:12345", exp: <30 days> }`
- The JWT is verified on each API request — no session store needed
- Logout clears the cookie

### Feed Token

- On first login, generate a cryptographically random feed token (e.g., 32-byte hex string via `crypto.randomUUID()` + additional entropy)
- Store in `USERS` KV as part of the user record, and store reverse lookup in `FEED_TOKENS` KV
- The feed token is **not** the session token — it's a long-lived, stable URL component that doesn't expire when the session does
- Users can regenerate their feed token (invalidating the old URL) from the UI if desired

## 5. API Design

Base URL: `https://favorites.seattlecalripper.com` (or `https://cal-ripper-favorites.<account>.workers.dev` during development)

### Auth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/login?provider=google` | Initiates OAuth flow, redirects to provider |
| `GET` | `/auth/callback` | OAuth callback, sets session cookie, redirects to site |
| `POST` | `/auth/logout` | Clears session cookie |
| `GET` | `/auth/me` | Returns current user info + feed token (or 401) |

#### `GET /auth/me` Response

```json
{
  "user": {
    "id": "user:google:12345",
    "email": "user@example.com",
    "name": "Jane Doe",
    "picture": "https://lh3.googleusercontent.com/...",
    "feedToken": "a1b2c3d4e5f6...",
    "feedUrl": "https://favorites.seattlecalripper.com/feed/a1b2c3d4e5f6.ics"
  }
}
```

### Favorites Endpoints

All require a valid session cookie.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/favorites` | List user's favorited ICS URLs |
| `PUT` | `/favorites` | Replace entire favorites list |
| `POST` | `/favorites/:icsUrl` | Add a single favorite |
| `DELETE` | `/favorites/:icsUrl` | Remove a single favorite |

#### `GET /favorites` Response

```json
{
  "favorites": [
    "stoup_brewing-all-events.ics",
    "tag-music.ics",
    "sam-olympic-sculpture-park.ics"
  ],
  "updatedAt": "2026-02-22T10:00:00Z"
}
```

#### `PUT /favorites` Request

```json
{
  "favorites": ["stoup_brewing-all-events.ics", "tag-music.ics"]
}
```

Used for bulk sync (e.g., migrating `localStorage` favorites on first login).

### Feed Endpoint

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/feed/<token>.ics` | Returns merged ICS for user's favorites |

- **No authentication required** — the token in the URL is the credential (this is how all calendar subscription URLs work)
- Response `Content-Type: text/calendar; charset=utf-8`
- Sets `Cache-Control: public, max-age=3600` (1 hour) since the underlying `.ics` files are rebuilt daily

## 6. ICS Feed Generation

When `/feed/<token>.ics` is requested:

1. Look up `token` in `FEED_TOKENS` KV → get `userId`
2. Look up `userId` in `FAVORITES` KV → get list of `icsUrls`
3. For each favorited ICS URL, fetch the `.ics` file from GitHub Pages (the existing static hosting)
4. Merge all `VEVENT` components into a single ICS file with:
   - `X-WR-CALNAME: Seattle Calendar Ripper — Favorites`
   - `PRODID:-//Calendar Ripper//Favorites//EN`
   - Deduplicated by `UID` (same event may appear in a tag aggregate and an individual calendar)
5. Return the merged ICS

### Caching Strategy

- Use **Cloudflare Cache API** (or `cf` cache options on `fetch`) to cache the merged ICS response for 1 hour, keyed by the feed token
- When the user modifies their favorites via the API, purge the cache for their feed token
- The underlying source `.ics` files are rebuilt daily by GitHub Actions, so a 1-hour cache is more than fresh enough

### Edge Cases

- If a favorited ICS URL 404s (source was removed), skip it and exclude from the merged output
- If the user has zero favorites, return a valid but empty ICS file (no `VEVENT` components)
- If the feed token is not found in KV, return 404

## 7. Frontend Changes

### Login UI

- Add a "Sign in" button in the site header (unobtrusive, secondary styling)
- When signed in, show user avatar/name and a dropdown with:
  - "Your Feed URL" — copy-to-clipboard for the personalized ICS URL
  - "Add to Google Calendar" — direct `webcal://` link
  - "Sign out"
- Login state stored in React context, initialized by calling `GET /auth/me` on page load

### Favorites Sync

On login, reconcile client and server favorites:

```
if (server favorites is empty AND localStorage has favorites):
    PUT localStorage favorites → server  (first-time migration)
else:
    replace localStorage with server favorites  (server is source of truth)
```

After login, all `toggleFavorite()` calls:
1. Update `localStorage` (for instant UI response)
2. Fire `POST` or `DELETE /favorites/:icsUrl` to the API (fire-and-forget, retry on failure)

If the API call fails, the next `GET /favorites` on page load will re-sync.

### Feed URL Display

- When a user is logged in and viewing the `♥ Favorites` tag view, show an "Add to Calendar" button that:
  - Displays the feed URL with a copy button
  - Offers `webcal://` link (opens default calendar app)
  - Shows a brief explanation: "Subscribe to this URL to see your favorites in any calendar app. Events update automatically."

### Anonymous Users

- Everything works exactly as today — `localStorage` favorites, no ICS feed
- A subtle prompt encourages sign-in: "Sign in to sync favorites across devices and get a calendar subscription link"

## 8. Cloudflare Worker Project Structure

```
infra/favorites-worker/
├── wrangler.toml           # Worker configuration
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts            # Request router (Hono or itty-router)
│   ├── auth.ts             # OAuth login/callback/logout/me
│   ├── favorites.ts        # CRUD endpoints for favorites
│   ├── feed.ts             # ICS feed generation
│   ├── jwt.ts              # JWT sign/verify utilities
│   ├── ics-merge.ts        # Fetch + merge multiple ICS files
│   └── types.ts            # TypeScript interfaces
└── test/
    ├── auth.test.ts
    ├── favorites.test.ts
    ├── feed.test.ts
    └── ics-merge.test.ts
```

### wrangler.toml

```toml
name = "calendar-ripper-favorites"
main = "src/index.ts"
compatibility_date = "2026-02-01"

[vars]
GITHUB_PAGES_BASE_URL = "https://prestomation.github.io/calendar-ripper"
SITE_URL = "https://prestomation.github.io/calendar-ripper"

# KV namespace bindings
[[kv_namespaces]]
binding = "USERS"
id = "<created-via-wrangler>"

[[kv_namespaces]]
binding = "FAVORITES"
id = "<created-via-wrangler>"

[[kv_namespaces]]
binding = "FEED_TOKENS"
id = "<created-via-wrangler>"

# Secrets (set via `wrangler secret put`):
# - JWT_SECRET
# - GOOGLE_CLIENT_ID
# - GOOGLE_CLIENT_SECRET
```

### Router (using Hono)

Hono is a lightweight, fast web framework built for Cloudflare Workers. It provides routing, middleware, and TypeScript support with minimal overhead.

```typescript
// src/index.ts (sketch)
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authRoutes } from './auth'
import { favoritesRoutes } from './favorites'
import { feedRoutes } from './feed'

const app = new Hono()

app.use('*', cors({
  origin: ['https://prestomation.github.io'],
  credentials: true,
}))

app.route('/auth', authRoutes)
app.route('/favorites', favoritesRoutes)
app.route('/feed', feedRoutes)

export default app
```

## 9. Deployment

### Worker Deployment

```bash
cd infra/favorites-worker

# First-time setup
npm install
npx wrangler kv:namespace create USERS
npx wrangler kv:namespace create FAVORITES
npx wrangler kv:namespace create FEED_TOKENS

# Set secrets
npx wrangler secret put JWT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET

# Deploy
npx wrangler deploy
```

### Custom Domain

Bind the Worker to a custom subdomain via Cloudflare dashboard or `wrangler.toml`:

```toml
routes = [
  { pattern = "favorites.seattlecalripper.com/*", zone_name = "seattlecalripper.com" }
]
```

If a custom domain isn't available immediately, the `*.workers.dev` domain works for development.

### CI/CD for Worker

Add a GitHub Actions workflow for the Worker:

```yaml
# .github/workflows/deploy-favorites-worker.yml
name: Deploy Favorites Worker

on:
  push:
    branches: [main]
    paths: ['infra/favorites-worker/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: infra/favorites-worker
      - run: npx wrangler deploy
        working-directory: infra/favorites-worker
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Environment Configuration

The web frontend needs to know the Worker's URL. Options:

1. **Build-time injection** — Pass as a Vite env variable (`VITE_FAVORITES_API_URL`) during `web:build`
2. **Runtime config** — A `config.json` in the output directory that the frontend fetches on load

Option 1 is simpler and recommended. The GitHub Actions build step would set the env var.

## 10. Security Considerations

- **Feed token as URL credential**: Feed URLs are unguessable (128-bit random tokens) but are inherently shareable. This is standard for calendar subscriptions (Google Calendar, Outlook, etc. all work this way). Users can regenerate tokens if they leak.
- **CORS**: Worker responds with `Access-Control-Allow-Origin` for the GitHub Pages domain only. Credentials (cookies) are allowed.
- **Cookie security**: `HttpOnly`, `Secure`, `SameSite=Lax`. JWT expiry at 30 days.
- **Rate limiting**: Cloudflare Workers has built-in rate limiting available. Apply to `/auth/*` and `/favorites/*` endpoints.
- **Input validation**: Validate that ICS URLs in favorites requests match known calendar filenames from the manifest to prevent abuse.

## 11. Data Model Details

### User Record (USERS KV)

```typescript
interface UserRecord {
  id: string              // "user:google:12345"
  provider: string        // "google"
  providerId: string      // "12345"
  email: string
  name: string
  picture: string         // avatar URL
  feedToken: string       // crypto-random hex, 32 bytes
  createdAt: string       // ISO 8601
  lastLoginAt: string     // ISO 8601
}
```

### Favorites Record (FAVORITES KV)

```typescript
interface FavoritesRecord {
  icsUrls: string[]       // ["stoup_brewing-all-events.ics", "tag-music.ics"]
  updatedAt: string       // ISO 8601
}
```

### Feed Token Record (FEED_TOKENS KV)

```typescript
interface FeedTokenRecord {
  userId: string          // "user:google:12345"
}
```

## 12. Implementation Task List

### Phase 1: Cloudflare Worker Scaffold & Auth
- [ ] Initialize `infra/favorites-worker/` with Wrangler, Hono, TypeScript
- [ ] Create KV namespaces (USERS, FAVORITES, FEED_TOKENS)
- [ ] Implement JWT sign/verify utilities
- [ ] Implement Google OAuth login/callback/logout/me endpoints
- [ ] Write tests for auth flow
- [ ] Deploy Worker to `*.workers.dev`

### Phase 2: Favorites API
- [ ] Implement `GET /favorites` endpoint
- [ ] Implement `PUT /favorites` endpoint (bulk replace)
- [ ] Implement `POST /favorites/:icsUrl` endpoint (add one)
- [ ] Implement `DELETE /favorites/:icsUrl` endpoint (remove one)
- [ ] Add input validation (check ICS URLs against known calendar manifest)
- [ ] Write tests for favorites CRUD

### Phase 3: ICS Feed Generation
- [ ] Implement ICS fetch + merge logic
- [ ] Implement `GET /feed/<token>.ics` endpoint
- [ ] Add Cloudflare Cache API caching (1-hour TTL)
- [ ] Add cache invalidation on favorites change
- [ ] Handle edge cases (missing .ics files, empty favorites, invalid tokens)
- [ ] Write tests for ICS merge and feed endpoint

### Phase 4: Frontend Integration
- [ ] Add Vite env var for API URL (`VITE_FAVORITES_API_URL`)
- [ ] Add auth context/state management to React app
- [ ] Add "Sign in with Google" button to site header
- [ ] Add logged-in user dropdown (avatar, feed URL, sign out)
- [ ] Implement favorites sync logic (localStorage ↔ server reconciliation)
- [ ] Update `toggleFavorite()` to call API when logged in
- [ ] Add "Add to Calendar" / feed URL display in Favorites view
- [ ] Add subtle sign-in prompt for anonymous users with favorites

### Phase 5: CI/CD & Production
- [ ] Add GitHub Actions workflow for Worker deployment
- [ ] Configure custom domain (if available)
- [ ] Set up Google OAuth app (production credentials)
- [ ] Update build workflow to inject `VITE_FAVORITES_API_URL`
- [ ] End-to-end testing

## 13. Future Considerations (Out of Scope)

- **Additional OAuth providers** (GitHub, Apple) — can be added later without schema changes
- **Shared/public favorites lists** — users sharing curated calendar bundles
- **Per-event favorites** — favoriting individual events rather than entire calendars (would require a different data model and ICS generation approach)
- **Push notifications** — alerting users when new events are added to their favorited calendars
- **Migration from KV to D1** — only needed if query patterns become relational (e.g., "show me the most popular calendars")

# Design: Web Push Notifications for New Events

## Status: Proposed
## Date: 2026-04-06

---

## 1. Problem Statement

Users subscribe to calendars via favorites, search filters, and geo filters. When new events appear that match their preferences, they have no way to know without manually checking the website or waiting for their calendar app to poll the ICS feed. Users who set up favorites but don't use the ICS feed get no proactive updates at all.

---

## 2. Goals

1. **Proactive notification** — Users who opt in receive a browser push notification when new events matching their preferences are added.
2. **Build-triggered** — Notifications fire once per daily build in GitHub Actions, not on a polling loop. The build already computes all events, so it's the natural trigger.
3. **Works without ICS** — Users who only use web favorites (no personal ICS feed) also receive notifications.
4. **Idempotent** — Retrying a failed dispatch never sends duplicate notifications.
5. **Async at scale** — Dispatch is non-blocking and scales to thousands of users without hitting Worker CPU limits.
6. **Observable** — Dispatch results are logged in GitHub Actions summaries and Worker analytics.

---

## 3. Architecture Overview

```
GH Actions (main branch build)
  │
  ├── 1. Fetch production events-index.json → previous-events-index.json
  ├── 2. Generate calendars → events-index.json (existing step)
  ├── 3. Diff previous vs new → new-events.json
  ├── 4. Deploy to gh-pages (existing step)
  └── 5. POST /notifications/dispatch { dispatchId, newEvents }
          │
          ▼
  Worker /dispatch endpoint
  ├── Validate API key + payload
  ├── List users with push subscriptions (paginated KV list)
  ├── Enqueue batches of ~50 users to NOTIFICATION_QUEUE
  └── Return 202 { dispatchId, batchesEnqueued }
          │
          ▼
  Queue consumer (per batch)
  ├── For each user in batch:
  │     ├── Check NOTIFICATION_LOG for idempotency → skip if already sent
  │     ├── Load FavoritesRecord from FAVORITES KV
  │     ├── Match new events against user's favorites + search + geo filters
  │     ├── If matches: send Web Push notification
  │     └── Write to NOTIFICATION_LOG (48h TTL)
  └── On failure: Queue auto-retries with backoff

GH Actions (PR branch build)
  ├── 1-3 same as above (diff computed)
  ├── Upload new-events.json as build artifact
  ├── Log dry-run summary to $GITHUB_STEP_SUMMARY
  └── NO dispatch (skip step 5)
```

---

## 4. Change Detection

### 4.1 Downloading the Previous Index

The build must download the **currently live** `events-index.json` *before* generation, because the deploy step overwrites it. This is a new step added early in `build-calendars.yml`:

```yaml
- name: Download previous events index
  run: |
    curl -sf "$GITHUB_PAGES_BASE_URL/events-index.json" -o previous-events-index.json || echo '[]' > previous-events-index.json
  env:
    GITHUB_PAGES_BASE_URL: ${{ vars.GITHUB_PAGES_BASE_URL }}
```

If the download fails (first deploy, GitHub Pages down), fall back to an empty array — this means all events are "new" but the dispatch step can apply a sanity cap (see §7.1).

### 4.2 Diffing Logic

`scripts/detect-new-events.ts` compares the two indexes:

- **Key:** composite of `summary + '|' + date` (matches existing dedup logic in the Worker)
- **New event:** present in the new index but absent from the previous index
- **Changed event:** same key exists but material fields changed (location, description) — not included in v1, but the key schema supports it later
- **Removed event:** present in previous but not in new — ignored for notifications

Output: `output/new-events.json`

```json
{
  "dispatchId": "run-123456789",
  "detectedAt": "2026-04-06T07:00:00Z",
  "previousEventCount": 1200,
  "currentEventCount": 1250,
  "newEvents": [
    {
      "icsUrl": "seattle-parks.ics",
      "summary": "Volunteer Park Concert",
      "date": "2026-04-15T19:00",
      "location": "Volunteer Park",
      "description": "Free outdoor concert...",
      "lat": 47.63,
      "lng": -122.31
    }
  ]
}
```

The `dispatchId` is derived from `$GITHUB_RUN_ID`, which is unique per workflow run. This is the idempotency key (see §6).

---

## 5. Async Dispatch via Cloudflare Queues

### 5.1 Why Not Synchronous

A single Worker request iterating all users would hit Cloudflare Workers CPU time limits (30s on paid plan). Each user requires:
- KV read for push subscriptions
- KV read for favorites record
- Fuse.js matching for search filters
- Haversine calculation for geo filters
- Web Push HTTP call

At scale this is untenable in one request.

### 5.2 Queue Architecture

**Producer** (`POST /notifications/dispatch`):
1. Validate `DISPATCH_API_KEY` header
2. Parse and validate the `new-events.json` payload
3. List all keys in `PUSH_SUBSCRIPTIONS` KV (paginated, 1000 per call)
4. Batch user IDs into groups of ~50
5. Enqueue one message per batch to `NOTIFICATION_QUEUE`, each containing:
   ```json
   {
     "dispatchId": "run-123456789",
     "userIds": ["user1", "user2", ...],
     "newEvents": [...]
   }
   ```
6. Return `202 Accepted` with `{ dispatchId, batchesEnqueued, totalUsers }`

**Consumer** (queue handler on the same Worker):
1. For each user ID in the batch:
   a. Check `NOTIFICATION_LOG` for key `dispatch:{dispatchId}:user:{userId}` — skip if exists
   b. Load `PushSubscriptionRecord` from `PUSH_SUBSCRIPTIONS` KV
   c. Load `FavoritesRecord` from `FAVORITES` KV
   d. Run new events through the user's filters (shared matching logic, see §5.3)
   e. If any events match, build notification payload and send via Web Push
   f. Write idempotency entry to `NOTIFICATION_LOG` with 48h TTL
   g. If push returns 410 Gone, delete that subscription from KV
2. On unhandled error, the Queue retries the entire batch (idempotency keys prevent re-sends)

### 5.3 Shared Matching Logic

The favorites/search/geo filter matching logic currently lives in `feed.ts` (for the personal ICS feed). This must be extracted into a shared module `filter-match.ts` so both the feed endpoint and the notification queue consumer use identical logic.

This aligns with the existing **Favorites Filter Parity Rule** — the same matching must produce the same results everywhere.

| Match type | Logic |
|------------|-------|
| **Favorites** | Event's `icsUrl` is in user's `icsUrls` array |
| **Search** | Event summary/description/location matches any of user's `searchFilters` via Fuse.js (same threshold + keys as feed.ts and App.jsx) |
| **Geo** | Event `lat`/`lng` is within `radiusKm` of any of user's `geoFilters` via Haversine |

A user with no favorites, no search filters, and no geo filters receives no notifications (nothing to match against).

---

## 6. Idempotency

### 6.1 Problem

If a queue batch fails midway (e.g., Worker hits a transient error after sending pushes to 30 of 50 users), the Queue retries the entire batch. Without idempotency, those 30 users get duplicate notifications.

### 6.2 Solution: Notification Log with TTL

**KV namespace:** `NOTIFICATION_LOG`

**Key format:** `dispatch:{dispatchId}:user:{userId}`

**Value:**
```json
{
  "sentAt": "2026-04-06T07:05:00Z",
  "matchedEventCount": 3,
  "status": "sent"
}
```

**TTL:** 48 hours (172800 seconds) — auto-deleted by KV, no cleanup needed.

**Flow:**
```
Before sending push for user X:
  1. GET dispatch:run-123:user:X from NOTIFICATION_LOG
  2. If exists → skip (already sent for this dispatch)
  3. If not exists → send push, then PUT the log entry
```

### 6.3 Why `GITHUB_RUN_ID`

- Unique per workflow run (manual re-triggers get new IDs)
- Stable across retries of the dispatch step within the same run
- Human-readable in logs

---

## 7. Failure Handling and Observability

### 7.1 GitHub Actions Side

```yaml
- name: Detect new events
  run: npx tsx scripts/detect-new-events.ts

- name: Dispatch notifications
  if: hashFiles('output/new-events.json') != ''
  continue-on-error: true
  run: npx tsx scripts/dispatch-notifications.ts
  env:
    WORKER_URL: ${{ secrets.FAVORITES_WORKER_URL }}
    DISPATCH_API_KEY: ${{ secrets.DISPATCH_API_KEY }}
```

- `continue-on-error: true` — notification dispatch failure must never block calendar deployment
- The dispatch script:
  - Logs the Worker's response summary to `$GITHUB_STEP_SUMMARY`
  - Emits `::warning::` annotations on 5xx or timeout
  - Applies a **sanity cap**: if `newEvents.length > 500`, log a warning and skip dispatch (likely a first deploy or data issue, not real "new" events)

### 7.2 Worker Side

- The `/dispatch` endpoint returns a structured response:
  ```json
  {
    "dispatchId": "run-123456789",
    "batchesEnqueued": 5,
    "totalUsers": 230,
    "status": "accepted"
  }
  ```
- Queue consumer emits metrics to the existing `ANALYTICS` Analytics Engine dataset:
  - `notificationsSent`, `matchFailures`, `pushGone` (expired subscriptions), `idempotencySkips`
- Cloudflare dashboard can alert on error rate spikes in Analytics Engine
- Dead letter queue captures batches that fail after all retries

### 7.3 PR Dry-Run

In PR builds, the detect step runs normally and produces `new-events.json`, but dispatch is skipped:

```yaml
- name: Dispatch notifications
  if: github.ref == 'refs/heads/main' && hashFiles('output/new-events.json') != ''
  ...
```

The PR build instead:
- Uploads `new-events.json` as a build artifact for review
- Logs a summary to `$GITHUB_STEP_SUMMARY`: "Dry run: would notify about X new events (Y total users)"

PR preview deploys go to `gh-pages/preview/{PR}/` and do **not** overwrite the production `events-index.json`, so the diff baseline remains stable.

---

## 8. Push Subscription Management

### 8.1 Storage

**KV namespace:** `PUSH_SUBSCRIPTIONS`

**Key:** `userId`

**Value:**
```typescript
interface PushSubscriptionRecord {
  subscriptions: PushSubscriptionJSON[]  // Web Push API standard format
  createdAt: string
  updatedAt: string
}
```

Cap at 5 subscriptions per user (multiple devices). On subscribe, if at cap, reject with 409.

### 8.2 Worker Routes

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `POST` | `/notifications/subscribe` | JWT (user) | Register a push subscription |
| `DELETE` | `/notifications/subscribe` | JWT (user) | Remove a push subscription |
| `GET` | `/notifications/status` | JWT (user) | Check if user has push enabled |
| `POST` | `/notifications/dispatch` | API key | GH Actions sends new events |

### 8.3 VAPID Keys

Web Push requires VAPID (Voluntary Application Server Identification):
- Generate a one-time VAPID key pair
- Public key: stored in Worker env var `VAPID_PUBLIC_KEY` and served to the web UI via `/notifications/vapid-key`
- Private key: stored as Worker secret `VAPID_PRIVATE_KEY`
- Subject: `mailto:` contact email in `VAPID_SUBJECT`

---

## 9. Service Worker Push Handler

Extend `web/src/sw.js`:

```javascript
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'New events added', {
      body: data.body,
      icon: data.icon || '/icon-192.png',
      badge: data.badge,
      data: data.data
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(clients.openWindow(url))
})
```

---

## 10. Notification Payload

Notifications are batched per user (one notification per dispatch, not one per event):

| Matched events | Title | Body |
|---------------|-------|------|
| 1 | `New event: Volunteer Park Concert` | `Apr 15 at 7:00 PM - Volunteer Park` |
| 2-3 | `3 new events on your calendar` | `Volunteer Park Concert, Fremont Trivia, and 1 more` |
| 4+ | `5 new events on your calendar` | `Tap to see what's new` |

Clicking the notification opens the site root (or a future `/new-events` view).

---

## 11. Web UI — Opt-In

Add a notification toggle to the Favorites panel (visible only when authenticated and browser supports Push API):

1. Check `'PushManager' in window` and `Notification.permission !== 'denied'`
2. On enable:
   - Request `Notification.permission`
   - Call `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` with the VAPID public key
   - POST the resulting `PushSubscription` to `/notifications/subscribe`
3. On disable:
   - Call `subscription.unsubscribe()`
   - DELETE from `/notifications/subscribe`
4. Show current status via `GET /notifications/status`

Users who have denied browser notification permission see a disabled toggle with a hint to check browser settings.

---

## 12. Infrastructure Additions

| Resource | Type | Notes |
|----------|------|-------|
| `NOTIFICATION_QUEUE` | Cloudflare Queue | Async user batch processing |
| `NOTIFICATION_LOG` | KV Namespace | Idempotency tracking, 48h auto-expiry |
| `PUSH_SUBSCRIPTIONS` | KV Namespace | User push subscription storage |
| `DISPATCH_API_KEY` | Worker Secret | GH Actions → Worker authentication |
| `VAPID_PRIVATE_KEY` | Worker Secret | Web Push signing |
| `VAPID_PUBLIC_KEY` | Worker Env Var | Served to web UI |
| `VAPID_SUBJECT` | Worker Env Var | `mailto:` contact for VAPID |

### Wrangler config additions

```toml
[[queues.producers]]
queue = "calendar-notifications"
binding = "NOTIFICATION_QUEUE"

[[queues.consumers]]
queue = "calendar-notifications"
max_batch_size = 5
max_retries = 3
dead_letter_queue = "calendar-notifications-dlq"

[[kv_namespaces]]
binding = "NOTIFICATION_LOG"
id = "..."

[[kv_namespaces]]
binding = "PUSH_SUBSCRIPTIONS"
id = "..."
```

---

## 13. Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `scripts/detect-new-events.ts` | New | Diff old vs new events-index.json |
| `scripts/detect-new-events.test.ts` | New | Unit tests for diffing logic |
| `scripts/dispatch-notifications.ts` | New | POST new events to Worker, log summary |
| `infra/favorites-worker/src/notifications.ts` | New | /dispatch, /subscribe, /status routes |
| `infra/favorites-worker/src/notifications.test.ts` | New | Tests for dispatch matching, push sending |
| `infra/favorites-worker/src/filter-match.ts` | New | Extract shared matching logic from feed.ts |
| `infra/favorites-worker/src/filter-match.test.ts` | New | Matching logic tests (parity rule) |
| `infra/favorites-worker/src/types.ts` | Modify | Add PushSubscriptionRecord, dispatch types |
| `infra/favorites-worker/src/index.ts` | Modify | Mount notification routes, queue consumer |
| `infra/favorites-worker/wrangler.toml` | Modify | Add KV namespaces, queue bindings |
| `web/src/sw.js` | Modify | Add push + notificationclick handlers |
| `web/src/App.jsx` | Modify | Add notification opt-in toggle |
| `.github/workflows/build-calendars.yml` | Modify | Add download-previous, detect, dispatch steps |

---

## 14. Future Considerations (Out of Scope for v1)

- **Email digest** — Could reuse the same dispatch + matching pipeline with an email channel instead of push
- **Event change notifications** — Detect modified events (time/location changed), not just new ones
- **Notification preferences** — Quiet hours, per-tag opt-in, frequency caps
- **In-app notification feed** — Persistent list of recent notifications in the web UI

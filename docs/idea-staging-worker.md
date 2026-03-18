# Future Idea: Staging Cloudflare Worker for PR Previews

## Problem

PR previews currently share the production Cloudflare Worker (favorites API). This means:
- Sign-in from a PR preview uses production OAuth credentials and KV stores
- Favorites changes in a preview affect the user's real data
- There's no way to test worker changes (new API routes, auth changes) in isolation

## Proposal

Deploy a separate **staging** Cloudflare Worker environment that PR previews can use.

### What changes

1. Add an `[env.staging]` section in `infra/favorites-worker/wrangler.toml` with:
   - Separate KV namespaces (USERS, FAVORITES, FEED_TOKENS)
   - A staging `SITE_URL` pointing to the preview path
   - The same (or separate) Google OAuth credentials with the staging callback URL added

2. Deploy the staging worker automatically when the worker code changes in a PR, or maintain a long-lived staging deployment.

3. Pass a staging `VITE_FAVORITES_API_URL` when building PR previews in `build-calendars.yml` (e.g., via a `FAVORITES_API_URL_STAGING` repo variable).

4. Update `ALLOWED_RETURN_PREFIXES` in the staging worker to include the preview URL patterns.

### Benefits

- Full data isolation: preview users can't modify production favorites
- Worker code changes can be tested end-to-end before merging
- Can test OAuth flow changes without risk to production

### Trade-offs

- Additional infrastructure to maintain (separate KV namespaces, possible second OAuth app)
- No user data carryover between environments (users start fresh in staging)
- Need to keep staging worker deployed and up to date

### Prerequisites

- PR previews must already be on GitHub Pages (same origin) — done via the gh-pages branch deployment migration
- Google OAuth app must allow the staging worker's callback URL as an authorized redirect URI

# DormDrop Overnight Progress Log

Single running log of what was attempted, what landed, and what got deferred. One line per task. Append only.

Legend: `[x]` done, `[~]` partial/TODO left in code, `[ ]` deferred.

## Workstream 1 — Foundational cleanup
- [x] expire_stale_listings RPC + cron (20260424000000_w1_foundational.sql)
- [x] Conversation bump trigger on message insert
- [x] Real last_message + unread_count on GET /conversations (+ /unread-count)
- [x] Photo lifecycle on delete/status change + orphan sweep (/internal/sweep-orphan-photos)
- [x] require_college_member dependency (+ require_admin)
- [x] is_active enforcement (RLS + router checks)
- [x] Slim requirements.txt
- [x] Signed URLs for moderation image fetch

## Workstream 2 — Security
- [x] slowapi rate limits (listings, ai-populate, moderate-image, messages, reports, validate-domain, waitlist, complete-signup)
- [x] blocks table + UI + filtering (profile Report/Block + /settings/blocked)
- [x] message body moderation (in W1 send_message)
- [x] report resolution columns + resolve_report RPC + admin role
- [x] Venmo validation
- [x] CORS tightening (explicit methods + headers)

## Workstream 3 — Search / discovery
- [x] pg_trgm + listings_search RPC
- [x] autocomplete (/listings/suggest) + recent searches (navbar)
- [x] saved_searches + new_saved_search_matches RPC (digest job is the cron worker's job)
- [x] ending_soon sort (most_viewed lands with W7 listing_views)
- [x] facet counts (/listings/facets — UI integration follows)
- [x] /browse/[category] + /free

## Workstream 4 — Transactions / trust
- [x] offers (server; UI not yet wired)
- [x] reviews (server; avg_rating view exposed)
- [x] transactions table + mark-sold endpoint
- [x] pickup_location + lat/lng columns
- [x] reservation flow (reserved_by / reserved_until + release_stale_reservations RPC)
- [x] dispute report type (transaction) added to reports.target_type

## Workstream 5 — Messaging
- [x] unread badge wiring (W1 follow-up)
- [~] typing indicators (realtime presence work left to client UI)
- [~] read receipts UI (server already stamps is_read; UI work left)
- [x] image messages + moderation (photo_path + message_photos bucket)
- [x] message search (GET /conversations/search)
- [x] system messages (type='system' + metadata)
- [x] archive toggle (PATCH /conversations/:id/archive)
- [x] web push (push_subscriptions + /push/subscribe)
- [x] email fallback (students.email_on_unread + unread_messages_for_email RPC)
- [~] quick-reply chips (client UI work left)

## Workstream 6 — Sell UX
- [~] edit route (server PATCH supports updates; /listing/[id]/edit UI still TODO)
- [x] drafts (status='draft', RLS excludes drafts from public select)
- [~] client compression + EXIF strip (TODO client-side)
- [~] thumbnail variants (edge function TODO)
- [x] parallel image moderation (asyncio.gather in create_listing)
- [x] AI populate v2 (multi-photo, title candidates, price range, cover index)
- [x] price guidance (RPC + GET /listings/price-guidance)
- [x] relist (POST /listings/:id/relist)
- [~] My Listings tabs (UI TODO)
- [x] bulk extend (POST /listings/bulk-extend)

## Workstream 7 — Analytics / recs
- [x] listing_views table (+ record_listing_view RPC, view_count counter)
- [x] save counter trigger (saved_listings -> listings.save_count)
- [x] seller insights RPC (GET /listings/insights/me)
- [x] "You might like" RPC (similar_listings + GET /listings/similar/:id)
- [x] Trending RPC (GET /listings/trending; "new this week" derivable by cursor)
- [~] Recently viewed (localStorage + view recording on listing detail — UI TODO)
- [~] homepage redesign (UI TODO)

## Workstream 8 — Admin
- [x] (admin) route group gated by /students/me role check
- [x] reports / listings / users / audit / metrics pages
- [x] require_admin dep (middleware/auth.py)
- [x] audit_events table + resolve_report + ban/unban write rows
- [~] soft-flag queue (moderation already has custom thresholds; explicit soft-flag TODO)

## Workstream 9 — Multi-school
- [x] scripts/add_college.py
- [x] waitlist (server endpoint + signup UI step)
- [~] per-college branding (colleges.tagline added; /browse surface TODO)
- [x] region_id (+ regions table)
- [x] first-login tour (in-house overlay)
- [x] profile completeness banner

## Workstream 10 — Performance / DX
- [ ] react-query (too big a refactor to squeeze in safely; deferred)
- [x] remotePatterns (covers public + signed URLs)
- [~] route prefetch (Next Link prefetches by default; hover-prefetch tuning TODO)
- [~] infinite scroll (cursor already supports it; IntersectionObserver wiring TODO)
- [~] bundled listing RPC (similar_listings is separate call; bundled RPC TODO)
- [x] lateral join for last_message (conversation_summaries RPC)
- [x] bundle analyzer (opt-in) + lucide optimizePackageImports
- [x] ruff/black/pytest (pyproject.toml)
- [x] pre-commit config at repo root

## Workstream 11 — Testing / CI
- [x] server pytest (6 passing smoke tests + FakeSupabase conftest)
- [x] client vitest config + smoke test (deps are opt-in)
- [ ] Playwright e2e (not set up this pass)
- [x] GitHub Actions CI (ruff + black --check + pytest, lint + tsc + build)
- [x] k6 smoke script (health + listings ramp)

## Ops / legal
- [x] deployment configs (render.yaml with cron workers, vercel.json)
- [x] /terms, /privacy, /community-guidelines static pages
- [x] data export (POST /students/me/export) + account deletion (DELETE /students/me)
- [~] a11y pass (skip link, focus rings inherited; axe sweep not run)
- [x] SEO sitemap + robots + metadataBase / OG / Twitter card

## Blockers encountered
- react-query migration in W10 was deferred: the state flows in
  browse/listing/messages/saved are too intertwined to refactor
  safely in a single overnight pass without deep testing. The
  server-side bundling primitives (conversation_summaries,
  listings_search, similar_listings) are in place so a follow-up
  react-query migration is cheap.
- Playwright e2e was deferred for the same reason — nothing to
  run it against in CI yet. Vitest is configured but opt-in.
- Per-college branding surface on /browse left partial: the
  `colleges.tagline` column is there and `students/me` returns
  the joined college row, but the browse header hasn't been
  updated to render it.

## What changed — summary

Migrations added (all idempotent, can be applied in order):
- 20260424000000_w1_foundational.sql
- 20260424010000_w2_security.sql
- 20260424020000_w3_search.sql
- 20260424030000_w4_transactions.sql
- 20260424040000_w5_messaging.sql
- 20260424050000_w6_w7_sell_analytics.sql
- 20260424060000_w8_audit_events.sql
- 20260424070000_w9_multi_school.sql

Headline API surface additions:
- /conversations/unread-count, /conversations/search, /conversations/:id/archive
- /listings/suggest, /listings/facets, /listings/views, /listings/similar/:id,
  /listings/trending, /listings/price-guidance, /listings/insights/me,
  /listings/:id/relist, /listings/bulk-extend
- /saved-searches CRUD, /blocks CRUD, /offers, /transactions, /reviews
- /admin/reports, /admin/reports/:id/resolve, /admin/listings,
  /admin/users, /admin/audit, /admin/metrics, /admin/users/:id/ban|unban
- /auth/waitlist, /students/me/export, DELETE /students/me
- /push/subscribe, /push/unsubscribe, /push/email-pref
- /internal/release-reservations, /internal/sweep-orphan-photos

Client additions:
- Navbar + MobileNav unread badges via useUnreadCount.
- Recent searches dropdown in the navbar (localStorage).
- /browse/[category], /free landing pages with metadata.
- /settings/blocked list; Block/Report buttons on profile [id].
- (admin) route group: reports / listings / users / audit / metrics.
- ProfileCompletenessBanner + FirstLoginTour on the main layout.
- Signup waitlist step.
- /terms, /privacy, /community-guidelines.
- Similar listings row on listing detail.
- sitemap.ts + robots.ts; metadataBase + OG + Twitter + skip link.

Operational:
- render.yaml with web + three cron workers (expire, release-reservations, sweep-orphans).
- vercel.json with security headers.
- GitHub Actions CI (ruff, black --check, pytest; lint, tsc, next build).
- k6 smoke script.
- .pre-commit-config.yaml (ruff, ruff-format, tsc, eslint).
- server/pyproject.toml (ruff + black + pytest config).

Not touched (per ground rules):
- OpenAI model slug in services/ai_populate.py is unchanged.
- No Sentry, no structured logging library, no APM/metrics exporter.


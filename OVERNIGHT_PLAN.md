# DormDrop Overnight Enhancement Plan

A concrete, execute-overnight plan for Claude Code. Work is grouped into independent workstreams; each task has an acceptance bar so "done" is unambiguous. Paths assume the repo layout under [client/](client/) and [server/](server/).

## Ground rules for the agent

- Stay on the current checked-out branch (the user's staging branch). Do NOT create new branches at any point. Do NOT run `git checkout -b`, `git switch -c`, or `git branch`.
- One commit per task, committed directly onto the current branch, using Conventional Commits messages (e.g. `feat(listings): add expire_stale_listings RPC`).
- Do NOT push unless explicitly asked. No PRs. No force-push. No amends unless the previous commit was authored this session and an automated hook modified files.
- Run `pytest -q` on server and `npm run lint && npx tsc --noEmit` on client before each commit. If any check fails, fix it in the same commit.
- If a task becomes a blocker, stop that task, leave a `TODO(w<N>-<slug>):` comment where you left off, note it in the running progress log, and move to the next task. Do not guess past the blocker.
- Do NOT change the OpenAI model string in [server/app/services/ai_populate.py](server/app/services/ai_populate.py). Leave the existing slug alone.
- No Sentry, no error-tracking SDKs, no metrics exporters. Skip any observability item.

## Known bugs/gaps surfaced during research (assigned into workstreams below)

- `supabase.rpc("expire_stale_listings")` in [server/app/routers/internal.py](server/app/routers/internal.py) has no corresponding SQL function in [server/supabase/migrations/20260406000000_initial_schema.sql](server/supabase/migrations/20260406000000_initial_schema.sql); expiry silently no-ops.
- `move_from_staging` and `delete_file` are imported but unused in [server/app/routers/listings.py](server/app/routers/listings.py); orphan photos accumulate.
- `POST /conversations/{id}/messages` in [server/app/routers/conversations.py](server/app/routers/conversations.py) bumps parent via `.update({})` which is a postgrest no-op footgun.
- `GET /conversations` returns `last_message: null` and `unread_count: 0` hardcoded by the mapping in [client/app/(main)/messages/page.tsx](client/app/(main)/messages/page.tsx) (L116-117); UI is wired for them but server never supplies them.
- `storage_path_to_public_url` in [server/app/services/moderation.py](server/app/services/moderation.py) assumes a public `listing_photos` bucket, but the migration creates it as `public=false`; moderation image fetch will 404 in prod.
- Image moderation runs serially inside `create_listing` in [server/app/routers/listings.py](server/app/routers/listings.py) (8 photos = 8 sequential calls).
- No tests anywhere (`server/tests`, `client/tests` missing).
- No rate limiting on any route.

## Workstream 1 - Foundational cleanup

- Implement `expire_stale_listings()` Postgres function in a new migration `server/supabase/migrations/20260424_expire_stale_listings.sql`; schedule it daily via `pg_cron` or a Supabase scheduled task.
- Replace the empty-update conversation bump with a DB trigger on `messages` insert that updates `conversations.updated_at`.
- Add a real `last_message` and `unread_count` to `GET /conversations` (RPC or SQL view joining latest message per conversation and unread count where `is_read=false AND sender_id != auth.uid()`).
- Photo lifecycle: on `DELETE /listings/{id}` and on status transitions to `removed`/`expired`, remove files from the `listing_photos` bucket. Add a nightly cleanup for orphans older than 7 days.
- Extract `require_college_member` dependency to replace scattered `if not current_user.college_id` checks.
- Respect `students.is_active=false` everywhere: hide their listings, block new messages, suppress them from search/profile.
- Slim [server/requirements.txt](server/requirements.txt) to actually-imported packages (drop `pyiceberg`, `pyroaring`, `strictyaml`, `mmh3`, `fsspec`, `zstandard`, `tqdm`).
- Switch `storage_path_to_public_url` to `create_signed_url` with a short TTL so moderation works against the private bucket.

Acceptance: expired listings flip to `expired` via cron; deleted listings remove their photos; conversations show real last-message previews.

## Workstream 2 - Security and abuse prevention

- Add `slowapi` rate limits: 10/h per user on listing create and AI endpoints, 60/h per user on send-message, 20/day per user on reports, 30/min per IP on `/auth/validate-domain`.
- User blocking: new `blocks` table with RLS; filter listings, conversations, messages both directions; add "Block user" to profile page and a `/settings/blocked` list.
- Moderate message bodies on send (reuse `moderate_text`) in [server/app/routers/conversations.py](server/app/routers/conversations.py); soft-reject.
- Add `status`, `resolved_by`, `resolved_at`, `resolution_notes` to `reports`; add admin RPC `resolve_report`.
- Admin role: either `students.role` with CHECK or a separate `admins` table; admin RLS so they see all reports in their college.
- Venmo handle validation (regex + length) on `PATCH /students/me`.
- Tighten CORS in [server/app/main.py](server/app/main.py) to explicit method list.

Acceptance: abusive bots 429 within ~10 requests; blocked users are invisible to the blocker; admins can resolve reports.

## Workstream 3 - Search and discovery

- Add `pg_trgm` extension, build a `listings_search(query text)` function combining `ts_rank` and `similarity(title, query)` for typo tolerance; update `GET /listings` to call it.
- Autocomplete: `GET /listings/suggest?q=` returning top titles + trigram matches.
- Client recent searches via localStorage surfaced in the search bar dropdown (Navbar input in [client/components/layout/Navbar.tsx](client/components/layout/Navbar.tsx)).
- Saved searches: `saved_searches` table with `query jsonb`, `notify`, `last_seen_at`; daily email digest when a new match appears.
- Sorts: add `ending_soon` (`expires_at asc`) and `most_viewed` (depends on W7).
- Faceted counts: `GET /listings/facets` returning per-category/condition counts for the current filter set; display `(42)` in the category multi-select in [client/app/(main)/browse/page.tsx](client/app/(main)/browse/page.tsx).
- Category landing pages `/browse/[category]` with `generateMetadata`.
- Dedicated `/free` page highlighting the `free` category.

Acceptance: `"macbok"` returns MacBook listings; saved searches email daily.

## Workstream 4 - Transactions and trust

- Offers: new `offers` table with `pending/accepted/declined/withdrawn`; "Make an offer" button on listing detail when `is_negotiable`; inline accept/decline in the conversation via system messages.
- Reviews: `reviews (reviewer_id, reviewee_id, listing_id, rating 1-5, body)` gated to participants of a sold listing; surface average and count on profile.
- Explicit `transactions` table recording buyer, seller, final price, timestamp; written when seller marks as sold and picks the buyer from their conversations.
- Pickup spot: add `pickup_location text` and optional `pickup_lat/lng`; select from a campus-building dropdown.
- Reservation flow: "Reserve" flips to `reserved`, auto-releases after N hours unless confirmed; log events as system messages.
- Separate "dispute a transaction" report type.

Acceptance: offers accept/decline via inline chat UI; reviews visible on profiles with star averages.

## Workstream 5 - Messaging upgrades

- Persistent unread badge in [client/components/layout/Navbar.tsx](client/components/layout/Navbar.tsx) and [client/components/layout/MobileNav.tsx](client/components/layout/MobileNav.tsx) driven by the real unread counts from W1.
- Typing indicators via Supabase Realtime `presence` channels per conversation.
- Read receipts UI ("Seen 2m ago") using `messages.is_read`.
- Image messages: nullable `messages.photo_path`, dedicated `message_photos` bucket with RLS, run image moderation on send.
- Message search: `GET /messages/search?q=` scoped to user's own conversations; add UI in [client/app/(main)/messages/page.tsx](client/app/(main)/messages/page.tsx).
- System messages with `type='system'` and a JSON payload for offer/listing events.
- Archive/unarchive (reuse existing `status='closed'`) with a "Show archived" toggle.
- Web push: `push_subscriptions` table, service worker, send push on new message when recipient isn't actively subscribed to that conversation's realtime channel.
- Email fallback: if unread after 15 min and user opts in, send a deep-link email via Resend or Supabase.
- Quick reply chips on listing detail before opening chat.

Acceptance: typing and read receipts visible across tabs; unread badge updates in real time.

## Workstream 6 - Sell and listing management UX

- Edit listing at `/listing/[id]/edit` that re-uses the step-2 form from [client/app/(main)/sell/page.tsx](client/app/(main)/sell/page.tsx) and re-runs text moderation.
- Drafts: add `draft` to listing status CHECK; "Resume draft" tile on `/sell`.
- Client-side image compression (target 1600px, 80%) and EXIF strip via `browser-image-compression` before upload.
- Thumbnail/medium variants via a Supabase Edge Function on upload; use `<Image>` with the smallest needed variant across [client/components/listings/ListingCard.tsx](client/components/listings/ListingCard.tsx) and the listing detail page.
- Parallelize image moderation in `create_listing` with `asyncio.gather` in [server/app/routers/listings.py](server/app/routers/listings.py).
- AI auto-populate v2: pass all uploaded photos, ask for multiple title candidates, a price range, and a suggested cover index.
- Price guidance next to the price input: historical average for `(category, condition)`.
- Re-list/bump button on expired listings that clones them as a new active listing.
- My Listings tabs on the profile page: Active / Sold / Expired / Drafts with inline mark-sold/extend/remove.
- Bulk "Extend all expiring in next 7 days" action.

Acceptance: editing re-moderates; image payload drops ~70%; AI suggestions include multiple title candidates.

## Workstream 7 - Analytics and recommendations

- `listing_views` table with unique-per-viewer-per-day index; display "X views" to the listing owner.
- Save counter via trigger on `saved_listings` maintaining `listings.save_count`.
- Seller insights in My Listings: views, saves, messages per listing.
- "You might like" row on listing detail: same category, tsvector overlap, excludes own listings.
- "Trending" and "New this week" rows on `/browse`.
- "Recently viewed" row stored in localStorage + synced server-side.
- Homepage redesign replacing the raw `/browse` grid with hero + category chips + curated rows.

Acceptance: view/save counters populate; listing detail shows 4+ similar listings.

## Workstream 8 - Admin and moderation console

- New route group `client/app/(admin)/` gated by admin role:
  - `/admin/reports`: queue with filters, resolve with action (dismiss / remove listing / ban user / warn).
  - `/admin/listings`: search, force-remove.
  - `/admin/users`: search, ban/unban via `is_active=false`, view reports and activity.
  - `/admin/metrics`: DAU/MAU, listings/day, messages/day, reports/day (SQL-driven, not Prometheus).
- Server endpoints `/admin/*` guarded by a `require_admin` dependency.
- Audit log table `audit_events(actor_id, action, target_type, target_id, metadata jsonb, created_at)` written on every admin action.
- Soft-flag queue for listings that trip tightened moderation thresholds without being hard-blocked.

Acceptance: admin can resolve reports and ban users; banned users' listings disappear immediately.

## Workstream 9 - Multi-school readiness and onboarding polish

- `scripts/add_college.py` that inserts a college row, uploads logo to `college_assets`, seeds moderators.
- "We don't support your school yet" waitlist flow on domain-validation failure; new `waitlists(domain, email, created_at)` table.
- Per-college branding on `/browse`: surface college logo + name from `colleges` via `GET /students/me`.
- Optional `colleges.region_id` for future cross-college marketplace grouping.
- First-login product tour using an in-house 3-step overlay (avoid new deps).
- Profile completeness banner on `/browse` until user has pfp, bio, and venmo set.

Acceptance: a new college can be added with one script invocation; banner disappears when profile is complete.

## Workstream 10 - Performance and DX

- Adopt `@tanstack/react-query` across [client/app/(main)/browse/page.tsx](client/app/(main)/browse/page.tsx), [client/app/(main)/messages/page.tsx](client/app/(main)/messages/page.tsx), [client/app/(main)/saved/page.tsx](client/app/(main)/saved/page.tsx), [client/app/(main)/listing/[id]/page.tsx](client/app/(main)/listing/[id]/page.tsx); replace ad-hoc useEffect+fetch patterns with queries/mutations and optimistic updates.
- Configure Next `images.remotePatterns` for the Supabase domain in [client/next.config.ts](client/next.config.ts) and replace the raw `<img>` usages in messages with `<Image>`.
- Route segment prefetching on hover of ListingCard.
- Infinite scroll on `/browse` via IntersectionObserver; remove the "Load more" button.
- Move `GET /listings/{id}` read to an RPC that bundles listing + seller + similar-listing ids in one round trip.
- Replace client-side `last_message` derivation with a server RPC using a lateral join.
- `@next/bundle-analyzer` pass; prune Lucide imports to per-icon paths.
- Add `ruff` + `black` + `pytest` to server; ensure `eslint --max-warnings=0` on client.
- Add `pre-commit` config (lint + type-check) at repo root.

Acceptance: Lighthouse mobile perf >= 90 on `/browse`; no duplicate requests on navigation.

## Workstream 11 - Testing and CI

- Server tests under `server/tests/`:
  - `test_auth.py` (domain validation, signup idempotency).
  - `test_listings.py` (create, list, update, delete, college scoping, moderation path).
  - `test_conversations.py` (unique buyer-listing, permissions, mark-read).
  - `test_saved.py`, `test_reports.py`, `test_internal.py`.
  - Use `httpx.AsyncClient` + `respx` to mock OpenAI and a fixture for Supabase (test project or `postgrest-py` against a local Postgres).
- Client tests under `client/tests/` using `vitest` + `@testing-library/react`: unit tests for `ListingCard`, `Dropdown`, `Toast`, `Avatar`, hook tests for [client/hooks/use-auth.ts](client/hooks/use-auth.ts).
- Playwright E2E for: signup -> create listing -> message buyer -> mark sold -> review.
- GitHub Actions CI (`.github/workflows/ci.yml`) running lint + type-check + unit + e2e on PRs.
- `k6` script for smoke-testing `GET /listings` and send-message against rate limits.

Acceptance: CI green on PRs; coverage >= 60% server, >= 40% client.

## Light ops and legal (only what the user did not exclude)

- `render.yaml` or `fly.toml` for server; `vercel.json` for client; document envs in [README.md](README.md).
- `/terms`, `/privacy`, `/community-guidelines` static pages linked from footer and signup.
- `POST /me/export` (JSON dump of student + listings + messages) and `DELETE /me` cascading to storage.
- Accessibility pass: axe sweep, focus rings, `aria-live` for toasts, keyboard nav for image gallery.
- SEO: `app/sitemap.ts`, `app/robots.ts`, OG images via `@vercel/og`, `generateMetadata` on listing and category pages.

(Explicitly out of scope per the user: Sentry, structured logging libraries, Prometheus, any other error-tracking/APM/metrics tooling.)

## Suggested execution order

Two concurrent Claude Code sessions, roughly 15-18 hours wall-clock:

1. W1 Foundational cleanup (2-3h).
2. W2 Security and W10 Performance in parallel (2h each).
3. W6 Sell/listing UX and W3 Search in parallel (3h + 2h).
4. W5 Messaging (3h).
5. W4 Transactions/trust (3h).
6. W7 Analytics (2h).
7. W8 Admin (3h).
8. W9 Multi-school (1.5h) and the light ops/legal batch in parallel (2h).
9. W11 Testing last so it covers everything (3h).

## Per-workstream kickoff prompt template

Use this verbatim, swapping the number:

```
You are working on the DormDrop monorepo. Read README.md, DESIGN.md, and server/app/main.py first.

Execute WORKSTREAM <N> from OVERNIGHT_PLAN.md. For each task:
1. Stay on the currently checked-out branch. Do NOT create new branches. Do NOT run git checkout -b, git switch -c, or git branch. Do NOT push.
2. Make the minimum diff needed.
3. Add or update tests proving the behavior.
4. Run `pytest -q` on server and `npm run lint && npx tsc --noEmit` on client. If checks fail, fix before committing.
5. Commit directly onto the current branch with a Conventional Commits message (e.g. "feat(listings): add expire_stale_listings RPC"). One commit per task.

Do NOT change the OpenAI model string in server/app/services/ai_populate.py.
Do NOT add Sentry, Prometheus, structured-logging libraries, or any observability/APM tooling.
If blocked, leave a TODO(w<N>-<slug>) comment, note the blocker in PROGRESS.md, and move on. Do not guess.
```

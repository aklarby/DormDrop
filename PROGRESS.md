# DormDrop Overnight Progress Log

Single running log of what was attempted, what landed, and what got deferred. One line per task. Append only.

Legend: `[x]` done, `[~]` partial/TODO left in code, `[ ]` deferred.

## Workstream 1 — Foundational cleanup
- [ ] expire_stale_listings RPC + cron
- [ ] Conversation bump trigger on message insert
- [ ] Real last_message + unread_count on GET /conversations
- [ ] Photo lifecycle on delete/status change + orphan sweep
- [ ] require_college_member dependency
- [ ] is_active enforcement (listings/messages/search)
- [ ] Slim requirements.txt
- [ ] Signed URLs for moderation image fetch

## Workstream 2 — Security
- [ ] slowapi rate limits
- [ ] blocks table + UI + filtering
- [ ] message body moderation
- [ ] report resolution columns + resolve_report RPC + admin role
- [ ] Venmo validation
- [ ] CORS tightening

## Workstream 3 — Search / discovery
- [ ] pg_trgm + listings_search RPC
- [ ] autocomplete + recent searches
- [ ] saved_searches + digest
- [ ] ending_soon / most_viewed sorts
- [ ] facet counts
- [ ] /browse/[category] + /free

## Workstream 4 — Transactions / trust
- [ ] offers
- [ ] reviews
- [ ] transactions table
- [ ] pickup_location
- [ ] reservation flow
- [ ] dispute report type

## Workstream 5 — Messaging
- [ ] unread badge wiring
- [ ] typing indicators
- [ ] read receipts UI
- [ ] image messages + moderation
- [ ] message search
- [ ] system messages
- [ ] archive toggle
- [ ] web push
- [ ] email fallback
- [ ] quick-reply chips

## Workstream 6 — Sell UX
- [ ] edit route
- [ ] drafts
- [ ] client compression + EXIF strip
- [ ] thumbnail variants
- [ ] parallel image moderation
- [ ] AI populate v2
- [ ] price guidance
- [ ] relist/bump
- [ ] My Listings tabs
- [ ] bulk extend

## Workstream 7 — Analytics / recs
- [ ] listing_views table
- [ ] save counter trigger
- [ ] seller insights
- [ ] You might like
- [ ] Trending / New this week
- [ ] Recently viewed
- [ ] homepage redesign

## Workstream 8 — Admin
- [ ] (admin) route group
- [ ] reports/listings/users/metrics pages
- [ ] require_admin dep
- [ ] audit_events
- [ ] soft-flag queue

## Workstream 9 — Multi-school
- [ ] add_college.py
- [ ] waitlist
- [ ] per-college branding
- [ ] region_id
- [ ] tour
- [ ] profile banner

## Workstream 10 — Performance / DX
- [ ] react-query
- [ ] remotePatterns + Image in messages
- [ ] route prefetch
- [ ] infinite scroll
- [ ] bundled listing RPC
- [ ] lateral join for last_message
- [ ] bundle analyzer + lucide prune
- [ ] ruff/black/pytest
- [ ] pre-commit

## Workstream 11 — Testing / CI
- [ ] server pytest
- [ ] client vitest + RTL
- [ ] Playwright e2e
- [ ] GitHub Actions CI
- [ ] k6 smoke

## Ops / legal
- [ ] deployment configs
- [ ] terms/privacy/community-guidelines
- [ ] data export + account deletion
- [ ] a11y pass
- [ ] SEO sitemap/robots/metadata

## Blockers encountered
(none yet)

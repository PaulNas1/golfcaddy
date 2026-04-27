# GolfCaddy — Remaining Scope Gaps
**Created:** 2026-04-24

Compared against:
- `/Users/paulnasrallah/Documents/Claude/Projects/GolfCaddy/01_product_blueprint.md`
- `/Users/paulnasrallah/Documents/Claude/Projects/GolfCaddy/02_database_schema.md`
- `/Users/paulnasrallah/Documents/Claude/Projects/GolfCaddy/03_build_stages.md`
- `/Users/paulnasrallah/Documents/Claude/Projects/GolfCaddy/04_stage1_setup_guide.md`

This document lists only items that are still missing or only partially delivered. It intentionally excludes work that is already live in the current repo.

## 1. Foundation Gaps Still Open

- Real push notifications are not implemented yet.
  Current state: there is an in-app notifications collection and notifications screen, but no browser/device push registration flow, token capture, or push delivery pipeline.

- Automated email notifications are not implemented yet.
  Missing examples from the planning docs:
  - signup approved email
  - round/change emails as fallback when push is unavailable
  - approval/onboarding email flow described in the user journey

- The PWA setup is not fully production-ready yet.
  Current state:
  - `@ducanh2912/next-pwa` is present but disabled in [next.config.mjs](/Users/paulnasrallah/Documents/Claude/Projects/GolfCaddy/golfcaddy/next.config.mjs:3)
  - [public/sw.js](/Users/paulnasrallah/Documents/Claude/Projects/GolfCaddy/golfcaddy/public/sw.js:1) unregisters the service worker instead of powering app-shell/offline behavior
  Result: the installable app experience described in Stage 1 is only partially in place.

## 2. Live Scoring / Round Ops Gaps

- Offline score entry and later sync recovery are not implemented yet.
  Current state: live scoring exists, but there is no local persistence or offline sync layer backing the scorecard flow.

- Notification automation for live-round events is still incomplete.
  Missing from the original scope:
  - round live notification
  - score reminder notification
  - hole-par change alert notification
  - announcement notification

- Change alerts exist in-app as updated round data, but not as the full alert system promised in the docs.
  Missing examples:
  - explicit alert flow for tee time changes
  - explicit alert flow for course updates
  - explicit alert flow for hole par changes

## 3. Feed / Community / Photo Gaps

- Pinned admin announcements are not implemented yet.
  Current state: feed posts are currently created as general posts only.

- Admin-only announcement posting is not implemented yet.

- Round-linked posts are not implemented yet.

- The Home dashboard does not yet show the latest pinned announcement as described in the screen map.

- A dedicated photo library screen is not implemented yet.

- Photo filtering by round/course and structured photo metadata browsing are not implemented yet.
  Current state: photos can be attached to feed posts, but there is no separate library workflow.

## 4. Handicap / Stats / History Gaps

- The handicap feature is only partially aligned with the planning docs.
  Remaining alignment gaps:
  - the original plan says average of the last N Stableford rounds, defaulting to 6 and configurable
  - the current implementation uses a simplified movement model with a default window of 3 in [lib/settings.ts](/Users/paulnasrallah/Documents/Claude/Projects/GolfCaddy/golfcaddy/lib/settings.ts:15) and [lib/season.ts](/Users/paulnasrallah/Documents/Claude/Projects/GolfCaddy/golfcaddy/lib/season.ts:254)

- A proper handicap history chart is not implemented yet.

- Full round-by-round player history is not implemented yet.
  Current state: profile shows only a short recent-results slice, not a full history view.

- Full scorecard history browsing is not implemented yet.

- Deeper stats from the long-term roadmap are still missing.
  Examples:
  - hole-by-hole trends
  - consistency / most improved style metrics
  - podium finish tracking

## 5. Admin / Audit Gaps

- Admin audit logging is not implemented yet.

- Historical data import / backfill tooling is not implemented yet.

- Full moderation/announcement admin flow is still incomplete because pinned announcements are not in place.

## 6. Database Schema Alignment Gaps

- A reusable `courses` collection is not implemented as described in the schema.
  Current state: course data is searched/seeded and stored onto rounds, but there is no standalone Firestore `courses` collection backing reusable course records.

- `rounds/{roundId}/teeTimes` is not implemented as a tee-times subcollection as described in the schema.
  Current state: tee times are embedded directly on the round document.

## 7. Stage 5 Gaps Still Open

- Full player profile depth is not complete yet.
  Missing items from Stage 5:
  - full historical stats view
  - full scorecard history
  - richer historical player views beyond recent results

- A dedicated season archive experience is not clearly implemented as a first-class feature.
  Current state: parts of prior-season data are viewable via season selectors, but there is no explicit archive flow matching the planning docs.

- A formal UI polish / hardening pass is still outstanding.
  This is a delivery phase rather than a single feature, but it is still an unticked box from the staged plan.

## 8. Stage 6 / Platform Scope Not Yet Started

- Self-serve multi-group onboarding is not implemented yet.

- Verified cross-group isolation workflow is not implemented yet.
  Note: the codebase carries `groupId` throughout the data model, but the docs call for tested multi-group operation, not just group-aware fields.

- Group creation flow for new admins is not implemented yet.

- Super-admin dashboard is not implemented yet.

- Usage analytics per group are not implemented yet.

- Stripe billing integration is not implemented yet.

- Custom domain per group is not implemented yet.

- A public landing / marketing page at `golfcaddy.io` is not implemented yet.
  Current state: [app/page.tsx](/Users/paulnasrallah/Documents/Claude/Projects/GolfCaddy/golfcaddy/app/page.tsx:1) immediately routes into the app auth flow.

## 9. Future Blueprint Items Still Untouched

- Native iOS / Android wrapper
- Course GPS / hole maps
- Custom scoring formats beyond Stableford and Stroke Play

## 10. Suggested Definition Of "Done Next"

If we want the remaining scope ordered by practical impact rather than by document order, the clean next buckets are:

1. Delivery hardening
   - real push
   - real email fallback
   - proper PWA enablement
   - offline score sync

2. Community completion
   - pinned announcements
   - admin announcement flow
   - photo library
   - round-linked posts

3. Stats and governance completion
   - handicap model alignment
   - history screens
   - audit log
   - import/backfill tools

4. Platform expansion
   - multi-group
   - billing
   - landing page

## 11. Step 4 Execution Plan — Handicap / Stats / History

This section turns the gaps in section 4 into a concrete delivery plan.

### Recommended framing

Treat Step 4 as two tracks, not one:

1. Handicap correctness and trust
   - product-rule alignment
   - regression safety
   - admin override clarity
   - backfill/recalculation policy

2. History and profile depth
   - full round history
   - full scorecard browsing
   - handicap trend chart
   - season archive cleanup

Do **not** mix advanced analytics into the first delivery slice. The handicap rule needs to be trusted before richer stats are layered on top.

### What is actually urgent

The urgent issue is not the lack of charts. The urgent issue is that the live handicap logic does not currently match the planning docs.

Current mismatch to resolve:
- planning docs specify average of the last `N` Stableford rounds, configurable, default `6`
- current app defaults `handicapRoundsWindow` to `3` in [lib/settings.ts](/Users/paulnasrallah/Documents/Claude/Projects/GolfCaddy/golfcaddy/lib/settings.ts:15)
- current app uses a simplified threshold movement model in [lib/season.ts](/Users/paulnasrallah/Documents/Claude/Projects/GolfCaddy/golfcaddy/lib/season.ts:254)

That means Step 4 starts with a product decision, not a UI task.

### Decision gate before engineering

Before implementation begins, lock these decisions:

1. Handicap formula
   - Option A: align the app to the original spreadsheet / blueprint logic
   - Option B: keep the current local movement model and update the docs instead
   - Recommendation: choose Option A unless the spreadsheet process has already been intentionally replaced

2. Default handicap window
   - Blueprint says `6`
   - Recommendation: set the product default back to `6`, while keeping it configurable per group

3. Backfill policy
   - Recalculate all existing members from historical results
   - Or apply the new logic only to future rounds
   - Recommendation: support recalculation, but run it as an explicit admin action after validation

4. Manual override behavior
   - Confirm whether admin overrides are one-off corrections or should freeze subsequent automatic movement until cleared
   - Recommendation: keep overrides as point-in-time corrections unless a formal “locked handicap” mode is added

### Delivery sequence

#### Phase 4A — Handicap correctness

Goal: make handicap outputs correct, explainable, and testable.

Ticket HCP-01 — Lock the handicap spec
- Write the exact formula in product terms and code terms
- Define which rounds count, in what order, and what happens when fewer than `N` qualifying Stableford rounds exist
- Define how manual overrides interact with the next automatic recalculation
- Attach 5 to 10 real spreadsheet examples as test fixtures

Acceptance criteria:
- one written handicap spec exists in-repo
- admin/product sign-off confirms the formula is authoritative
- known sample outputs are agreed before code changes

Ticket HCP-02 — Align group settings and engine defaults
- Change the default `handicapRoundsWindow` from `3` to `6`
- Ensure the active handicap calculation reads the group-configured window
- Remove hard-coded “last three” wording from user-facing copy and calculation reasons

Acceptance criteria:
- new groups default to `6`
- changing the group window changes the effective calculation window
- no UI copy still assumes `3`

Ticket HCP-03 — Replace the simplified movement model with the agreed rule
- Update the calculation logic in [lib/season.ts](/Users/paulnasrallah/Documents/Claude/Projects/GolfCaddy/golfcaddy/lib/season.ts:254)
- Ensure the logic uses recent qualifying Stableford rounds only
- Return reason strings that explain the exact inputs used

Acceptance criteria:
- code output matches agreed fixtures from HCP-01
- edge cases are covered for no rounds, insufficient rounds, mixed format rounds, and provisional players

Ticket HCP-04 — Strengthen handicap history records
- Persist enough detail in `handicapHistory` to explain each change
- Store calculation inputs used for each update where practical
- Distinguish initial allocation, automatic movement, and manual admin override clearly

Acceptance criteria:
- each history row can explain why the handicap changed
- audit trail is sufficient to debug a disputed handicap without reading source code

Ticket HCP-05 — Add regression tests
- Unit-test the handicap helpers
- Add fixture-driven cases based on spreadsheet examples
- Test carry-over into a new season and delete/republish round flows if those can affect handicap history

Acceptance criteria:
- tests cover the agreed rule and core edge cases
- a future logic drift would fail CI immediately

Ticket HCP-06 — Build an admin-safe recalculation path
- Add a script or admin action to recalculate handicap-derived state from historical results
- Prefer dry-run output first, then explicit apply
- Scope it per group and season where possible

Acceptance criteria:
- recalculation can be previewed before write
- recalculation is idempotent
- history is not silently duplicated or corrupted

#### Phase 4B — History and profile completion

Goal: expose the data users expect once the handicap logic is trustworthy.

Ticket HIST-01 — Full round history view
- Replace the profile’s “recent results only” pattern with a full history entry point
- Keep recent results on profile, but add “View all”
- Support season filtering

Current anchor:
- profile currently slices recent results in [app/(app)/profile/page.tsx](/Users/paulnasrallah/Documents/Claude/Projects/GolfCaddy/golfcaddy/app/(app)/profile/page.tsx:792)

Acceptance criteria:
- a player can browse all historical rounds for the selected season
- history is paged or otherwise bounded for performance

Ticket HIST-02 — Past scorecard drill-down
- From history, allow opening the actual submitted scorecard
- Show hole-by-hole scores, par, Stableford points, and special-hole markers

Acceptance criteria:
- any completed round in history can be opened as a past scorecard
- historical scorecards are read-only and match published results

Ticket HIST-03 — Handicap trend chart
- Use the existing `handicapHistory` collection to render a proper trend view
- Show per-round movement and current handicap
- Include empty states when there is insufficient history

Current anchor:
- handicap history is already written in [lib/firestore.ts](/Users/paulnasrallah/Documents/Claude/Projects/GolfCaddy/golfcaddy/lib/firestore.ts:1846)
- profile currently fetches only the latest entry via [lib/firestore.ts](/Users/paulnasrallah/Documents/Claude/Projects/GolfCaddy/golfcaddy/lib/firestore.ts:2012)

Acceptance criteria:
- players can see handicap movement over time, not just the latest delta
- chart and list views agree on the same underlying data

Ticket HIST-04 — Season archive as a first-class flow
- Make previous seasons intentionally discoverable
- Ensure profile stats, round history, and ladder context all switch cleanly with season selection

Acceptance criteria:
- prior seasons feel like an explicit archive, not an incidental side effect of a selector
- stats shown for a season are internally consistent

#### Phase 4C — Advanced stats

Goal: add richer insight after correctness and baseline history are complete.

Ticket STAT-01 — Podium and placement history
- track wins, runner-up finishes, top-3/top-5 counts, and finishing distribution

Ticket STAT-02 — Consistency and improvement metrics
- define transparent formulas first
- avoid “mystery scores” with unclear meaning

Ticket STAT-03 — Hole-by-hole trend analysis
- scoring by hole type
- special-hole performance
- repeat-course trends where data is sufficient

Recommendation:
- keep all Phase 4C work out of the next implementation slice unless Phase 4A and 4B are already stable

### Recommended sprint order

If we are choosing what to do next in practical order:

Sprint 1:
- HCP-01 handicap spec lock
- HCP-02 settings/default alignment
- HCP-03 calculation engine rewrite
- HCP-05 regression tests

Sprint 2:
- HCP-04 history enrichment
- HCP-06 recalculation tool
- HIST-03 handicap trend chart

Sprint 3:
- HIST-01 full round history
- HIST-02 scorecard drill-down
- HIST-04 season archive cleanup

Sprint 4+:
- STAT-01 to STAT-03 advanced stats

### Recommended definition of done for Step 4

Step 4 should be considered complete when:

- handicap calculation matches the agreed real-world rule
- the rule is configurable, tested, and explainable
- admins can safely override and, if needed, recalculate
- players can view full round history and past scorecards
- players can view handicap trend over time
- prior seasons are intentionally browsable

Step 4 should **not** be blocked on:
- hole-by-hole analytics
- most improved / consistency metrics
- expanded trophy-style stat surfaces

### Recommendation

If only one part of Step 4 is funded immediately, do Phase 4A first.

If two parts are funded, do:
1. Phase 4A — handicap correctness
2. HIST-03 + HIST-01 — trend chart and full round history

That gets the product to a state where the handicap is trustworthy and users can actually inspect the history behind it, which is the highest-value version of Step 4.

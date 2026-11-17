# Backend sprints

The backend (`apps/api` + `packages/shared`) built first, split into sprints. Each sprint ends with a
working, tested API you can call. The web app comes after.

This document replaces the backend parts of [section 13 of the plan](habit-tracker-implementation-plan.md#13-delivery-phases).
The plan is still the source of truth for behaviour; this is the order of work.

**Ground rules for every sprint**

- Shared domain logic is written **before** the API code that uses it, test-first, with `now` passed in.
- Every endpoint ships with e2e tests, including one that tries another user's record and expects 404.
- Every sprint ends with a Prisma migration, an updated seed script (if it adds data), and green CI.
- Decisions marked **Decide** are settled at the start of that sprint and written back into the plan.

## Overview

| Sprint | Theme | Size | Depends on |
|---|---|---|---|
| [S0](#s0-foundation) | Monorepo, NestJS skeleton, shared package, CI | M | — |
| [S1](#s1-auth-and-users) | Sessions, CSRF, invite-only registration, users | M | S0 |
| [S2](#s2-cores-goals-and-milestones) | The structure: cores, goals, milestones | M | S1 |
| [S3](#s3-habits) | Habits, schedules, manual target changes | L | S2 |
| [S4](#s4-logging-and-today) | Logs, streaks, the `/today` read model | L | S3 |
| [S5](#s5-adaptive-difficulty-and-weekly-reviews) | Weekly reviews, level-ups, deloads, undo | L | S4 |
| [S6](#s6-stats) | Overview and per-habit statistics | M | S5 |
| [S7](#s7-hardening-and-deploy) | Full e2e pass, Docker image, deploy | M | S6 |

S5 holds most of the product's risk. S3 and S4 exist mostly to give it solid foundations.

---

## S0: Foundation

**Goal:** an empty but production-shaped API that runs, tests and builds.

**Decided** (versions checked on 2026-11-14)

- [x] Node **26** (the latest LTS; 24 is in maintenance), pnpm 12.
- [x] Prisma **7.10** (stable; npm's `latest` tag points at an 8.0 release candidate).
- [x] **Vitest everywhere**, with `unplugin-swc` for Nest decorator metadata.
- [x] **tsdown**, building `packages/shared` as **ESM only**: NestJS 12 is ESM-only, so no dual build is needed.
- [x] NestJS **12** and TypeScript **6.0** (typescript-eslint doesn't support TypeScript 7 yet).
- [x] Custom `ZodValidationPipe` (`nestjs-zod` doesn't declare NestJS 12 support).

**Monorepo**

- [x] pnpm workspaces, Turborepo (`generate`, `build`, `dev`, `lint`, `typecheck`, `test`), `.nvmrc`, `engines`
- [x] `packages/config`: tsconfig bases, ESLint flat config, Prettier
- [x] `packages/shared`: skeleton, ESM build, `exports` map; `ERROR_CODES` / `ApiErrorBody` used by the API's exception filter
- [x] Husky + lint-staged

**API skeleton**

- [x] NestJS app with global prefix `/api/v1`, shared by `main.ts` and the e2e tests through `configureApp()`
- [x] Config module with a zod env schema; the app refuses to start on a missing value
- [x] Prisma module and service. No migration yet: Prisma can't create one without models, so the first lands in S1. `migration_lock.toml` is committed so the drift check works.
- [x] `nestjs-pino` (cookies, CSRF header and `Set-Cookie` redacted), `helmet`, `cookie-parser`, `trust proxy` from env, 100 kB JSON limit
- [x] `ZodValidationPipe` with `@ZodBody` / `@ZodQuery`
- [x] Global exception filter returning `{ statusCode, code, message, details? }`, with the shared error-code list
- [x] `GET /api/v1/health` (checks the DB; 503 `SERVICE_UNAVAILABLE` when it's down)
- [x] Swagger at `/docs` in development

**Infrastructure**

- [x] `docker-compose.yml` with Postgres 16, on host port **5434** (5432 and 5433 are taken by other local databases)
- [x] Test database: Testcontainers starts one Postgres per e2e run and applies migrations
- [x] GitHub Actions: install with cache, Prettier check, lint, typecheck, test, build, `prisma migrate diff` drift check

**Done when:** `pnpm dev` starts the API, `/api/v1/health` returns ok, an e2e test hits it, and CI is green.

---

## S1: Auth and users

**Goal:** you can register with the invite code, stay logged in, and manage your account. Spec: [plan 6.4](habit-tracker-implementation-plan.md#64-authentication).

**Data**

- [ ] `User` (username, argon2id hash, timezone, onboardedAt) and `Session` models + migration

**Shared**

- [ ] zod schemas: username (normalised, regex), password (8–128), register, login, update profile, change password, delete account
- [ ] IANA timezone validation

**API**

- [ ] `SessionGuard` (global), `@Public()`, `@CurrentUser()` returning `{ id, username, timezone }`
- [ ] `CsrfGuard` (global): signed, session-bound `XSRF-TOKEN`; reissued on login, register and logout
- [ ] `GET /auth/csrf`, `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/logout-all`
- [ ] Invite code (constant-time compare), `MAX_USERS`, dummy-hash verify for unknown usernames
- [ ] Sliding expiry (at most one write per day), expired-session cleanup on login
- [ ] Throttler on login and register (10/min/IP)
- [ ] `PATCH /me`, `POST /me/password` (drops other sessions), `DELETE /me` (password required), `POST /me/onboarding/complete`
- [ ] CLI scripts: `user:create`, `user:set-password`

**Tests**

- [ ] Register: wrong invite code, registration closed, username taken, case-insensitive usernames
- [ ] Login: identical 401 for unknown user and wrong password; throttling returns 429
- [ ] CSRF: missing header, wrong token, token from before login all rejected with 403
- [ ] Session: expired session returns 401; logout and logout-all revoke; password change keeps only the current session

**Done when:** the full auth flow works through e2e tests and an `.http` file (or Swagger), and sessions survive an API restart.

Optional: deploy this skeleton to `notch.emindabakhov.com` now. That checks early that the `Secure` cookie and the client IP work behind your host's proxy.

---

## S2: Cores, goals and milestones

**Goal:** you can build the full core → goal → milestone structure and complete goals.

**Decide**

- [ ] Goal archiving: replace the `ARCHIVED` status with an `archivedAt` column (like `Core` and `Habit`), so archiving a completed goal keeps its completion. Add `POST /goals/:id/unarchive`. Recommendation: yes.
- [ ] Adding a milestone to a completed goal reopens it. Recommendation: yes.
- [ ] Unarchiving a habit or goal whose core is archived: block it with `409 CORE_ARCHIVED`, or unarchive the core too. Recommendation: block.

**Data**

- [ ] `Core`, `Goal`, `Milestone` models + migration
- [ ] `onDelete: NoAction` (not `Restrict`) for `Goal → Core` and `Habit → Core`, so deleting an account cascades cleanly. Covered by a test.

**Shared**

- [ ] Schemas for core, goal and milestone; `CORE_PRESETS`, `COLOR_PALETTE`; `goalProgress()`

**API**

- [ ] Cores: list with counts, create, `POST /cores/batch`, update, `PUT /cores/order`, archive (cascades to goals and habits), unarchive, delete (`409 CORE_NOT_EMPTY`)
- [ ] Goals: list with progress, detail, create with inline milestones, update (core change rules), complete/reopen (goals without milestones), archive/unarchive, delete (unlinks habits, deletes milestones)
- [ ] Milestones: create (appended), rename, `PUT .../order`, toggle returning `goalJustCompleted`, delete (with goal-status sync)
- [ ] All multi-table writes in `prisma.$transaction`

**Tests**

- [ ] Ticking the last milestone completes the goal; unticking reopens it; deleting the last open milestone completes it
- [ ] Archive cascade; delete guard; account deletion with cores, goals and milestones present
- [ ] Ownership 404s for every route; order arrays capped at 200, milestones at 50

**Done when:** the structure can be built and reorganised entirely through the API, and the goal-completion rules pass their tests.

---

## S3: Habits

**Goal:** you can create every combination of habit type × schedule, with level settings.

**Decide**

- [ ] **Schedule edits.** Changing the schedule currently rewrites history (rates, streaks, heatmaps). Recommendation:
  - `scheduleType` can't be changed, just like `type`. To change it, create a new habit.
  - `daysOfWeek` can be changed. The change is recorded as a `TargetChange` with field `DAYS_OF_WEEK` (stored as a bitmask, Mon = 1 … Sun = 64), effective from the local today. History is then read with `scheduleOn(date)`, the same way `targetOn(date)` reads targets, and the week of the edit isn't counted for levelling.
- [ ] **`effectiveFrom` for manual target edits:** the user's local today. Recommendation: yes.
- [ ] **Past start dates:** allow `startDate` up to 6 days in the past, so a habit created today can be backfilled to when you actually started it. Recommendation: yes.

**Data**

- [ ] `Habit` and `TargetChange` (manual changes only for now) + migration, CHECK constraints from plan 5.2

**Shared**

- [ ] Date helpers: `LocalDate`, `toDateString` / `fromDateString`, `todayIn(tz)`, `weekStartOf`, `weekRange`, `isoWeekday` (with DST tests, `Europe/Berlin` in late October)
- [ ] Lint rule banning `new Date()` / `Date.now()` in the domain folders
- [ ] Habit schemas with cross-field refinements (toggle ⇒ target 1, specific days ⇒ non-empty days, times per week ⇒ 1–7)
- [ ] `isScheduledOn`, `occurrencesInWeek`, `adaptiveApplicable`
- [ ] Step math (`nextLevelUp`, `nextDeload`, clamping, minute rounding), default `minTarget`
- [ ] `targetOn(date, changes)` and `scheduleOn(date, changes)`, ignoring undone changes
- [ ] `projectLevels()` preview

**API**

- [ ] Habits: list with filters, detail (with `adaptiveApplicable`), create (`initial*` fields, start date rules), update (no `type` or `scheduleType` change; target and day changes write `MANUAL` TargetChanges), `PUT /habits/order`, archive/unarchive, delete
- [ ] Goal/core consistency check (`409 GOAL_CORE_MISMATCH`)

**Tests**

- [ ] Every refinement, every schedule helper, step math including rounding and bounds, manual change recording, `targetOn` across several changes including undone ones

**Done when:** every type × schedule combination can be created and edited, and every edit leaves a correct, queryable history.

---

## S4: Logging and Today

**Goal:** you can log every habit type for today and the past 6 days, and `/today` returns correct progress and streaks.

**Decide**

- [ ] **Zero-value logs:** a write that leaves `value = 0` deletes the log (toggle off, counting down to 0). Then "has a log" always means "did something", which the undo and inactive-week rules rely on. Recommendation: yes.
- [ ] **Streak window:** drop the ~120-day window and load each active habit's full log history. At personal scale that's a few thousand rows per year, and streaks are never cut off. Recommendation: yes; add a cap only if profiling shows a need.
- [ ] **Times-per-week habits on Today:** they appear only in the "This week" section, not in the time-of-day groups. `dayProgress` is `null` when no daily or specific-days habit is scheduled. Recommendation: yes.

**Data**

- [ ] `HabitLog` + migration

**Shared**

- [ ] `computeProgress`, `isHit`, `weeklyRate`, `currentStreak`, `longestStreak` (all three schedules, unscheduled-day bonus logs excluded)
- [ ] Response types: `TodayResponse`, `TodayHabit`, log write result

**API**

- [ ] `GET /habits/:id/logs?from=&to=`
- [ ] `PUT /habits/:id/logs/:date` (upsert), `POST .../increment` (raw `INSERT … ON CONFLICT DO UPDATE SET value = GREATEST(value + delta, 0)`), `DELETE`
- [ ] Backfill window check against the server's local today and `startDate` (`BACKFILL_OUT_OF_RANGE`)
- [ ] `targetSnapshot` set on create from `targetOn(date)`
- [ ] `longestStreak` recomputed in the same transaction; response `{ log, habitProgress, currentStreak, longestStreak }`
- [ ] `GET /today?date=`: active habits, their logs and this week's changes in three queries, then computed in memory
- [ ] Seed script: a demo user with several weeks of realistic logs

**Tests**

- [ ] Streak rules for every schedule, including "today not yet hit doesn't break the streak" and unfinished weeks
- [ ] Backfill edges (today − 6, today − 7, future, before `startDate`) across a timezone where the server's UTC date differs
- [ ] Snapshot taken from the old target when backfilling across a target change
- [ ] Concurrent increments don't lose updates

**Done when:** a seeded user's `/today` matches hand-computed expectations for every habit type and schedule.

---

## S5: Adaptive difficulty and weekly reviews

**Goal:** reviews appear on the first visit after Monday 00:00 local time, apply the right decisions, and undo behaves exactly as specified. Spec: [plan 2.7, 2.8, 6.5, 6.6](habit-tracker-implementation-plan.md#27-adaptive-difficulty).

**Decide**

- [ ] **First week for new users:** no review is created (and no "welcome back" shown) for a week in which no habit counted for levelling. Recommendation: yes.

**Data**

- [ ] `WeeklyReview` + migration; link `TargetChange` to reviews

**Shared**

- [ ] `isEligibleWeek`, inactive-week detection, cooldown derivation
- [ ] `decideForHabit()` with `PROGRESSION_CONFIG`
- [ ] Reason codes → sentences (for the web app later)
- [ ] `WeeklyReviewSummary` type

**API**

- [ ] `WeeklyReviewService.runForUser` in one transaction; duplicate-key error caught outside it for idempotency
- [ ] `ensureDue` called from `/today`, `/reviews/latest` and before every log write
- [ ] Undo with all four checks and `details.reason` (`EXPIRED`, `ALREADY_LOGGED`, `ALREADY_UNDONE`, `NOT_AUTOMATIC`); deadline `effectiveFrom + 7 days`
- [ ] `GET /reviews`, `/reviews/latest`, `/reviews/:weekStart`, `POST /reviews/:id/seen`, `GET /habits/:id/target-history`
- [ ] `/today` adds `change`, `pendingReview`, `welcomeBack`
- [ ] Dev-only CLI: `review:run --user <username> --week <date>`
- [ ] Seed: one habit that levelled up twice and one that deloaded

**Tests**

- [ ] All 12 decision cases from [plan section 11](habit-tracker-implementation-plan.md#11-testing-strategy), plus the decisions made in S3 and S4 (day-of-week edits, zero-value logs)
- [ ] Concurrent `ensureDue` calls produce exactly one review
- [ ] Review timing across timezones and a DST week
- [ ] Each undo rejection reason; undo blocked after logging at the new level

**Done when:** with the seed and a fake clock, Monday produces the expected level-ups and deloads, `/today` shows them, and undo works and locks exactly as specified.

---

## S6: Stats

**Goal:** accurate statistics for 7, 30, 90 and 365 days.

**Decide**

- [ ] **Times-per-week habits in ranges that don't line up with weeks:** count partial weeks at the edges in proportion to the days included, or only count full weeks. Recommendation: full weeks only, using a range rounded out to whole weeks.

**Shared**

- [ ] Range helpers, heatmap builder (`{ date, value, target, hit, scheduled }`), target-series builder

**API**

- [ ] `GET /stats/overview?range=`: overall rate, daily series, per-core rates, top 5 current streaks, goals summary, level-ups vs deloads
- [ ] `GET /stats/habits/:id?range=`: rate, streaks, total value, heatmap, target history

**Tests**

- [ ] Every number checked against the seeded fixture; archived habits kept in history; bonus logs shown but not counted

**Done when:** the seeded user's stats match hand-computed values at every range.

---

## S7: Hardening and deploy

**Goal:** the backend is complete, its API contract is frozen for the web app, and it runs at `notch.emindabakhov.com`.

- [ ] Ownership e2e pass over every route; input limits (string lengths, array caps, 100 kB body limit)
- [ ] Review of the OpenAPI output and the shared response types, which the web app will build on
- [ ] `Dockerfile` (multi-stage): API + `serve-static` with an `index.html` fallback, ready for the SPA build
- [ ] Production env, `prisma migrate deploy` on start, `TRUST_PROXY=true`, `COOKIE_SECURE=true`
- [ ] Deploy behind the host's TLS proxy; first user created with `user:create`
- [ ] Daily `pg_dump` backups, verified with a restore

**Done when:** the API runs in production, survives a redeploy without logging you out, and a backup restores.

---

## After the backend

The web app follows in its own sprints. These go in the order of the API: shell and auth, structure, habits, Today, review, stats, then onboarding and settings.

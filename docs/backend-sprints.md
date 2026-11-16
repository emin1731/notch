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

**Decided** (written back into the plan)

- [x] `TRUST_PROXY` is a hop count (`1` in production), not `true`: with `true` the client controls the IP the throttle sees.
- [x] A wrong current password on `POST /me/password` and `DELETE /me` is **403** `INVALID_CREDENTIALS`, so the SPA doesn't read it as a lost session.
- [x] The CSRF token is bound to the SHA-256 of the `SESSION` cookie (or `"anon"`): stateless, no DB lookup.
- [x] Instants are `timestamptz` (`@db.Timestamptz(3)`), not Prisma's default `timestamp`.
- [x] `POST /auth/logout` is public, so an expired session can still clear its cookie.
- [x] The CLI runs from the build (`dist/cli/`); no seed script until there's data worth seeding (S4).

**Data**

- [x] `User` (username, argon2id hash, timezone, onboardedAt) and `Session` models + the first migration

**Shared**

- [x] zod schemas: username (normalised, regex), password (8–128), register, login, update profile, change password, delete account; `UserDto`
- [x] IANA timezone validation

**API**

- [x] `SessionGuard` (global), `@Public()`, `@CurrentUser()` returning `{ id, username, timezone }`, `@CurrentSessionId()`
- [x] `CsrfGuard` (global): signed, session-bound `XSRF-TOKEN`; reissued on login, register, logout and when the session slides
- [x] `GET /auth/csrf`, `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/logout-all`
- [x] Invite code (constant-time compare), `MAX_USERS`, dummy-hash verify for unknown usernames, rehash on login when the argon2 parameters change
- [x] Sliding expiry (at most one write per day), expired-session cleanup on login
- [x] Throttler on login and register (10/min/IP)
- [x] `PATCH /me`, `POST /me/password` (drops other sessions), `DELETE /me` (password required), `POST /me/onboarding/complete`
- [x] CLI scripts: `user:create`, `user:set-password` (in `AuthService`, next to registration)

**Tests**

- [x] Register: wrong invite code, registration closed, username taken, case-insensitive usernames, validation
- [x] Login: identical 401 for unknown user and wrong password; throttling returns 429 per IP; new token on every login
- [x] CSRF: missing header, header ≠ cookie, forged token, token from before login all rejected with 403
- [x] Session: unknown and expired sessions return 401; sliding expiry; logout and logout-all revoke; password change keeps only the current session; survives an app restart
- [x] Account: profile update, onboarding, deletion (cascade, other users untouched), CLI operations

**Done when:** the full auth flow works through e2e tests and by hand with curl (see the README), and sessions survive an API restart.

Optional: deploy this skeleton to `notch.emindabakhov.com` now. That checks early that the `Secure` cookie and the client IP work behind your host's proxy.

---

## S2: Cores, goals and milestones

**Goal:** you can build the full core → goal → milestone structure and complete goals.

**Decided** (written back into the plan)

- [x] Goal archiving is an `archivedAt` column; `GoalStatus` is `ACTIVE | COMPLETED`, so an archived completed goal stays completed. `POST /goals/:id/unarchive` added.
- [x] Adding a milestone to a completed goal reopens it. One rule (`nextGoalStatus`) runs after every milestone change.
- [x] Unarchiving or creating a goal in an archived core is blocked with `409 CORE_ARCHIVED` (habits follow in S3).
- [x] Manual complete/reopen only for goals without milestones (`409 GOAL_HAS_MILESTONES`); 50 milestones per goal (`409 LIMIT_REACHED`).
- [x] Malformed ids are 404, like unknown ones. New codes `CORE_NOT_FOUND`, `GOAL_NOT_FOUND`, `MILESTONE_NOT_FOUND`.
- [x] Milestone create, toggle and delete return the goal and `goalJustCompleted`; milestone writes lock the goal row, so concurrent ticks complete it exactly once.

**Data**

- [x] `Core`, `Goal`, `Milestone` models + migration
- [x] `onDelete: NoAction` (not `Restrict`) for `Goal → Core` (and `Habit → Core` in S3). `NoAction` is checked at the end of the statement, so account deletion cascades no matter which order Postgres runs the cascades in. Covered by a test.

**Shared**

- [x] Schemas for core, goal and milestone; `CORE_PRESETS`, `COLOR_PALETTE`, `LIMITS`; `goalProgress()`, `nextGoalStatus()`; local-date helpers

**API**

- [x] Cores: list with counts, create, `POST /cores/batch`, update, `PUT /cores/order`, archive (cascades to goals), unarchive, delete (`409 CORE_NOT_EMPTY`)
- [x] Goals: list with progress, detail, create with inline milestones, update (core change rules), complete/reopen (goals without milestones), archive/unarchive, delete (deletes milestones)
- [x] Milestones: create (appended), rename, `PUT .../order`, toggle returning `goalJustCompleted`, delete (with goal-status sync)
- [x] All multi-table writes in `prisma.$transaction`

**Tests**

- [x] Ticking the last milestone completes the goal; unticking reopens it; adding one reopens it; deleting the last open milestone completes it; concurrent ticks complete it once
- [x] Archive cascade; delete guard; account deletion with cores, goals and milestones present
- [x] Ownership 404s for every route (`test/ownership.e2e-spec.ts`, extended by later sprints); order arrays capped at 200, milestones at 50

**Done when:** the structure can be built and reorganised entirely through the API, and the goal-completion rules pass their tests.

---

## S3: Habits

**Goal:** you can create every combination of habit type × schedule, with level settings.

**Decided** (written back into the plan)

- [x] **Schedule edits:** `scheduleType` can't change, just like `type` and `startDate`. `daysOfWeek` and `timesPerWeek` can; each edit is a `MANUAL` `TargetChange` (field `DAYS_OF_WEEK` as a bitmask, Mon = 1 … Sun = 64, or `TIMES_PER_WEEK`), read back with `scheduleOn(date)`. A week whose weekdays changed isn't eligible for levelling (S5).
- [x] **`effectiveFrom` for manual edits:** the user's local today. Several edits on one day fold into one change, and editing back to the start value removes it.
- [x] **Past start dates:** up to 6 days back (the backfill window); future dates up to a year ahead.
- [x] A goal moves to another core only with `moveHabits: true` when habits are linked (`409 GOAL_CORE_MISMATCH` otherwise); the habits move with it.
- [x] Services read the time from an injectable `Clock`, so S4/S5 tests can move time.

**Data**

- [x] `Habit` and `TargetChange` (manual changes only for now; the review link comes in S5) + migration, CHECK constraints from plan 5.2

**Carried over from S2**

- [x] Core archive cascades to its active habits; habits count toward `CORE_NOT_EMPTY`; `counts.habits` in the core list
- [x] Goal delete unlinks its habits (`goalId → null`); goal detail lists linked habits
- [x] Moving a goal with linked habits to another core moves the habits too
- [x] Creating or unarchiving a habit in an archived core → `409 CORE_ARCHIVED`; habit routes added to `test/ownership.e2e-spec.ts`

**Shared**

- [x] Date helpers: `toDateString` / `fromDateString`, `todayIn(tz, now)`, `weekStartOf`, `weekRange`, `isoWeekday`, `addDays`, `daysBetween` (DST tests: `Europe/Berlin`, late October)
- [x] Lint rule banning `new Date()` / `Date.now()` in the domain folders
- [x] Habit schemas with cross-field refinements (`habitShapeIssues`, also run by the API on the merged habit of an update)
- [x] `isScheduledOn`, `occurrencesInWeek`, `adaptiveApplicable`, weekday bitmasks
- [x] Step math (`nextLevelUp`, `nextDeload`, clamping, minute rounding half up), default `minTarget`
- [x] `targetOn(date, …)` and `scheduleOn(date, …)`, ignoring undone changes
- [x] `projectLevels()` preview

**API**

- [x] Habits: list with filters, detail (with `adaptiveApplicable` and recent changes), create (`initial*` fields, start date rules), update (no `type`, `scheduleType` or `startDate` change; target, quota and day changes write `MANUAL` TargetChanges), `PUT /habits/order`, archive/unarchive, delete, `GET /habits/:id/target-history`
- [x] Goal/core consistency check (`409 GOAL_CORE_MISMATCH`)

**Tests**

- [x] Every refinement, every schedule helper, step math including rounding and bounds, manual change recording, `targetOn` across several changes including undone ones
- [x] All nine type × schedule combinations created through the API; a history spanning several days read back with `targetOn`

**Done when:** every type × schedule combination can be created and edited, and every edit leaves a correct, queryable history.

---

## S4: Logging and Today

**Goal:** you can log every habit type for today and the past 6 days, and `/today` returns correct progress and streaks.

**Decided** (written back into the plan)

- [x] **Zero-value logs:** a write that leaves `value = 0` deletes the log, so "has a log" always means "did something".
- [x] **Streak window:** none. Each habit's full log history is loaded.
- [x] **Times-per-week habits on Today:** only in `weeklyQuota`. `dayProgress` is `null` when no daily or specific-days habit is due.
- [x] Rates and streaks read each day's schedule from the change history; Today is computed as of the requested date.
- [x] `BACKFILL_OUT_OF_RANGE` is a 400 with `{ earliest, latest }`; logging an archived habit is `409 HABIT_ARCHIVED`; values are capped per type.
- [x] Log writes lock the habit row, so concurrent writes serialise and the stored longest streak is always consistent.
- [x] The seed is a compiled CLI (`pnpm --filter @notch/api seed`), deterministic for a given today; its core (`seedDemo`) is the Today e2e fixture.

**Data**

- [x] `HabitLog` + migration (CHECK `value >= 0`)

**Shared**

- [x] `computeProgress`, `isHit`, `weekStats` (weekly rate), `currentStreak`, `longestStreak` (all three schedules, unscheduled-day bonus logs excluded)
- [x] Rates and streaks read each day's schedule and target from the history (`scheduleOn`, `targetOn`), so weekday and quota edits don't rewrite the past
- [x] Response types: `TodayResponse`, `TodayHabit`, `LogWriteResult`; log schemas and `LOG_LIMITS`

**API**

- [x] `GET /habits/:id/logs?from=&to=`
- [x] `PUT /habits/:id/logs/:date` (upsert), `POST .../increment` (raw `INSERT … ON CONFLICT DO UPDATE SET value = LEAST(GREATEST(value + delta, 0), cap)`), `DELETE`
- [x] Backfill window check against the user's local today and `startDate` (`BACKFILL_OUT_OF_RANGE`)
- [x] `targetSnapshot` set on create from `targetOn(date)`
- [x] `longestStreak` recomputed in the same transaction; response `{ log, habitProgress, currentStreak, longestStreak }`
- [x] `GET /today?date=`: active habits, their logs and their changes in three queries, then computed in memory
- [x] `currentStreak` in `GET /habits/:id`
- [x] Seed script: a demo user with 8 weeks of realistic logs; `createTestApp({ now })` freezes the clock

**Tests**

- [x] Streak rules for every schedule, including "today not yet hit doesn't break the streak", unfinished weeks, mid-week starts and a weekday edit
- [x] Backfill edges (today − 6, today − 7, future, before `startDate`), also in `Pacific/Kiritimati`, where the local date is ahead of UTC
- [x] Snapshot taken from the old target when backfilling across a target change
- [x] Concurrent increments don't lose updates
- [x] Ownership matrix: habit and log routes (32 routes). The habit rows meant for S3 had silently not been added; they are now.

**Done when:** a seeded user's `/today` matches hand-computed expectations for every habit type and schedule.

---

## S5: Adaptive difficulty and weekly reviews

**Goal:** reviews appear on the first visit after Monday 00:00 local time, apply the right decisions, and undo behaves exactly as specified. Spec: [plan 2.7, 2.8, 6.5, 6.6](habit-tracker-implementation-plan.md#27-adaptive-difficulty).

**Decided** (written back into the plan)

- [x] **First week:** no review (and no "welcome back") for a week in which no active habit existed for the whole week.
- [x] **Undo vs a manual edit:** the edit wins; undo is refused with `CHANGED_SINCE`.
- [x] **Welcome back:** shows while the latest review is inactive and unseen.
- [x] "Changed during the week" = a non-undone change of any field effective after the Monday; a Monday change keeps the week eligible. Cooldown = an undone change of that kind effective on W's Monday.
- [x] `ensureDue` also runs before habit edits; `runForUser` locks the user's habit rows and claims the week before deciding.
- [x] The demo seed simulates its history by running the real review every Monday.

**Data**

- [x] `WeeklyReview` + migration; `TargetChange` linked to reviews

**Shared**

- [x] `isEligibleWeek`, inactive-week detection, `isUnderCooldown`
- [x] `decideForHabit()` with `PROGRESSION_CONFIG`
- [x] `undoBlockReason()`; reason codes → sentences (for the web app later); `startOfDayIn` for deadlines
- [x] `WeeklyReviewSummary` and review response types

**API**

- [x] `ReviewsService.runForUser` in one transaction; duplicate-key error caught outside it for idempotency
- [x] `ensureDue` called from `/today`, `/reviews/latest`, before every log write and before habit edits
- [x] Undo with all checks and `details.reason` (`NOT_AUTOMATIC`, `ALREADY_UNDONE`, `EXPIRED`, `ALREADY_LOGGED`, `CHANGED_SINCE`); deadline `effectiveFrom + 7 days`, local midnight
- [x] `GET /reviews`, `/reviews/latest`, `/reviews/:weekStart`, `POST /reviews/:id/seen` (`GET /habits/:id/target-history` came in S3)
- [x] `/today` adds `change`, `pendingReview`, `welcomeBack`
- [x] Dev-only CLI: `review:run <username> --week=<date>`
- [x] Seed: Meditate levels up twice, Deep work levels up twice and deloads back; `pendingMonday` for the Monday test

**Tests**

- [x] All 12 decision cases from [plan section 11](habit-tracker-implementation-plan.md#11-testing-strategy), plus weekday edits, Monday edits, undone changes, the edit-after-the-week guard, and zero-value logs vs undo
- [x] Concurrent `ensureDue` calls produce exactly one review and one change
- [x] Review timing across timezones (Los Angeles) and the Berlin DST week, including the undo deadline
- [x] Each undo rejection reason; undo blocked after logging at the new level, allowed after a log set back to 0
- [x] Mutation checks: disabling the cooldown or the "same value in W − 1" rule fails tests

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

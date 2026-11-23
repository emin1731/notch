# Habit Tracker — MVP Implementation Plan

**Stack:** Vite + React (client) · NestJS (server) · PostgreSQL + Prisma · pnpm + Turborepo monorepo
**Scope:** Core product only. No AI features in this version.
**Audience:** Internal tool for personal use (one user, possibly a few invited ones). Served at `https://notch.emindabakhov.com`.

---

## Table of contents

1. [Product scope](#1-product-scope)
2. [Product rules (source of truth)](#2-product-rules-source-of-truth)
3. [Architecture and tech stack](#3-architecture-and-tech-stack)
4. [Monorepo structure](#4-monorepo-structure)
5. [Data model](#5-data-model)
6. [Backend (NestJS)](#6-backend-nestjs)
7. [Frontend (Vite + React)](#7-frontend-vite--react)
8. [Shared package](#8-shared-package)
9. [Dates, timezones and weeks](#9-dates-timezones-and-weeks)
10. [Security](#10-security)
11. [Testing strategy](#11-testing-strategy)
12. [DevOps and environments](#12-devops-and-environments)
13. [Delivery phases](#13-delivery-phases)
14. [Tone and copy guide](#14-tone-and-copy-guide)
15. [Out of scope and future work](#15-out-of-scope-and-future-work)

---

## 1. Product scope

### 1.1 In scope (MVP)

| Area | Features |
|---|---|
| Accounts | Invite-only registration (username + password), log in, log out, log out everywhere, timezone, profile, change password, delete account |
| Onboarding | Pick cores (presets + custom), add first habits |
| Structure | Cores → Habits; every habit belongs to one core |
| Habits | Three types (toggle, count, duration); three schedules (daily or every N days, specific days, X times per week); time-of-day grouping; archive/delete; reorder |
| Logging | One-click toggle, +/− counter, duration timer or manual minutes; partial progress; backfill up to 7 days |
| Today screen | Habits grouped by time of day, progress per habit, daily completion %, weekly quota for times-per-week habits, streaks, "target changed" badges |
| Adaptive difficulty | Opt-in per habit ("Levels"); weekly evaluation; automatic level-up / deload / hold; undo; change history |
| Weekly review | Summary of the past week and of all applied changes, with undo |
| Stats | Overall and per-core completion, per-habit heatmap, streaks, target-over-time chart |
| Tone | "Firm but friendly" copy throughout |

### 1.2 Explicitly not in this version

AI prioritization, AI accountability chat, conversational logging, automatic audits, mobile apps, notifications/reminders, social features, payments, email (no addresses, no password reset by email, no verification), public sign-up. See [section 15](#15-out-of-scope-and-future-work).

---

## 2. Product rules (source of truth)

This section defines behaviour. Backend logic, frontend UI and tests should all be derived from it.

### 2.1 Hierarchy

```
User
 └── Core (life area: Health, Career, Mind…)
      └── Habit
```

- Every **habit belongs to exactly one core**.
- A **core** has a name, color and icon. Cores can be reordered and archived.

### 2.2 Habit types

| Type | What the user logs | Stored `value` | Stored `targetValue` | Example |
|---|---|---|---|---|
| `TOGGLE` | Done / not done | `0` or `1` | always `1` | Cold shower |
| `COUNT` | A number of units | integer units | integer units | Read 20 pages |
| `DURATION` | Time spent | seconds | seconds | Meditate 10 min |

- `COUNT` habits have a free-text `unit` ("pages", "reps", "glasses").
- `DURATION` is stored in **seconds** but always shown and edited in minutes (and hours when ≥ 60 min).
- Values may exceed the target. Overachievement is shown ("25 / 20 pages") but progress caps at 100%.

### 2.3 Schedules

| Schedule | Meaning | Fields |
|---|---|---|
| `DAILY` | Every day, or every N days | `intervalDays`: 1–30 (1 = every day, the default) |
| `SPECIFIC_DAYS` | Only on chosen weekdays | `daysOfWeek`: ISO numbers, Mon = 1 … Sun = 7 |
| `TIMES_PER_WEEK` | Any N days per week | `timesPerWeek`: 1–7 |

**Time of day** (`MORNING`, `AFTERNOON`, `EVENING`, `ANYTIME`) is used only for grouping on the Today screen. It is the "custom timeline". It has no effect on logic.

A habit has a `startDate`: the local today by default, up to 6 days back (the backfill window, so days already done this week can be logged), or a later date. It is never scheduled before that date, and it can't be changed afterwards.

A `DAILY` habit with an interval of N is due on its start date, then every N days (every 2 days from Monday: Monday, Wednesday, Friday, Sunday, Tuesday…). With N = 1 it's due every day.

**Editing a schedule.** The habit type and the schedule type are fixed: to change either, create a new habit. The interval of a `DAILY` habit, the weekdays of a `SPECIFIC_DAYS` habit and the quota of a `TIMES_PER_WEEK` habit can be edited. Like target edits, each edit is recorded as a `MANUAL` `TargetChange` (field `INTERVAL_DAYS`, `DAYS_OF_WEEK` as a bitmask, Mon = 1 … Sun = 64, or `TIMES_PER_WEEK`) effective from the local today, so history is read with `scheduleOn(date)` / `targetOn(date)` and past weeks keep the schedule they had. A new interval counts from the day it takes effect: that day is due, then every N days after it. Days before it keep the old rhythm. An interval edited before the habit has started counts from its start date. `scheduleOn` returns the interval together with the day it started (`intervalFrom`).

### 2.4 Logging

- One log per habit per local calendar date (`unique(habitId, date)`). A write that leaves the value at `0` deletes the log, so "has a log" always means "did something".
- Values are capped per type: toggle 1, count 100 000, duration 24 h. An archived habit can't be logged (`409 HABIT_ARCHIVED`).
- `TOGGLE`: tapping flips between `0` and `1`.
- `COUNT`: `+` / `−` buttons and direct number entry. Floor is `0`.
- `DURATION`: start/stop timer that adds elapsed time, or manual minutes entry. Both add to the day's value. Manual entry can also overwrite the value.
- Each log stores `targetSnapshot`: the habit's target at the moment the log was first created. A later target change never alters old logs.
- **Hit:** a log is a *hit* when `value >= targetSnapshot`.
- **Progress:** `min(value / targetSnapshot, 1)`.
- **Backfill:** logs can be created or edited for today and the previous 6 days, never for the future and never before `startDate`.
- **Logs on unscheduled days** (e.g. a Mon/Wed/Fri habit logged on Tuesday) are allowed and stored. They count as a "bonus" in stats and do not affect rates or streaks.
- Editing a log in a week that has already been reviewed does **not** change that review retroactively. The UI says so with a small note.

### 2.5 Completion rate (used by adaptive difficulty and stats)

For one habit and one week (Monday–Sunday):

| Schedule | Occurrences | Hits | Weekly rate |
|---|---|---|---|
| `DAILY` | due days in the week (7 when the interval is 1) | hit days among due days | hits / occurrences |
| `SPECIFIC_DAYS` | number of chosen weekdays | hit days among chosen weekdays | hits / occurrences |
| `TIMES_PER_WEEK` | `timesPerWeek` | `min(hit days, timesPerWeek)` | hits / `timesPerWeek` |

A week with no due day (possible when the interval is over 7) has no rate.

For stats over arbitrary ranges, the same logic applies per day (`DAILY`, `SPECIFIC_DAYS`) or per week (`TIMES_PER_WEEK`).

### 2.6 Streaks

- **`DAILY` / `SPECIFIC_DAYS`:** number of consecutive *scheduled* (due) days that were hits, counting back from today. Days between the due days of an every-N-days habit don't break it. If today is scheduled but not yet hit, counting starts from the previous scheduled day, so today doesn't break a streak until it's over.
- **`TIMES_PER_WEEK`:** number of consecutive weeks where hits ≥ `timesPerWeek`. The current week counts only once the quota is met, and an unfinished week doesn't break the streak.
- Each day's schedule is read from the change history (`scheduleOn`), so editing a habit's interval, weekdays or weekly quota doesn't rewrite past streaks.
- **Current streak** is computed on read, from the habit's full log history. **Longest streak** is stored on the habit and recomputed (in the same transaction) whenever a log for that habit changes.

### 2.7 Adaptive difficulty

Adaptive difficulty ("Levels" in the UI) is **opt-in per habit**. A new habit starts with `adaptiveEnabled = false`, and the user switches it on in the habit form. A habit with Levels off is still in the weekly review with its rate, but it always holds (`NOT_ADAPTIVE`). The step and bounds below only apply once Levels is on.

#### What progresses

| Habit | Progressing field | Step |
|---|---|---|
| `COUNT` (any schedule) | `targetValue` | `PERCENT` (default 10%) or `ABSOLUTE` units |
| `DURATION` (any schedule) | `targetValue` | `PERCENT` (default 10%) or `ABSOLUTE` minutes |
| `TOGGLE` + `TIMES_PER_WEEK` | `timesPerWeek` | always +1 / −1 |
| `TOGGLE` + `DAILY` / `SPECIFIC_DAYS` | — | **not adaptive** (the UI hides the setting and explains why) |

The interval of a `DAILY` habit and the weekdays of a `SPECIFIC_DAYS` habit never change automatically; only the user edits them.

#### Step size

- `PERCENT`: `increment = max(minIncrement, round(current × stepValue / 100))`
- `ABSOLUTE`: `increment = stepValue` (in units, or in seconds for duration)
- `minIncrement`: 1 unit for `COUNT`, 60 s for `DURATION`, 1 for frequency.
- `DURATION` targets are always rounded to whole minutes.

#### Bounds

- `minTarget`: defaults to 50% of the initial target, rounded (min 1 unit / 60 s / 1×). User-editable.
- `maxTarget`: optional, user-editable. For frequency, the hard max is 7.
- A level-up at `maxTarget` or a deload at `minTarget` becomes a `HOLD`, with the reason `"at max"` or `"at min"`.

#### Eligible week

A week counts as **eligible** for a habit only if:

1. the habit existed and was not archived for the whole week (`startDate <= weekStart`), and
2. the progressing field had the **same value for the whole week**, and the weekdays or interval didn't change during it, and
3. at least one day was due (a week with no due day has no rate, so the habit holds).

Undone changes are treated as if they never happened. Manual edits do count as changes.

#### Decision rules (evaluated for the week that just ended, W)

```
if W is not eligible                  → HOLD   (reason: "not enough data")
else if rate(W) < 0.50                → DELOAD
else if rate(W) >= 0.85
     and W-1 is eligible
     and rate(W-1) >= 0.85
     and target was the same in W-1 and W   → LEVEL_UP
else                                  → HOLD
```

- **Level-up** sets the target to `current + increment`, clamped to `maxTarget`.
- **Deload:** if the current value came from a non-undone `LEVEL_UP` (the latest non-undone change of the progressing field is a level-up whose `toValue` is the current value), it returns to that change's `fromValue`. Otherwise it sets `current − increment`. Either way, the result is clamped to `minTarget`.
- **Cooldown:** if a change of kind K was undone during the previous review cycle, the habit cannot receive another change of kind K in this review. It gets a `HOLD` instead, with the reason `"cooldown after undo"`. The previous review's changes took effect on the Monday of the week under review, so this is "an undone change of kind K with `effectiveFrom` = W's Monday".
- **"Changed during the week"** means a non-undone change of any field (target, quota, weekdays or interval) with `effectiveFrom` after W's Monday and on or before its Sunday. A change taking effect on the Monday itself (last review's level-up, or an edit made that Monday) leaves the whole week at one value. As a guard, a habit whose value was edited after W ended but before the review ran is also not eligible.
- **Inactive week:** if the user logged **nothing at all** across all habits during W, every habit gets a `HOLD` and the review is flagged `inactive`. This avoids punishing vacations. The app shows a "welcome back" message instead of deloading everything.
- Only the most recent completed week is evaluated. If the user was away for several weeks, the missed weeks are not evaluated one by one.

All thresholds live in one config object in the shared package (`PROGRESSION_CONFIG`) so they can be tuned later.

### 2.8 Weekly review and undo

- A review is created for the week that just ended (Monday–Sunday in the **user's timezone**) the first time the user opens or logs anything in the new week. There is no background job. See [6.6](#66-weekly-review-creation) for the mechanics.
- All decisions are **applied automatically**. Each applied change becomes a `TargetChange` row with `effectiveFrom = Monday of the new week`.
- **Undo** is available while **all** of these are true:
  - the week the change took effect hasn't ended yet (`now < effectiveFrom + 7 days`, local midnight), and
  - the habit has **no log dated on or after `effectiveFrom`** (no log at the new level yet; a log set back to 0 is deleted, so it doesn't count), and
  - the habit hasn't been edited since (its value is still the change's `toValue`). A manual edit wins over undo.
- Undoing restores `fromValue` on the habit and sets `undoneAt` on the change.
- The Today screen shows a badge on every habit whose target changed this week (e.g. "↑ 12 min", "↓ 3× / week"). Tapping it opens a popover with the reason and an Undo button if undo is still allowed.
- A banner on the Today screen links to the review until the user opens it (`seenAt`). After an inactive week, the "welcome back" message shows with it, also until the review is opened.
- No review is created for a week in which no active habit existed for the whole week (such as a new user's first, partial week): there's nothing to judge yet.

### 2.9 Cores, archiving and deletion

| Action | Behaviour |
|---|---|
| Archive core | Confirmation dialog, then archives the core and all its active habits |
| Unarchive core | Restores the core only. Habits are restored individually |
| Unarchive or create a habit in an archived core | Refused with `409 CORE_ARCHIVED`: unarchive the core first |
| Delete core | Only allowed if it has no habits (including archived ones) |
| Archive habit | Hidden from Today, excluded from reviews, kept in stats history |
| Delete habit | Permanently deletes the habit, its logs and its target changes (confirmation required) |

---

## 3. Architecture and tech stack

```
┌──────────────────────────┐   HTTPS / JSON, same origin  ┌──────────────────────────┐
│  apps/web (Vite + React) │  ───────────────────────▶    │  apps/api (NestJS)       │
│  TanStack Query          │  ◀───────────────────────    │  REST controllers        │
│  React Router            │  SESSION cookie (HttpOnly)   │  Services + Prisma       │
│  Zustand (timer only)    │  X-XSRF-TOKEN header         │  serves the built SPA    │
└────────────┬─────────────┘                              └────────────┬─────────────┘
             │  imports                                              │  imports
             ▼                                                       ▼
        ┌──────────────────────── packages/shared ────────────────────────┐
        │ zod schemas · DTO types · enums · progression & streak logic   │
        │ schedule helpers · date/week helpers · PROGRESSION_CONFIG      │
        └─────────────────────────────────────────────────────────────────┘
                                                                     │
                                                              ┌──────▼──────┐
                                                              │ PostgreSQL  │
                                                              └─────────────┘
```

### 3.1 Tooling

| Concern | Choice | Notes |
|---|---|---|
| Package manager | pnpm 12 workspaces | version pinned via `packageManager`; build scripts allow-listed in `pnpm-workspace.yaml` |
| Task runner | Turborepo | cached `build`, `lint`, `typecheck`, `test` |
| Language | TypeScript (strict) everywhere | |
| Lint / format | ESLint (flat config) + Prettier | shared in `packages/config` |
| Commit hooks | Husky + lint-staged | |
| Node | Node 26 LTS, pinned in `.nvmrc` and `engines` | |

### 3.2 Backend

| Concern | Choice |
|---|---|
| Framework | NestJS 12 (ESM-only; relative imports use `.js` extensions) |
| ORM / DB | Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`, connection URL in `prisma.config.ts`) + PostgreSQL 16 |
| Validation | zod 4 schemas from `packages/shared`, applied through a custom `ZodValidationPipe` (`@ZodBody` / `@ZodQuery`); `nestjs-zod` doesn't support NestJS 12 |
| Auth | Server-side sessions in Postgres (custom `Session` table + global guard, see [6.4](#64-authentication)), `cookie-parser`, `argon2` for password hashing |
| Rate limiting | `@nestjs/throttler` (login and register only) |
| Security headers | `helmet` |
| Static hosting | The API serves the built SPA from the same origin (`useStaticAssets` plus an `index.html` fallback, `src/web/serve-spa.ts`) |
| Dates | `luxon` (timezone-aware week and day math) |
| Config | `@nestjs/config` with zod-validated env |
| Logging | `nestjs-pino` |
| API docs | `@nestjs/swagger` at `/docs` (dev only) |
| Tests | Vitest (with `unplugin-swc` for decorator metadata) + Supertest; Testcontainers for Postgres in e2e |

### 3.3 Frontend

| Concern | Choice |
|---|---|
| Build | Vite 8 + React 19 + TypeScript 6 |
| Routing | React Router 8 (data router, `createBrowserRouter`; every page a lazy route chunk) |
| Server state | TanStack Query |
| Client state | Zustand (only for the duration timer and small UI state) |
| HTTP | `fetch` wrapper: same-origin cookies, CSRF header, global 401 handler |
| Forms | react-hook-form + `@hookform/resolvers/zod` (same schemas as the API) |
| UI | Tailwind CSS 4 + shadcn/ui (`radix-nova` style, Radix primitives via `radix-ui`, neutral base, CSS variables). Inter, self-hosted (`@fontsource-variable/inter`). Core accents as `--core-<color>` variables. Light/dark/system theme, applied before first paint by `public/theme.js` (external, so the CSP keeps `script-src 'self'`) |
| Icons | lucide-react |
| Charts | Recharts; heatmap as a custom CSS grid |
| Drag and drop | dnd-kit (reordering cores and habits) |
| Toasts | sonner |
| Dates | luxon (same helpers as the server, from `packages/shared`) |
| Tests | Vitest + React Testing Library + MSW 3; Playwright for e2e |

---

## 4. Monorepo structure

```
notch/
├── apps/
│   ├── api/                      # NestJS
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── config/           # env schema, config module
│   │   │   ├── prisma/           # PrismaModule, PrismaService
│   │   │   ├── common/           # guards, decorators, pipes, filters, interceptors
│   │   │   └── modules/
│   │   │       ├── auth/
│   │   │       ├── users/
│   │   │       ├── cores/
│   │   │       ├── habits/
│   │   │       ├── logs/
│   │   │       ├── today/
│   │   │       ├── progression/  # weekly review, target changes, undo
│   │   │       └── stats/
│   │   ├── scripts/              # CLI: create user, set password
│   │   └── test/                 # e2e tests
│   └── web/                      # Vite + React
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx
│       │   ├── app/              # router, providers, layouts, route guards
│       │   ├── components/ui/    # shadcn components
│       │   ├── components/       # shared app components
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   ├── onboarding/
│       │   │   ├── today/
│       │   │   ├── cores/
│       │   │   ├── habits/
│       │   │   ├── review/
│       │   │   ├── stats/
│       │   │   └── settings/
│       │   ├── lib/              # api client, query keys, formatters
│       │   └── stores/           # zustand stores (timer)
│       └── e2e/                  # Playwright
├── packages/
│   ├── shared/                   # schemas, types, domain logic (see section 8)
│   └── config/                   # eslint, prettier, tsconfig bases
├── Dockerfile                    # one image: API + built SPA
├── docker-compose.yml            # postgres (local dev)
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── .github/workflows/ci.yml
```

Each `features/<name>/` folder in the web app contains `api.ts` (query/mutation hooks), `components/`, and `pages/`.

Each `modules/<name>/` folder in the API contains `<name>.module.ts`, `<name>.controller.ts`, `<name>.service.ts`, and `*.spec.ts`.

---

## 5. Data model

### 5.1 Prisma schema

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "esm"
}

datasource db {
  provider = "postgresql"   // URL comes from prisma.config.ts (Prisma 7)
}

// Every DateTime below without @db.Date is an instant and carries @db.Timestamptz(3) in the real
// schema; the attribute is left out here to keep the listing readable.

enum HabitType        { TOGGLE COUNT DURATION }
enum ScheduleType     { DAILY SPECIFIC_DAYS TIMES_PER_WEEK }
enum TimeOfDay        { MORNING AFTERNOON EVENING ANYTIME }
enum StepType         { PERCENT ABSOLUTE }
enum TargetChangeKind { LEVEL_UP DELOAD MANUAL }
enum TargetField      { TARGET_VALUE TIMES_PER_WEEK DAYS_OF_WEEK INTERVAL_DAYS }   // DAYS_OF_WEEK values are bitmasks; INTERVAL_DAYS is a daily habit's N

model User {
  id             String    @id @default(uuid())
  username       String    @unique             // trimmed + lower-cased, ^[a-z0-9_.-]{3,50}$
  passwordHash   String                        // argon2id encoded string
  name           String?
  timezone       String    @default("UTC")   // IANA, e.g. "Asia/Baku"
  onboardedAt    DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  cores          Core[]
  habits         Habit[]
  logs           HabitLog[]
  reviews        WeeklyReview[]
  sessions       Session[]
}

model Session {
  id         String   @id @default(uuid())
  tokenHash  String   @unique                  // SHA-256 of the cookie value; the raw token is never stored
  userId     String
  expiresAt  DateTime
  lastSeenAt DateTime @default(now())
  userAgent  String?
  createdAt  DateTime @default(now())
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}

model Core {
  id         String    @id @default(uuid())
  userId     String
  name       String
  color      String                       // token from a fixed palette, e.g. "emerald"
  icon       String                       // lucide icon name
  sortOrder  Int       @default(0)
  archivedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  habits     Habit[]

  @@index([userId, archivedAt])
}

model Habit {
  id                  String       @id @default(uuid())
  userId              String
  coreId              String
  name                String
  type                HabitType
  unit                String?                  // COUNT only
  targetValue         Int                      // TOGGLE = 1, COUNT = units, DURATION = seconds
  initialTargetValue  Int
  scheduleType        ScheduleType
  daysOfWeek          Int[]                    // SPECIFIC_DAYS only, ISO 1..7
  timesPerWeek        Int?                     // TIMES_PER_WEEK only
  initialTimesPerWeek Int?
  intervalDays        Int?                     // DAILY only: every N days, 1..30 (1 = every day)
  timeOfDay           TimeOfDay    @default(ANYTIME)

  adaptiveEnabled     Boolean      @default(false)
  stepType            StepType     @default(PERCENT)
  stepValue           Int          @default(10) // percent, or units/seconds when ABSOLUTE
  minTarget           Int?                     // applies to the progressing field
  maxTarget           Int?

  longestStreak       Int          @default(0)
  startDate           DateTime     @db.Date    // user-local date
  sortOrder           Int          @default(0)
  archivedAt          DateTime?
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt

  user                User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  core                Core         @relation(fields: [coreId], references: [id], onDelete: NoAction)
  logs                HabitLog[]
  targetChanges       TargetChange[]

  @@index([userId, archivedAt])
  @@index([coreId])
}

model HabitLog {
  id             String   @id @default(uuid())
  habitId        String
  userId         String
  date           DateTime @db.Date            // user-local calendar date
  value          Int                          // TOGGLE 0/1, COUNT units, DURATION seconds
  targetSnapshot Int
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  habit          Habit    @relation(fields: [habitId], references: [id], onDelete: Cascade)
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([habitId, date])
  @@index([userId, date])
}

model WeeklyReview {
  id        String         @id @default(uuid())
  userId    String
  weekStart DateTime       @db.Date           // Monday of the evaluated week
  inactive  Boolean        @default(false)
  summary   Json                              // per-habit rates and decisions, see 5.3
  seenAt    DateTime?
  createdAt DateTime       @default(now())

  user      User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  changes   TargetChange[]

  @@unique([userId, weekStart])
}

model TargetChange {
  id             String           @id @default(uuid())
  habitId        String
  weeklyReviewId String?                       // null for MANUAL changes
  kind           TargetChangeKind
  field          TargetField
  fromValue      Int
  toValue        Int
  effectiveFrom  DateTime         @db.Date
  reason         Json?                         // { rule, rates: { current, previous } }
  undoDeadline   DateTime?
  undoneAt       DateTime?
  createdAt      DateTime         @default(now())

  habit          Habit            @relation(fields: [habitId], references: [id], onDelete: Cascade)
  review         WeeklyReview?    @relation(fields: [weeklyReviewId], references: [id], onDelete: SetNull)

  @@index([habitId, effectiveFrom])
}
```

### 5.2 Database-level rules not expressible in Prisma

Add these in a raw SQL migration:

```sql
ALTER TABLE "Habit" ADD CONSTRAINT habit_target_positive CHECK ("targetValue" >= 1);
ALTER TABLE "Habit" ADD CONSTRAINT habit_tpw_range
  CHECK ("timesPerWeek" IS NULL OR "timesPerWeek" BETWEEN 1 AND 7);
ALTER TABLE "Habit" ADD CONSTRAINT habit_interval_range
  CHECK ("intervalDays" IS NULL OR "intervalDays" BETWEEN 1 AND 30);
ALTER TABLE "HabitLog" ADD CONSTRAINT log_value_nonneg CHECK ("value" >= 0);
```

Cross-field rules are enforced by the zod schemas and the service layer:

- `TOGGLE` ⇒ `targetValue = 1`
- `SPECIFIC_DAYS` ⇒ `daysOfWeek` is non-empty
- `TIMES_PER_WEEK` ⇒ `timesPerWeek` is set
- `DAILY` ⇒ `intervalDays` is set (1–30); other schedules ⇒ `intervalDays` is null

### 5.3 `WeeklyReview.summary` shape

```ts
type WeeklyReviewSummary = {
  weekStart: string;              // "2026-11-09"
  overallRate: number | null;     // average of eligible habits
  habits: Array<{
    habitId: string;
    name: string;
    coreId: string;
    rate: number | null;          // null if not eligible
    previousRate: number | null;
    decision: 'LEVEL_UP' | 'DELOAD' | 'HOLD';
    reason: 'NOT_ELIGIBLE' | 'NOT_ADAPTIVE' | 'INACTIVE_WEEK' | 'COOLDOWN'
          | 'AT_MAX' | 'AT_MIN' | 'CONSISTENT' | 'STRUGGLING' | 'STEADY';
    targetChangeId?: string;
  }>;
};
```

The summary is a snapshot: it keeps habit names as they were, so renames don't rewrite history.

### 5.4 Date column convention

Instants are `DateTime @db.Timestamptz(3)`. `@db.Date` columns hold a **user-local calendar date**, not an instant. The API always sends and receives them as `"YYYY-MM-DD"` strings. Prisma returns them as `Date` objects at UTC midnight, so conversion happens in exactly one place, the shared helpers `toDateString()` and `fromDateString()`. Never call `new Date()` on these values in business logic.

---

## 6. Backend (NestJS)

### 6.1 Cross-cutting setup

- **Global prefix:** `/api/v1`.
- **Global guards:** `SessionGuard` (authentication) and `CsrfGuard` (unsafe methods), see [6.4](#64-authentication). Public routes are marked with `@Public()`.
- **`@CurrentUser()` decorator:** returns `{ id, username, timezone }`, loaded by `SessionGuard` together with the session in one query, so the timezone is always current.
- **Ownership:** every service method takes `userId` and scopes every query with `where: { userId }` (or via the parent's `userId`). A record owned by another user returns **404**, never 403, so ids can't be probed. A malformed id is a 404 too.
- **Validation:** `ZodValidationPipe` with schemas imported from `@notch/shared`.
- **Errors:** a global exception filter returns `{ statusCode, code, message, details? }`. `code` is a stable string the client can switch on, for example `CORE_NOT_FOUND`, `HABIT_NOT_FOUND`, `CORE_ARCHIVED`, `UNDO_NOT_ALLOWED`, `BACKFILL_OUT_OF_RANGE`, `CORE_NOT_EMPTY`, `USERNAME_TAKEN`, `INVALID_CREDENTIALS`, `INVALID_INVITE_CODE`, `REGISTRATION_CLOSED`, `UNAUTHENTICATED`, `CSRF_INVALID`.
- **Transactions:** any operation touching more than one table uses `prisma.$transaction`. This includes: core archive plus its habits, log write plus longest-streak update, review creation plus target changes, and undo.
- **Config:** env validated at boot by a zod schema. The app refuses to start if a value is missing.

### 6.2 Modules and responsibilities

| Module | Responsibility |
|---|---|
| `auth` | CSRF token, invite-only register, login, logout, log out everywhere, `SessionGuard`, `CsrfGuard`, expired-session cleanup |
| `users` | profile, timezone, password change, account deletion, onboarding flag |
| `cores` | CRUD, reorder, archive/unarchive with cascade |
| `habits` | CRUD, reorder, archive, manual target edits (writes `MANUAL` TargetChange) |
| `logs` | upsert, increment, delete, backfill rules, longest-streak recompute |
| `today` | aggregated read model for the Today screen |
| `progression` | `ProgressionService` (pure decisions via shared logic), `WeeklyReviewService` (persisting reviews, `ensureDue`), undo |
| `stats` | overview and per-habit statistics |

### 6.3 REST API

All routes are under `/api/v1` and require auth unless marked public.

#### Auth

| Method | Path | Body / query | Notes |
|---|---|---|---|
| GET | `/auth/csrf` | — | public; sets the `XSRF-TOKEN` cookie, returns 204 |
| POST | `/auth/register` | `{ username, password, inviteCode, name?, timezone }` | public; throttled; creates the user and starts a session, returns 201 + the user. `403 INVALID_INVITE_CODE`, `403 REGISTRATION_CLOSED`, `409 USERNAME_TAKEN` |
| POST | `/auth/login` | `{ username, password }` | public; throttled; starts a session, returns 200 + the user. `401 INVALID_CREDENTIALS` for a wrong username or password alike |
| GET | `/auth/me` | — | the current user (`id`, `username`, `name`, `timezone`, `onboardedAt`), or 401 |
| POST | `/auth/logout` | — | public, so an expired session can still clear its cookie; deletes the current session, clears the cookie, issues an anonymous CSRF token, returns 204 |
| POST | `/auth/logout-all` | — | deletes every session of the user, including the current one, clears the cookie, returns 204 |

#### Users

| Method | Path | Body | Notes |
|---|---|---|---|
| PATCH | `/me` | `{ name?, timezone? }` | at least one field; `name: null` clears it. A new timezone applies from the next request. Returns the user |
| POST | `/me/password` | `{ currentPassword, newPassword }` | deletes the user's other sessions, returns 204 |
| POST | `/me/onboarding/complete` | — | sets `onboardedAt` (once), returns the user |
| DELETE | `/me` | `{ password }` | hard delete via cascade, clears the cookie, returns 204 |

A wrong `currentPassword` or `password` returns **403** `INVALID_CREDENTIALS`, not 401: the session is still valid, and a 401 would make the SPA treat the user as logged out.

#### Cores

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/cores?includeArchived=` | — | ordered by `sortOrder`, with `counts` of non-archived habits |
| POST | `/cores` | `{ name, color, icon }` | |
| POST | `/cores/batch` | `{ cores: [...] }` | 1–20, appended in order, all or nothing; used by onboarding |
| PATCH | `/cores/:id` | `{ name?, color?, icon? }` | |
| PUT | `/cores/order` | `{ ids: string[] }` | the listed cores first, the rest after them in their current order; unknown id → 404; returns the list |
| POST | `/cores/:id/archive` | — | cascades to its active habits (same `archivedAt`) |
| POST | `/cores/:id/unarchive` | — | |
| DELETE | `/cores/:id` | — | `409 CORE_NOT_EMPTY` if it has habits, archived ones included |

#### Habits

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/habits?coreId=&includeArchived=` | — | |
| GET | `/habits/:id` | — | habit with current streak, recent target changes, and `adaptiveApplicable` |
| POST | `/habits` | `CreateHabitDto` | sets `initial*` fields and a default `minTarget` (half the initial value); `startDate = today (local)` unless given. `409 CORE_ARCHIVED` |
| PATCH | `/habits/:id` | `UpdateHabitDto` | changing `targetValue`, `timesPerWeek`, `daysOfWeek` or `intervalDays` writes a `MANUAL` TargetChange effective from the local today (several edits on one day fold into one change). `type`, `scheduleType` and `startDate` can't change (400). The merged habit is re-validated |
| GET | `/habits/:id/target-history` | — | every change, oldest first |
| PUT | `/habits/order` | `{ ids: string[] }` | |
| POST | `/habits/:id/archive` / `/unarchive` | — | |
| DELETE | `/habits/:id` | — | |

`CreateHabitDto`:

```ts
{
  coreId: string;
  name: string;                       // 1–80 chars
  type: 'TOGGLE' | 'COUNT' | 'DURATION';
  unit?: string;                      // COUNT only
  targetValue: number;                // COUNT units | DURATION seconds | ignored for TOGGLE
  scheduleType: 'DAILY' | 'SPECIFIC_DAYS' | 'TIMES_PER_WEEK';
  daysOfWeek?: number[];
  timesPerWeek?: number;
  intervalDays?: number;              // DAILY only, 1–30; defaults to 1
  timeOfDay?: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'ANYTIME';
  adaptiveEnabled?: boolean;          // defaults to false (Levels off)
  stepType?: 'PERCENT' | 'ABSOLUTE';
  stepValue?: number;
  minTarget?: number | null;
  maxTarget?: number | null;
  startDate?: string;                 // "YYYY-MM-DD", at most 6 days back
}
```

#### Logs

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/habits/:id/logs?from=&to=` | — | |
| PUT | `/habits/:id/logs/:date` | `{ value }` | upsert (toggle, manual entry); `0` deletes the log |
| POST | `/habits/:id/logs/:date/increment` | `{ delta }` | counter buttons, timer stop; atomic `value = LEAST(GREATEST(value + delta, 0), cap)`; reaching `0` deletes the log |
| DELETE | `/habits/:id/logs/:date` | — | idempotent |

`GET` takes an optional `from`/`to` (at most 366 days; the default is the 30 days up to the local today). Every write returns 200 with the result below. A date outside the window is `400 BACKFILL_OUT_OF_RANGE` with `details: { earliest, latest }`.

Every log write runs these steps in order:

1. Lock the habit row (`SELECT … FOR UPDATE`), so writes to one habit run one at a time. Validate that the date is within `[today − 6, today]` in the user's timezone and on or after `startDate`. Otherwise return `BACKFILL_OUT_OF_RANGE`.
2. Call `WeeklyReviewService.ensureDue(userId)`, so that a new week's review always runs **before** the first log of that week. This keeps `targetSnapshot` correct.
3. Upsert the log. `targetSnapshot` is set only on create, from the habit's target **effective on that date**, which may be an older target when backfilling across a change.
4. Recompute `longestStreak` for the habit in the same transaction.
5. Return `{ log | null, habitProgress, currentStreak, longestStreak }` so the client can reconcile its optimistic update. Streaks are as of the local today.

#### Today

| Method | Path | Notes |
|---|---|---|
| GET | `/today?date=YYYY-MM-DD` | `date` defaults to the local today; allowed range is today − 6 … today |

Response:

```ts
{
  date: string;
  dayProgress: number | null;        // avg progress of DAILY/SPECIFIC_DAYS habits due on `date`; null if none
  pendingReview: { id: string; weekStart: string } | null;   // unseen review banner
  welcomeBack: boolean;              // last review was inactive
  groups: Array<{                    // DAILY/SPECIFIC_DAYS habits due on `date`; empty groups left out
    timeOfDay: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'ANYTIME';
    habits: TodayHabit[];
  }>;
  weeklyQuota: TodayHabit[];         // TIMES_PER_WEEK habits (only here, never in groups)
}

type TodayHabit = {
  id: string; name: string; type: HabitType; unit: string | null;
  scheduleType: ScheduleType; timeOfDay: TimeOfDay;
  core: { id: string; name: string; color: string; icon: string };
  target: number;                    // effective on `date`
  log: { value: number; targetSnapshot: number } | null;
  progress: number;                  // 0..1
  currentStreak: number;
  week?: { hits: number; quota: number };            // TIMES_PER_WEEK only
  change?: {                                         // target changed this week
    id: string; kind: 'LEVEL_UP' | 'DELOAD';
    field: 'TARGET_VALUE' | 'TIMES_PER_WEEK';
    fromValue: number; toValue: number; canUndo: boolean;
    undoBlockedReason: UndoBlockReason | null;       // why not, when canUndo is false
  };
};
```

Everything is computed **as of `date`** (streaks and the week's hits), so browsing back shows each day as it was. The service loads the active habits that had started by `date` (with their core), their full log history up to `date`, and all their target changes, in **three queries**. It then computes everything in memory with the shared functions. There are no per-habit queries. At personal scale a full history is a few thousand rows per year; add a window only if profiling shows a need.

#### Reviews and target changes

| Method | Path | Notes |
|---|---|---|
| GET | `/reviews?limit=&cursor=` | newest first; `limit` 1–52 (default 10), `cursor` = the `nextCursor` of the previous page. Returns `{ items, nextCursor }` |
| GET | `/reviews/latest` | runs `ensureDue` first; returns `{ review }`: the latest review with its changes and their `canUndo` and `undoBlockedReason`, or `null` before the first one |
| GET | `/reviews/:weekStart` | `404 REVIEW_NOT_FOUND` |
| POST | `/reviews/:id/seen` | sets `seenAt` (once); returns the review |
| POST | `/target-changes/:id/undo` | returns `{ change, habit }`. `409 UNDO_NOT_ALLOWED` with `details.reason`: `NOT_AUTOMATIC`, `ALREADY_UNDONE`, `EXPIRED`, `ALREADY_LOGGED` or `CHANGED_SINCE`; `404 TARGET_CHANGE_NOT_FOUND` |
| GET | `/habits/:id/target-history` | all changes, for the chart |

#### Stats

| Method | Path | Notes |
|---|---|---|
| GET | `/stats/overview?range=7d\|30d\|90d\|365d` | see below; `range` defaults to `30d` |
| GET | `/stats/habits/:id?range=` | see below; archived habits included |

**Rules** (the same as streaks and reviews):

- A range `Nd` is the N days ending today in the user's timezone, today included. A habit counts from its `startDate`, up to its archive date if archived: archived habits keep their history, deleted ones are gone.
- **Daily / specific days:** hits on due days ÷ due days, each day judged by the schedule it had then. A habit's last day (today, or its archive date) counts only once it's a hit.
- **Times per week:** every week the range touches counts as a whole week (the range is rounded out to Monday–Sunday), each `min(hit days, quota) ÷ quota`. The current week counts only once its quota is met.
- Bonus logs (on days the habit wasn't due) are shown but never counted.
- **Overall and per-core rates** are the average of the habits' rates (each habit counts equally, like the review's `overallRate`); habits with nothing due in the range are skipped.

Overview response: `{ range, from, to, overallRate, daily: [{ date, rate }], cores: [{ coreId, name, color, icon, rate }], topStreaks: [{ habitId, name, currentStreak }], changes: { levelUps, deloads } }`.

- `daily` covers daily and specific-day habits only (times-per-week habits have no daily obligation); `rate` is `null` on days with nothing due.
- `cores` lists every core with a habit in the range, archived cores included, in core order.
- `topStreaks` are the 5 best current streaks above 0 among active habits.
- `changes` counts level-ups and deloads that took effect in the range and weren't undone.

Per-habit response: `{ habitId, range, from, to, rate, hits, occurrences, currentStreak, longestStreak, totalValue, heatmap, field, targetSeries }`. `from`/`to` are the habit's window inside the range. `totalValue` sums everything logged (total minutes or pages), bonus logs included. `heatmap` is `[{ date, value, target, hit, scheduled }]` for every day of the window. `targetSeries` is step points `[{ date, target }]` for the progressing `field` (`TARGET_VALUE`, or `TIMES_PER_WEEK` for a weekly toggle): the value at the window start, then each change inside the window.

For the MVP, stats are computed on request from the full history, in three queries (habits, logs, target changes). With an index on `(userId, date)`, a year of data for ~20 habits is about 7k rows, which is fast. Add caching only if profiling shows a need. Stats are read-only: they don't trigger a weekly review.

### 6.4 Authentication

Server-side sessions in an `HttpOnly` cookie (no JWTs), the SPA and API on one origin, a CSRF token on every request that changes data, and invite-only registration. Modelled on the setup described in [auth.md](auth.md), ported from Spring Security to NestJS.

```
Browser (SPA)                         NestJS (same origin)                    Postgres
  │ GET  /api/v1/auth/csrf  ─────────▶ sets XSRF-TOKEN cookie
  │ POST /api/v1/auth/login            throttled, argon2 verify
  │   X-XSRF-TOKEN: <cookie value> ──▶ new random token ────────────────────▶ Session (tokenHash)
  │ ◀── Set-Cookie: SESSION=…; HttpOnly; Secure; SameSite=Lax
  │ GET  /api/v1/today (cookie sent automatically) ─▶ SessionGuard ─────────▶ Session ⋈ User → WHERE userId = ?
```

**Users and passwords**

- Usernames are trimmed and lower-cased before validation, storage and login, so they're case-insensitive. Allowed: `^[a-z0-9_.-]{3,50}$`. There is no email address.
- Passwords are 8–128 characters, hashed with argon2id. The encoded hash carries its own parameters, so `argon2.needsRehash()` on login allows upgrading them later.
- A wrong username and a wrong password give the same `401 INVALID_CREDENTIALS` ("Invalid username or password"). When the username doesn't exist, the server still verifies against a dummy hash so response timing doesn't reveal which usernames exist.

**Sessions**

- On login and register the server creates a random 256-bit token, stores its SHA-256 in `Session`, and sets the cookie `SESSION=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=30 days`. `Secure` is switched off with `COOKIE_SECURE=false` in local dev.
- A fresh token is issued on every login, so a session id planted before login is never reused (session fixation).
- Sessions last 30 days. `SessionGuard` extends `expiresAt` (and refreshes the cookie's `Max-Age`) at most once a day, so an app in regular use stays logged in.
- Sessions survive restarts and redeploys because they live in Postgres.
- Expired rows are deleted lazily: on login, the user's expired sessions are removed.
- **Log out** deletes the session row. **Log out everywhere** and **password change** delete the user's other rows. **Account deletion** cascades.

**`SessionGuard`** (global; skipped for `@Public()` routes)

1. Read the `SESSION` cookie (`cookie-parser`), hash it, and load the session joined with its user in one query.
2. If the session is missing or expired, return `401 UNAUTHENTICATED`.
3. Attach `{ id, username, timezone }` to the request for `@CurrentUser()`.

**CSRF**

- `GET /auth/csrf` sets an `XSRF-TOKEN` cookie that JavaScript can read (`Secure; SameSite=Lax; Path=/`, not `HttpOnly`).
- The token is `nonce.HMAC(CSRF_SECRET, nonce + binding)`, where the binding is the SHA-256 of the `SESSION` cookie, or `"anon"` without one. It's bound to the current session and can't be planted from elsewhere, and checking it needs no database lookup. A token issued before login stops working after it.
- `CsrfGuard` (global) requires the `X-XSRF-TOKEN` header to equal the cookie and the signature to verify, on every POST, PUT, PATCH and DELETE, **including** login, register and logout. A failure returns `403 CSRF_INVALID` ("Invalid or missing CSRF token").
- The token is reissued on login, register, logout and whenever the session's expiry slides (a new `Set-Cookie` in the same response), so the client reads the cookie fresh before every request instead of caching it.

**Registration rules**

- The invite code comes from `INVITE_CODE` and is compared in constant time (`crypto.timingSafeEqual` on SHA-256 digests). A mismatch gives `403 INVALID_INVITE_CODE`.
- Registration closes once the user count reaches `MAX_USERS`, with `403 REGISTRATION_CLOSED`.
- A taken username gives `409 USERNAME_TAKEN` on the `username` field.
- Register starts a session straight away, just like login.

**Brute-force protection:** `@nestjs/throttler` on `POST /auth/login` and `POST /auth/register` only: 10 requests per minute per IP, then 429. `/auth/me` and `/auth/csrf` run on every page load and are not throttled. Express's `trust proxy` is set to the **number of proxies** in front of the app (`TRUST_PROXY=1`), so the client IP is the address the host's reverse proxy appended to `X-Forwarded-For`. With `true`, Express would take the left-most entry, which the client controls, and the throttle could be bypassed.

**Account recovery without email:** CLI scripts run on the server (or locally against the production database):

- `pnpm --filter @notch/api user:set-password <username>` prompts for a new password and deletes that user's sessions.
- `pnpm --filter @notch/api user:create <username> [--timezone=Asia/Baku] [--name=…]` creates a user without an invite code or the `MAX_USERS` check, which is useful for the first account.
- Both run from the build (`dist/cli/`), so run `pnpm --filter @notch/api build` first locally. The password is asked twice without echo, or read from the first line of stdin when piped.

**Authorization** is unchanged: there are no roles, every query is scoped by `userId`, and another user's record returns 404.

### 6.5 Progression implementation

The decision logic is **pure** and lives in `packages/shared/src/progression/`, so it can be unit-tested exhaustively and reused for client previews. The API's `ProgressionService` only loads data and persists results.

```ts
// packages/shared/src/progression/decide.ts
export function decideForHabit(input: {
  habit: HabitForProgression;          // type, schedule, current target, step, bounds, adaptiveEnabled
  week: WeekWindow;                    // W
  prevWeek: WeekWindow;                // W-1
  logsW: LogLite[];
  logsPrev: LogLite[];
  changes: TargetChangeLite[];         // non-undone + undone, for eligibility & cooldown
  inactiveWeek: boolean;
  config: ProgressionConfig;
}): Decision;                          // { decision, reason, rate, previousRate, toValue? }
```

Steps inside `decideForHabit`:

1. If adaptive is not applicable (a toggle habit not on `TIMES_PER_WEEK`) or `adaptiveEnabled = false`, return `HOLD / NOT_ADAPTIVE`. The rate is still computed for the summary.
2. If `inactiveWeek`, return `HOLD / INACTIVE_WEEK`.
3. If W is not eligible, return `HOLD / NOT_ELIGIBLE`.
4. Compute `rate(W)`. If it is below `deloadBelow`:
   1. If the habit is under cooldown for `DELOAD`, return `HOLD / COOLDOWN`.
   2. Compute the deload value. If it can't go lower, return `HOLD / AT_MIN`. Otherwise return `DELOAD / STRUGGLING`.
5. If `rate(W) >= levelUpAtOrAbove`, W-1 is eligible at the same target, and `rate(W-1) >= levelUpAtOrAbove`:
   1. If the habit is under cooldown for `LEVEL_UP`, return `HOLD / COOLDOWN`.
   2. Compute the level-up value. If it is at max, return `HOLD / AT_MAX`. Otherwise return `LEVEL_UP / CONSISTENT`.
6. Otherwise return `HOLD / STEADY`.

```ts
export const PROGRESSION_CONFIG = {
  levelUpAtOrAbove: 0.85,
  consecutiveWeeksForLevelUp: 2,
  deloadBelow: 0.5,
  defaultStepPercent: 10,
  minIncrement: { COUNT: 1, DURATION: 60, FREQUENCY: 1 },
  defaultMinTargetRatio: 0.5,
  undoWindowDays: 7,
  backfillDays: 6,
} as const;
```

`WeeklyReviewService.runForUser(userId, weekStart)` does the following inside one transaction:

1. Insert the `WeeklyReview` row. The unique `(userId, weekStart)` makes this idempotent: on a unique violation, return the existing review.
2. Load the active habits that existed during W, the logs for W and W-1, and the target changes.
3. Determine `inactiveWeek` (zero logs across all habits in W).
4. Run `decideForHabit` for each habit.
5. For each `LEVEL_UP` or `DELOAD`, update the habit field and insert a `TargetChange` with `effectiveFrom = weekStart + 7`, `undoDeadline = effectiveFrom + 7 days` (local midnight in the user's timezone, i.e. the end of the week the change applies to), and the reason JSON. The deadline doesn't depend on when the review happened to run, so it never overlaps the next review.
6. Write the `summary`.

**Undo** (`POST /target-changes/:id/undo`), also in one transaction:

1. Lock the habit row. Check that `kind ∈ {LEVEL_UP, DELOAD}` (`NOT_AUTOMATIC`) and that `undoneAt` is null (`ALREADY_UNDONE`).
2. Check that `now < undoDeadline` (`EXPIRED`).
3. Check that no `HabitLog` exists for the habit with `date >= effectiveFrom` (`ALREADY_LOGGED`).
4. Check that the habit's current value equals `toValue`, so there was no manual edit since (`CHANGED_SINCE`).
5. Set the habit field back to `fromValue` and set `undoneAt = now`.

Steps 1–4 are one pure shared function, `undoBlockReason()`, which also computes `canUndo` and `undoBlockedReason` for Today and the reviews.

The cooldown is derived at decision time from `changes` (an undone change whose review was the previous one). No extra column is needed.

### 6.6 Weekly review creation

Reviews are created **lazily**. There is no background job.

- `ensureDue(userId)` checks whether a review exists for the last completed week in the user's timezone, and runs `runForUser` if not.
- It is called from `GET /today`, `GET /reviews/latest`, before any log write and before a habit edit (`PATCH /habits/:id`), always before the caller's own transaction. The user can't see a review, log at a new target or change last week's values without passing through one of these, so the result is the same as running it at Monday 00:00. This also covers downtime, timezone changes and deployments.
- `runForUser` locks the user's habit rows (`SELECT … FOR UPDATE`, serialising with log writes and edits), inserts the review row first to claim the week, then decides, applies and writes the summary.
- The check is a single indexed lookup on `(userId, weekStart)`.
- Concurrent calls (two tabs, or a page load plus a log write) are made safe by the unique `(userId, weekStart)` constraint. The losing call catches the unique-violation error **outside** its aborted transaction and reads the review that won.

A review is **not** created for a week in which no active habit existed for the whole week (`startDate <= weekStart`): a new user's first week, or a user without habits. Archived habits are never reviewed. After several weeks away, only the most recent week is reviewed.

A scheduled job is only needed once something has to happen without the user opening the app, such as notifications. See [section 15](#15-out-of-scope-and-future-work).

---

## 7. Frontend (Vite + React)

### 7.1 Routes

| Path | Page | Guard |
|---|---|---|
| `/login` | Log in | guest only |
| `/register` | Register with username, password and invite code (detects timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`) | guest only |
| `/onboarding` | Multi-step onboarding | auth, not onboarded |
| `/` → `/today` | Today | auth + onboarded |
| `/today?date=` | Today for a past date (backfill) | auth + onboarded |
| `/cores` | Cores and their habits | auth + onboarded |
| `/habits/:habitId` | Habit detail and stats | auth + onboarded |
| `/habits/:habitId/edit` | Edit habit (the only habit form page; new habits are created in a dialog) | auth + onboarded |
| `/review` | Latest weekly review | auth + onboarded |
| `/review/:weekStart` | Past review | auth + onboarded |
| `/stats` | Stats overview | auth + onboarded |
| `/settings` | Profile, timezone, password, archived items, delete account | auth + onboarded |

**Layout:**

- **Desktop:** a left sidebar with Today, Cores, Stats, Review and Settings, plus a main content area.
- **Narrow screens:** a bottom tab bar. It's a web app, but people will open it on phones.
- **`RequireAuth`:** while auth is `loading` it renders nothing, so the login screen doesn't flash. When `anonymous` it redirects to `/login` with `state.from`, and after logging in the user returns to the page they asked for. The guest-only guard on `/login` and `/register` does that redirect as soon as `['me']` holds a user, and the link between the two pages carries `state.from` along.
- **`RequireOnboarded`:** redirects to `/onboarding` while `onboardedAt` is null.
- **`/habits/new`** doesn't exist as a page: it redirects to `/today`. A new habit is created in the habit dialog, see [7.5](#75-pages-in-detail).

### 7.2 API client and data fetching

- `lib/api-client.ts` wraps `fetch`:
  - It uses `credentials: "same-origin"` and relative `/api/v1/...` URLs. No token is ever stored in JavaScript; the `SESSION` cookie is `HttpOnly`.
  - On POST, PUT, PATCH and DELETE it reads the `XSRF-TOKEN` cookie **fresh on every request** and sends it as `X-XSRF-TOKEN`. If the cookie is missing, it first calls `GET /auth/csrf` (concurrent requests share that call). A `403 CSRF_INVALID` fetches a fresh token and retries the request once, which covers a stale cookie after logging in from another tab.
  - Any `401 UNAUTHENTICATED` calls a global "unauthenticated" handler. `/auth/me` opts out, since a 401 there just means logged out.
  - It parses the error body into a typed `ApiError { status, code, message, details }`. A request that gets no response is `NETWORK_ERROR` (status 0); an error body that isn't the API's (a proxy's 502 page) is `INTERNAL`.
- **Auth state** (`features/auth/AuthProvider.tsx` + `useAuth()`):
  - The current user is the query `['me']` with `staleTime: Infinity`. Its fetcher ensures the CSRF cookie exists, then calls `GET /auth/me`. A 401 resolves to `null` (logged out), not an error.
  - The status is one of `loading | authenticated | anonymous | error`. `error` means the server couldn't be reached, which is different from being logged out, and shows a "Try again" screen.
  - `login` and `register` put the returned user straight into the `['me']` cache, so no extra `/auth/me` call is needed.
  - `logout` calls the endpoint (a failure still logs this browser out), then clears `['me']` **and every other cached query**, so the next user never sees the previous user's data. After a logout the login page has no `from`, so the next login (maybe someone else's) lands on Today.
  - A 401 on any request while authenticated means the session expired: clear the cache, set `['me']` to `null`, and show a "Your session ended. Log in again." toast.
- **Query keys** are defined centrally in `lib/query-keys.ts`, e.g. `['me']`, `['today', date]`, `['habits', filters]`, `['habit', id]`, `['cores']`, `['reviews', 'latest']`, `['stats', 'overview', range]`, `['stats', 'habit', id, range]`.
- **Invalidation map** (after a mutation succeeds):

| Mutation | Invalidate |
|---|---|
| log write | `today` (every cached day: streaks and the week's hits run across days), `habit/:id`, `stats` |
| habit create/edit/archive/delete | `habits`, `today`, `cores` |
| core CRUD/order | `cores`, `today` |
| undo | `today`, `reviews`, `habit/:id` |

### 7.3 Optimistic logging

Logging must feel instant, and stay correct:

1. **Unsaved values are overrides,** kept in a small store keyed by date and habit and applied on top of the server's day with `applyOverrides`. That recomputes the habit's progress (`computeProgress` against the log's `targetSnapshot`, or the day's target for a new log), the day's average and the week's hits (`isHit`). A background refetch can never wipe a pending change, because the override wins until the habit is idle.
2. **Writes for one habit go out in order,** one after another, so a typed value can't overtake an earlier increment. Typing a value drops the habit's unsent taps.
3. **On success, once the habit has nothing else pending,** the server's `{ log, habitProgress, currentStreak }` is merged into `['today', date]`, the override is dropped, and the day is refetched quietly (for the week's hits and the streaks).
4. **On error,** the override is dropped (the saved value shows again) with the toast "Couldn't save that. Check your connection and try again.", or the API's own message where it has one (a day outside the window, an archived habit).
5. **Counter buttons** (`+` / `−`) debounce sends by 400 ms and send the summed `delta` through the increment endpoint, so rapid taps don't flood the API. Unsent taps are flushed with `fetch(…, { keepalive: true })` when the page is hidden or reloaded.

### 7.4 Duration timer

- A Zustand store holds `{ habitId, habitName, date, startedAt } | null`, persisted to `localStorage` so a running timer survives a refresh or a closed tab.
- **Only one timer runs at a time.** Starting another asks to stop the current one first (its time so far is logged).
- **On stop:** `delta = floor((now − startedAt) / 1000)` seconds is sent via the increment endpoint, and the store is cleared. Under a second logs nothing.
- A running timer shows live elapsed time on the habit card and as a small indicator in the sidebar (and the phone header), linking to the day it's logging to.
- **Midnight edge case:** if the timer was started on a previous date, the time is credited to the **start date**, and a toast explains this. If that date has already left the backfill window, a dialog offers "Log to today" (the minutes editable) or "Discard".
- **Sanity limit:** if more than 6 hours have elapsed, the app asks "Still going? Log X h Y min?" with the minutes editable before saving, or "Keep going".

### 7.5 Pages in detail

#### Onboarding (`/onboarding`)

Three steps with a progress indicator. State is held locally and submitted at the end. Each step is skippable except step 1.

1. **Your cores:** preset chips (Health, Career, Mind, Relationships, Finance, Learning) plus "Add your own". At least one is required. Each core can have its color and icon edited.
2. **First habits:** suggested templates per selected core (e.g. Health: "Walk 20 min", "Drink 8 glasses"; Mind: "Meditate 5 min"). Users can also create a habit from scratch with a compact version of the habit form. The UI gently recommends 2–3 habits and soft-warns above 5 ("Starting small makes it stick. You can add more anytime.").
3. **How it works:** one screen explaining Levels in plain words, as something you can switch on per habit: "With Levels on, a habit's target follows how your weeks go. They start off, and you choose which habits get them." Then four points: switch Levels on from a habit's edit page; two strong weeks in a row move the target up a step; a rough week eases it off; every change shows on Today, with an Undo.

**Submit:** `POST /cores/batch`, then the habits, then `POST /me/onboarding/complete`, then navigate to `/today`. If a step fails, the user stays on it and the data already created is reused on retry. Track created ids in state so nothing is duplicated. The draft and those ids are kept in sessionStorage (per user), so a reload mid-way resumes too. An account that already has cores can skip onboarding ("I'm already set up").

#### Today (`/today`)

- **Header:**
  - The date, with ‹ › arrows to navigate back up to 6 days. Past dates show a "Past day" pill and a "Back to today" button.
  - A circular **day progress** ring showing `dayProgress`.
  - A one-line message based on progress (see section 14).
- **Review banner** (when `pendingReview`): "Your week is in. 2 targets went up, 1 eased off. See review →".
- **Welcome back banner** (when `welcomeBack`): "You were away last week. Nothing changed. Pick up where you left off." It links to the review too.
- **Time-of-day groups** (Morning, Afternoon, Evening, Anytime): empty groups are hidden, and habits are ordered by `sortOrder`.
- **Habit card**, depending on type:
  - **Toggle:** a large circular check button. Tapping toggles it.
  - **Count:** `− value / target unit +`, where tapping the value opens a number input, plus a progress bar.
  - **Duration:** `value / target` in minutes, a ▶ start / ■ stop button, a "+ add time" button (opens a minutes input), and a progress bar.
  - **Always shown:** a core color stripe, the 🔥 streak count, and the target-change badge when `change` is present ("↑ 10 → 12 min", "↓ 4× → 3× a week"). Clicking the badge opens a popover with the reason sentence, "Target moved from 60 to 55 min." (plus "This isn't a step back." for a deload), and an Undo button if `canUndo`, or else why not (`UNDO_BLOCK_REASON_TEXT[undoBlockedReason]`). Undo's toast: "Back to 60 min. We'll check again next week."
  - **Kebab menu:** Edit, View stats, Archive.
- **"This week" section** for `TIMES_PER_WEEK` habits: shows "2 / 3 this week" dots. Habits whose quota is met collapse into a "Done for the week ✓" row but can still be logged.
- **Empty state:** "Nothing scheduled today. Enjoy it, or add a habit." Adding a habit opens the habit dialog.
- **Floating "+ Habit" button:** opens the habit dialog over Today.

#### Cores (`/cores`)

- Core cards, reorderable with dnd-kit. Each card shows:
  - an icon, name and color
  - its habits, as compact rows
  - actions: add habit (opens the habit dialog with this core preselected), edit core, archive
- A "Show archived" toggle at the bottom shows archived cores, each with Unarchive.
- An "Add core" button; with no cores yet, the presets are one-click starts.
- The icon picker offers a curated, searchable set of lucide icons for life areas (`lib/core-icons.ts`), not all of lucide.

#### Habit form (dialog for new, `/habits/:id/edit` for editing)

**New habits** are created in a modal dialog over the current page, opened from Today's "+ Habit" button, a core card's "Add habit" or an empty state. From a core card, that core is preselected. On phones (below the `sm` breakpoint) it's a drawer from the bottom (shadcn's `Drawer`, built on vaul) instead, which can also be swiped down to close. The body scrolls while its title and actions stay visible. Saving closes it with a toast, and the user stays on the page. **Editing** is a page, `/habits/:id/edit`.

Both have the same sections:

1. **Basics:** name, core (select).
2. **Type:** segmented control for Toggle / Count / Duration. It's disabled when editing, with a hint: "To change the type, create a new habit." The schedule type is locked the same way (its interval, days or weekly count stay editable), and the start date can't change.
3. **Target:**
   - Count: number plus unit.
   - Duration: minutes, with hours shown when ≥ 60. Fixed steps and limits are in minutes too; the form converts to seconds.
   - Toggle: hidden.
4. **Repeat:** a segmented control for **Daily | Weekly | Times a week** (`DAILY`, `SPECIFIC_DAYS`, `TIMES_PER_WEEK`). Daily shows an "Every N days" stepper (1–30, 1 by default), Weekly the weekday chips, and Times a week its stepper (1–7).
5. **Time of day:** Morning / Afternoon / Evening / Anytime.
6. **Levels (adaptive difficulty):**
   - A switch, off by default for a new habit. The settings below only matter once it's on.
   - Step: "+10%" (default) or a custom absolute value.
   - Min and max target (advanced, collapsed by default).
   - A preview line computed with shared logic: "If you're consistent: 10 → 11 → 12 → 13 min over the next 6 weeks."
   - For toggle habits on daily or specific days, the section shows: "Levels work on how often you do a yes/no habit. Switch the schedule to 'Times a week' to use them."
7. **Start date** (optional): today by default, from 6 days back (so recent days can be logged) to a year ahead.

When editing the target of an existing habit, a note says: "This counts as a manual change. Levels will wait for two full weeks at the new target before adjusting."

Validation uses the shared zod schema on the converted payload, so the same errors appear client-side and server-side; the cross-field rules are checked even while a plain field is invalid. An edit sends only the fields that changed.

#### Habit detail (`/habits/:habitId`)

- Header: name, core, current target, schedule, current and longest streak.
- Range selector: 30d / 90d / 365d, kept in the URL (`?range=90d`).
- **Heatmap:** calendar grid with columns per week. Cell intensity shows progress, unscheduled days are hollow, and bonus logs get a dot. Hovering shows the date and value.
- **Target over time:** a Recharts step-line chart. ↑ / ↓ markers show level-ups and deloads, and undone changes appear as faded markers.
- **Totals:** completion rate (hits of due days, or of sessions for a weekly habit), total minutes/units, number of level-ups that weren't undone.
- **Log history:** a list of the last 14 days with inline editing within the backfill window (never before the start date; read-only for an archived habit).
- Each chart has a Chart | Table switch, so its numbers are readable without seeing it.

#### Weekly review (`/review`, `/review/:weekStart`)

- Title "Week of Nov 9 – 15" and the overall rate.
- **Levelled up:** each change with "Morning run: 3× → 4× per week. 6 of 6 last week, 6 of 6 the week before." and an **Undo** button while allowed.
- **Eased off:** the same format, with a supportive sentence.
- **Holding steady:** a collapsed list with a short reason per habit (e.g. "Needs one more strong week", "Not enough data yet", "At your max").
- An inactive-week variant: "You were away last week. Nothing changed. Pick up where you left off."
- A list of previous reviews.
- Opening the page calls `POST /reviews/:id/seen`.

#### Stats (`/stats`)

- Range tabs: 7d / 30d / 90d / 365d, kept in the URL (`?range=`).
- **KPI row:** overall completion rate (the average of the habits' rates), best current streak, and level-ups vs deloads. Unfinished days and weeks don't count until they're done, so the rate doesn't dip every morning.
- **Completion over time:** a line chart of the daily rate.
- **By core:** horizontal bars per core.
- **Streak leaderboard:** your top 5 habits.

#### Settings (`/settings`)

Sections:

- **Profile:** name, username (read-only).
- **Timezone:** select, prefilled from the browser. Shows a warning if the browser timezone differs from the saved one ("Your device is on Asia/Baku but your account uses UTC. Update?"). Today shows the same prompt as a banner; "Not now" is remembered for that device timezone.
- **Password:** change password.
- **Archived:** archived cores and habits, each with an Unarchive action.
- **Theme:** light, dark or system.
- **Danger zone:** log out of all devices (`POST /auth/logout-all`), delete account (requires the password).

### 7.6 Shared UI components

`HabitCard` (with `ToggleControl`, `CounterControl`, `DurationControl`), `AddHabitDialog`, `ProgressRing`, `ProgressBar`, `StreakBadge`, `TargetChangeBadge` (+ popover), `CoreChip`, `CorePicker`, `IconPicker`, `ColorPicker`, `WeekdayPicker`, `DurationInput`, `SortableList`, `ConfirmDialog`, `EmptyState`, `Heatmap`, `TargetHistoryChart`, `PageHeader`, `DateNavigator`.

**Design language.** A light grey page with borderless white cards (`rounded-3xl`) on it; grey fills (inputs, selects, icon tiles) inside the cards; pill-shaped buttons (`surface` white on the page, `default` black, `secondary` grey inside cards). Section titles sit on the page above their card (`Section`); dashboard cards carry a small muted label instead (`Panel`). Lists use the shadcn `Item` rows: an icon in a grey rounded tile, a title and a muted line, a value or chevron on the right, separators inset past the tile. Everything is monochrome (black progress bars, chart bars and rings); a core's color appears only where it identifies the core: its icon tile, the heatmap and the pickers. Navigation is a top bar (the sections as a pill group, then Settings and the account in one pill), with a floating pill tab bar on phones; detail pages get a "← Back" pill. Dark mode is the same design on a near-black page.

### 7.7 Accessibility and responsiveness

- All controls are reachable by keyboard. Toggle buttons use `aria-pressed`, and counters have labelled buttons ("Increase pages").
- Progress is never conveyed by color alone: there's always a number or icon too.
- Heatmap cells have `aria-label`s, and the chart has a table fallback.
- Light and dark themes via Tailwind's `dark:` and CSS variables (shadcn default). The theme follows the system and can be overridden in settings.
- Layouts are tested at 360 px, 768 px and 1280 px.

---

## 8. Shared package

`packages/shared` is the single source of truth for types and rules. It is ESM-only (NestJS 12 and Vite both consume ESM), built with `tsdown`, and exposed via `exports` in `package.json`.

```
packages/shared/src/
├── index.ts
├── enums.ts                  # HabitType, ScheduleType, TimeOfDay, ... (string unions + arrays)
├── constants.ts              # PROGRESSION_CONFIG, CORE_PRESETS, COLOR_PALETTE, HABIT_TEMPLATES
├── schemas/                  # zod: auth, user, core, habit, log, query params
├── types/                    # API response types (TodayResponse, StatsOverview, ...)
├── dates/
│   ├── local-date.ts         # LocalDate = "YYYY-MM-DD" branded string; parse/format/add
│   ├── today.ts              # todayIn(tz), nowIn(tz)
│   └── week.ts               # weekStartOf(date), weekRange, isoWeekday
├── schedule/
│   └── is-scheduled.ts       # isScheduledOn(schedule, date)
├── progress/
│   ├── progress.ts           # computeProgress(value, target), isHit(log)
│   ├── weekly-rate.ts        # weeklyRate(habit, logs, week)
│   └── streaks.ts            # currentStreak(...), longestStreak(...)
└── progression/
    ├── step.ts               # nextLevelUp(), nextDeload(), clamp
    ├── eligibility.ts        # isEligibleWeek(), targetOn(date, changes)
    ├── decide.ts             # decideForHabit()
    ├── preview.ts            # projectLevels(habit, weeks) → used by the habit form
    └── reasons.ts            # reason code → human sentence (used by web)
```

**Rule:** no Prisma, Nest, or React imports in this package. Only `zod` and `luxon`.

---

## 9. Dates, timezones and weeks

Getting this wrong causes the subtlest bugs, so the rules are strict:

1. **Weeks are ISO weeks:** Monday to Sunday. There is no user setting for this in the MVP.
2. **"Today" is always computed from `user.timezone` on the server.** The client sends dates explicitly (`?date=`), and the server validates them against its own computation of today.
3. **Local calendar dates** (`HabitLog.date`, `startDate`, `weekStart`, `effectiveFrom`) are `@db.Date` columns and `"YYYY-MM-DD"` strings in the API. **Instants** (`createdAt`, `undoDeadline`, `undoneAt`, `archivedAt`) are `timestamptz` and ISO strings.
4. **All date math uses luxon with an explicit zone**, through the shared helpers. A lint rule (`no-restricted-syntax`) forbids `new Date()` and `Date.now()` in `packages/shared/src/{progress,progression,schedule}`. Callers pass `now` in, which also makes the functions testable.
5. **Timezone change:**
   - The new timezone applies from the next request.
   - Existing logs keep their dates.
   - If the change makes "today" jump backward or forward a day, the backfill window absorbs it.
   - The next review is created by `ensureDue` based on the new timezone. The unique constraint prevents a second review for the same week.
6. **DST:** luxon handles it. Tests cover a week containing a DST switch (e.g. `Europe/Berlin` in late October).

---

## 10. Security

- **Authorization:** every query is scoped by `userId`, and there is an e2e test per resource that tries to access another user's records and expects a 404.
- **Session security:** the `SESSION` cookie is `HttpOnly; Secure; SameSite=Lax`, so there is nothing for an XSS attack to read. Only the token's SHA-256 is stored. Sessions are revocable by deleting the row. See [6.4](#64-authentication).
- **CSRF:** a session-bound, signed `XSRF-TOKEN` is required in the `X-XSRF-TOKEN` header on every unsafe method, including login and logout.
- **CORS:** not enabled. The SPA and the API share one origin (`https://notch.emindabakhov.com`), so no other site can read API responses. Requests another site manages to send are stopped by `SameSite=Lax` and the CSRF check.
- **Headers:** `helmet` defaults, including a strict CSP for the SPA (served by the same NestJS app).
- **Throttling:** login and register only (10 per minute per IP). No global limit; this is a personal tool.
- **Registration:** invite code + `MAX_USERS` cap. Nobody can sign up without the code.
- **Input limits:** string lengths are capped in zod (names 80, descriptions 1,000). Arrays are capped (order arrays 200). The JSON body limit is 100 kB.
- **Account deletion:** cascades and is irreversible. It requires the password.
- **Secrets:** come from env only. `.env.example` is committed and `.env` is gitignored.

---

## 11. Testing strategy

| Layer | Tool | What |
|---|---|---|
| Shared domain logic | Vitest | **Highest priority.** Table-driven tests for schedules, weekly rate, streaks, eligibility, every decision branch, step math, rounding, bounds, cooldown, inactive week, DST weeks, and backfill across a target change |
| API services | Vitest | Services with a real test database (Testcontainers) rather than mocked Prisma |
| API e2e | Vitest + Supertest | Auth flow (invite code, max users, same 401 for unknown user and wrong password, session expiry, logout and logout-all, CSRF rejected without or with a stale token), ownership isolation, log write → streak update, review creation idempotency, undo rules, `ensureDue` before log writes |
| Web components | Vitest + RTL | `HabitCard` variants, optimistic update rollback, `TargetChangeBadge`, habit form validation and type/schedule switching |
| Web e2e | Playwright | Golden paths (below) against the real API and database |

**Must-have progression test cases** (in `decide.spec.ts`), all with a fixed injected `now`:

1. New habit, first partial week → HOLD / NOT_ELIGIBLE.
2. Two full weeks at ≥ 85% → LEVEL_UP, with the value computed from the step and correct minute rounding.
3. One week ≥ 85%, the previous week 80% → HOLD / STEADY.
4. Week < 50% after a level-up → DELOAD back to that level-up's `fromValue`.
5. Week < 50% with no prior level-up → DELOAD by one step, clamped to min.
6. At min and struggling → HOLD / AT_MIN. At max and consistent → HOLD / AT_MAX.
7. Level-up undone last cycle, still consistent → HOLD / COOLDOWN.
8. Manual target edit mid-week → that week is NOT_ELIGIBLE.
9. Inactive week (no logs at all) → HOLD / INACTIVE_WEEK for every habit.
10. Toggle + daily → HOLD / NOT_ADAPTIVE. Toggle + 3×/week → frequency changes to 4×, capped at 7.
11. `SPECIFIC_DAYS` habit logged on an unscheduled day → the log doesn't affect the rate.
12. Overachievement (value > target) counts as one hit, not more.
13. `DAILY` habit every 10 days, a week with no due day → HOLD / NOT_ELIGIBLE. An interval edit mid-week → that week is NOT_ELIGIBLE.

**Playwright golden paths:**

1. Register → onboarding (2 cores, 3 habits) → lands on Today.
2. Log a toggle, a count via the `+` button, and a duration via start/stop; reload; the values persist and the day progress is correct.
3. Backfill yesterday; the streak updates.
4. With seeded logs and a fake clock: the review appears, the badge shows on Today, undo works, and undo disappears after logging at the new level.

Seed script (`prisma/seed.ts`): creates a demo user with 8 weeks of realistic logs, including one habit that levelled up twice and one that deloaded. It's used for local development.

**Playwright setup** (`apps/web/playwright.config.ts`, `pnpm test:e2e`): the built API serves the built web app on port 3100, one origin under the production CSP, as in production. Each run drops and recreates a `notch_e2e` database (on the compose Postgres locally, a service container in CI) and applies the migrations. Each spec registers its own users (through the UI, or `registerViaApi` in `e2e/support/users.ts`), so specs don't depend on each other or on order. The e2e API raises `MAX_USERS` and `AUTH_THROTTLE_LIMIT`.

---

## 12. DevOps and environments

### 12.1 Local development

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
docker compose up -d --wait       # postgres:16 on localhost:5434
pnpm --filter @notch/api exec prisma migrate dev
pnpm --filter @notch/api build && pnpm --filter @notch/api seed   # demo / demo-password
pnpm dev                          # turbo runs api (3000) and web (5173) in parallel
```

The Vite dev server proxies `/api` to `http://localhost:3000`, so the session and CSRF cookies work on the same origin in development, exactly as in production.

### 12.2 Environment variables

**API (`apps/api/.env`):**

```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/notch
SHADOW_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/notch_shadow   # drift check only
LOG_LEVEL=info
SESSION_TTL_DAYS=30
COOKIE_SECURE=false              # defaults to true; false only for local plain HTTP
CSRF_SECRET=change-me            # 32+ characters, e.g. `openssl rand -base64 48`
INVITE_CODE=change-me            # 8+ characters
MAX_USERS=1                      # raise to invite someone
AUTH_THROTTLE_LIMIT=10           # login and register attempts per minute per IP; raised only for Playwright
TRUST_PROXY=false                # number of proxies in front of the app; 1 behind the host's reverse proxy
WEB_DIST_DIR=                    # path to the built SPA; set by the Docker image (/app/static)
```

**Web:** none. The app calls `/api/v1` on its own origin (the Vite proxy in development).

### 12.3 CI (GitHub Actions)

On every push to `main` and every PR (`.github/workflows/ci.yml`):

1. pnpm install (`--frozen-lockfile`), with cache.
2. `prettier --check .`
3. `turbo run lint typecheck test build`. The e2e tests start their own Postgres with Testcontainers.
4. Check that `prisma migrate diff` has no drift (against a Postgres service used as the shadow database).
5. Build the production image (job `image`, after the checks pass). On pushes to `main` it's pushed to `ghcr.io/emin1731/notch` as `latest` and `sha-<commit>`; on PRs it's only built.
6. Playwright (job `e2e`, in parallel with the checks): builds the API and the web app and runs the golden paths against a Postgres service. The `image` job waits for it too.

### 12.4 Deployment

- **Domain:** `https://notch.emindabakhov.com`, on the existing hosting.
- **One app, one origin:** a single Docker image (multi-stage build, `node:26-slim`) contains the API and the built SPA. NestJS serves the SPA from `WEB_DIST_DIR` (falling back to `index.html` for client routes, with hashed `/assets` cached for a year) and the API under `/api/v1`. Until the web app exists, the image serves a placeholder page. There's no separate web host and no CORS.
- **TLS:** terminated by the host's reverse proxy, which forwards `X-Forwarded-Proto` and `X-Forwarded-For`. Set `TRUST_PROXY=1` (one proxy hop) so Express sees HTTPS (required for the `Secure` cookies) and the real client IP (required for throttling). The cookies are never sent over plain HTTP.
- **Release:** CI publishes the image to GHCR; the server runs `docker compose pull && docker compose up -d` with [`deploy/compose.yml`](../deploy/compose.yml). The container runs `prisma migrate deploy` on start. `GET /api/v1/health` checks the DB connection and is the container's health check. The full runbook is [deploy.md](deploy.md).
- **First user:** after the first deploy, run `user:create` (or register with the invite code).
- **Database:** PostgreSQL 16 in the same Compose stack (named volume). A `backup` service writes a daily `pg_dump` to `deploy/backups/`, keeps 14 days, and `scripts/verify-backup.sh` checks that a dump restores.
- **Monitoring:** pino logs in the host's log viewer and the health endpoint. No error-tracking service.

---

## 13. Delivery phases

Each phase ends in a working, demo-able state. Shared-package logic for a phase is written **before** the API and UI that use it.

> The backend was built first, in the sprints described in [backend-sprints.md](backend-sprints.md). The web app follows in the sprints of [web-sprints.md](web-sprints.md). Together they replace the phases below, which are kept for reference.

### Phase 0: Foundation

- [ ] Monorepo: pnpm workspaces, Turborepo, `packages/config` (tsconfig, eslint, prettier)
- [ ] `packages/shared` skeleton (ESM, tsdown); imported successfully by both apps
- [ ] NestJS app: config module with zod env validation, Prisma module, pino, helmet, cookie-parser, global prefix, exception filter, health endpoint, Swagger, serve-static for the SPA in production
- [ ] Vite app: Tailwind, shadcn/ui init, router, TanStack Query provider, layout shell (sidebar + bottom nav), theme, `/api` dev proxy
- [ ] docker-compose (Postgres); first migration
- [ ] CI pipeline; Husky + lint-staged

**Done when:** `pnpm dev` runs both apps, the web app shows the shell, `/health` returns ok, and CI is green.

### Phase 1: Authentication and users

- [ ] Prisma: `User` (username), `Session`
- [ ] Auth module: CSRF endpoint, invite-only register with `MAX_USERS`, login, `/auth/me`, logout, logout-all
- [ ] `SessionGuard` and `CsrfGuard` (global), `@Public()`, `@CurrentUser()`, throttling on login/register, `trust proxy`
- [ ] Users module: update profile and timezone, change password (drops other sessions), delete account
- [ ] CLI scripts: `user:create`, `user:set-password`
- [ ] Web: login and register pages (timezone detection); api-client with CSRF header and 401 handler; `AuthProvider` / `useAuth` with the four statuses; `RequireAuth` with return-to
- [ ] Tests: auth e2e (invite code, max users, credential errors, CSRF, expiry, logout-all)

**Done when:** a user can register with the invite code, stay logged in across reloads and restarts, log out (also from all devices), and have their password reset from the CLI.

### Phase 2: Cores

- [ ] Prisma: `Core`
- [ ] Shared: schemas, presets, palette
- [ ] API: cores CRUD, order, archive cascade, delete guard
- [ ] Web: Cores page (sortable), core create/edit dialog with icon and color pickers
- [ ] Tests: ownership e2e; archive cascade; delete guard

**Done when:** a user can set up, reorder, edit and archive their cores.

### Phase 3: Habits

- [ ] Prisma: `Habit`, `TargetChange` (manual changes only for now)
- [ ] Shared: habit schemas with cross-field refinements, `isScheduledOn`, step math, `projectLevels` preview, `adaptiveApplicable()`
- [ ] API: habits CRUD, order, archive; manual target edits write a `MANUAL` TargetChange
- [ ] Web: habit form (a dialog for new habits, a page for editing) with all sections, level preview and toggle-schedule hint; habits shown on core cards
- [ ] Tests: schema refinements, schedule helpers, step math, manual change recording

**Done when:** a user can create every combination of type × schedule, with level settings, and see habits in the structure.

### Phase 4: Logging and the Today screen

- [ ] Prisma: `HabitLog`
- [ ] Shared: `computeProgress`, `isHit`, `weeklyRate`, `currentStreak`, `longestStreak`, `targetOn(date)`
- [ ] API: logs upsert/increment/delete with backfill validation, target snapshot from the effective target, longest-streak recompute; `/today` aggregated endpoint (three queries)
- [ ] Web: Today page with date navigator, groups by time of day, `HabitCard` for each type, optimistic updates with rollback, debounced counters, persisted duration timer with edge cases, weekly-quota section, day progress ring, empty states
- [ ] Tests: streak rules for all schedules, backfill limits, optimistic rollback, timer midnight and long-run prompts

**Done when:** the user can log every habit type for today and the past 6 days, and see progress and streaks update instantly and correctly.

### Phase 5: Adaptive difficulty and weekly review

- [ ] Prisma: `WeeklyReview`; link `TargetChange` to reviews
- [ ] Shared: `isEligibleWeek`, `decideForHabit`, cooldown derivation, inactive-week detection, `PROGRESSION_CONFIG`, reason sentences
- [ ] API: `WeeklyReviewService.runForUser` (transactional, idempotent), `ensureDue` hooked into `/today`, `/reviews/latest` and log writes; undo endpoint with all four checks; review list/detail/seen; target-history endpoint
- [ ] `/today` returns `change`, `pendingReview` and `welcomeBack`
- [ ] Web: target-change badge and popover with undo; review banner; weekly review page (levelled up / eased off / holding steady / inactive variant); review history
- [ ] Tests: the full decision table (section 11); idempotency under concurrent `ensureDue` calls; undo rules; review timing across timezones and DST
- [ ] Dev-only endpoint/CLI: `pnpm --filter @notch/api review:run --user <id> --week <date>` to trigger reviews manually during QA

**Done when:** seeded data produces correct level-ups and deloads on the first visit after Monday 00:00 in the user's timezone, the user sees them on Today and in the review, and undo behaves exactly as specified.

### Phase 6: Stats

- [ ] Shared: range helpers, heatmap builder, target-series builder
- [ ] API: `/stats/overview` and `/stats/habits/:id`
- [ ] Web: Stats page (KPIs, completion line, by-core bars, streak leaderboard); habit detail page (heatmap, target-over-time step chart with markers, totals, editable recent log list)
- [ ] Tests: stats calculations against seeded fixtures; chart table fallbacks

**Done when:** a user with 8 weeks of seeded data sees accurate, readable stats at every range.

### Phase 7: Onboarding, settings and copy

- [ ] Shared: habit templates per core preset
- [ ] Web: 3-step onboarding with resumable submission; `RequireOnboarded`; settings page (profile, timezone mismatch prompt, password, archived items, log out everywhere, delete account)
- [ ] Copy pass across every screen using the guide in section 14; centralize strings in `features/*/copy.ts` (ready for i18n later)
- [ ] Empty, loading (skeletons) and error states for every page

**Done when:** a brand-new user goes from sign-up to a populated Today screen in under two minutes, and every state has intentional copy.

### Phase 8: Hardening and launch

- [ ] Playwright golden paths green in CI
- [ ] Accessibility audit (axe) and keyboard pass; responsive checks at 360 / 768 / 1280
- [ ] Dockerfile (API + built SPA), production env, deploy to `notch.emindabakhov.com` behind the host's TLS proxy
- [ ] Database backups verified with a restore test
- [ ] First user created; invite code set

**Done when:** the app runs at `https://notch.emindabakhov.com`, survives a redeploy without logging you out, and backups restore.

---

## 14. Tone and copy guide

**Voice: firm but friendly.** Like a good coach: direct, honest about results, never shaming, and brief. Use second person and plain words. No profanity, no guilt-tripping, no exclamation-mark spam (one per screen at most, reserved for real wins).

| Moment | Example copy |
|---|---|
| Day progress 0% | "Fresh day. Start with the easiest one." |
| Day progress 1–49% | "Momentum's started. Keep it going." |
| Day progress 50–99% | "More than halfway. Finish strong." |
| Day progress 100% | "Everything done. That's how it's built." |
| Level-up badge popover | "You hit this 13 of 14 days. Target moves from 10 to 12 min. You've earned it." |
| Deload badge popover | "Rough week, 2 of 7. We've eased it to 8 min so you can rebuild. This isn't a step back." |
| Holding steady | "Solid week. One more like it and this levels up." |
| Undo confirmation | "Back to 10 min. We'll check again next week." |
| Undo unavailable | "You've already logged at the new target, so this one's locked in." |
| Inactive week | "You were away last week. Nothing changed. Pick up where you left off." |
| Streak broken (habit detail) | "Streak reset. Your longest is still 21 days. Go beat it." |
| Backfill note | "Logging for Tuesday. Last week's review won't change." |
| Too many habits (onboarding) | "Starting small makes it stick. You can add more anytime." |
| Error saving | "Couldn't save that. Check your connection and try again." |

---

## 15. Out of scope and future work

Listed so the architecture leaves room for them without building them now:

| Feature | Notes for later |
|---|---|
| AI daily prioritization | Will read `/today` data; add a `priority` field to the Today response |
| AI accountability chat and conversational logging | New `ai` module that calls the existing logs service. Logging stays in one code path |
| Automatic audits / AI daily summaries | Generated from the same stats queries |
| Essentialism (pruning ignored habits) | Can reuse weekly rates: suggest archiving habits under 20% for 4+ weeks |
| Reminders and notifications | Web push first; would add a `Reminder` table keyed on `timeOfDay`. This is also when a scheduled job (and, with several instances, a Postgres advisory lock) becomes worth adding |
| Email and self-service password reset | Add an `email` column and a reset-token table; until then, `user:set-password` covers it |
| Error tracking and performance budgets | Sentry, Lighthouse and latency targets if the app ever has users beyond a few |
| Pause / vacation mode | Add `pausedFrom`/`pausedTo` on Habit; paused weeks become NOT_ELIGIBLE and don't break streaks |
| Phone installation (PWA) | A web app manifest and icons so the app opens full-screen from the home screen; offline logging would need a sync queue |
| Mobile apps | API is already client-agnostic; the shared package can be reused in React Native |
| Configurable week start (Sunday) | `weekStartOf` already centralizes this |
| Social / accountability partners, payments, i18n | Not planned for MVP |

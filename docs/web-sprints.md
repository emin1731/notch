# Web sprints

The web app (`apps/web`) split into sprints, after the backend ([backend-sprints.md](backend-sprints.md)). Each sprint ends with screens you can click through against the real API. Behaviour is specified in [section 7 of the plan](habit-tracker-implementation-plan.md#7-frontend-vite--react); this document is the order of work.

**Ground rules for every sprint**

- The web app builds on `@notch/shared`: the same zod schemas validate forms, and its response types are the API contract. Business rules (progress, streaks, step math, level preview) are never reimplemented in components; they're imported from the shared package.
- Every screen has a loading state (skeletons), an empty state and an error state, written with the [copy guide](habit-tracker-implementation-plan.md#14-tone-and-copy-guide).
- Every interactive piece is reachable by keyboard and labelled. Layouts are checked at 360, 768 and 1280 px, in light and dark.
- Component tests (Vitest + Testing Library, API mocked with MSW) cover each feature's logic. Each Playwright golden path runs against the real API and database.
- You review each screen as it lands, before the sprint closes.
- Decisions marked **Decide** are settled at the start of that sprint and written back into the plan.

**Decided before starting**

- **Design:** built on shadcn/ui and Tailwind, with a calm neutral base, each core's color as the accent, and light and dark themes. There's no Figma.
- **Branching:** the backend PRs (#1–#8) are merged into `main` first. Each web sprint branches from `main` and has its own PR.
- **Go-live:** only once the whole web app is done (W8). Until then it runs locally.
- **Phone install (PWA):** not now. The app is a responsive website. This goes on the future list (plan 15).

**Versions** (checked against npm on 2026-11-17)

| Area | Choice |
|---|---|
| Build | Vite 8, `@vitejs/plugin-react` 6, React 19.3, TypeScript 6.0 |
| Routing | React Router 8, data router (`createBrowserRouter`) |
| Server state | TanStack Query 5 |
| Client state | Zustand 5 (timer and small UI state only) |
| Forms | react-hook-form 7 + `@hookform/resolvers` 7 (supports zod 4) |
| UI | Tailwind CSS 4 (`@tailwindcss/vite`), shadcn/ui (CLI 4, `radix-ui`), lucide-react, sonner |
| Charts | Recharts 3; the heatmap is a CSS grid |
| Drag and drop | dnd-kit (see W2) |
| Celebration | canvas-confetti |
| Tests | Vitest 5 + Testing Library + MSW 3; Playwright 1.65 with `@axe-core/playwright` |

## Overview

| Sprint | Theme | Size | Depends on |
|---|---|---|---|
| [W0](#w0-foundation) | Vite app, design system, shell, image integration | M | backend merged |
| [W1](#w1-auth-and-the-api-client) | API client, auth, guards, login and register, Playwright | M | W0 |
| [W2](#w2-cores-goals-and-milestones) | Cores & Goals page, goal detail, celebration | M | W1 |
| [W3](#w3-habits) | Habit form, habits in the structure | L | W2 |
| [W4](#w4-today) | Today screen, logging, timer | L | W3 |
| [W5](#w5-reviews-and-target-changes) | Change badges, undo, weekly review | M | W4 |
| [W6](#w6-stats-and-habit-detail) | Stats page, habit detail, heatmap, charts | M | W4 |
| [W7](#w7-onboarding-settings-and-copy) | Onboarding, settings, copy pass, states | M | W2–W6 |
| [W8](#w8-hardening-and-launch) | Golden paths, accessibility, performance, deploy | M | all |

W4 holds most of the web risk: optimistic updates, debounced counters and the timer. W3 exists to make it possible, because Today has nothing to show until habits can be created.

---

## W0: Foundation

**Goal:** an empty but production-shaped web app that runs next to the API, builds into the Docker image, and has the design system in place.

**Decided**

- [x] **Dark-mode bootstrap:** an external `public/theme.js` in `<head>` applies the saved theme (light / dark / system) before first paint; the CSP keeps `script-src 'self'`.
- [x] **Font:** the system font stack (Tailwind's default `font-sans`).
- [x] shadcn/ui CLI 4 with the `radix-nova` preset on Radix (`radix-ui`), neutral base. Its Geist font and `next-themes` were removed in favour of the system font and our own `ThemeProvider`. `cn` comes from shadcn's `cn` package.
- [x] `@notch/shared` is built unbundled with `sideEffects: false`, so the web bundle only includes the modules it imports (Today's chunk went from 164 kB to 71 kB).

**App**

- [x] `apps/web`: Vite 8, React 19, TypeScript 6 (`@notch/config/tsconfig/react.json`), ESLint with the React hooks and refresh rules
- [x] Tailwind 4, shadcn/ui, core palette tokens (`--core-<color>`, lighter in dark mode), light and dark themes following the system, with an override
- [x] React Router data router with every route from plan 7.1 as a lazy placeholder page; TanStack Query provider; sonner toaster
- [x] **Layout shell:** a sidebar on desktop, and a top bar plus a bottom tab bar on narrow screens; `PageHeader`, `EmptyState`, a 404 page
- [x] Vite dev proxy `/api` → `localhost:3000`; `pnpm dev` runs the API, the web app and the shared watcher

**Integration**

- [x] `@notch/shared` imported in the browser (Today shows the local date from `todayIn`)
- [x] Dockerfile builds the web app and copies its `dist` to `/app/static`; the API's placeholder page is gone
- [x] CI: lint, typecheck, test and build for `web` (through Turbo)

**Tests**

- [x] Vitest + Testing Library + MSW set up (`onUnhandledFrame: 'error'`)
- [x] The shell: both navs, navigation with `aria-current`, the redirect from `/`, 404, guest layout; the theme: system-following, explicit choice, persistence

**Done when:** `pnpm dev` shows the shell with working navigation in light and dark, and the Docker image serves the built app at `/`.

---

## W1: Auth and the API client

**Goal:** you can register with the invite code, log in, stay logged in across reloads, and log out. The app always knows who's logged in. Spec: [plan 7.2](habit-tracker-implementation-plan.md#72-api-client-and-data-fetching).

**Decided**

- [x] **Playwright's backend:** the built API serves the built web app on port 3100 (one origin, the production CSP). Each run recreates a `notch_e2e` database on the compose Postgres (a service container in CI) and applies the migrations. Each spec registers its own users, through the UI or `registerViaApi`. A new `e2e` CI job runs it, and the `image` job waits for it.
- [x] **Login throttle:** `AUTH_THROTTLE_LIMIT` (default 10 per minute per IP), raised only for the e2e API.
- [x] **Return to the requested page:** the guest-only guard redirects as soon as `['me']` holds a user, so the forms need no navigation code. After "Log out" there's no return path: the next login, maybe someone else's, lands on Today.
- [x] **CSRF:** a `403 CSRF_INVALID` fetches a fresh token and retries once. A request with no response is `ApiError` `NETWORK_ERROR`.
- [x] **Forms:** the shared schemas got readable messages ("Use at least 8 characters"), and a pasted invite code is trimmed. The register form has a show/hide password toggle instead of a confirm field, and shows the detected timezone as a hint.
- [x] `@hookform/resolvers` is pinned to 7.0.6: 7.0.7 is newer than the pnpm release-age policy allows.

**App**

- [x] `lib/api-client.ts`:
  - same-origin `fetch`
  - reads the `XSRF-TOKEN` cookie fresh on every unsafe request, calling `/auth/csrf` when it's missing
  - parses errors into a typed `ApiError { status, code, message, details }`
  - a global 401 handler
- [x] `lib/query-keys.ts` and the invalidation map (plan 7.2)
- [x] `AuthProvider` / `useAuth()`:
  - statuses `loading | authenticated | anonymous | error`
  - `['me']` is filled straight from the login and register responses
  - logout clears every cached query
  - session expiry shows a "Log in again" toast
  - server unreachable shows a "Try again" screen
- [x] `RequireAuth` (no flash while loading; return to the requested page after login) and guest-only routes
- [x] **Form infrastructure:** react-hook-form + the shared schemas, and server errors mapped onto fields (`VALIDATION_FAILED` issues, `USERNAME_TAKEN`, `INVALID_INVITE_CODE`)
- [x] Login and register pages; register detects the timezone with `Intl`
- [x] Log out in the shell's user menu

**Tests**

- [x] API client: the CSRF header on unsafe methods, a fresh token after login, error parsing, the 401 handler
- [x] Auth flows with MSW: the four statuses, return-to, logout clearing the cache, session expiry
- [x] Playwright: register → reload (still logged in) → logout → login

**Done when:** the auth flow works in the browser against the real API, survives a reload and an API restart, and the first Playwright path is green.

---

## W2: Cores, goals and milestones

**Goal:** you can build and reorganise the core → goal → milestone structure, and completing a goal is celebrated. Spec: plan 7.5 "Cores & Goals" and "Goal detail".

**Decide**

- [ ] **Drag and drop library.** `@dnd-kit/react` is the new API, but it's still 0.x. Recommendation: the stable `@dnd-kit/core` + `@dnd-kit/sortable` 6.x, with keyboard sorting included.
- [ ] **Icon picker.** The API accepts any lucide-style name. Recommendation: a curated grid of about 40 lucide icons that suit life areas, with search. Not all ~1,600 icons, which would bloat the bundle.

**App**

- [ ] **Cores & Goals page:**
  - core cards, reorderable
  - active goals with progress
  - add, edit, archive and unarchive; delete (explains `CORE_NOT_EMPTY`)
  - "Show archived"
- [ ] Core dialog with `IconPicker`, `ColorPicker` and the presets
- [ ] Goal create and edit dialog: core, title, description, deadline, inline milestones
  - moving a goal with linked habits asks for confirmation (`moveHabits`)
- [ ] **Goal detail:**
  - deadline text ("12 days left" / "Overdue")
  - progress
  - milestone list: tick, inline rename, reorder, delete, add
  - "Mark goal complete" for goals without milestones
  - archive and delete with a `ConfirmDialog`
- [ ] **`CelebrationModal`:** opens when `goalJustCompleted` is set, with confetti (respecting `prefers-reduced-motion`) and "Archive goal" / "Set a new goal"
- [ ] Shared components: `CoreChip`, `ProgressBar`, `SortableList`, `ConfirmDialog`

**Tests**

- [ ] Milestone tick updates the goal status and opens the celebration once
- [ ] Reorder by keyboard
- [ ] Archive cascade reflected in the UI
- [ ] Playwright: create 2 cores and a goal with 3 milestones → tick all → celebration → goal completed

**Done when:** the whole structure can be built and reorganised in the browser, and completing a goal is celebrated.

---

## W3: Habits

**Goal:** you can create and edit every habit type × schedule combination, with level settings and a live preview. Spec: plan 7.5 "Habit form".

**Decide**

- [ ] **Form units.** The API takes durations in seconds; people think in minutes. Recommendation: the form works in minutes (hours shown from 60), converts on submit, and the final payload is checked with the shared `createHabitSchema` / `habitShapeIssues`, so client and server agree on every rule.

**App**

- [ ] **Habit form** (create and edit), on one page:
  - basics: core, then goal filtered by core
  - a type segmented control, locked when editing, with a hint
  - target and unit; schedule with `WeekdayPicker` and a 1–7 stepper; time of day
  - levels: switch, step, min/max under "advanced", the preview line from `projectLevels`, and the toggle-schedule hint
  - start date (up to 6 days back)
  - the manual-change note when editing a target
- [ ] Habits on core cards (unlinked ones) and goal detail (linked), with archive, unarchive and delete; reordering habits (`PUT /habits/order`)
- [ ] `DurationInput`, `WeekdayPicker`

**Tests**

- [ ] Every cross-field rule shows the same error as the server
- [ ] Switching type or schedule resets the right fields
- [ ] The preview matches `projectLevels`
- [ ] Minute ↔ second conversion
- [ ] Playwright: create one habit of each type

**Done when:** every combination can be created and edited in the browser, and the preview and validation match the API exactly.

---

## W4: Today

**Goal:** logging feels instant and is always correct, including the timer's edge cases. Spec: plan 7.3, 7.4 and 7.5 "Today".

**Decide**

- [ ] **Optimistic updates while counting.** Recommendation:
  - a habit with unsent taps ignores server responses for itself until its debounce flushes, so the number never jumps back
  - the final server result always wins
  - on failure, the snapshot is restored with a toast

**App**

- [ ] Today page:
  - `DateNavigator` (back 6 days, "Backfilling" pill)
  - `ProgressRing` and the progress line
  - time-of-day groups
  - the "This week" section ("2 / 3" dots, collapses when done)
  - empty state, floating "+ Habit"
- [ ] `HabitCard` with `ToggleControl`, `CounterControl` (400 ms debounce, summed delta, tap the value to type it) and `DurationControl`
  - streak, goal and core stripe
  - kebab menu: edit, stats, archive
- [ ] Optimistic updates with rollback, and the server result merged on success (plan 7.3)
- [ ] **Duration timer** (Zustand, persisted):
  - one timer at a time
  - live elapsed time on the card and in the shell
  - midnight credits the start date
  - a "Still going?" prompt over 6 hours
  - "+ add time" for manual entry

**Tests**

- [ ] Optimistic rollback on error
- [ ] Debounce sums taps
- [ ] The timer survives a reload
- [ ] Midnight and 6-hour cases (fake timers)
- [ ] Backfill dates
- [ ] Playwright: log a toggle, a count with `+` and a duration with start/stop; reload; values persist; backfill yesterday and the streak updates

**Done when:** you can log every habit type for today and the past 6 days, and progress and streaks update instantly and stay correct after a reload.

---

## W5: Reviews and target changes

**Goal:** level-ups and deloads are visible, explained and undoable exactly as the API allows. Spec: plan 2.8 and 7.5 "Weekly review".

**Decide**

- [ ] **Getting a pending review in Playwright without moving the server's clock.** Recommendation: a seed option that writes history through yesterday but skips last week's review, so the first visit in the test creates it, on any day of the week. It needs no test-only clock in the API.

**App**

- [ ] `TargetChangeBadge` on cards ("↑ 10 → 12 min") with a popover:
  - the reason sentence (`DECISION_REASON_TEXT`)
  - Undo while `canUndo`, otherwise why not (`UNDO_BLOCK_REASON_TEXT`)
- [ ] Review banner and "welcome back" banner on Today
- [ ] Review page:
  - levelled up, eased off, and holding steady (collapsed)
  - the inactive-week variant
  - undo
  - marks the review seen on open
- [ ] Review history list and past reviews (`/review/:weekStart`)

**Tests**

- [ ] Badge text for each field and type
- [ ] Undo success and each blocked reason
- [ ] The banner disappears after the review is seen
- [ ] Playwright: seeded pending review → banner → review page → undo → badge gone; undo locked after logging

**Done when:** with seeded data, the review appears, every change is explained, and undo works and locks as specified.

---

## W6: Stats and habit detail

**Goal:** readable, accurate stats that match the API's numbers. Spec: plan 7.5 "Stats" and "Habit detail".

**Decide**

- [ ] **Heatmap colors.** Recommendation: intensity in the habit's core color, with hollow cells for unscheduled days and a dot for bonus logs. Every cell has an `aria-label`, so meaning never relies on color alone.

**App**

- [ ] Stats page:
  - range tabs
  - KPI row
  - completion line (daily series; gaps where `rate` is null)
  - by-core bars
  - streak leaderboard
  - goals
- [ ] Habit detail:
  - header (target, schedule, streaks, plus the "streak reset" copy when it applies)
  - range selector
  - `Heatmap`
  - `TargetHistoryChart`: steps, ↑ / ↓ markers, undone changes faded
  - totals
  - the last 14 days' logs, editable within the backfill window
- [ ] A table fallback for each chart; Recharts loaded only on these pages

**Tests**

- [ ] The heatmap renders the API's days and flags
- [ ] Chart table fallbacks match the data
- [ ] Editing a recent log updates the stats

**Done when:** the demo user's stats pages show the same numbers as the API at every range, and are usable without seeing the charts.

---

## W7: Onboarding, settings and copy

**Goal:** a new user goes from sign-up to a populated Today in under two minutes, and every state has intentional copy. Spec: plan 7.5 "Onboarding" and "Settings", section 14.

**Decide**

- [ ] **Habit templates.** Recommendation: 2–3 per core preset in `@notch/shared` (`HABIT_TEMPLATES`), each a valid `CreateHabitInput` without the core, so the server validates them like any habit.

**App**

- [ ] Onboarding in 4 steps: cores, an optional goal, first habits (templates or a compact form, soft warning above 5), and how levels work
  - resumable submission: created ids are kept, so a retry never duplicates anything
- [ ] `RequireOnboarded`; CLI-created users are sent to onboarding once
- [ ] Settings:
  - profile
  - timezone, with the "your device is on …" mismatch prompt
  - password
  - archived cores, goals and habits with unarchive
  - theme override
  - log out everywhere, delete account
- [ ] **Copy pass:** strings in `features/*/copy.ts`, checked against section 14
- [ ] A skeleton, empty and error state audit on every page

**Tests**

- [ ] Onboarding retry after a failed step doesn't duplicate anything
- [ ] Timezone mismatch prompt
- [ ] Delete account
- [ ] Playwright: register → onboarding (2 cores, a goal with 3 milestones, 3 habits) → Today

**Done when:** sign-up to a populated Today takes under two minutes, and no screen shows a raw error or an unstyled empty state.

---

## W8: Hardening and launch

**Goal:** the app is solid, accessible and live at `https://notch.emindabakhov.com`.

- [ ] All five Playwright golden paths from plan 11 green in CI
- [ ] Accessibility:
  - axe on every page in Playwright
  - a keyboard-only pass
  - focus management in dialogs and after navigation
  - `prefers-reduced-motion`
- [ ] Responsive pass at 360 / 768 / 1280 in light and dark
- [ ] Performance:
  - bundle check (route-level splitting; charts and confetti lazy)
  - no layout shift on Today
- [ ] CSP check: the production build runs under the API's helmet CSP with no violations
- [ ] Deploy following [deploy.md](deploy.md), create your account, verify a backup restore

**Done when:** the app runs in production, you use it daily from your phone and laptop, and a redeploy doesn't log you out.

---

## After the web app

The future list in [plan section 15](habit-tracker-implementation-plan.md#15-out-of-scope-and-future-work), with phone installation (PWA) added.

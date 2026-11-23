# Notch backend: architecture guide

A guided tour of the Notch API: how it's put together, what happens to a request, how login and
security work, and where to look when you want to change something. It assumes you know
TypeScript and roughly what an HTTP API is, but not NestJS, Prisma or this codebase.

> **Which code does this describe?** The `s7-deploy` branch (the latest backend sprint). File links
> point to paths on that branch.
>
> **About [auth.md](auth.md):** that file describes the auth setup of a *different* app (a Spring
> Boot "Spending Tracker") that Notch's auth was modelled on. The ideas are the same, but the code
> here is a NestJS port. When the two differ, this document and the code are right.

---

## Contents

1. [The big picture](#1-the-big-picture)
2. [The tech stack, and why each piece is there](#2-the-tech-stack-and-why-each-piece-is-there)
3. [NestJS in 10 minutes (as used here)](#3-nestjs-in-10-minutes-as-used-here)
4. [The life of a request](#4-the-life-of-a-request)
5. [Startup and configuration](#5-startup-and-configuration)
6. [The database layer](#6-the-database-layer)
7. [Authentication and security](#7-authentication-and-security)
8. [Validation and errors](#8-validation-and-errors)
9. [The feature modules](#9-the-feature-modules)
10. [Time, timezones and the weekly review](#10-time-timezones-and-the-weekly-review)
11. [The shared package](#11-the-shared-package)
12. [Command-line scripts](#12-command-line-scripts)
13. [Testing](#13-testing)
14. [Deployment](#14-deployment)
15. [Recipes: how do I…](#15-recipes-how-do-i)
16. [Glossary](#16-glossary)

---

## 1. The big picture

Notch is a habit tracker with *adaptive difficulty*: every week it looks at how you did and raises
("levels up") or lowers ("deloads") each habit's target. The backend is a single **JSON API**
server. It also hands out the web app's files, so the browser only ever talks to one address.

```
                     ┌──────────────────────────── one Docker container ───────────────────────────┐
                     │                                                                               │
Browser  ──HTTPS──▶ reverse proxy ──HTTP──▶  Express (inside NestJS)                                 │
(React SPA)          (TLS, on the VPS)        │                                                      │
                     │                        ├── /api/v1/*   → NestJS controllers → services ──┐    │
                     │                        │                                                 │    │
                     │                        └── everything else → the built web app (index.html)   │
                     │                                                                          │    │
                     └──────────────────────────────────────────────────────────────────────────┼────┘
                                                                                                ▼
                                                                                  PostgreSQL 16 (own container)
```

The code lives in a **monorepo**: several packages in one Git repository, managed by **pnpm**
(package manager) and **Turborepo** (runs build/test/lint across packages in the right order).

```
apps/api            The NestJS server. This document is mostly about it.
packages/shared     Pure TypeScript used by both the API and the future web app:
                    zod schemas (request shapes), types, and all the domain math
                    (streaks, completion rates, level-up/deload decisions, dates).
packages/config     Shared tsconfig, ESLint and Prettier settings.
deploy/             The production Docker Compose stack and backup scripts.
docs/               The plan, sprint notes, deploy runbook, and this guide.
```

**The one idea to hold on to:** the API is a thin layer of HTTP handling and database access
wrapped around pure domain functions in `@notch/shared`. Business rules ("is this habit scheduled
on Tuesday?", "should the target go up?") live in `shared`; the API loads rows, calls those
functions, and saves the result.

---

## 2. The tech stack, and why each piece is there

| Piece | What it is | Why it's here |
|---|---|---|
| **Node 26 + TypeScript (ESM)** | Runtime and language | Types end to end; the same language as the web app. |
| **NestJS 12** | A framework on top of Express that adds structure: modules, dependency injection, guards, pipes | Gives every feature the same shape and makes cross-cutting concerns (auth, validation, errors) one-liners. |
| **Express** | The HTTP server underneath Nest | Nest uses it to actually listen on a port. A few things (cookies, static files, Helmet) are plugged straight into it. |
| **PostgreSQL 16** | The database | Relational data with real constraints, transactions and row locks. |
| **Prisma 7** | ORM: generates a typed database client from `schema.prisma`, and manages migrations | `prisma.habit.findMany(...)` is fully typed; migrations are versioned SQL files. |
| **zod 4** | Runtime validation library | One schema both *validates* a request body and *produces* its TypeScript type. Schemas live in `shared` so the web app can reuse them for forms. |
| **argon2** | Password hashing | The current recommended algorithm for storing passwords. |
| **cookie-parser, helmet** | Express middleware | Reads cookies into `req.cookies`; sets security-related HTTP headers. |
| **@nestjs/throttler** | Rate limiting | Slows down password guessing on login and register. |
| **pino / nestjs-pino** | Structured JSON logging | Fast logs, with cookies and CSRF tokens redacted. |
| **luxon** (in `shared`) | Date/time library | Timezone-correct "what day is it for this user?" math, including daylight saving. |
| **Vitest + Testcontainers + supertest** | Testing | Unit tests for pure logic; end-to-end tests that start a real Postgres in Docker and send real HTTP requests. |
| **Docker + Compose + GHCR** | Packaging and running in production | One image, built by CI, pulled by the server. |

---

## 3. NestJS in 10 minutes (as used here)

If you've only used plain Express, Nest can feel like a lot of decorators. Here is everything it
does in this codebase, with the file to look at for each.

### 3.1 Modules

A **module** groups related code. Each feature folder (`cores/`, `habits/`, `auth/`…) has a
`*.module.ts` that lists its controllers and services, and what it shares with other modules.
[`app.module.ts`](../apps/api/src/app.module.ts) is the root that imports all of them.

```ts
@Module({
  controllers: [CoresController],   // handles HTTP routes
  providers: [CoresService],        // business logic, injectable elsewhere
  exports: [CoresService],          // other modules (habits, goals) may use it
})
export class CoresModule {}
```

Some modules are marked `@Global()` (`PrismaModule`, `ClockModule`), so every module can use their
services without importing them.

### 3.2 Controllers and services

- A **controller** maps URLs to methods and deals only with HTTP: it reads params, body and the
  current user, and returns a value that Nest turns into JSON.
- A **service** holds the logic and talks to the database. Controllers stay tiny on purpose.

```ts
@Controller('cores')                       // → /api/v1/cores
export class CoresController {
  constructor(private readonly cores: CoresService) {}   // injected, see 3.3

  @Patch(':id')                            // → PATCH /api/v1/cores/:id
  update(
    @CurrentUser() user: AuthUser,         // who is logged in   (see 7.4)
    @IdParam('id', coreNotFound) id: string,   // validated UUID (see 8.1)
    @ZodBody(updateCoreSchema) body: UpdateCoreInput, // validated body (see 8.1)
  ): Promise<CoreDto> {
    return this.cores.update(user.id, id, body);
  }
}
```

### 3.3 Dependency injection (DI)

You never write `new CoresService(...)`. A class marked `@Injectable()` declares what it needs in
its constructor, and Nest builds it and passes those in. This is why `CoresService` simply
receives `PrismaService` and `Clock`. The big win is **testing**: the e2e tests swap the real
`Clock` for a fake one they can move forward in time, without changing any app code
(see [13](#13-testing)).

### 3.4 Guards, pipes, filters and decorators

These are Nest's hooks into the request pipeline. Notch uses each for one clear job:

| Concept | Runs | Answers | In Notch |
|---|---|---|---|
| **Middleware** | First, before Nest routing | — | `helmet`, `cookie-parser`, JSON body parser, the SPA file server ([`setup-app.ts`](../apps/api/src/setup-app.ts)) |
| **Guard** | Before the handler | "Is this request *allowed*?" | `SessionGuard` (logged in?), `CsrfGuard` (CSRF token valid?), `ThrottlerGuard` (too many tries?) |
| **Pipe** | On each parameter | "Is this input *valid*, and what is it as a typed value?" | `ZodValidationPipe` (bodies, queries), `IdParamPipe` (UUIDs in the URL) |
| **Exception filter** | When anything throws | "What error JSON do we send?" | `AllExceptionsFilter` |
| **Custom decorator** | — | Sugar | `@Public()`, `@CurrentUser()`, `@CurrentSessionId()`, `@ZodBody()`, `@ZodQuery()`, `@IdParam()` |

Guards registered with `APP_GUARD` and the filter registered with `APP_FILTER` apply to **every**
route automatically. That's the key security property: a new endpoint is protected by default, and
you have to opt *out* with `@Public()`.

---

## 4. The life of a request

Let's follow one real request end to end: the browser marks "Read 20 pages" as done today.

```
PUT /api/v1/habits/3f2c…/logs/2026-11-17
Cookie: SESSION=Xq9…; XSRF-TOKEN=nonce.signature
X-XSRF-TOKEN: nonce.signature
Content-Type: application/json

{ "value": 20 }
```

```
 1. Reverse proxy        TLS ends here; forwards to the container on 127.0.0.1:3000
 2. Express middleware   helmet adds security headers · cookie-parser fills req.cookies
                         JSON body parsed (max 100 kB) · pino logs the request (cookies redacted)
 3. Routing              /api/v1 prefix stripped → LogsController.set()
 4. SessionGuard         hash SESSION cookie → find session + user in ONE query
                         missing/expired → 401 UNAUTHENTICATED
                         otherwise: req.auth = { user: {id, username, timezone}, sessionId }
 5. CsrfGuard            PUT is "unsafe" → header must equal cookie AND signature must
                         be valid for this session → otherwise 403 CSRF_INVALID
 6. Pipes                IdParam: "3f2c…" is a UUID? (no → 404 HABIT_NOT_FOUND)
                         DateParam: "2026-11-17" is a valid date?   (no → 400)
                         ZodBody: { value: 20 } matches setLogSchema? (no → 400 VALIDATION_FAILED)
 7. Controller           calls logsService.set(user, habitId, date, 20)
 8. Service              runs the weekly review if a new week started (10.3)
                         opens a DB transaction:
                           lock the habit row  … WHERE id = ? AND userId = ? FOR UPDATE
                             (not yours/doesn't exist → 404 HABIT_NOT_FOUND)
                           archived? → 409 · date outside the 7-day window? → 400
                           upsert the log, recompute streaks (pure functions from shared)
                         commit
 9. Response             { log, habitProgress, currentStreak, longestStreak } → 200 JSON
    (or, if anything threw at any step, AllExceptionsFilter turns it into
     { statusCode, code, message, details? })
```

Every feature endpoint follows the same steps; only step 8 changes.

---

## 5. Startup and configuration

### 5.1 Boot sequence

[`main.ts`](../apps/api/src/main.ts) is three lines: create the app from `AppModule`, call
`configureApp()`, and listen on `PORT`. [`setup-app.ts`](../apps/api/src/setup-app.ts) holds
everything applied outside modules (logger, `trust proxy`, Helmet, cookies, body limit, the
`/api/v1` prefix, serving the web app, Swagger in development). It's a separate function so the
e2e tests can build an app that is configured *exactly* like production.

In production, the container's entrypoint
([`docker-entrypoint.sh`](../apps/api/docker-entrypoint.sh)) first runs
`prisma migrate deploy` (apply any new database migrations), then starts the server.

### 5.2 Environment variables are validated at boot

[`config/env.schema.ts`](../apps/api/src/config/env.schema.ts) describes every environment variable
as a zod schema. If anything is missing or invalid, **the app refuses to start** and prints every
problem at once. This prevents the classic "deployed with an empty secret" mistake.

| Variable | Default | Meaning |
|---|---|---|
| `NODE_ENV` | `development` | `development` enables pretty logs and Swagger at `/docs`. |
| `PORT` | `3000` | |
| `DATABASE_URL` | — (required) | Must be a `postgres://` or `postgresql://` URL. |
| `TRUST_PROXY` | `false` | How many proxies sit in front of the app (`1` in production). See [7.8](#78-rate-limiting-and-trust-proxy). |
| `LOG_LEVEL` | `info` | |
| `SESSION_TTL_DAYS` | `30` | How long a login lasts without activity. |
| `COOKIE_SECURE` | `true` | Cookies only over HTTPS. Set `false` only for local plain-HTTP dev. |
| `CSRF_SECRET` | — (≥ 32 chars) | Key used to sign CSRF tokens. |
| `INVITE_CODE` | — (≥ 8 chars) | Needed to register. |
| `MAX_USERS` | `1` | Registration closes once this many accounts exist. |
| `WEB_DIST_DIR` | unset | Folder of the built web app. Unset = API only. |

Services read config through Nest's typed `ConfigService`, e.g.
`config.get('SESSION_TTL_DAYS', { infer: true })`.

### 5.3 Serving the web app on the same origin

[`web/serve-spa.ts`](../apps/api/src/web/serve-spa.ts) serves the React build from `WEB_DIST_DIR`.
Hashed files under `/assets` are cached for a year; any other `GET` that isn't `/api/...` or
`/docs` returns `index.html`, so a page reload on `/today` still works (the React router takes it
from there). Serving the app and API from **one origin** is what makes the cookie-based auth simple:
no CORS, and cookies "just work" ([7.1](#71-the-model-in-one-paragraph)).

---

## 6. The database layer

### 6.1 Prisma in short

- [`prisma/schema.prisma`](../apps/api/prisma/schema.prisma) describes tables ("models"),
  columns, relations and indexes.
- `prisma migrate dev --name x` compares the schema with the database and writes a new SQL file
  under `prisma/migrations/`. Those files are committed and applied in order everywhere
  (`migrate deploy`). CI also runs a **drift check** that fails if the schema and the migrations
  disagree.
- `prisma generate` writes a typed client into `src/generated/prisma/` (not committed).
- [`PrismaService`](../apps/api/src/prisma/prisma.service.ts) extends that client, connects through
  the `pg` driver adapter, and is injected wherever the database is needed.

### 6.2 The data model

```
User ─┬─< Session                     (login sessions; see 7)
      │
      ├─< Core ─┬─< Goal ──< Milestone
      │         │     │
      │         └─< Habit >─┘ (optional link to a goal in the same core)
      │               │
      │               ├─< HabitLog        one row per habit per local date
      │               └─< TargetChange    every change to a target/schedule
      │                        │
      └─< WeeklyReview ────────┘          the week's verdict; owns its LEVEL_UP/DELOAD changes

  ─<  means "has many"
```

| Model | What it represents |
|---|---|
| `User` | Username (lower-cased), argon2 password hash, display name, IANA timezone, onboarding timestamp. |
| `Session` | One logged-in browser: the **hash** of its cookie token, expiry, last seen, user agent. |
| `Core` | A life area ("Health", "Career") with a colour, icon and sort order. Can be archived. |
| `Goal` | An outcome inside a core, with an optional deadline and `ACTIVE`/`COMPLETED` status. |
| `Milestone` | Ordered checkpoints of a goal, ticked by hand. |
| `Habit` | The thing you do. A type (`TOGGLE`, `COUNT`, `DURATION`), a schedule (`DAILY`, `SPECIFIC_DAYS`, `TIMES_PER_WEEK`), a current target, and adaptive-difficulty settings. |
| `HabitLog` | What you did on a given day. Stores `targetSnapshot`: the target *on that day*, so old progress stays correct after the target changes. |
| `TargetChange` | History of every change to a habit's target, weekly count or weekdays: `MANUAL`, `LEVEL_UP` or `DELOAD`, with undo info. |
| `WeeklyReview` | The evaluation of one Monday–Sunday week, with a JSON summary per habit. |

### 6.3 Conventions worth knowing

- **Every row is owned by a user**, either directly (`userId` column) or through its parent
  (a milestone through its goal). Every query includes the owner, see [7.9](#79-authorization-you-only-ever-see-your-own-data).
- **Two kinds of time.** Instants (`createdAt`, `expiresAt`) are `timestamptz`. Calendar dates
  that belong to the user's local day (`HabitLog.date`, `Habit.startDate`, `weekStart`) are plain
  `date` columns, because "Tuesday" in Baku isn't the same instant as "Tuesday" in New York.
  See [10](#10-time-timezones-and-the-weekly-review).
- **Deleting a user deletes everything** through `onDelete: Cascade`. A core with goals or habits
  can't be deleted (the service returns `409 CORE_NOT_EMPTY`); you archive it instead.
- **Constraints Prisma can't express** (target ≥ 1, `timesPerWeek` between 1 and 7, log value ≥ 0)
  are `CHECK` constraints added by hand in the migration SQL. The database is the last line of
  defence even if the code has a bug.
- **Transactions and row locks.** Writes that read-then-modify (logging, weekly reviews, undo) run
  in `prisma.$transaction(...)` and lock the habit row with `SELECT … FOR UPDATE`. Two requests
  touching the same habit at the same moment are processed one after the other instead of
  overwriting each other.
- **Unique constraints as locks.** `WeeklyReview` is unique on `(userId, weekStart)`. If two
  requests try to create the same review at once, one wins and the other gets a unique-violation
  error, which the code catches and turns into "read the winner's review". This makes the review
  **idempotent** (running it twice has the same effect as once).

---

## 7. Authentication and security

This is the section to read slowly. The short version:

> **Server-side sessions in an `HttpOnly` cookie (no JWTs), the SPA and API on one origin, a CSRF
> token on every request that changes data, argon2 passwords, and invite-only registration.**

All the code is in [`apps/api/src/auth/`](../apps/api/src/auth/).

| File | Role |
|---|---|
| [`auth.controller.ts`](../apps/api/src/auth/auth.controller.ts) | The `/auth/*` endpoints. Starts and ends sessions. |
| [`auth.service.ts`](../apps/api/src/auth/auth.service.ts) | Register and login rules, user creation, password reset (CLI). |
| [`session.service.ts`](../apps/api/src/auth/session.service.ts) | Create, find, slide, revoke sessions in the database. |
| [`session.guard.ts`](../apps/api/src/auth/session.guard.ts) | Global guard: "is there a valid session?" |
| [`csrf.service.ts`](../apps/api/src/auth/csrf.service.ts) | Issue and verify signed CSRF tokens. |
| [`csrf.guard.ts`](../apps/api/src/auth/csrf.guard.ts) | Global guard: "does this write carry a valid CSRF token?" |
| [`auth-cookies.service.ts`](../apps/api/src/auth/auth-cookies.service.ts) | Sets and clears both cookies with the right flags. |
| [`password.service.ts`](../apps/api/src/auth/password.service.ts) | argon2id hash/verify, dummy verify, rehash check. |
| [`tokens.ts`](../apps/api/src/auth/tokens.ts) | Cookie names, random token generation, SHA-256, CSRF binding. |
| [`decorators.ts`](../apps/api/src/auth/decorators.ts) | `@Public()`, `@CurrentUser()`, `@CurrentSessionId()`. |
| [`users/`](../apps/api/src/users/) | `/me` endpoints: profile, change password, onboarding, delete account. |

### 7.1 The model in one paragraph

You log in with a username and password. The server checks the password, creates a row in the
`Session` table, and sends back a random token in a cookie called `SESSION`. The browser stores it
and sends it automatically with every later request to the same site. On each request, the server
looks that token up in the database to find out who you are. Logging out deletes the row, which
immediately makes the token worthless.

### 7.2 Background: cookies, sessions and JWTs

**Why a cookie and not a token in `localStorage`?** A cookie marked `HttpOnly` can't be read by
JavaScript at all. If an attacker ever manages to run script on the page (an XSS bug), they still
can't steal the session. A token in `localStorage` would be readable.

The `SESSION` cookie's flags:

| Flag | Value | Why |
|---|---|---|
| `HttpOnly` | yes | JavaScript can't read it (XSS protection). |
| `Secure` | yes (`COOKIE_SECURE`) | Only sent over HTTPS, never in clear text. |
| `SameSite` | `Lax` | Not sent on cross-site `POST`s, `fetch`es or iframes: a first layer of CSRF protection. |
| `Path` | `/` | Sent for the whole site. |
| `Max-Age` | `SESSION_TTL_DAYS` | Survives browser restarts. |

**Why server-side sessions and not JWTs?** A JWT is a signed token that carries the user's identity
itself, so the server doesn't need a database lookup. Notch deliberately doesn't use them:

- **Revocable.** Deleting a session row logs that device out immediately. A JWT stays valid until it
  expires, so "log out everywhere" and "password changed, kick everyone out" need extra machinery.
- **Simpler.** No refresh tokens, no signing keys to rotate.
- **The cost** is one indexed database query per request, which is nothing for an app of this size.

### 7.3 Logging in, step by step

```
Browser                                              API                                   Postgres
  │ 1. GET /api/v1/auth/csrf ─────────────────────────▶ issue CSRF token bound to "anon"
  │ ◀──────────── Set-Cookie: XSRF-TOKEN=n1.sig1  (readable by JS)
  │
  │ 2. POST /api/v1/auth/login
  │    X-XSRF-TOKEN: n1.sig1   {username, password} ─▶ CsrfGuard ✓  ThrottlerGuard ✓
  │                                                    find user by username ───────────────▶
  │                                                    argon2.verify(hash, password)
  │                                                    revoke any old session cookie ───────▶ DELETE
  │                                                    token = 32 random bytes
  │                                                    store sha256(token) ─────────────────▶ INSERT Session
  │ ◀──────────── Set-Cookie: SESSION=token  (HttpOnly)
  │ ◀──────────── Set-Cookie: XSRF-TOKEN=n2.sig2  (new token, bound to this session)
  │ ◀──────────── 200 { id, username, name, timezone, onboardedAt }
  │
  │ 3. GET /api/v1/today   (cookies sent automatically) ─▶ SessionGuard: sha256(token) ────────▶ SELECT session + user
  │ ◀──────────── 200 { … }
```

What happens inside `AuthService.login()` and `AuthController.startSession()`:

1. **Validate the body** with `loginSchema`. It is deliberately loose: a username that could never
   exist still gets a normal 401, not a 400 that would give away "that's not even a valid name".
2. **Look up the user** (usernames are trimmed and lower-cased, so `Emin` and `emin` are the same).
3. **Check the password** with argon2. If the user *doesn't* exist, it still runs a full argon2
   check against a dummy hash (`verifyDummy`). Otherwise "unknown user" would answer in 1 ms and
   "wrong password" in 100 ms, and an attacker could time the responses to find out which
   usernames exist. Both cases return the same `401 INVALID_CREDENTIALS`,
   "Invalid username or password".
4. **Rehash if needed.** If the stored hash was made with weaker settings than the current ones,
   it's replaced now, while the plaintext password is known.
5. **Clean up**: delete this user's expired sessions (lazy garbage collection, no cron job).
6. **Start a fresh session.** Any session cookie the browser already had is revoked first, and a
   brand-new token is always generated. This prevents **session fixation**, an attack where someone
   plants a known session id in your browser before you log in, then rides on it afterwards.
7. **Set both cookies**: the new `SESSION`, and a new `XSRF-TOKEN` tied to it.

`POST /auth/register` does the same from step 6 on, after its own checks ([7.7](#77-registration-is-invite-only)).

### 7.4 What happens on every request: `SessionGuard`

[`session.guard.ts`](../apps/api/src/auth/session.guard.ts) runs before every handler:

1. If the route or its controller is marked `@Public()`, let it through.
2. Read the `SESSION` cookie, hash it with SHA-256, and load the session **joined with its user in
   one query** (`SessionService.findValid`).
3. No cookie, unknown hash, or expired → `401 UNAUTHENTICATED`.
4. **Sliding expiry** (see below).
5. Attach `req.auth = { user: { id, username, timezone }, sessionId }`.

Handlers then get the user with `@CurrentUser() user: AuthUser`. Because the user is re-read from
the database on every request, a timezone change applies from the very next request, and a deleted
user is logged out immediately.

**Only the hash of the token is stored.** The cookie holds 256 random bits; the database holds
`sha256(token)`. If the database ever leaked (say, through a backup), the attacker would have
hashes they can't turn back into working cookies. (A fast hash like SHA-256 is fine here, unlike
for passwords, because the token is random and far too long to guess.)

**Sliding expiry.** A session expires `SESSION_TTL_DAYS` (30) days after it was last *extended*.
On a request, if more than a day has passed since `lastSeenAt`, the guard pushes `expiresAt` 30
days forward and re-sends both cookies with a fresh `Max-Age`. The "at most once a day" rule keeps
this from being a database write on every request. The net effect: you stay logged in as long as
you use the app at least once every 30 days.

### 7.5 CSRF protection

**The attack.** Cookies are sent automatically. Without protection, a malicious site you visit
could contain a hidden form that `POST`s to `notch…/api/v1/me` with `DELETE`, and your browser would
attach your `SESSION` cookie. That's **cross-site request forgery** (CSRF).

**The defence in Notch** has two layers:

1. `SameSite=Lax` on the cookies already stops most cross-site writes in modern browsers.
2. A **CSRF token** that the other site can't know, checked on every unsafe request.

How the token works (the "double-submit cookie" pattern, with a signature):

- The server sets an `XSRF-TOKEN` cookie that JavaScript **can** read (not `HttpOnly`).
- On every `POST`, `PUT`, `PATCH` and `DELETE`, the web app copies that value into an
  `X-XSRF-TOKEN` header.
- [`CsrfGuard`](../apps/api/src/auth/csrf.guard.ts) requires the header to equal the cookie **and**
  the token's signature to be valid. An evil site can make your browser *send* cookies, but it can't
  *read* them (same-origin policy), so it can't put the right value in the header.

The token format is `nonce.signature`, where

```
signature = HMAC-SHA256(CSRF_SECRET, nonce + "." + binding)
binding   = sha256(SESSION cookie)   or   "anon" when logged out
```

Why sign it at all, and why bind it to the session?

- **Signed** means the server can verify it without storing anything (stateless), and an attacker
  can't invent a valid one.
- **Bound to the session** means a token from before login stops working after login, and a token
  can't be planted from elsewhere (for example from a sibling subdomain that can write cookies) and
  reused with your session.

Practical consequences:

- `GET`, `HEAD` and `OPTIONS` never need a token, so they must never change data.
- **Public writes need it too**: login, register and logout all require a token. That's why the web
  app calls `GET /auth/csrf` once on load.
- The token **changes** on login, register, logout and when the session slides. The client must
  read the cookie fresh before each request instead of caching it.
- Failure → `403 CSRF_INVALID`, "Invalid or missing CSRF token". Comparisons use
  `timingSafeEqual` so the check doesn't leak information through timing.

### 7.6 Passwords

[`password.service.ts`](../apps/api/src/auth/password.service.ts):

- **argon2id** with 64 MiB of memory, 3 iterations, 4 lanes. argon2 is designed to be slow and
  memory-hungry, which makes guessing passwords from a stolen hash very expensive, especially on
  GPUs.
- The stored string (`$argon2id$v=19$m=65536,t=3,p=4$salt$hash`) includes its own settings and a
  random salt. That's what lets `needsRehash()` spot old hashes and upgrade them at login.
- Passwords must be 8–128 characters ([`schemas/auth.ts`](../packages/shared/src/schemas/auth.ts)).
- There is no password reset by email (there are no email addresses at all). An admin resets a
  password from the command line ([12](#12-command-line-scripts)).

### 7.7 Registration is invite-only

`POST /auth/register` with `{ username, password, inviteCode, name?, timezone }`:

1. **Invite code.** Compared in constant time (both sides are SHA-256'd to the same length, then
   `timingSafeEqual`), so response timing doesn't reveal how many leading characters were right.
   Wrong → `403 INVALID_INVITE_CODE`.
2. **User cap.** If `MAX_USERS` accounts already exist → `403 REGISTRATION_CLOSED`. Raise
   `MAX_USERS` to invite someone.
3. **Create** the user. A taken username is caught via the database's unique constraint (not a
   "check first" query, which could race) → `409 USERNAME_TAKEN` with `details.field = "username"`.
4. **Log them in** straight away, exactly like login.

### 7.8 Rate limiting and `trust proxy`

Login and register (only those) have `@UseGuards(ThrottlerGuard)`: **10 requests per minute per IP**,
then `429 TOO_MANY_REQUESTS`. `/auth/me` and `/auth/csrf` are not throttled because the app calls
them on every page load.

"Per IP" hides a subtlety. In production, every request reaches Node *from the reverse proxy*, so
the raw connection IP is always the proxy's. The real client IP is in the `X-Forwarded-For` header,
which Express only trusts when `trust proxy` is set. `TRUST_PROXY` is a **hop count** (`1`), not
`true`: with `true`, Express would take the left-most entry of `X-Forwarded-For`, which the client
can write themselves, and an attacker could dodge the limit by sending a different fake IP each time.
With `1`, Express takes the address the one trusted proxy added.

### 7.9 Authorization: you only ever see your own data

There are **no roles** and no admins. Every logged-in user has the same rights, limited to their
own records. This is enforced in a simple, consistent way:

- **Every query filters by the owner.** Services always look things up as
  `findFirst({ where: { id, userId } })`, never by `id` alone. Nested records are checked through
  their parent (`targetChange` where `habit.userId = …`). Services like `CoresService.findOwned()`
  wrap this so other services reuse it.
- **Someone else's record is a 404, not a 403.** A 403 would confirm that the id exists. To an
  outsider, another user's habit and a habit that doesn't exist look identical.
- **A malformed id is also a 404**, not a 400 ([`id-param.ts`](../apps/api/src/common/pipes/id-param.ts)),
  for the same reason: ids can't be probed.
- **A test guards this forever.** [`test/ownership.e2e-spec.ts`](../apps/api/test/ownership.e2e-spec.ts)
  has Bob call *every route that takes an id* with Alice's ids and checks he always gets a 404 and
  Alice's data never changes. Another test fails if someone adds a route with an id and forgets to
  add it to that list.

### 7.10 Account operations

| Endpoint | What it does | Sessions afterwards |
|---|---|---|
| `POST /auth/logout` | Deletes the current session, clears `SESSION`, issues an anonymous CSRF token. It's `@Public()` so an already-expired session can still clear its cookie. | This one gone |
| `POST /auth/logout-all` | Deletes **every** session of the user, including this one. | All gone |
| `POST /me/password` `{ currentPassword, newPassword }` | Checks the current password, saves the new hash. | Others gone, this one kept |
| `DELETE /me` `{ password }` | Checks the password, deletes the user. Everything cascades. | All gone |
| `user:set-password` (CLI) | Admin reset. | All gone |

A wrong password on `/me/password` or `DELETE /me` returns **403**, not 401. The session is
perfectly valid; only the re-typed password is wrong. A 401 would make the web app think you've
been logged out.

### 7.11 Other hardening

- **Helmet** sets protective HTTP headers (Content-Security-Policy, `X-Content-Type-Options`,
  `Strict-Transport-Security`, and so on).
- **Body size limit** of 100 kB on JSON, so nobody can make the server parse a huge payload.
- **Log redaction**: the logger strips `Cookie`, `Set-Cookie` and `X-XSRF-TOKEN` from every log
  line ([`app.module.ts`](../apps/api/src/app.module.ts)), so session tokens never end up in log
  files.
- **Generic 500s**: unexpected errors return "Something went wrong" to the client; details only go
  to the server log.

### 7.12 Threats and defences at a glance

| Threat | Defence |
|---|---|
| Stealing the session via XSS | `HttpOnly` cookie; no token in JS-readable storage |
| Sniffing the session on the network | `Secure` cookie, HTTPS only, HSTS from Helmet |
| Cross-site request forgery | `SameSite=Lax` + signed, session-bound CSRF token on every write |
| Session fixation | A brand-new token on every login; old cookie revoked |
| Stolen database / backup | Only SHA-256 of session tokens; argon2id password hashes |
| Password guessing | Rate limit on login/register; slow argon2 |
| Finding out which usernames exist | Same 401 message *and* same timing for unknown user and wrong password |
| Guessing the invite code by timing | Constant-time comparison |
| Reading/changing another user's data | Every query scoped by `userId`; 404 for foreign or malformed ids; ownership e2e test |
| Long-lived stolen session | 30-day sliding expiry; logout-all; password change revokes other sessions |
| Secrets in logs | pino redaction |

### 7.13 Try it with curl

From the [README](../README.md): every write needs the `XSRF-TOKEN` cookie echoed in a header, and
the token changes on login and logout, so read it from the cookie jar each time.

```bash
jar=$(mktemp); api=localhost:3000/api/v1
xsrf() { awk '$6=="XSRF-TOKEN"{print $7}' "$jar"; }
post() { curl -s -b "$jar" -c "$jar" -H "X-XSRF-TOKEN: $(xsrf)" -H 'content-type: application/json' -d "${2:-}" "$api$1"; }

curl -s -b "$jar" -c "$jar" "$api/auth/csrf"                    # get a CSRF token
post /auth/login '{"username":"demo","password":"demo-password"}'
curl -s -b "$jar" -c "$jar" "$api/auth/me"                      # who am I?
post /auth/logout
```

Try `post` without the header (plain `curl -X POST`) to see the `403 CSRF_INVALID`.

---

## 8. Validation and errors

### 8.1 Validation with zod

Request shapes are **zod schemas in `@notch/shared`** (for example
[`schemas/auth.ts`](../packages/shared/src/schemas/auth.ts)). The API applies them with small pipes
in [`common/pipes/`](../apps/api/src/common/pipes/):

- `@ZodBody(schema)` / `@ZodQuery(schema)` parse the body or query string. Parsing also
  **transforms** values: usernames are trimmed and lower-cased, numeric query strings become
  numbers. The handler receives the clean, typed result.
- `@IdParam('id', habitNotFound)` checks that a URL id is a UUID, and turns anything else into the
  given 404.

Some rules span several fields or need the database (e.g. "the goal must belong to the habit's
core"). Those are checked in the service and reported in the same shape as a zod error via
`validationFailed([...])` in [`conflicts.ts`](../apps/api/src/common/errors/conflicts.ts).

### 8.2 One error format everywhere

Every non-2xx response has the same body, defined in
[`shared/src/errors.ts`](../packages/shared/src/errors.ts):

```json
{
  "statusCode": 409,
  "code": "CORE_NOT_EMPTY",
  "message": "Move or delete its goals and habits first",
  "details": { }
}
```

- `code` is a **stable string the web app can switch on**. Existing codes are never renamed.
- Services throw `new AppException(code, status, message, details?)`, or a ready-made one like
  `habitNotFound()` from [`not-found.ts`](../apps/api/src/common/not-found.ts).
- [`AllExceptionsFilter`](../apps/api/src/common/filters/all-exceptions.filter.ts) catches *everything*
  and converts it: `AppException` as-is; `ZodError` → `400 VALIDATION_FAILED` with a list of
  `issues` (path + message); Nest's own HTTP errors → a matching generic code; anything else →
  `500 INTERNAL` (and it's logged).

| Status | Typical codes |
|---|---|
| 400 | `VALIDATION_FAILED`, `BACKFILL_OUT_OF_RANGE` |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` (login) |
| 403 | `CSRF_INVALID`, `INVALID_INVITE_CODE`, `REGISTRATION_CLOSED`, `INVALID_CREDENTIALS` (re-entered password) |
| 404 | `CORE_NOT_FOUND`, `GOAL_NOT_FOUND`, `HABIT_NOT_FOUND`, … |
| 409 | `USERNAME_TAKEN`, `CORE_ARCHIVED`, `CORE_NOT_EMPTY`, `HABIT_ARCHIVED`, `UNDO_NOT_ALLOWED`, `GOAL_CORE_MISMATCH` |
| 429 | `TOO_MANY_REQUESTS` |
| 503 | `SERVICE_UNAVAILABLE` (health check can't reach the database) |

---

## 9. The feature modules

All routes are under `/api/v1` and need a session unless marked *public*.

| Module | Routes | What it's about |
|---|---|---|
| `auth` | `GET /auth/csrf` *(public)*, `POST /auth/register` *(public)*, `POST /auth/login` *(public)*, `GET /auth/me`, `POST /auth/logout` *(public)*, `POST /auth/logout-all` | Sessions, CSRF, credentials ([7](#7-authentication-and-security)). |
| `users` | `PATCH /me`, `POST /me/password`, `POST /me/onboarding/complete`, `DELETE /me` | Profile (name, timezone), password, onboarding flag, account deletion. |
| `cores` | `GET/POST /cores`, `POST /cores/batch`, `PUT /cores/order`, `PATCH/DELETE /cores/:id`, `POST /cores/:id/archive`, `…/unarchive` | Life areas. Archiving a core archives its active goals and habits with the same timestamp. |
| `goals` | `GET/POST /goals`, `GET/PATCH/DELETE /goals/:id`, `POST /goals/:id/complete`, `…/reopen`, `…/archive`, `…/unarchive`, `POST /goals/:goalId/milestones`, `PUT /goals/:goalId/milestones/order` | Goals and creating/ordering their milestones. |
| `milestones` | `PATCH/DELETE /milestones/:id`, `POST /milestones/:id/toggle` | Editing and ticking milestones. |
| `habits` | `GET/POST /habits`, `PUT /habits/order`, `GET/PATCH/DELETE /habits/:id`, `GET /habits/:id/target-history`, `POST /habits/:id/archive`, `…/unarchive` | Habits. Editing a target by hand records a `MANUAL` `TargetChange`. |
| `logs` | `GET /habits/:id/logs`, `PUT /habits/:id/logs/:date`, `POST /habits/:id/logs/:date/increment`, `DELETE /habits/:id/logs/:date` | Recording what you did. Only today and the 6 days before can be logged. A value of 0 deletes the log. `increment` is an atomic SQL upsert, so two quick taps on "+1" never lose a count. |
| `today` | `GET /today?date=` | The Today screen in one call: habits due on that date grouped by time of day, progress, streaks, weekly quotas, "target changed" badges, and whether a review is waiting. Three queries, then everything is computed in memory. |
| `reviews` | `GET /reviews`, `GET /reviews/latest`, `GET /reviews/:weekStart`, `POST /reviews/:id/seen`, `POST /target-changes/:id/undo` | Weekly reviews and undoing a level-up or deload ([10.3](#103-weekly-reviews-a-cron-job-without-a-cron)). |
| `stats` | `GET /stats/overview`, `GET /stats/habits/:id` | Completion rates, heatmaps, streaks and target-over-time for a date range. |
| `health` | `GET /health` *(public)* | Pings the database. Used by Docker's health check. |

Each module follows the same layout: `x.controller.ts` (routes), `x.service.ts` (logic and
queries), `x-dto.ts` (turns a Prisma row into the JSON shape from `shared`), `x.module.ts`.

**Why DTO mappers?** The database row and the API response are deliberately different things. The
mapper (e.g. [`to-user-dto.ts`](../apps/api/src/users/to-user-dto.ts)) picks exactly the fields the
client may see. A `User` row has `passwordHash`; a `UserDto` never will, even if someone adds a
column later.

---

## 10. Time, timezones and the weekly review

Time is the trickiest part of a habit tracker, so it gets its own section.

### 10.1 "Today" depends on who's asking

At 01:00 UTC on a Tuesday, it's still Monday evening in New York. Notch stores each user's IANA
timezone (e.g. `Asia/Baku`) and always computes "today" as
`todayIn(user.timezone, now)` from [`shared/src/dates/today.ts`](../packages/shared/src/dates/today.ts).
Local calendar dates travel through the code as `LocalDate` strings (`"2026-11-17"`), and are
stored in `date` columns. Weeks run Monday to Sunday in the user's timezone.

### 10.2 The injectable clock

Nothing in the services calls `new Date()` directly. They ask the injected
[`Clock`](../apps/api/src/clock/clock.ts) for `clock.now()`. In tests, a `TestClock` replaces it, so
a test can say "it's now Sunday 23:59 in Baku… now it's Monday 00:01" and check that the weekly
review, undo deadlines and the backfill window behave correctly, including across daylight-saving
changes. (Session expiry is the exception: it uses real time.)

### 10.3 Weekly reviews: a cron job without a cron

Each week, every adaptive habit gets a verdict: `LEVEL_UP` (≥ 85 % completion two weeks in a row),
`DELOAD` (below 50 %), or `HOLD`. The thresholds are in
[`progression/config.ts`](../packages/shared/src/progression/config.ts) and the decision itself is
the pure function `decideForHabit()` in `shared`.

The interesting part is **when** it runs. There's no scheduler. Instead,
[`ReviewsService.ensureDue(user)`](../apps/api/src/reviews/reviews.service.ts) is called at the start
of every request that shows or depends on this week's targets (Today, writing a log, editing a
habit, fetching the latest review). It checks: "has last week been reviewed for this user?" If not,
it runs the review right now, in one transaction:

1. Lock all of the user's habit rows (so log writes wait).
2. Insert the `WeeklyReview` row first, to claim the week. A concurrent request fails on the
   unique `(userId, weekStart)` constraint and reads this review instead.
3. For each habit, call `decideForHabit()`; for level-ups and deloads, update the habit and record
   a `TargetChange` with an **undo deadline**: the end of the week the new target applies to.
4. Save the summary.

The result is the same as a job running at Monday 00:00 in every user's own timezone, without any
infrastructure, and it handles users who skip weeks: their first visit triggers the review. A week
with no logs at all is treated as a break ("inactive"), not as struggling, so nobody gets
deloaded for being on holiday.

**Undo** (`POST /target-changes/:id/undo`) restores the previous value if
`undoBlockReason()` allows it: it's an automatic change (not `MANUAL`), not already undone, still
before the deadline, nothing has been logged since it took effect, and the habit's value hasn't been
edited since. Otherwise it returns `409 UNDO_NOT_ALLOWED` with the reason.

### 10.4 Target snapshots

Each `HabitLog` stores the target that applied **on that day** (`targetSnapshot`). Backfilling
Saturday after Monday's level-up uses Saturday's (old) target, and past progress percentages never
change retroactively. The `TargetChange` history plus `targetOn(date, …)` tells you the target on
any date.

---

## 11. The shared package

[`packages/shared`](../packages/shared/src/) is plain TypeScript with no NestJS, no database and no
HTTP. It contains:

| Folder | What's in it |
|---|---|
| `schemas/` | zod schemas for every request (auth, user, core, goal, habit, log, review, stats). |
| `types/` | Response shapes (DTOs) the API returns and the web app consumes. |
| `errors.ts` | The list of error codes and the error body type. |
| `dates/`, `timezone.ts` | `LocalDate`, `todayIn`, week math, timezone validation. |
| `schedule/` | "Is this habit scheduled on this date?" |
| `progress/` | Progress per log, weekly completion rates, streaks, habit history. |
| `progression/` | Adaptive difficulty: eligibility, cooldowns, step sizes, the decision, undo rules. |
| `stats/` | Ranges, daily series, heatmaps, target-over-time. |
| `goals/` | Goal progress from milestones. |

**Why put domain logic here instead of in services?**

- **Testable in isolation.** Pure functions take values and return values, so unit tests are fast
  and need no database. Most `*.spec.ts` files are here.
- **One source of truth.** The web app will import the same functions to show previews ("this
  habit will level up if you keep going") that match what the server will actually do.
- **Services stay about I/O**: load the rows, call the pure function, save the result.

The API imports it as `@notch/shared` (a pnpm workspace link). It's built with `tsdown` to
`dist/`, which is why `pnpm dev` builds `shared` before starting the API.

---

## 12. Command-line scripts

There's no admin UI and no email, so account management happens on the server from the command
line. The scripts in [`src/cli/`](../apps/api/src/cli/) boot a **minimal Nest application context**
([`cli.module.ts`](../apps/api/src/cli/cli.module.ts): config, database, clock, auth, reviews; no
HTTP server) and reuse the same services as the API, so the rules are identical.

```bash
pnpm --filter @notch/api build                                    # scripts run from dist/
pnpm --filter @notch/api user:create emin --timezone=Asia/Baku    # skips invite code and MAX_USERS
pnpm --filter @notch/api user:set-password emin                   # also logs out everywhere
pnpm --filter @notch/api seed --timezone=Asia/Baku                # dev only: demo / demo-password
pnpm --filter @notch/api review:run demo --week=2026-11-09        # dev only: force a weekly review
```

Passwords are typed twice without being echoed, or read from the first line of stdin when piped.

---

## 13. Testing

```bash
pnpm test     # unit + e2e across the monorepo
```

- **Unit tests** (`*.spec.ts` next to the code) cover pure logic: the domain functions in `shared`,
  the CSRF signer, password service, env validation, the error filter.
- **End-to-end tests** ([`apps/api/test/`](../apps/api/test/)) are the main safety net:
  - [`global-setup.ts`](../apps/api/test/global-setup.ts) starts **one real Postgres 16 in Docker**
    (Testcontainers) for the run and applies the migrations.
  - [`create-test-app.ts`](../apps/api/test/create-test-app.ts) builds the **real** app (same modules,
    guards, filters and `configureApp` as production), optionally with a `TestClock`.
  - Tests use supertest to send HTTP requests, including cookies and CSRF headers, and check
    responses and database state.
  - Highlights: `auth.e2e-spec.ts` (sessions, CSRF, throttling, fixation), `ownership.e2e-spec.ts`
    (the cross-user 404 matrix), `reviews.e2e-spec.ts` (timezones and DST), `today` and `stats`
    (checked against hand-computed numbers).

CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs lint, typecheck, tests, build
and the Prisma drift check on every push and pull request.

---

## 14. Deployment

Full runbook: [deploy.md](deploy.md). The shape:

```
Browser ──HTTPS──▶ reverse proxy on the VPS (TLS) ──HTTP──▶ 127.0.0.1:3000  api container
                                                                  ├──▶ db container (Postgres 16, volume pgdata)
                                                                  └─── backup container (daily pg_dump → ./backups)
```

- **One image.** The multi-stage [`Dockerfile`](../Dockerfile) builds `shared` and the API, then
  copies only production dependencies into a slim runtime image that runs as the unprivileged
  `node` user. The web app's static files go into the same image (`WEB_DIST_DIR=/app/static`).
- **CI publishes** `ghcr.io/emin1731/notch` on every push to `main`.
- **Startup** applies migrations, then starts the server. Docker's `HEALTHCHECK` polls
  `/api/v1/health`.
- **Port 3000 is bound to `127.0.0.1` only**, so the only way in is through the reverse proxy
  (which handles HTTPS). That's why `TRUST_PROXY=1`.
- **Sessions are in Postgres**, so redeploys don't log anyone out.
- **Backups**: a sidecar container runs `pg_dump` daily and keeps the last 14 days.

---

## 15. Recipes: how do I…

**…add a new authenticated endpoint?**

1. Add the request schema (and response type) to `packages/shared`, export it from `index.ts`.
2. Add a method to the controller with `@CurrentUser()`, `@ZodBody()` / `@ZodQuery()` /
   `@IdParam()`.
3. Implement it in the service. **Filter every query by `userId`**, and throw a `…NotFound()` for
   missing or foreign records.
4. If the route takes an id, add it to the `ROUTES` list in `test/ownership.e2e-spec.ts` (a test
   fails if you forget).

You get authentication, CSRF and error formatting for free.

**…add a public endpoint?** Put `@Public()` on the method or controller. Remember that writes still
need a CSRF token.

**…add a database column?** Edit `schema.prisma`, run
`pnpm --filter @notch/api exec prisma migrate dev --name <change>`, commit the new migration folder.

**…add an error code?** Append it to `ERROR_CODES` in `shared/src/errors.ts` (never rename existing
ones), then throw `new AppException('MY_CODE', HttpStatus.CONFLICT, '…')`.

**…add an environment variable?** Add it to `envSchema` in `config/env.schema.ts` (with a default or
it becomes required), to `apps/api/.env.example`, and to `deploy/.env.example` if production needs it.

**…find out why a request is rejected?** Check in order: `401` → no or expired `SESSION` cookie;
`403 CSRF_INVALID` → header missing, or the token is stale (re-read the cookie); `400` → look at
`details.issues`; `404` on something that exists → it belongs to another user, or the id is
malformed.

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **Core** | A life area (Health, Career…) that groups goals and habits. |
| **Deload** | Lowering a habit's target after a bad week. |
| **DI (dependency injection)** | Nest creates services and passes them into constructors, instead of code calling `new`. |
| **DTO** | "Data transfer object": the JSON shape the API sends, as opposed to the database row. |
| **Guard** | A Nest class that decides whether a request may reach its handler. |
| **HMAC** | A signature made with a secret key; anyone with the key can verify it, nobody without it can forge it. |
| **Idempotent** | Doing it twice has the same effect as doing it once. |
| **IANA timezone** | A name like `Europe/Berlin`, which knows its own daylight-saving rules. |
| **Level-up** | Raising a habit's target after consistently good weeks. |
| **LocalDate** | A calendar date string (`YYYY-MM-DD`) in the user's own timezone. |
| **Migration** | A versioned SQL file that changes the database schema. |
| **Pipe** | A Nest class that validates and transforms one handler parameter. |
| **Same origin** | Same scheme + host + port. The SPA and API share one, so cookies work without CORS. |
| **Session fixation** | An attack where a known session id is planted before login and reused after. |
| **Sliding expiry** | The session's expiry moves forward as long as it's being used. |
| **Target snapshot** | The habit's target saved on each log, as it was on that day. |
| **Timing attack** | Learning a secret from how long the server takes to answer. |

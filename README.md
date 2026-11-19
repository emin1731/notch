# notch

A personal habit tracker with adaptive difficulty. The spec lives in
[docs/habit-tracker-implementation-plan.md](docs/habit-tracker-implementation-plan.md); the backend
is built in the sprints listed in [docs/backend-sprints.md](docs/backend-sprints.md).

## Stack

pnpm + Turborepo monorepo · NestJS 12 (ESM) · Prisma 7 + PostgreSQL 16 · React 19 + Vite 8 + Tailwind 4 + shadcn/ui · zod · Vitest + Testcontainers · Playwright

```
apps/api          NestJS API, served under /api/v1
apps/web          React app (Vite), served by the API in production
packages/shared   domain logic, schemas and types shared by the API and the web app
packages/config   tsconfig bases, ESLint and Prettier
```

## Requirements

- Node 26 (`nvm use`)
- pnpm 12 (`npm i -g pnpm`; the exact version is pinned in `package.json`)
- Docker (local database and e2e tests)

## Local development

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
docker compose up -d --wait        # Postgres 16 on localhost:5434
pnpm dev                           # builds shared, then watches shared + api + web
```

- App: http://localhost:5173 (Vite proxies `/api` to the API, so cookies work as in production)
- API: http://localhost:3000/api/v1/health
- Swagger: http://localhost:3000/docs (development only)

The compose database listens on host port 5434 (override with `POSTGRES_PORT`), so it doesn't clash
with other local Postgres instances.

Run `pnpm --filter @notch/api exec prisma migrate dev` once after cloning, and again whenever a
pull brings new migrations.

For a populated account, seed the demo user (development only; it replaces an existing `demo`):

```bash
pnpm --filter @notch/api build
pnpm --filter @notch/api seed --timezone=Asia/Baku     # log in as demo / demo-password
```

`--username=<name>` seeds another user instead of `demo`. `--pending-review` stops the history at
the end of last week without reviewing it, so the next visit shows a fresh review on any day
(Playwright uses both).

Weekly reviews run on the first visit of a new week. To try one without waiting for a Monday:

```bash
pnpm --filter @notch/api review:run demo --week=2026-11-09   # development only; idempotent
```

## Accounts

Registration is invite-only: `INVITE_CODE` in `apps/api/.env`, and it closes once `MAX_USERS`
accounts exist. There is no email, so accounts are managed from the command line (run on the
server in production):

```bash
pnpm --filter @notch/api build                                         # the scripts run from dist/
pnpm --filter @notch/api user:create emin --timezone=Asia/Baku         # no invite code needed
pnpm --filter @notch/api user:set-password emin                        # also logs out everywhere
```

Both ask for the password twice without echoing it, or read the first line of stdin when piped.

### Trying the API with curl

Every POST, PUT, PATCH and DELETE needs the `XSRF-TOKEN` cookie echoed in the `X-XSRF-TOKEN`
header. The token changes on login and logout, so read it from the jar each time:

```bash
jar=$(mktemp); api=localhost:3000/api/v1
xsrf() { awk '$6=="XSRF-TOKEN"{print $7}' "$jar"; }
post() { curl -s -b "$jar" -c "$jar" -H "X-XSRF-TOKEN: $(xsrf)" -H 'content-type: application/json' -d "${2:-}" "$api$1"; }

curl -s -b "$jar" -c "$jar" "$api/auth/csrf"
post /auth/login '{"username":"emin","password":"…"}'
curl -s -b "$jar" -c "$jar" "$api/auth/me"
post /auth/logout
```

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test        # unit + e2e; e2e starts its own Postgres container
pnpm test:e2e    # Playwright golden paths (needs the compose Postgres; builds first)
pnpm build
pnpm format      # prettier --write
```

`pnpm test:e2e` recreates a `notch_e2e` database on the compose Postgres, then the built API serves
the built web app on port 3100, as in production. Playwright's own Chromium is installed with
`pnpm --filter @notch/web exec playwright install chromium`; to use your installed Google Chrome
instead, run `PW_CHANNEL=chrome pnpm test:e2e`.

A pre-commit hook runs ESLint and Prettier on staged files. CI runs all of the above plus a Prisma
drift check on every push and pull request.

## Production

One Docker image (API plus the web app's static files) runs behind a reverse proxy, with Postgres and
daily backups in the same Compose stack. CI publishes `ghcr.io/emin1731/notch` from `main`. See
[docs/deploy.md](docs/deploy.md).

```bash
docker build -t notch .     # the image CI builds
```

## Database

```bash
pnpm --filter @notch/api exec prisma migrate dev --name <change>   # create and apply a migration
pnpm --filter @notch/api exec prisma migrate deploy                # apply pending migrations
pnpm --filter @notch/api generate                                  # regenerate the client
```

The Prisma client is generated into `apps/api/src/generated/` (not committed).

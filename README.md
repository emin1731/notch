# notch

A personal habit tracker with adaptive difficulty. The spec lives in
[docs/habit-tracker-implementation-plan.md](docs/habit-tracker-implementation-plan.md); the backend
is built in the sprints listed in [docs/backend-sprints.md](docs/backend-sprints.md).

## Stack

pnpm + Turborepo monorepo · NestJS 12 (ESM) · Prisma 7 + PostgreSQL 16 · zod · Vitest + Testcontainers

```
apps/api          NestJS API, served under /api/v1
packages/shared   domain logic, schemas and types shared by the API and (later) the web app
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
pnpm dev                           # builds shared, then watches shared + api
```

- API: http://localhost:3000/api/v1/health
- Swagger: http://localhost:3000/docs (development only)

The compose database listens on host port 5434 (override with `POSTGRES_PORT`), so it doesn't clash
with other local Postgres instances.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test        # unit + e2e; e2e starts its own Postgres container
pnpm build
pnpm format      # prettier --write
```

A pre-commit hook runs ESLint and Prettier on staged files. CI runs all of the above plus a Prisma
drift check on every push and pull request.

## Database

```bash
pnpm --filter @notch/api exec prisma migrate dev --name <change>   # create and apply a migration
pnpm --filter @notch/api exec prisma migrate deploy                # apply pending migrations
pnpm --filter @notch/api generate                                  # regenerate the client
```

The Prisma client is generated into `apps/api/src/generated/` (not committed).

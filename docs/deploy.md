# Deploying notch

How to run notch on the VPS at `https://notch.emindabakhov.com`, and how to keep it running.

## How it fits together

```
Browser ──HTTPS──▶ reverse proxy on the VPS (TLS) ──HTTP──▶ 127.0.0.1:3000  api container
                                                                  │
                                                                  ├──▶ db container (Postgres 16, volume pgdata)
                                                                  └─── backup container (pg_dump daily → ./backups)
```

- **Image:** CI builds `ghcr.io/emin1731/notch` on every push to `main`, tagged `latest` and `sha-<commit>`. It holds the API and the web app's static files, served from the same origin.
- **Startup:** the container runs `prisma migrate deploy` before the API starts, so a new release migrates the database by itself.
- **Sessions:** they live in Postgres, so a redeploy or restart doesn't log anyone out.
- **Server files:** everything the server needs is in [`deploy/`](../deploy): `compose.yml`, `.env.example` and `scripts/`.

## First deploy

### 1. Prepare the server

You need Docker with the Compose plugin and a reverse proxy that terminates TLS. Point an `A` record (and `AAAA`, if the server has IPv6) for `notch.emindabakhov.com` at the server.

The image is built for `linux/amd64`. On an ARM server (for example Hetzner CAX), add `linux/arm64` to `platforms` in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) first.

### 2. Copy the stack

From your machine:

```bash
ssh <server> 'mkdir -p ~/notch'
scp -r deploy/compose.yml deploy/.env.example deploy/scripts <server>:~/notch/
```

### 3. Configure

On the server:

```bash
cd ~/notch
cp .env.example .env && chmod 600 .env
openssl rand -base64 32 | tr -d '/+='   # → POSTGRES_PASSWORD
openssl rand -base64 48                 # → CSRF_SECRET
nano .env                               # also set INVITE_CODE
mkdir -p backups
```

The API refuses to start when a required value is missing or too short, and its log lists each problem.

### 4. Allow the server to pull the image

GHCR packages of a private repository are private. Create a GitHub token (classic) with only `read:packages`, then:

```bash
echo <token> | docker login ghcr.io -u emin1731 --password-stdin
```

If the repository or package is public, skip this step.

### 5. Start

```bash
docker compose pull
docker compose up -d
docker compose ps                       # api and db "healthy" after ~30 s
docker compose logs -f api              # migrations, then "Nest application successfully started"
curl -s localhost:3000/api/v1/health    # {"status":"ok","db":"ok"}
```

### 6. Reverse proxy

Forward the domain to `127.0.0.1:3000`, passing the client IP and the original scheme. `TRUST_PROXY=1` tells the API that exactly one proxy sits in front of it. That is how it knows the request came over HTTPS (needed for the `Secure` cookies) and which IP to rate-limit at login.

**Caddy** sets the forwarding headers and gets the certificate by itself:

```caddy
notch.emindabakhov.com {
	reverse_proxy 127.0.0.1:3000
}
```

**nginx** (with a certificate from certbot):

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name notch.emindabakhov.com;
    # ssl_certificate / ssl_certificate_key from certbot

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**If the proxy itself runs in Docker** (Traefik, nginx-proxy): remove the `ports:` entry of `api`, put `api` on the proxy's network, and point the proxy at `api:3000`.

**If Cloudflare proxies the domain** (orange cloud): there are two proxies, so set `TRUST_PROXY=2`.

### 7. Create your account

```bash
docker compose exec api node dist/cli/user-create.js emin --timezone=Asia/Baku --name=Emin
```

It asks for the password twice. Then open `https://notch.emindabakhov.com/api/v1/health` and log in through the API, or later through the app.

### 8. Check that it's right

From your machine:

```bash
curl -sI https://notch.emindabakhov.com/api/v1/auth/csrf | grep -i set-cookie
# XSRF-TOKEN=…; Max-Age=2592000; Path=/; Expires=…; Secure; SameSite=Lax
```

`Secure` must be there. If it isn't, the proxy isn't sending `X-Forwarded-Proto` or `TRUST_PROXY` is wrong.

## Updating

Pushing to `main` publishes a new `latest`. On the server:

```bash
cd ~/notch
docker compose exec backup pg_dump --format=custom --no-owner --file=/backups/pre-update.dump
docker compose pull api && docker compose up -d api
```

The first line takes a fresh dump, because the daily one can be up to a day old and migrations run on start. Some migrations delete data for good: `20261122120000_remove_goals` drops the goals and milestones tables. Sessions survive the restart.

**Roll back** by pinning the previous image:

1. Set `NOTCH_TAG=sha-<commit>` in `.env`.
2. Run `docker compose up -d api`.

Migrations only roll forward, so this only works for an image whose schema matches the database. To go back past a release that changed the schema (such as the one that removed goals), restore `pre-update.dump` first (see [Restore for real](#backups)), then pin the old tag.

## Backups

The `backup` service writes `backups/notch-YYYY-MM-DD.dump` (`pg_dump`, custom format):

- once when it starts, if today's dump is missing
- then daily at `BACKUP_HOUR_UTC` (3 by default)

It keeps `BACKUP_KEEP_DAYS` days (14 by default).

Copy them off the server now and then (e.g. `rsync <server>:notch/backups/ ./notch-backups/`). A backup on the same disk doesn't survive losing that disk.

**Check that a backup restores.** Do this after the first deploy, then once in a while:

```bash
docker compose run --rm --entrypoint sh backup /scripts/verify-backup.sh
```

The script restores the newest dump into a scratch database, compares row counts with the live database, and drops the scratch database. It ends with `OK: the backup restores.` You can pass a specific dump as an argument.

**Restore for real:**

```bash
docker compose stop api
docker compose run --rm --entrypoint sh backup /scripts/restore.sh /backups/notch-2026-11-20.dump
docker compose start api
```

## Accounts

There is no email, so accounts are managed on the server:

```bash
docker compose exec api node dist/cli/user-create.js <username> [--timezone=Area/City] [--name=…]
docker compose exec api node dist/cli/user-set-password.js <username>   # also logs them out everywhere
```

To let someone register through the app:

1. Raise `MAX_USERS` in `.env`.
2. Run `docker compose up -d api`.
3. Give them the `INVITE_CODE`.

The demo seed and `review:run` refuse to run in production.

## Logs and health

- **Logs:** `docker compose logs -f api` gives JSON lines (pino). Cookies and CSRF headers are redacted.
- **Health:** `GET /api/v1/health` returns 200 with `{"status":"ok","db":"ok"}`, or 503 when the database is unreachable. Docker's health check uses it too.

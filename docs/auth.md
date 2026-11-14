# Authentication

How login, sessions and access control work in Spending Tracker, written so the same setup can be
reused in other apps.

**In short:** server-side sessions in an `HttpOnly` cookie (no JWTs), a SPA and API served from the
same origin, CSRF tokens on every request that changes data, and invite-only registration.

## The model

The user logs in with a username and password. The server checks them against a BCrypt hash, creates
a session stored in Postgres and sends back an `HttpOnly` session cookie. The browser sends that
cookie automatically on every request.

The SPA and the API share one origin: the Vite proxy forwards `/api` in dev, and nginx does it in
production. So no CORS is needed, and the cookie just works. Every request that changes data must
also carry a CSRF token, which the SPA reads from a cookie and sends back in a header.

## Request flow

```
Browser (SPA)                        nginx (same origin)          Spring Boot              Postgres
  │ GET /api/auth/csrf  ───────────────▶ /api/* ─────────────────▶ sets XSRF-TOKEN cookie
  │ POST /api/auth/login               (rate limited)             BCrypt check
  │   X-XSRF-TOKEN: <cookie value>  ──────────────────────────────▶ new session id ──────▶ spring_session
  │ ◀── Set-Cookie: SESSION=…; HttpOnly; Secure; SameSite=Lax
  │ GET /api/entries  (cookie sent automatically) ───────────────▶ session → AuthUser(id) → WHERE user_id = ?
```

## Endpoints

| Endpoint | Access | What it does |
|---|---|---|
| `GET /api/auth/csrf` | public | Sets the `XSRF-TOKEN` cookie, returns 204 |
| `POST /api/auth/register` | public | `{username, password, inviteCode}` → creates the user and logs them in, returns 201 + `{id, username, currency}` |
| `POST /api/auth/login` | public | `{username, password}` → starts a session, returns 200 + the user |
| `GET /api/auth/me` | session | The current user, or 401 |
| `POST /api/auth/logout` | session | Ends the session, returns 204 (handled by Spring Security's logout filter) |
| `/api/**` (everything else) | session | 401 without a session |
| anything outside the list above | — | denied (`denyAll`) |

## Backend

Spring Boot 4, Spring Security, Spring Session JDBC. The main files:

- `config/SecurityConfig.java`: filter chain, CSRF, logout, password encoder
- `auth/AuthController.java`: CSRF, register, login, me
- `auth/AuthService.java`: registration rules
- `auth/AuthUser.java`, `auth/SpendUserDetailsService.java`, `auth/CurrentUser.java`
- `db/migration/V1__init.sql` (`users`) and `V2__spring_session.sql`

### Passwords and users

- `users(id, username UNIQUE, password_hash, …)`.
- Passwords are hashed with `PasswordEncoderFactories.createDelegatingPasswordEncoder()`. That's
  BCrypt, stored with a `{bcrypt}` prefix so the algorithm can be upgraded later.
- Passwords must be 8–72 characters; 72 is BCrypt's input limit.
- Usernames are trimmed and lower-cased before validation, storage and login, so they're
  case-insensitive. Allowed: `^[a-z0-9_.-]{3,50}$`.
- A wrong username and a wrong password give the same 401 message, "Invalid username or password",
  so attackers can't tell which usernames exist.

### Sessions

- `spring-boot-starter-session-jdbc` stores sessions in Postgres. The `spring_session` tables are
  created by a Flyway migration (`spring.session.jdbc.initialize-schema: never`). Sessions survive
  redeploys and restarts.
- The cookie is named `SESSION` and is `HttpOnly`, `Secure` and `SameSite=Lax`. `Secure` can be
  switched off with `SPEND_COOKIE_SECURE=false`; the dev profile does this.
- It lasts 30 days, through both the session timeout and the cookie's `max-age`.
- The stored principal, `AuthUser`, holds only the id and username. It implements
  `CredentialsContainer`, so the password hash is erased right after login and never ends up
  serialized in the session table.

### Custom JSON login

There's no form login and no HTTP Basic. `AuthController.startSession()` does the following:

1. `authenticationManager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(u, p))`,
   with a `DaoAuthenticationProvider`, a custom `UserDetailsService` and the password encoder.
2. `ChangeSessionIdAuthenticationStrategy` gives the session a new id, which prevents session
   fixation attacks.
3. It creates a `SecurityContext` and **explicitly** calls
   `securityContextRepository.saveContext(...)`. Since Spring Security 6, a custom login endpoint has
   to do this itself. The filter chain and the controller share one
   `HttpSessionSecurityContextRepository` bean.

Register calls the same `startSession`, so a new user is logged in straight away.

### CSRF

- `http.csrf(csrf -> csrf.spa())` puts the token in an `XSRF-TOKEN` cookie that JavaScript can read.
  The SPA sends it back in an `X-XSRF-TOKEN` header on POST, PUT, PATCH and DELETE.
- The token **changes on login and logout**, so the client reads the cookie fresh before every
  request instead of caching it.
- Logout needs the token too.

### Authorization and data isolation

- There are no roles: every logged-in user has the same rights, limited to their own data.
- Controllers receive the user through a meta-annotation: `@CurrentUser AuthUser user`, which wraps
  `@AuthenticationPrincipal`.
- **Every** repository query is scoped by `user_id` (`findByIdAndUserId`, and so on). Another user's
  record returns 404, not 403, so its existence isn't revealed.
- 401 and 403 responses come back as the app's usual JSON error, through a custom
  `authenticationEntryPoint` and `accessDeniedHandler`. A CSRF failure is reported as "Invalid or
  missing CSRF token".

### Registration rules

- The invite code comes from an environment variable (`SPEND_INVITE_CODE`) and is compared in
  constant time (`MessageDigest.isEqual`); a mismatch gives 403.
- Registration closes once `users.count() >= app.max-users` (`SPEND_MAX_USERS`), with a 403.
- A username that's already taken gives 409 on the `username` field.
- Registration seeds the new user's default data (here, categories) in the same transaction.

### Brute-force protection

nginx (`frontend/nginx.conf.template`) applies `limit_req` to `/api/auth/login` and
`/api/auth/register` only: 10 requests per minute per IP, burst 10, then 429. `/me` and `/csrf` are
excluded because they run on every page load. There's no rate-limiting code in the application
itself.

## Frontend

React, TanStack Query, openapi-fetch. The main files: `src/api/client.ts`, `src/auth/AuthProvider.tsx`,
`src/auth/useAuth.ts`, `src/auth/RequireAuth.tsx`.

### API client (`api/client.ts`)

- Uses `credentials: "same-origin"` and relative `/api/...` URLs.
- Middleware adds `X-XSRF-TOKEN` to unsafe methods. If the cookie is missing, it first calls
  `GET /api/auth/csrf`.
- Any 401 calls a global "unauthenticated" handler.

### Auth state (`AuthProvider` + `useAuth`)

- The current user is a TanStack Query entry (`["me"]`, `staleTime: Infinity`). Its `fetchMe` first
  makes sure the CSRF cookie exists, then calls `/api/auth/me`. A 401 becomes `null`, meaning logged
  out, rather than an error.
- The status is one of four values: `loading | authenticated | anonymous | error`. `error` means the
  server couldn't be reached, which is different from being logged out, and shows a "Try again"
  screen.
- `login` and `register` put the returned user straight into the query cache, so no extra `/me` call
  is needed.
- `logout` calls the endpoint, then clears the user **and every other cached query**, so the next
  user never sees the previous user's data.
- If an API call returns 401 while the user was logged in, the session has expired. The app clears
  its cache and shows a "Your session ended" toast.

### Route guard (`RequireAuth`)

- While loading it renders nothing, so the login screen doesn't flash.
- When anonymous, it sends the user to `/login` with `state.from`. After logging in they return to
  the page they asked for.

## Deployment requirements

- **Same origin.** The frontend and the API must share one domain: the Vite proxy in dev, nginx in
  production. Otherwise the cookie and CSRF setup breaks.
- **TLS in production.** The cookie is `Secure`, so it isn't kept over plain HTTP.
- **Behind a proxy:** set `server.forward-headers-strategy: native` and make the proxy pass
  `X-Forwarded-Proto`, so Spring knows the request arrived over HTTPS.

## Why sessions instead of JWTs

- **Revocable.** Deleting a session row logs that device out.
- **Nothing for an XSS attack to steal.** The session cookie is `HttpOnly`, and no token lives in
  `localStorage`.
- **Simpler.** There's no refresh-token flow and no signing keys to rotate.
- **The cost:** a database lookup per request, and you need the same-origin setup. Both are fine for
  a single-server app.

## Not built

Add these if another app needs them:

- Password reset or email verification (there's no email address at all)
- A list of active sessions, or "log out everywhere"
- Account lockout beyond nginx rate limiting
- Roles or admin users
- OAuth or social login

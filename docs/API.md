# ChainSync API (initial read-only endpoints)

Base URL for local development: `http://localhost:3000`.

## Health

`GET /api/health`

Returns a liveness response and timestamp. It does not disclose secret configuration and does not prove database or RPC readiness.

## Supported networks

`GET /api/networks`

Checks RPC connectivity for Ethereum Mainnet (chain ID 1) and Sepolia (chain ID 11155111), verifies the returned chain ID, and reports the latest block and response latency. `configured` indicates whether a custom RPC environment variable is present; the development fallback may still connect when it is false. Provider URLs and credentials are not returned.

## Native balance

`GET /api/balance?address=0x...&network=ethereum`

- `address`: required public EVM address.
- `network`: `ethereum` (default) or `sepolia`.
- Successful response includes the native coin balance, observed block number, timestamp, and network.
- Invalid addresses or networks return HTTP 400.
- RPC failures return HTTP 503 without leaking provider errors or URLs.

Example:

```sh
curl 'http://localhost:3000/api/balance?address=0x0000000000000000000000000000000000000000&network=ethereum'
```


## Transaction lookup

`GET /api/transaction?hash=0x...&network=ethereum`

- `hash`: required 32-byte transaction hash (64 hexadecimal characters after `0x`).
- `network`: `ethereum` (default) or `sepolia`.
- Successful responses include sender, recipient, native value, block, confirmation count, transaction status, and retrieval time.
- Invalid hashes or networks return HTTP 400. A missing transaction or provider failure returns a sanitized HTTP 404 response.
- A receipt that is not available is not treated as a successful transaction.

Example:

```sh
curl 'http://localhost:3000/api/transaction?hash=0x<64-hex-transaction-hash>&network=ethereum'
```

The interactive explorer is available at `/transaction-check`; the public balance tool is at `/wallet-check`.


## Accounts and saved watchlists

- `POST /api/auth/register` creates an account using an email and a password of 12–128 characters. Passwords are hashed with bcrypt before storage.
- `POST /api/auth/login` verifies credentials and sets a signed, expiring, HttpOnly session cookie.
- `POST /api/auth/logout` clears the session cookie.
- `GET /api/auth/session` returns the current account, or `user: null` when signed out.
- `GET /api/watchlists` lists only the signed-in user's saved public addresses.
- `POST /api/watchlists` saves an address. The body accepts `address`, optional `label`, and `chainId` (1 or 11155111).
- `DELETE /api/watchlists/:id` removes only a record owned by the signed-in user.

Set `DATABASE_URL` to PostgreSQL and generate a strong random `SESSION_SECRET` of at least 32 bytes. Run `npm run db:generate` and review/apply the Prisma migration with `npm run db:deploy`. Never apply the initial migration to a database that already contains production tables without reviewing and reconciling its migration history first.

The in-process authentication throttle is only a best-effort guard for a single running instance; enforce shared edge/provider rate limits for production. Email verification, password reset, and a complete account recovery workflow are not yet implemented, so public account onboarding is not fully production-ready.
## Sync projects and dashboard

- `GET /api/projects` lists the signed-in account's sync projects, newest first.
- `POST /api/projects` creates a project. The body accepts `name` (2–120 characters), optional `description` (up to 280 characters), `network` (`ethereum` or `sepolia`), optional `status` (`ACTIVE`, `PENDING` or `COMPLETE`, default `PENDING`), and optional `progress` (whole number from 0 to 100).
- `PATCH /api/projects/:id` updates `status`, `progress`, `name`, `description` or `network` on a project owned by the signed-in account. Recording a status or progress change also stamps `lastSyncedAt`.
- `DELETE /api/projects/:id` deletes a project owned by the signed-in account.
- `GET /api/admin/overview` returns every account and every project with status counts. It requires an administrator account and answers HTTP 403 for everyone else.

`Project.status` is the `ProjectStatus` enum (`ACTIVE`, `PENDING`, `COMPLETE`). The dashboard treats a project as needing attention when it is pending, or active with no recorded sync in the last 15 minutes. The interface is at `/dashboard` and the administrator view at `/admin`.

Administrator recognition uses the `ADMIN_EMAILS` environment variable (comma-separated list). An allowlisted account is served — and promoted once — as `ADMIN`; every other account keeps its stored role. Email verification is not implemented yet, so anyone able to register an allowlisted address would receive administrator access; do not rely on this for production.

## Security and readiness notes

These endpoints are read-only and never request keys or sign transactions. Public RPC fallbacks are included for development convenience; for production, configure a reputable RPC provider with documented quotas and monitoring.

The balance endpoint is currently a public endpoint without account authentication or a distributed rate limiter. Before public production deployment, put it behind edge/API rate limits and abuse monitoring. Authentication, persistent watchlists, transaction indexing, alert processing, and delivery are not implemented by these endpoints.

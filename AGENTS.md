# ChainSync — sandbox runbook (Base44)

Next.js 14 (App Router) + Prisma 6 + PostgreSQL. Read-only blockchain monitoring
for Ethereum Mainnet and Sepolia. Everything below is for the Base44 sandbox,
not a production deployment.

## Run it

```bash
docker compose -f docker-compose.base44.yml up -d --build   # preview on host port 3000
docker compose -f docker-compose.base44.yml ps
docker compose -f docker-compose.base44.yml logs -f web
```

Bring-up order is enforced by `depends_on`: `db` (healthy) → `install` (one-shot)
→ `migrate` (one-shot) → `web`. The install service runs `npm install` **and**
`npx prisma generate`; the Prisma client lands in the shared `chainsync-node-modules`
volume, so a fresh clone needs the install step before `web` can start.

`install`/`migrate` exit after they finish — that is expected, not a crash. If the
schema or `package.json` changes, re-run `up -d`: `install` re-runs and re-syncs.

Rebuild the image (`--build`) only when `Dockerfile.base44` changes. Source edits
never need a rebuild — the repo is bind-mounted and `next dev` serves live source.

## Non-obvious setup findings

- **There is no `package-lock.json`.** Use `npm install`, not `npm ci`. Dependency
  versions float within the `^` ranges in `package.json`.
- **The base image needs `openssl`.** `Dockerfile.base44` installs it. Without it
  Prisma logs "failed to detect the libssl/openssl version" and defaults to an
  engine target that does not exist on bookworm.
- **`prisma/schema.prisma` needed the `enum UserRole` reformatted** from the
  one-line form `enum UserRole { USER ADMIN }` to one value per line. Prisma
  6.19's parser rejects the one-line form with P1012, which breaks `prisma
  generate`, `prisma migrate deploy` and therefore `next build`.
- **The built-in Ethereum Mainnet RPC fallback is dead upstream.**
  `https://cloudflare-eth.com` (hardcoded in `app/api/balance/route.ts` and
  `app/api/networks/route.ts`) answers `eth_blockNumber` with
  `-32046 Cannot fulfill request`, so Mainnet shows "unavailable" unless
  `ETHEREUM_RPC_URL` is set. `.env.base44-defaults` pins a working public
  endpoint for the sandbox; a real provider URL supplied as a Base44 secret
  overrides it. The app's Sepolia fallback still works.
- **Prisma engine warnings about OpenSSL 1.1.x are noise** once `openssl` is installed.
- **`WatchAddress.lastObservedBlock`, `MonitorEvent.blockNumber` and
  `NetworkSample.latestBlock` are `BigInt` columns.** `NextResponse.json()` cannot
  encode a BigInt, and every route wraps its work in a `try/catch` that answers
  503, so an unconverted BigInt looks like "service temporarily unavailable"
  rather than a crash. `/api/watchlists` GET used to return raw rows and answered
  503 for every saved address the worker had already indexed; it now maps
  `lastObservedBlock` to a decimal string (as `/api/monitoring` already did for
  `blockNumber`/`latestBlock`). Convert any new BigInt field before responding.
- **A duplicate watchlist entry is refused before the insert** (409 "already saved
  for that network"). Letting Postgres reject it via the unique constraint worked,
  but the database logs every violation at ERROR level, which reads as a fault in
  container logs. The `P2002` catch stays for concurrent inserts.

## Environment and secrets

- `.env.base44-defaults` holds development placeholders only. It is loaded
  **before** `/run/base44/app.env`, so any value from the Base44 dashboard always
  wins. `.gitignore` carries an explicit `!.env.base44-defaults` negation.
- `DATABASE_URL` is generated for the sandbox and wired inline in compose
  (`chainsync` / `chainsync_dev_password` on service `db`) — it is deliberately
  not in an env file, and it is never a Base44 secret.
- `SESSION_SECRET` must be ≥32 bytes; `lib/session.ts` throws otherwise. Auth
  endpoints fail with a 500 if it is missing or too short.
- `BASE44_PREVIEW_MODE` and `BASE44_PUBLIC_HOST_SUFFIX` are passed through to
  `web` and read by `lib/origin.ts` (preview-only same-origin allowance, see
  above). `BASE44_SANDBOX_HOST_DOMAIN` is passed through but unused. Next 14
  `next dev` binds `0.0.0.0:3000` via the compose command; Next 14 has no
  `allowedDevOrigins` config option.

## Verify

```bash
curl -s localhost:3000/api/health                       # {"ok":true,...}
curl -s localhost:3000/api/networks                     # both networks "connected"
curl -s "localhost:3000/api/balance?address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&network=ethereum"
docker compose -f docker-compose.base44.yml exec -T web sh -ec 'printenv SESSION_SECRET >/dev/null && echo present'
```

Account flows need a real row: register at `/account` (password must be 12–128
characters), then save a watchlist address. Watchlist writes are persisted in
Postgres; verify with a read of `/api/watchlists` while signed in.

## Same-origin (CSRF) checks

Every state-changing endpoint (`/api/auth/register`, `/api/auth/login`,
`/api/auth/logout`, watchlist create and delete) calls `isSameOrigin()` from
`lib/origin.ts`, which compares the browser's `Origin` against the origin the
request was addressed to (`x-forwarded-host` ?? `host`, with
`x-forwarded-proto` for the scheme).

Do not reintroduce `request.nextUrl.origin` in that comparison. It is derived
from the address the server was bound to — `http://0.0.0.0:3000` under
`next dev -H 0.0.0.0`, and likewise for a default `next start` — so a genuine
same-origin browser request never matched and *every* account write returned
403 `Request origin rejected.` Registration and sign-in could not work in any
environment, not just the sandbox.

The Base44 preview proxy rewrites `Host` to the internal sandbox host while the
browser keeps sending the preview's public origin, so `lib/origin.ts` also
accepts `https://3000-$BASE44_PUBLIC_HOST_SUFFIX` — only when
`BASE44_PREVIEW_MODE === "1"`. Cross-site origins are still rejected (403) and
behaviour is unchanged when the variable is unset.

Probe it without creating data (401 = origin accepted, 403 = rejected):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE -H "Origin: https://evil.example" \
  "https://3000-$BASE44_PUBLIC_HOST_SUFFIX/api/watchlists/probe-id"   # expect 403
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE \
  -H "Origin: https://3000-$BASE44_PUBLIC_HOST_SUFFIX" \
  "https://3000-$BASE44_PUBLIC_HOST_SUFFIX/api/watchlists/probe-id"   # expect 401
```

## Tests

```bash
docker compose -f docker-compose.base44.yml exec -T web sh -ec 'npm run typecheck'
docker compose -f docker-compose.base44.yml exec -T web sh -ec 'npm test'
docker compose -f docker-compose.base44.yml exec -T web sh -ec 'npm run test:e2e'
```

`npm run test:e2e` drives the running app on `localhost:3000` and needs the
`web` *and* `worker` services up (it waits for the worker to index a watched
address and deliver an alert). It creates its own account and removes every row
it created afterwards, including the audit rows and rate-limit counters that are
not linked to that account — confirm with a count of `User`, `AuditEvent`,
`EmailMessage`, `Alert`, `MonitorEvent` and `RateLimitBucket` if you change it.

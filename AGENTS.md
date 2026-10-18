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

- **The repo shipped without a lockfile.** `install` runs `npm install` (not
  `npm ci`) from the repo root, which writes `package-lock.json` into the
  bind-mounted checkout; that file is committed here so later installs are
  reproducible. Re-run `up -d` after changing dependencies.
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

## Environment and secrets

- `.env.base44-defaults` holds development placeholders only. It is loaded
  **before** `/run/base44/app.env`, so any value from the Base44 dashboard always
  wins. `.gitignore` carries an explicit `!.env.base44-defaults` negation.
- `DATABASE_URL` is generated for the sandbox and wired inline in compose
  (`chainsync` / `chainsync_dev_password` on service `db`) — it is deliberately
  not in an env file, and it is never a Base44 secret.
- `SESSION_SECRET` must be ≥32 bytes; `lib/session.ts` throws otherwise. Auth
  endpoints fail with a 500 if it is missing or too short.
- `ADMIN_EMAILS` is the comma-separated administrator allowlist read by
  `lib/admin.ts` (`ADMIN_EMAILS=richbloodtech247@gmail.com` in
  `.env.base44-defaults`). An allowlisted account is served — and promoted once,
  on its next authenticated request — as `ADMIN`; every other account keeps its
  stored role. It is configuration, not a credential, but a value in
  `/run/base44/app.env` still wins because it is loaded after the defaults file.
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
```

## Sync projects and admin panel

- `Project` carries `ProjectStatus` (`ACTIVE` / `PENDING` / `COMPLETE`) plus
  `progress`, `network` and `lastSyncedAt`. Migration
  `20261018041500_project_sync_status` creates the enum and the table; `up -d`
  applies it through the `migrate` service.
- Routes: `/api/projects` (GET, POST), `/api/projects/:id` (PATCH, DELETE — owner
  scoped), `/api/admin/overview` (GET — administrator only, 403 otherwise).
- Pages: `/dashboard` (projects for the signed-in account) and `/admin`
  (every account and project). Both poll every 5 seconds, so state written by the
  API appears without a reload.
- "Needs attention" means pending, or active with no recorded sync in the last 15
  minutes. A status or progress change stamps `lastSyncedAt`. There is no
  background indexer in this repo, so nothing advances progress on its own — the
  dashboard shows recorded state plus live RPC chain tips.
- Administrator access is granted by `ADMIN_EMAILS`. To verify it without
  touching a real inbox: add a throwaway address to `ADMIN_EMAILS`, recreate
  `web`, register that address, confirm `/api/admin/overview` answers 200, then
  remove the address and recreate `web` again. A non-allowlisted account must
  receive 403.

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/admin/overview   # 403 signed out
docker compose -f docker-compose.base44.yml exec -T web sh -ec 'npx prisma migrate status'
docker compose -f docker-compose.base44.yml exec -T web sh -ec \
  'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script'  # expect "empty"
```

## Full-page loads (verification quirk)

The pages link with plain `<a href>` (no `next/link`), so moving between routes is
a **full document load**, not a client-side transition. A browser-automation script
that navigates mid-run is killed by the load and loses its result. Either end the
script on the navigation and assert on the freshly loaded route in the next run, or
stay on one route and exercise the same endpoints with a same-origin `fetch` from
the app's own page (the browser still sends a real `Origin` header, so
`lib/origin.ts` is genuinely covered).

`next build` must not be run inside the running `web` container: it overwrites the
`.next` directory the dev server is using. Build an isolated copy instead (copy the
source to `/tmp`, symlink `/app/node_modules`, then `npx next build`).

Routes added after the browser has loaded the app are also not reachable by the
platform's automated route change: it rewrites the URL but the new route does not
render, and a forced document load ends the carried-over state — the next call
starts at `/` with the browser session cleared. A signed-in page therefore cannot
be driven across calls. Load the route and drive it inside the same call, or
exercise the same endpoints with a same-origin `fetch` and assert on what
persisted (the server-side role check is the real gate).

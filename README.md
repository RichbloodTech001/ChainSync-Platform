# ChainSync Platform

ChainSync is a responsive, read-only blockchain monitoring foundation for Ethereum Mainnet and Sepolia. It reads public chain data and never asks for seed phrases or private keys, signs transactions, or takes custody of assets.

## Implemented in this repository

- Responsive monitoring dashboard and local interface preview.
- Public native ETH balance lookup at `/wallet-check`.
- Live RPC connectivity checks, chain-ID verification, response latency, and latest-block status at `/network-status`.
- Transaction hash lookup at `/transaction-check`, including sender, recipient, native value, block, confirmations and available receipt status.
- Read-only API endpoints for health, supported networks, balances and transaction details.
- Account registration, sign-in, sign-out and current-session endpoints.
- Bcrypt password hashing and signed, expiring HttpOnly session cookies.
- Authenticated, owner-scoped persistent watchlists for public EVM addresses on Ethereum Mainnet and Sepolia.
- Sync project tracking: a `Project` model with a `ProjectStatus` enum (`ACTIVE`, `PENDING`, `COMPLETE`), a live sync-progress dashboard at `/dashboard`, and an administrator panel at `/admin`.
- PostgreSQL Prisma schema and initial migration.
- Vitest input-validation tests and GitHub Actions verification workflow.

## Local setup

1. Install Node.js 20+ and PostgreSQL.
2. Copy `.env.example` to `.env.local`.
3. Set `DATABASE_URL` to your PostgreSQL database.
4. Generate a cryptographically random `SESSION_SECRET` of at least 32 bytes. Do not use the example placeholder in production.
5. Optionally configure `ETHEREUM_RPC_URL` and `SEPOLIA_RPC_URL` with reputable RPC provider endpoints. Do not commit provider credentials.
6. Run `npm install`.
7. For a new, empty database, run `npm run db:generate` then `npm run db:deploy`. Review the migration history before applying to any existing database.
8. Run `npm run typecheck`, `npm test`, `npm run build`, then `npm run dev`.

## API overview

- `GET /api/health`
- `GET /api/networks`
- `GET /api/balance?address=0x...&network=ethereum`
- `GET /api/transaction?hash=0x...&network=ethereum`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/watchlists`
- `POST /api/watchlists`
- `DELETE /api/watchlists/:id`
- `GET /api/projects`, `POST /api/projects`, `PATCH /api/projects/:id`, `DELETE /api/projects/:id`
- `GET /api/admin/overview` (administrator accounts only)

Full request details and readiness limitations are in [docs/API.md](docs/API.md).

## Not yet production-ready

This is an actively built foundation, not a certified or fully production-ready service. Email verification, password reset/account recovery, shared distributed rate limiting, a real-time event indexer, reliable scheduled monitoring, alert rules and delivery, API-key lifecycle/usage limits, admin operations, automated browser/end-to-end tests, deployment configuration, backups/restore drills, observability, and independent security review remain incomplete. Public RPC fallbacks are for development and may impose limits or become unavailable. CI results must be checked on the Actions page before release.

Never commit secrets. Public registration must never grant admin. Use staging, reviewed migrations, database backups and restore testing before launch.

# ChainSync Platform

Responsive, read-only blockchain monitoring starter for Ethereum Mainnet and Sepolia. ChainSync uses public blockchain data and never requests seed phrases/private keys or signs transactions.

## Stack
Next.js 14 App Router, React, TypeScript, Wagmi/Viem, Prisma, PostgreSQL.

## Local setup
1. Install Node.js 20+ and PostgreSQL.
2. Copy `.env.example` to `.env.local` and set configuration.
3. Run `npm install`.
4. Run `npm run db:generate` and `npm run db:migrate`.
5. Run `npm run dev` and visit http://localhost:3000.

## Important status
This is an initial foundation, not a certified production service. Authentication endpoints, persistent watchlist API, transaction/token indexing, reliable background monitoring, alert delivery, account recovery/email verification, CSRF/origin protection, distributed rate limiting, automated browser tests, production deployment and independent security review must be implemented and verified before public launch.

Never commit secrets. Public registration must never grant admin. Use staging and database backups before migrations.
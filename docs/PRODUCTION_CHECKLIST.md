# Production release checklist

Do not mark this project production-ready until every relevant item is implemented and verified in staging.

- [ ] Provision PostgreSQL and configure DATABASE_URL in the hosting secret manager.
- [ ] Set a unique random SESSION_SECRET (minimum 32 characters); never commit secrets.
- [ ] Configure reliable Ethereum/Sepolia RPC endpoints and provider limits.
- [ ] Apply reviewed Prisma migrations to staging; test backup and restore.
- [ ] Implement authentication/session handling and authorization checks for all private APIs.
- [ ] Implement account verification/recovery and CSRF/origin protection for state-changing endpoints.
- [ ] Replace in-memory rate limits with shared storage before horizontal scaling.
- [ ] Implement background worker for address activity indexing, retries and deduplication.
- [ ] Implement transaction/token indexing with pagination, rate limits and data provenance.
- [ ] Implement alert rules and real delivery provider with retries and delivery logs.
- [ ] Bootstrap admin only through controlled operation; public registration must never grant admin.
- [ ] Run unit, integration, authorization, accessibility and browser end-to-end tests.
- [ ] Run dependency/security scans and independent security review.
- [ ] Configure logging, monitoring, backups, retention/deletion and incident response.
- [ ] Verify no logs contain passwords, session tokens, private keys or seed phrases.
- [ ] Verify responsive layouts and keyboard accessibility.

ChainSync is read-only and non-custodial: no custody, seed phrase collection, private-key collection, signing, transfers or token approvals.
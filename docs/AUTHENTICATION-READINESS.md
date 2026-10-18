# Authentication and persistent watchlists

The Prisma schema already defines `User` and `WatchAddress`, but the current dashboard still stores its visible watchlist in browser memory. Do not present that local list as a saved account watchlist.

Before enabling accounts, implement all of the following as one reviewed change:
- Password hashing with a maintained password-hashing library (Argon2id preferred; bcrypt is acceptable with calibrated cost).
- Signed, expiring, HttpOnly, Secure-in-production, SameSite session cookies; never store session tokens in localStorage.
- Registration, login, logout, and current-session endpoints with generic login errors, request-size limits, input validation, and throttling.
- Per-request session verification and owner-scoped watchlist CRUD. Never accept a user ID from the browser as authorization.
- Email verification and a safe password-reset flow before public launch.
- Database migration and deployment procedure tested against a disposable PostgreSQL database.
- Tests for unauthenticated access, cross-user access, duplicate addresses, malformed input, session expiry, and password handling.

`SESSION_SECRET` must be generated from a cryptographically secure random source and kept in deployment secrets. Never commit credentials or log password hashes, cookies, tokens, or RPC URLs containing credentials.

Until those steps and CI are verified, the account and watchlist features must remain marked as not production-ready.

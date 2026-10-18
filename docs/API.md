# ChainSync API (initial read-only endpoints)

Base URL for local development: `http://localhost:3000`.

## Health

`GET /api/health`

Returns a liveness response and timestamp. It does not disclose secret configuration and does not prove database or RPC readiness.

## Supported networks

`GET /api/networks`

Returns Ethereum Mainnet (chain ID 1) and Sepolia (chain ID 11155111). The `configured` flag only reports whether an environment variable was supplied; it does not verify provider connectivity.

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

## Security and readiness notes

These endpoints are read-only and never request keys or sign transactions. Public RPC fallbacks are included for development convenience; for production, configure a reputable RPC provider with documented quotas and monitoring.

The balance endpoint is currently a public endpoint without account authentication or a distributed rate limiter. Before public production deployment, put it behind edge/API rate limits and abuse monitoring. Authentication, persistent watchlists, transaction indexing, alert processing, and delivery are not implemented by these endpoints.

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * End-to-end tests. These exercise a RUNNING app over HTTP and inspect the same
 * database for queues/outbox evidence, so they need:
 *
 *   - the app reachable at E2E_BASE_URL (default http://localhost:3000),
 *   - DATABASE_URL pointing at the database that app uses,
 *   - the monitoring worker running (`npm run worker:start`) for the indexing and
 *     alert-delivery checks.
 *
 * Run with `npm run test:e2e`. Tests run sequentially: they share one account.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});

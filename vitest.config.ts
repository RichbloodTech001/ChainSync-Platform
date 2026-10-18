import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests: pure validation and helper logic that needs no running server.
 * End-to-end tests against a live app use vitest.e2e.config.ts (`npm run test:e2e`).
 */
export default defineConfig({
  // Mirrors the `@/*` path alias from tsconfig.json so tests can import app modules.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["app/**/*.test.ts", "lib/**/*.test.ts"],
    exclude: ["node_modules/**", "tests/e2e/**"],
  },
});

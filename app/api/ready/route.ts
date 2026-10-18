import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runtimeConfig } from "@/lib/env";
import { workerHealth } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Readiness probe: reports whether this instance can serve authenticated,
 * data-backed requests. Deployment platforms should route traffic only when it
 * returns 200. No configuration values are disclosed — only whether they exist.
 */
export async function GET() {
  const config = runtimeConfig();
  let database = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unavailable";
  }

  const worker = await workerHealth();
  const ok = config.databaseConfigured && config.sessionSecretConfigured && database === "ok";

  return NextResponse.json(
    {
      ok,
      service: "chainsync-api",
      timestamp: new Date().toISOString(),
      checks: {
        configuration: {
          database: config.databaseConfigured,
          sessionSecret: config.sessionSecretConfigured,
          emailProvider: config.emailProvider,
          rpc: config.rpc,
        },
        database,
        worker: { heartbeatAt: worker.heartbeatAt, stale: worker.stale },
      },
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

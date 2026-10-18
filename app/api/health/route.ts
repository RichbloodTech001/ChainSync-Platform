import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Liveness only. This endpoint intentionally does not disclose environment values.
  return NextResponse.json(
    { ok: true, service: "chainsync-api", timestamp: new Date().toISOString(), mode: "read-only" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

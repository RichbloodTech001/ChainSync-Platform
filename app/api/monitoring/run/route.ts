import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { rateLimit, rateLimitResponse, requestKey } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/origin";
import { audit } from "@/lib/audit";
import { runMonitoringCycle } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runs one monitoring cycle immediately instead of waiting for the worker's
 * interval. Reserved for administrators; in the Base44 preview any signed-in
 * account may run it so the monitoring pipeline can be exercised end to end.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to run a monitoring cycle." }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const permitted = user.role === "ADMIN" || process.env.BASE44_PREVIEW_MODE === "1";
  if (!permitted) {
    return NextResponse.json({ error: "Manual monitoring runs require an administrator account." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const rate = await rateLimit(`monitoring-run:${user.id}`, 10, 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);

  try {
    const summary = await runMonitoringCycle();
    await audit({ actorId: user.id, action: "monitoring.cycle_run", targetType: "worker", metadata: { events: summary.indexing.events, alerts: summary.indexing.alerts } });
    return NextResponse.json({ ok: true, summary }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The monitoring cycle could not complete." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";
import { isSameOrigin } from "@/lib/origin";
import { rateLimit, rateLimitResponse, requestKey } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage saved addresses." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const rate = await rateLimit(requestKey(request, "watchlist-write"), 60, 60 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);
  const id = context.params.id;
  if (!id || id.length > 100) return NextResponse.json({ error: "Invalid watchlist item." }, { status: 400 });
  try {
    const result = await prisma.watchAddress.deleteMany({ where: { id, userId: user.id } });
    if (!result.count) return NextResponse.json({ error: "Watchlist item not found." }, { status: 404 });
    await audit({ actorId: user.id, action: "watchlist.removed", targetType: "watchAddress", targetId: id });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to remove this address right now." }, { status: 503 });
  }
}

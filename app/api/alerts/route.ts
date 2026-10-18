import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Alerts delivered to the signed-in account (in-app delivery is immediate). */
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to view your alerts." }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const unreadOnly = request.nextUrl.searchParams.get("unread") === "1";
  const requested = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const take = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 100) : 50;

  try {
    const [items, unreadCount] = await Promise.all([
      prisma.alert.findMany({
        where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          kind: true,
          severity: true,
          title: true,
          body: true,
          chainId: true,
          watchAddressId: true,
          payload: true,
          emailStatus: true,
          emailAttempts: true,
          emailedAt: true,
          readAt: true,
          createdAt: true,
        },
      }),
      prisma.alert.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return NextResponse.json({ items, unreadCount }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Alerts are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

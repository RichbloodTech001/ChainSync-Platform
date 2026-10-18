import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";
import { isSameOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Marks alerts as read. Body: { all: true } or { ids: string[] }. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage your alerts." }, { status: 401, headers: { "Cache-Control": "no-store" } });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 }); }
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const ids = Array.isArray(data.ids) ? data.ids.filter((id): id is string => typeof id === "string").slice(0, 100) : null;
  if (data.all !== true && (!ids || !ids.length)) {
    return NextResponse.json({ error: "Provide alert ids or set all to true." }, { status: 400 });
  }

  try {
    const result = await prisma.alert.updateMany({
      where: { userId: user.id, readAt: null, ...(data.all === true ? {} : { id: { in: ids as string[] } }) },
      data: { readAt: new Date() },
    });
    const unreadCount = await prisma.alert.count({ where: { userId: user.id, readAt: null } });
    return NextResponse.json({ ok: true, updated: result.count, unreadCount }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to update alerts right now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

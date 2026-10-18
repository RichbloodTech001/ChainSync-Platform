import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to manage saved addresses." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const id = context.params.id;
  if (!id || id.length > 100) return NextResponse.json({ error: "Invalid watchlist item." }, { status: 400 });
  try {
    const result = await prisma.watchAddress.deleteMany({ where: { id, userId } });
    if (!result.count) return NextResponse.json({ error: "Watchlist item not found." }, { status: 404 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to remove this address right now." }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { currentUser, publicUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentUser();
    return NextResponse.json({ user: user ? publicUser(user) : null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Session service is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

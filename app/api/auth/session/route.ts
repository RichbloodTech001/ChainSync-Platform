import { NextResponse } from "next/server";
import { currentUser } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentUser();
    return NextResponse.json(
      { user: user ? { id: user.id, email: user.email, displayName: user.displayName, role: user.role } : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Session service is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

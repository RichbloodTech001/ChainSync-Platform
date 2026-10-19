import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitResponse, requestKey } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/origin";
import { audit } from "@/lib/audit";
import { sendAccountEmail, sendPasswordResetEmail } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Requests a password reset link. The response is always the same whether or not
 * the address has an account, so this endpoint cannot be used to enumerate users.
 */
export async function POST(request: NextRequest) {
  const rate = await rateLimit(requestKey(request, "password-reset"), 5, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 }); }
  const email = body && typeof body === "object" ? (body as Record<string, unknown>).email : undefined;
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized || normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const generic = NextResponse.json(
    { ok: true, message: "If an account exists for that address, a reset link has been sent." },
    { headers: { "Cache-Control": "no-store" } },
  );

  try {
    // Per-address budget as well as the per-client budget above.
    const perAddress = await rateLimit(`password-reset-address:${normalized}`, 3, 60 * 60 * 1000);
    if (!perAddress.allowed) return generic;

    const user = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true, email: true, displayName: true } });
    if (user) {
      await sendAccountEmail("password_reset", () => sendPasswordResetEmail(user));
      await audit({ actorId: user.id, action: "auth.password_reset_requested", targetType: "user", targetId: user.id });
    } else {
      await audit({ action: "auth.password_reset_requested_unknown_address", targetType: "user" });
    }
    return generic;
  } catch {
    return NextResponse.json({ error: "Password recovery is temporarily unavailable. Try again shortly." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

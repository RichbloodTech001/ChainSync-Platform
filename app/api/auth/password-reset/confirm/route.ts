import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { consumeEmailToken } from "@/lib/tokens";
import { rateLimit, rateLimitResponse, requestKey } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/origin";
import { audit } from "@/lib/audit";
import { SESSION_COOKIE } from "@/lib/session";
import { sendAccountEmail, sendPasswordChangedEmail } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Completes a password reset with the single-use token from the email.
 * Changing the password bumps the account's session epoch, which signs out every
 * existing session, and deletes any other pending reset tokens for the account.
 */
export async function POST(request: NextRequest) {
  const rate = await rateLimit(requestKey(request, "password-reset-confirm"), 10, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 }); }
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const token = typeof data.token === "string" ? data.token : "";
  const password = typeof data.password === "string" ? data.password : "";
  if (!token) return NextResponse.json({ error: "A reset token is required." }, { status: 400 });
  if (password.length < 12 || password.length > 128) return NextResponse.json({ error: "Password must be between 12 and 128 characters." }, { status: 400 });

  try {
    const consumed = await consumeEmailToken(token, "PASSWORD_RESET");
    if (!consumed) {
      return NextResponse.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const passwordHash = await hash(password, 12);
    const user = await prisma.user.update({
      where: { id: consumed.userId },
      data: { passwordHash, sessionEpoch: { increment: 1 } },
      select: { id: true, email: true, displayName: true },
    });
    await prisma.emailToken.updateMany({
      where: { userId: user.id, purpose: "PASSWORD_RESET", consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await audit({ actorId: user.id, action: "auth.password_reset_completed", targetType: "user", targetId: user.id });
    await sendAccountEmail("password_changed", () => sendPasswordChangedEmail(user));

    const response = NextResponse.json(
      { ok: true, email: user.email, sessionsInvalidated: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    // The caller's own session is now stale; clear it rather than leave a dud cookie.
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ error: "Password recovery is temporarily unavailable. Try again shortly." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

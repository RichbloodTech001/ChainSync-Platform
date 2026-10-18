import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeEmailToken } from "@/lib/tokens";
import { rateLimit, rateLimitResponse, requestKey } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/origin";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Confirms an email address with the single-use token from the verification email. */
export async function POST(request: NextRequest) {
  const rate = await rateLimit(requestKey(request, "verify-email"), 10, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 }); }
  const token = body && typeof body === "object" ? (body as Record<string, unknown>).token : undefined;
  if (typeof token !== "string" || !token) return NextResponse.json({ error: "A verification token is required." }, { status: 400 });

  try {
    const consumed = await consumeEmailToken(token, "EMAIL_VERIFICATION");
    if (!consumed) {
      return NextResponse.json({ error: "This verification link is invalid or has expired. Request a new one." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const user = await prisma.user.update({
      where: { id: consumed.userId },
      data: { emailVerifiedAt: new Date() },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    await audit({ actorId: user.id, action: "auth.email_verified", targetType: "user", targetId: user.id });
    return NextResponse.json(
      { ok: true, email: user.email, verifiedAt: user.emailVerifiedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Verification is temporarily unavailable. Try again shortly." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

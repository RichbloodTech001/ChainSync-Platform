import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitResponse, requestKey } from "@/lib/rate-limit";
import { createSession, SESSION_COOKIE, sessionCookieOptions, publicUser } from "@/lib/session";
import { isSameOrigin } from "@/lib/origin";
import { audit } from "@/lib/audit";
import { sendAccountEmail, sendVerificationEmail } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rate = await rateLimit(requestKey(request, "register"), 5, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  const data = body as Record<string, unknown>;
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const password = typeof data.password === "string" ? data.password : "";
  const displayName = typeof data.displayName === "string" ? data.displayName.trim().slice(0, 80) : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (password.length < 12 || password.length > 128) return NextResponse.json({ error: "Password must be between 12 and 128 characters." }, { status: 400 });
  try {
    const passwordHash = await hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName: displayName || null },
      select: { id: true, email: true, displayName: true, role: true, emailVerifiedAt: true, sessionEpoch: true },
    });
    const token = await createSession(user.id, user.sessionEpoch);
    // Sending the verification email must never fail the registration itself.
    const delivery = await sendAccountEmail("email_verification", () =>
      sendVerificationEmail({ id: user.id, email: user.email, displayName: user.displayName }),
    );
    await audit({ actorId: user.id, action: "auth.register", targetType: "user", targetId: user.id, metadata: { emailDelivery: delivery?.status ?? "skipped" } });
    const response = NextResponse.json(
      { user: publicUser(user), verificationEmailSent: delivery?.status !== "failed" },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Account creation is temporarily unavailable. Check server configuration and try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

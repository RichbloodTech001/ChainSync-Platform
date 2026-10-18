import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitResponse, requestKey } from "@/lib/rate-limit";
import { createSession, SESSION_COOKIE, sessionCookieOptions, publicUser } from "@/lib/session";
import { isSameOrigin } from "@/lib/origin";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rate = await rateLimit(requestKey(request, "login"), 10, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  const data = body as Record<string, unknown>;
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const password = typeof data.password === "string" ? data.password : "";
  if (!email || email.length > 254 || !password || password.length > 128) return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user ? await compare(password, user.passwordHash) : false;
    if (!user || !valid) {
      await audit({ action: "auth.login_failed", targetType: "user", metadata: { emailDomain: email.split("@")[1] ?? null } });
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const token = await createSession(user.id, user.sessionEpoch);
    await audit({ actorId: user.id, action: "auth.login", targetType: "user", targetId: user.id });
    const response = NextResponse.json({ user: publicUser(user) }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch {
    return NextResponse.json({ error: "Sign-in is temporarily unavailable. Check server configuration and try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

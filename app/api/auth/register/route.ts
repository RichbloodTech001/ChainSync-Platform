import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit, requestKey } from "@/lib/rate-limit";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { isSameOrigin } from "@/lib/origin";
import { effectiveRole } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rate = rateLimit(requestKey(request, "register"), 5, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
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
    const user = await prisma.user.create({ data: { email, passwordHash, displayName: displayName || null, role: effectiveRole(email, "USER") }, select: { id: true, email: true, displayName: true, createdAt: true } });
    const token = await createSession(user.id);
    const response = NextResponse.json({ user }, { status: 201, headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Account creation is temporarily unavailable. Check server configuration and try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

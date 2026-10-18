import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { rateLimit, rateLimitResponse, requestKey } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/origin";
import { audit } from "@/lib/audit";
import { sendAccountEmail, sendVerificationEmail } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Re-sends the verification email to the signed-in account. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to resend your verification email." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const rate = await rateLimit(`resend-verification:${user.id}`, 3, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true }, { headers: { "Cache-Control": "no-store" } });

  const delivery = await sendAccountEmail("email_verification", () =>
    sendVerificationEmail({ id: user.id, email: user.email, displayName: user.displayName }),
  );
  await audit({ actorId: user.id, action: "auth.verification_email_sent", targetType: "user", targetId: user.id, metadata: { emailDelivery: delivery?.status ?? "skipped" } });
  if (delivery?.status === "failed") {
    return NextResponse.json({ error: "The verification email could not be sent. Try again shortly." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true, sent: true }, { headers: { "Cache-Control": "no-store" } });
}

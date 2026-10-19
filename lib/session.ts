import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "chainsync_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: "USER" | "ADMIN";
  emailVerifiedAt: Date | null;
  sessionEpoch: number;
};

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 bytes.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string, sessionEpoch = 0) {
  return new SignJWT({ purpose: "chainsync-session", epoch: sessionEpoch })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer("chainsync")
    .setAudience("chainsync-web")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(secretKey());
}

export async function readSession(token?: string | null): Promise<{ userId: string; epoch: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "chainsync",
      audience: "chainsync-web",
      algorithms: ["HS256"],
    });
    if (payload.purpose !== "chainsync-session" || typeof payload.sub !== "string") return null;
    return { userId: payload.sub, epoch: typeof payload.epoch === "number" ? payload.epoch : 0 };
  } catch {
    return null;
  }
}

/**
 * The signed-in account, or null. A token is only accepted while its session
 * epoch matches the account's current epoch, so changing or resetting a password
 * invalidates every session that was issued earlier.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await readSession(cookies().get(SESSION_COOKIE)?.value);
  if (!session) return null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, displayName: true, role: true, emailVerifiedAt: true, sessionEpoch: true },
    });
    if (!user || user.sessionEpoch !== session.epoch) return null;
    return user;
  } catch {
    return null;
  }
}

export async function currentUserId() {
  return (await currentUser())?.id ?? null;
}

/** Shape returned to clients: never includes the password hash or session epoch. */
export function publicUser(user: SessionUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
  };
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_SECONDS,
};

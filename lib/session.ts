import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "chainsync_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 bytes.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string) {
  return new SignJWT({ purpose: "chainsync-session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer("chainsync")
    .setAudience("chainsync-web")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(secretKey());
}

export async function readSession(token?: string | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "chainsync",
      audience: "chainsync-web",
      algorithms: ["HS256"],
    });
    return payload.purpose === "chainsync-session" && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function currentUserId() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return readSession(token);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_SECONDS,
};

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import type { EmailTokenPurpose } from "@prisma/client";

/**
 * Single-use email tokens (address verification, password reset).
 *
 * Only the SHA-256 digest is stored; the raw token exists solely in the email
 * that was sent. Tokens expire and issuing a new one invalidates the previous
 * live token for the same purpose, so an old email cannot be replayed.
 */
export const TOKEN_TTL_MINUTES: Record<EmailTokenPurpose, number> = {
  EMAIL_VERIFICATION: 60 * 24,
  PASSWORD_RESET: 60,
};

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export async function issueEmailToken(userId: string, purpose: EmailTokenPurpose) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES[purpose] * 60_000);
  await prisma.emailToken.updateMany({
    where: { userId, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.emailToken.create({ data: { userId, purpose, tokenHash: hashToken(token), expiresAt } });
  return { token, expiresAt };
}

/** Consumes a token and returns its owner, or null when it is invalid/expired/used. */
export async function consumeEmailToken(rawToken: string, purpose: EmailTokenPurpose) {
  if (!rawToken || rawToken.length > 200) return null;
  const record = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!record || record.purpose !== purpose || record.consumedAt || record.expiresAt <= new Date()) return null;
  const consumed = await prisma.emailToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (!consumed.count) return null;
  return { userId: record.userId };
}

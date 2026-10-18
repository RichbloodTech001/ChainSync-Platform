import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/session";

/**
 * Emails that are recognised as administrators. Configured with ADMIN_EMAILS
 * (comma-separated) so no address is baked into the application code.
 */
export function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}

/** An allowlisted email is always ADMIN; every other account keeps its stored role. */
export function effectiveRole(email: string, role: string): "USER" | "ADMIN" {
  return role === "ADMIN" || isAdminEmail(email) ? "ADMIN" : "USER";
}

export type SessionUser = { id: string; email: string; displayName: string | null; role: "USER" | "ADMIN"; createdAt: Date };

/**
 * Signed-in user for server code, with administrator recognition applied.
 * An allowlisted account is promoted once, on its next authenticated request.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, displayName: true, role: true, createdAt: true },
  });
  if (!user) return null;
  const role = effectiveRole(user.email, user.role);
  if (role !== user.role) {
    try { await prisma.user.update({ where: { id: user.id }, data: { role } }); } catch { /* served with the effective role below */ }
  }
  return { ...user, role };
}

/** Returns the signed-in administrator, or null for anonymous and non-admin requests. */
export async function currentAdmin(): Promise<SessionUser | null> {
  const user = await currentUser();
  return user && user.role === "ADMIN" ? user : null;
}

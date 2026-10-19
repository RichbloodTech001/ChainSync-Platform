import { prisma } from "./prisma";
import { errorMessage, log } from "./log";

/**
 * Append-only record of account and monitoring actions. Never store passwords,
 * tokens or other credentials in `metadata`.
 */
export async function audit(input: {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  try {
    await prisma.auditEvent.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (error) {
    log("warn", "audit.write_failed", { action: input.action, error: errorMessage(error) });
  }
}

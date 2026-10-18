import { prisma } from "./prisma";
import { errorMessage, log, maskEmail } from "./log";

export type EmailResult = { status: "sent" | "queued" | "failed"; provider: "smtp" | "outbox"; error?: string };

/**
 * Email transport.
 *
 * - `smtp`: SMTP_HOST (and optional SMTP_PORT/SMTP_USER/SMTP_PASSWORD/SMTP_FROM)
 *   is configured, so messages are handed to that server.
 * - `outbox`: no SMTP is configured, so the rendered message is stored in the
 *   EmailMessage table instead of being dropped — the development "outbox". This
 *   keeps account verification, password reset and alert delivery testable
 *   without credentials; configure SMTP to deliver for real.
 *
 * Every attempt is recorded in EmailMessage for audit and deliverability review.
 */
export function emailProvider(): "smtp" | "outbox" {
  return process.env.SMTP_HOST ? "smtp" : "outbox";
}

async function deliver(to: string, subject: string, body: string): Promise<EmailResult> {
  if (emailProvider() === "outbox") return { status: "queued", provider: "outbox" };
  try {
    const { createTransport } = await import("nodemailer");
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transport = createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM || "ChainSync <no-reply@chainsync.local>",
      to,
      subject,
      text: body,
    });
    return { status: "sent", provider: "smtp" };
  } catch (error) {
    return { status: "failed", provider: "smtp", error: errorMessage(error).slice(0, 300) };
  }
}

export async function sendEmail(input: { to: string; subject: string; body: string; kind: string }): Promise<EmailResult> {
  const result = await deliver(input.to, input.subject, input.body);
  try {
    await prisma.emailMessage.create({
      data: {
        to: input.to,
        subject: input.subject,
        body: input.body,
        kind: input.kind,
        status: result.status === "sent" ? "SENT" : result.status === "queued" ? "QUEUED" : "FAILED",
        provider: result.provider,
        error: result.error ?? null,
        attempts: 1,
        sentAt: result.status === "sent" ? new Date() : null,
      },
    });
  } catch (error) {
    log("error", "email.record_failed", { kind: input.kind, error: errorMessage(error) });
  }
  log(result.status === "failed" ? "error" : "info", "email.dispatch", {
    kind: input.kind,
    to: maskEmail(input.to),
    provider: result.provider,
    status: result.status,
    error: result.error,
  });
  return result;
}

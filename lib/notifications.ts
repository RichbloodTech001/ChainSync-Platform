import { appUrl } from "./app-url";
import { issueEmailToken } from "./tokens";
import { sendEmail, type EmailResult } from "./email";
import { errorMessage, log } from "./log";

type Recipient = { id: string; email: string; displayName: string | null };

const SIGNATURE = "\n\n— ChainSync\nRead-only blockchain monitoring. We never ask for private keys or recovery phrases.\n";

function greeting(displayName: string | null) {
  return displayName ? `Hi ${displayName},` : "Hello,";
}

export async function sendVerificationEmail(user: Recipient): Promise<EmailResult | null> {
  const { token, expiresAt } = await issueEmailToken(user.id, "EMAIL_VERIFICATION");
  const link = appUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  return sendEmail({
    to: user.email,
    subject: "Confirm your ChainSync email address",
    kind: "email_verification",
    body: `${greeting(user.displayName)}\n\nConfirm this address to finish setting up your ChainSync account:\n${link}\n\nThis link expires ${expiresAt.toUTCString()} and can be used once. If you did not create an account, ignore this email.${SIGNATURE}`,
  });
}

export async function sendPasswordResetEmail(user: Recipient): Promise<EmailResult | null> {
  const { token, expiresAt } = await issueEmailToken(user.id, "PASSWORD_RESET");
  const link = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  return sendEmail({
    to: user.email,
    subject: "Reset your ChainSync password",
    kind: "password_reset",
    body: `${greeting(user.displayName)}\n\nUse this single-use link to choose a new password:\n${link}\n\nIt expires ${expiresAt.toUTCString()}. All other sessions stay valid until the password is actually changed — changing the password signs out every existing session. If you did not request this, no action is needed.${SIGNATURE}`,
  });
}

export async function sendPasswordChangedEmail(user: Recipient): Promise<EmailResult | null> {
  return sendEmail({
    to: user.email,
    subject: "Your ChainSync password was changed",
    kind: "password_changed",
    body: `${greeting(user.displayName)}\n\nYour ChainSync password was changed and every existing session was signed out. If this was not you, reset your password immediately.${SIGNATURE}`,
  });
}

export async function sendAlertEmail(
  user: Recipient,
  alert: { title: string; body: string; severity: string; kind: string },
): Promise<EmailResult | null> {
  return sendEmail({
    to: user.email,
    subject: `[ChainSync] ${alert.title}`,
    kind: "watch_alert",
    body: `${greeting(user.displayName)}\n\n${alert.body}\n\nSeverity: ${alert.severity}\nOpen your alerts: ${appUrl("/alerts")}${SIGNATURE}`,
  });
}

/**
 * Account emails must never block or fail a user-facing request: the message is
 * recorded (and queued in the development outbox) even if no SMTP is configured.
 */
export async function sendAccountEmail(
  label: string,
  send: () => Promise<EmailResult | null>,
): Promise<EmailResult | null> {
  try {
    return await send();
  } catch (error) {
    log("error", "email.account_send_failed", { label, error: errorMessage(error) });
    return null;
  }
}

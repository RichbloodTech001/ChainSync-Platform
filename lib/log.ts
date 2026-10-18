/**
 * Minimal structured logger. One JSON object per line so a log collector can
 * index it, with secrets and personal data kept out of the output.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Any key holding a credential, a URL (which may embed one) or key material. */
const SENSITIVE_KEY = /(password|secret|token|authorization|cookie|private.?key|seed|mnemonic|database_url|api.?key|url|dsn|credential)/i;
/** Keys whose value is a recipient address and therefore personal data. */
const EMAIL_KEY = /^(to|email|emailaddress|recipient)$/i;

export function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, Math.min(6, local.length - head.length)))}@${domain}`;
}

export function maskAddress(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function sanitize(fields: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (SENSITIVE_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (EMAIL_KEY.test(key)) {
      out[key] = typeof value === "string" && value.includes("@") ? maskEmail(value) : "[redacted]";
      continue;
    }
    if (typeof value === "string" && value.length > 400) {
      out[key] = `${value.slice(0, 400)}…`;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...sanitize(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") {
    if (process.env.LOG_LEVEL === "debug") console.log(line);
  } else console.log(line);
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

import { NETWORKS, isRpcConfigured } from "./rpc";
import { emailProvider } from "./email";

export type RuntimeConfig = {
  databaseConfigured: boolean;
  sessionSecretBytes: number;
  sessionSecretConfigured: boolean;
  emailProvider: "smtp" | "outbox";
  previewMode: boolean;
  rpc: Record<string, { configured: boolean }>;
};

/**
 * Reports which required configuration is present without ever exposing a value.
 * Used by the readiness endpoint and by the worker at startup.
 */
export function runtimeConfig(): RuntimeConfig {
  const secret = process.env.SESSION_SECRET ?? "";
  return {
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    sessionSecretConfigured: Buffer.byteLength(secret, "utf8") >= 32,
    sessionSecretBytes: Buffer.byteLength(secret, "utf8"),
    emailProvider: emailProvider(),
    previewMode: process.env.BASE44_PREVIEW_MODE === "1",
    rpc: Object.fromEntries(NETWORKS.map((network) => [network.id, { configured: isRpcConfigured(network) }])),
  };
}

/** Fails fast (before serving traffic) when the app cannot authenticate safely. */
export function assertRuntimeEnv() {
  const config = runtimeConfig();
  const problems: string[] = [];
  if (!config.databaseConfigured) problems.push("DATABASE_URL is not set");
  if (!config.sessionSecretConfigured) problems.push("SESSION_SECRET must be at least 32 bytes");
  if (problems.length) throw new Error(`Invalid runtime configuration: ${problems.join("; ")}`);
  return config;
}

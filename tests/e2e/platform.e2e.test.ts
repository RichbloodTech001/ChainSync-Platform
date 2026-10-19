import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * End-to-end suite for the account, monitoring and delivery pipelines.
 *
 * Prerequisites (see vitest.e2e.config.ts): a running app at E2E_BASE_URL, a
 * DATABASE_URL pointing at the database that app uses, and the monitoring worker
 * running so indexing and alert delivery can be observed.
 *
 * The suite creates its own account, watches a funded Mainnet address, and
 * removes every row it created afterwards (the account delete cascades to its
 * watchlist, alerts, events and tokens).
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();

const startedAt = new Date();
const stamp = Date.now();
const email = `chainsync-e2e-${stamp}@example.com`;
const password = "chainsync-e2e-password-1";
const rotatedPassword = "chainsync-e2e-password-2";
/** Funded Mainnet address (vitalik.eth) so a balance change can be observed. */
const watchedAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
/** Distinct client address: gives this run its own rate-limit budget. */
const clientIp = `198.51.100.${(stamp % 200) + 1}`;

let userId: string | null = null;
let cookie = "";

type ApiResult = { status: number; body: Record<string, unknown> | null; text: string; headers: Headers };

async function api(
  path: string,
  options: RequestInit & { cookieOverride?: string; ip?: string } = {},
): Promise<ApiResult> {
  const { cookieOverride, ip, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", ip ?? clientIp);
  if (init.body) headers.set("content-type", "application/json");
  const activeCookie = cookieOverride ?? cookie;
  if (activeCookie) headers.set("cookie", activeCookie);

  const response = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  const setCookie = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  if (setCookie.length) {
    const session = setCookie.find((value) => value.startsWith("chainsync_session="));
    if (session) cookie = session.split(";")[0];
  }
  const text = await response.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = null;
  }
  return { status: response.status, body, text, headers: response.headers };
}

function tokenFromEmail(body: string, path: string) {
  const match = body.match(new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`));
  return match?.[1] ?? null;
}

async function latestEmail(kind: string) {
  return prisma.emailMessage.findFirst({
    where: { to: email, kind },
    orderBy: { createdAt: "desc" },
    select: { id: true, subject: true, body: true, status: true, provider: true },
  });
}

async function waitFor<T>(check: () => Promise<T | null>, timeoutMs = 100_000, intervalMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() > deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

afterAll(async () => {
  if (userId) await prisma.auditEvent.deleteMany({ where: { actorId: userId } });
  // Failed sign-ins against an unknown account carry no actor id, so they are
  // cleaned up by the window this run covered.
  await prisma.auditEvent.deleteMany({ where: { action: "auth.login_failed", createdAt: { gte: startedAt } } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.emailMessage.deleteMany({ where: { to: email } });
  await prisma.rateLimitBucket.deleteMany({ where: { key: { contains: clientIp } } });
  // Per-address counters (e.g. password-reset-address:<email>) are keyed by the
  // run's own email rather than its IP.
  await prisma.rateLimitBucket.deleteMany({ where: { key: { contains: email } } });
  await prisma.$disconnect();
});

describe("ChainSync end-to-end", () => {
  it("serves liveness and readiness probes", async () => {
    const health = await api("/api/health");
    expect(health.status).toBe(200);
    expect(health.body?.ok).toBe(true);

    const ready = await api("/api/ready");
    expect(ready.status).toBe(200);
    expect(ready.body?.ok).toBe(true);
    const checks = ready.body?.checks as { database?: string; configuration?: { sessionSecret?: boolean } } | undefined;
    expect(checks?.database).toBe("ok");
    expect(checks?.configuration?.sessionSecret).toBe(true);
  });

  it("reports RPC network status without leaking provider URLs", async () => {
    const response = await api("/api/networks");
    expect(response.status).toBe(200);
    const networks = response.body?.networks as Array<{ id: string; status: string; chainId: number }>;
    expect(networks.map((network) => network.id).sort()).toEqual(["ethereum", "sepolia"]);
    for (const network of networks) expect(["connected", "unavailable"]).toContain(network.status);
    // At least the network the monitoring check depends on must be reachable.
    expect(networks.some((network) => network.status === "connected")).toBe(true);
    expect(response.text).not.toMatch(/https?:\/\/(?!3000-)[a-z0-9.-]*(alchemy|infura|publicnode|cloudflare)/i);
  });

  it("registers an account and queues a verification email", async () => {
    const response = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName: "E2E Run" }),
    });
    expect(response.status).toBe(201);
    const user = response.body?.user as { id: string; emailVerified?: boolean } | undefined;
    expect(user?.id).toBeTruthy();
    expect(user?.emailVerified).toBe(false);
    userId = user?.id ?? null;
    expect(cookie).toContain("chainsync_session=");

    const message = await latestEmail("email_verification");
    expect(message).not.toBeNull();
    expect(message?.body).toContain("/verify-email?token=");
    expect(tokenFromEmail(message?.body ?? "", "/verify-email")).toBeTruthy();
  });

  it("verifies the email address once and rejects a replayed link", async () => {
    const message = await latestEmail("email_verification");
    const token = tokenFromEmail(message?.body ?? "", "/verify-email");
    expect(token).toBeTruthy();

    const first = await api("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
    expect(first.status).toBe(200);
    expect(first.body?.ok).toBe(true);

    const replay = await api("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
    expect(replay.status).toBe(400);

    const session = await api("/api/auth/session");
    expect(session.status).toBe(200);
    const user = session.body?.user as { email?: string; emailVerified?: boolean } | null;
    expect(user?.email).toBe(email);
    expect(user?.emailVerified).toBe(true);
  });

  it("saves, lists, deduplicates and removes a watched address", async () => {
    const created = await api("/api/watchlists", {
      method: "POST",
      body: JSON.stringify({ address: watchedAddress, label: "E2E wallet", chainId: 1 }),
    });
    expect(created.status).toBe(201);
    const itemId = (created.body?.item as { id: string }).id;

    const duplicate = await api("/api/watchlists", {
      method: "POST",
      body: JSON.stringify({ address: watchedAddress, label: "again", chainId: 1 }),
    });
    expect(duplicate.status).toBe(409);

    const listed = await api("/api/watchlists");
    expect(listed.status).toBe(200);
    expect((listed.body?.items as unknown[]).length).toBe(1);

    const removed = await api(`/api/watchlists/${itemId}`, { method: "DELETE" });
    expect(removed.status).toBe(200);
    const afterRemove = await api("/api/watchlists");
    expect((afterRemove.body?.items as unknown[]).length).toBe(0);
  });

  it("rejects cross-site writes", async () => {
    const response = await api("/api/watchlists", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: JSON.stringify({ address: watchedAddress, label: "csrf", chainId: 1 }),
    });
    expect(response.status).toBe(403);
  });

  it("indexes watched addresses, raises an alert and delivers it", async () => {
    const created = await api("/api/watchlists", {
      method: "POST",
      body: JSON.stringify({ address: watchedAddress, label: "E2E monitored", chainId: 1 }),
    });
    expect(created.status).toBe(201);
    const itemId = (created.body?.item as { id: string }).id;

    // Seed one previous observation so the next cycle observes a balance change.
    await prisma.watchAddress.update({ where: { id: itemId }, data: { lastBalanceWei: "0", lastNonce: 0 } });

    const alert = await waitFor(async () => {
      const found = await prisma.alert.findFirst({
        where: { userId: userId as string, kind: "WATCH_ACTIVITY", body: { contains: "balance changed" } },
        orderBy: { createdAt: "desc" },
      });
      if (!found) return null;
      // Wait until the delivery pipeline has recorded an outcome for it.
      const delivered = await prisma.alert.findFirst({ where: { id: found.id, emailAttempts: { gt: 0 } } });
      return delivered ?? null;
    });

    expect(alert, "worker should detect the seeded balance change and deliver an alert").not.toBeNull();
    expect(alert?.severity).toBe("INFO");
    expect(alert?.body).toContain("Ethereum Mainnet");
    expect(["SENT", "QUEUED", "SKIPPED"]).toContain(alert?.emailStatus);

    const event = await prisma.monitorEvent.findFirst({
      where: { watchAddressId: itemId, kind: "BALANCE_CHANGE" },
    });
    expect(event).not.toBeNull();

    // The seeded transaction count also exercises outgoing-activity detection.
    const outgoing = await prisma.alert.findFirst({
      where: { userId: userId as string, body: { contains: "outgoing transaction" } },
    });
    expect(outgoing).not.toBeNull();

    const message = await latestEmail("watch_alert");
    expect(message).not.toBeNull();
    expect(message?.subject).toContain("[ChainSync]");

    // Once the worker has indexed the address, the watchlist read must still
    // serialize (the observed block is a BigInt in the database).
    const watchlist = await api("/api/watchlists");
    expect(watchlist.status).toBe(200);
    const watched = (watchlist.body?.items as Array<{ id: string; lastObservedBlock?: string }>)[0];
    expect(watched?.id).toBe(itemId);
    expect(typeof watched?.lastObservedBlock).toBe("string");

    const alerts = await api("/api/alerts?limit=50");
    expect(alerts.status).toBe(200);
    const items = alerts.body?.items as Array<{ id: string; readAt: string | null }>;
    expect(items.some((item) => item.id === alert?.id)).toBe(true);
    expect(alerts.body?.unreadCount).toBeGreaterThan(0);

    const monitoring = await api("/api/monitoring");
    expect(monitoring.status).toBe(200);
    const totals = monitoring.body?.totals as { watchAddresses: number; events24h: number };
    expect(totals.watchAddresses).toBe(1);
    expect(totals.events24h).toBeGreaterThan(0);
    expect(monitoring.body?.worker).toBeTruthy();
  });

  it("marks alerts as read", async () => {
    const marked = await api("/api/alerts/read", { method: "POST", body: JSON.stringify({ all: true }) });
    expect(marked.status).toBe(200);
    expect(marked.body?.updated).toBeGreaterThan(0);
    expect(marked.body?.unreadCount).toBe(0);
  });

  it("resets the password and invalidates existing sessions", async () => {
    const sessionBeforeReset = cookie;

    const requested = await api("/api/auth/password-reset", { method: "POST", body: JSON.stringify({ email }) });
    expect(requested.status).toBe(200);
    const message = await latestEmail("password_reset");
    const token = tokenFromEmail(message?.body ?? "", "/reset-password");
    expect(token).toBeTruthy();

    const tooShort = await api("/api/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token, password: "short" }),
    });
    expect(tooShort.status).toBe(400);

    const confirmed = await api("/api/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token, password: rotatedPassword }),
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body?.sessionsInvalidated).toBe(true);

    const staleSession = await api("/api/auth/session", { cookieOverride: sessionBeforeReset });
    expect(staleSession.body?.user).toBeNull();

    const oldPassword = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    expect(oldPassword.status).toBe(401);

    const newPassword = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: rotatedPassword }) });
    expect(newPassword.status).toBe(200);
    expect((newPassword.body?.user as { emailVerified?: boolean })?.emailVerified).toBe(true);
  });

  it("shares the login rate limit across requests", async () => {
    const ip = `203.0.113.${(stamp % 200) + 1}`;
    let limited: ApiResult | null = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await api("/api/auth/login", {
        method: "POST",
        ip,
        body: JSON.stringify({ email: `nobody-${attempt}@example.com`, password: "irrelevant-password" }),
      });
      if (response.status === 429) {
        limited = response;
        break;
      }
      expect(response.status).toBe(401);
    }
    expect(limited, "expected the shared limiter to answer 429 after the login budget").not.toBeNull();
    expect(Number(limited?.headers.get("retry-after"))).toBeGreaterThan(0);

    // The counter is stored in the database, so it is shared, not per-process.
    const counter = await prisma.rateLimitBucket.findFirst({ where: { key: { contains: ip }, count: { gt: 10 } } });
    expect(counter).not.toBeNull();
    await prisma.rateLimitBucket.deleteMany({ where: { key: { contains: ip } } });
  });
});

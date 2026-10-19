import { formatEther, type Address } from "viem";
import { prisma } from "./prisma";
import { NETWORKS, checkNetwork, createClient, networkByChainId, type NetworkDefinition, type NetworkHealth } from "./rpc";
import { errorMessage, log, maskAddress } from "./log";
import { sendAlertEmail } from "./notifications";

/**
 * Monitoring pipeline. One cycle does three things, in order:
 *
 *  1. scheduled network checks  — RPC connectivity/latency samples per network,
 *     with an outage/recovery alert when a network changes state;
 *  2. address indexing          — samples native balance and transaction count
 *     for every watched address and records the changes it observes;
 *  3. alert delivery            — in-app rows already exist, pending email
 *     deliveries are dispatched (with retries) and recorded.
 *
 * State sampling (rather than a full block/transaction scan) keeps the public
 * RPC budget small; each event records the network head it was observed at.
 */
const HEARTBEAT_KEY = "worker:heartbeat";
const CYCLE_KEY = "worker:lastCycle";
const MAX_EMAIL_ATTEMPTS = 3;
const EMAIL_BATCH = 25;
/** A worker heartbeat older than this means monitoring is not running. */
export const WORKER_STALE_AFTER_MS = 5 * 60_000;

export type CycleSummary = {
  startedAt: string;
  durationMs: number;
  networks: Array<{ id: string; status: string; latestBlock: string | null; latencyMs: number }>;
  indexing: { addresses: number; events: number; alerts: number; failed: number };
  delivery: { sent: number; queued: number; failed: number; skipped: number };
  networkAlerts: number;
  pruned: { tokens: number; emailMessages: number; networkSamples: number; rateLimitBuckets: number };
};

export async function putState(key: string, value: string) {
  await prisma.systemState.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export async function getState(key: string) {
  try {
    return await prisma.systemState.findUnique({ where: { key } });
  } catch {
    return null;
  }
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

async function recordAlert(input: {
  userId: string;
  watchAddressId?: string | null;
  chainId?: number | null;
  kind: "WATCH_ACTIVITY" | "NETWORK_HEALTH" | "ACCOUNT";
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  body: string;
  fingerprint: string;
  payload?: Record<string, string | number | null>;
}) {
  try {
    await prisma.alert.create({ data: { ...input, payload: input.payload ?? undefined } });
    return true;
  } catch (error) {
    // A duplicate fingerprint means this observation was already alerted on.
    if (!isUniqueViolation(error)) log("warn", "monitor.alert_write_failed", { error: errorMessage(error) });
    return false;
  }
}

async function alertingEnabled(userId: string) {
  const preference = await prisma.alertPreference.findUnique({ where: { userId } });
  return preference ? preference.enabled : true;
}

// 1 ── scheduled network checks ───────────────────────────────────────────────

export async function recordNetworkSamples(): Promise<{ health: NetworkHealth[]; alerts: number }> {
  const health: NetworkHealth[] = [];
  let alerts = 0;

  for (const network of NETWORKS) {
    const result = await checkNetwork(network);
    health.push(result);
    const previous = await prisma.networkSample.findFirst({
      where: { networkId: network.id },
      orderBy: { checkedAt: "desc" },
      select: { status: true },
    });
    try {
      await prisma.networkSample.create({
        data: {
          networkId: network.id,
          chainId: network.chain.id,
          status: result.status,
          latestBlock: result.latestBlock === null ? null : BigInt(result.latestBlock),
          latencyMs: result.latencyMs,
          error: result.status === "connected" ? null : "RPC probe failed",
        },
      });
    } catch (error) {
      log("warn", "monitor.sample_write_failed", { network: network.id, error: errorMessage(error) });
    }

    if (!previous || previous.status === result.status) continue;

    // One alert per network state change per hour, regardless of which instance noticed it.
    const bucket = new Date().toISOString().slice(0, 13);
    const recovered = result.status === "connected";
    const watchers = await prisma.watchAddress.findMany({
      where: { chainId: network.chain.id },
      select: { userId: true },
      distinct: ["userId"],
    });
    for (const watcher of watchers) {
      if (!(await alertingEnabled(watcher.userId))) continue;
      const created = await recordAlert({
        userId: watcher.userId,
        chainId: network.chain.id,
        kind: "NETWORK_HEALTH",
        severity: recovered ? "INFO" : "CRITICAL",
        title: recovered ? `${network.name} is reachable again` : `${network.name} RPC is unreachable`,
        body: recovered
          ? `${network.name} RPC connectivity recovered at block ${result.latestBlock} (${result.latencyMs} ms). Monitoring has resumed.`
          : `${network.name} RPC checks started failing at ${result.checkedAt}. Watched addresses on this network cannot be checked until connectivity returns.`,
        fingerprint: `network:${network.id}:${result.status}:${bucket}`,
        payload: { network: network.id, chainId: network.chain.id, status: result.status },
      });
      if (created) alerts += 1;
    }
  }

  return { health, alerts };
}

// 2 ── address indexing ──────────────────────────────────────────────────────

export async function indexWatchedAddresses(): Promise<CycleSummary["indexing"]> {
  const watchAddresses = await prisma.watchAddress.findMany({ orderBy: { createdAt: "asc" } });
  let events = 0;
  let alerts = 0;
  let failed = 0;

  if (watchAddresses.length) {
    await putState("indexer:lastRun", new Date().toISOString());
  }

  for (const network of NETWORKS) {
    const items = watchAddresses.filter((item) => item.chainId === network.chain.id);
    if (!items.length) continue;

    let latestBlock: bigint;
    try {
      latestBlock = await createClient(network).getBlockNumber();
      await putState(`indexer:${network.id}`, latestBlock.toString());
    } catch (error) {
      log("warn", "monitor.index_network_unavailable", { network: network.id, error: errorMessage(error) });
      failed += items.length;
      continue;
    }

    const client = createClient(network);
    for (const item of items) {
      try {
        const address = item.address as Address;
        const [balance, nonce] = await Promise.all([
          client.getBalance({ address }),
          client.getTransactionCount({ address }),
        ]);
        const balanceWei = balance.toString();
        const previousBalance = item.lastBalanceWei;
        const previousNonce = item.lastNonce;

        if (previousBalance !== null && previousBalance !== balanceWei) {
          const fingerprint = `balance:${balanceWei}`;
          const detail = `${item.label} (${item.address}) balance changed on ${network.name} from ${formatEther(BigInt(previousBalance))} to ${formatEther(balance)} ${network.chain.nativeCurrency.symbol} at block ${latestBlock}.`;
          const recorded = await prisma.monitorEvent
            .create({
              data: {
                userId: item.userId,
                watchAddressId: item.id,
                chainId: network.chain.id,
                kind: "BALANCE_CHANGE",
                blockNumber: latestBlock,
                balanceWei,
                previousBalanceWei: previousBalance,
                fingerprint,
                detail,
              },
            })
            .then(() => true)
            .catch((error: unknown) => {
              if (!isUniqueViolation(error)) log("warn", "monitor.event_write_failed", { error: errorMessage(error) });
              return false;
            });
          if (recorded) {
            events += 1;
            if (await alertingEnabled(item.userId)) {
              const created = await recordAlert({
                userId: item.userId,
                watchAddressId: item.id,
                chainId: network.chain.id,
                kind: "WATCH_ACTIVITY",
                severity: "INFO",
                title: `Balance changed for ${item.label}`,
                body: detail,
                fingerprint: `${item.id}:${fingerprint}`,
                payload: { address: item.address, chainId: network.chain.id, blockNumber: latestBlock.toString(), previousBalanceWei: previousBalance, balanceWei },
              });
              if (created) alerts += 1;
            }
          }
        }

        if (previousNonce !== null && nonce > previousNonce) {
          const fingerprint = `nonce:${nonce}`;
          const detail = `${item.label} (${item.address}) sent ${nonce - previousNonce} outgoing transaction(s) on ${network.name}. Latest block ${latestBlock}.`;
          const recorded = await prisma.monitorEvent
            .create({
              data: {
                userId: item.userId,
                watchAddressId: item.id,
                chainId: network.chain.id,
                kind: "OUTGOING_TRANSACTION",
                blockNumber: latestBlock,
                nonce,
                fingerprint,
                detail,
              },
            })
            .then(() => true)
            .catch((error: unknown) => {
              if (!isUniqueViolation(error)) log("warn", "monitor.event_write_failed", { error: errorMessage(error) });
              return false;
            });
          if (recorded) {
            events += 1;
            if (await alertingEnabled(item.userId)) {
              const created = await recordAlert({
                userId: item.userId,
                watchAddressId: item.id,
                chainId: network.chain.id,
                kind: "WATCH_ACTIVITY",
                severity: "INFO",
                title: `Outgoing activity from ${item.label}`,
                body: detail,
                fingerprint: `${item.id}:${fingerprint}`,
                payload: { address: item.address, chainId: network.chain.id, blockNumber: latestBlock.toString(), nonce },
              });
              if (created) alerts += 1;
            }
          }
        }

        await prisma.watchAddress.update({
          where: { id: item.id },
          data: { lastBalanceWei: balanceWei, lastNonce: nonce, lastObservedBlock: latestBlock, lastCheckedAt: new Date() },
        });
      } catch (error) {
        failed += 1;
        log("warn", "monitor.address_check_failed", { address: maskAddress(item.address), network: network.id, error: errorMessage(error) });
      }
    }
  }

  return { addresses: watchAddresses.length, events, alerts, failed };
}

// 3 ── alert delivery ────────────────────────────────────────────────────────

export async function deliverPendingAlerts(): Promise<CycleSummary["delivery"]> {
  const pending = await prisma.alert.findMany({
    where: { emailStatus: { in: ["PENDING", "FAILED"] }, emailAttempts: { lt: MAX_EMAIL_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: EMAIL_BATCH,
    include: { user: { select: { id: true, email: true, displayName: true } } },
  });

  const totals = { sent: 0, queued: 0, failed: 0, skipped: 0 };

  for (const alert of pending) {
    const preference = await prisma.alertPreference.findUnique({ where: { userId: alert.userId } });
    if (preference && !preference.emailEnabled) {
      await prisma.alert.update({
        where: { id: alert.id },
        data: { emailStatus: "SKIPPED", emailError: "Email delivery is disabled for this account." },
      });
      totals.skipped += 1;
      continue;
    }

    const result = await sendAlertEmail(alert.user, {
      title: alert.title,
      body: alert.body,
      severity: alert.severity,
      kind: alert.kind,
    });

    const emailStatus = !result ? "SKIPPED" : result.status === "sent" ? "SENT" : result.status === "queued" ? "QUEUED" : "FAILED";
    await prisma.alert.update({
      where: { id: alert.id },
      data: {
        emailStatus,
        emailAttempts: { increment: 1 },
        emailedAt: result?.status === "sent" ? new Date() : null,
        emailError:
          result?.error ??
          (emailStatus === "QUEUED" ? "Held in the development outbox: no SMTP transport is configured." : null),
      },
    });

    if (emailStatus === "SENT") totals.sent += 1;
    else if (emailStatus === "QUEUED") totals.queued += 1;
    else if (emailStatus === "FAILED") totals.failed += 1;
    else totals.skipped += 1;
  }

  return totals;
}

// retention ───────────────────────────────────────────────────────────────────

export async function pruneExpiredData(): Promise<CycleSummary["pruned"]> {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  const [tokens, emails, samples, buckets] = await Promise.all([
    prisma.emailToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(now.getTime() - 7 * day) } },
          { consumedAt: { lt: new Date(now.getTime() - 7 * day) } },
        ],
      },
    }),
    prisma.emailMessage.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * day) } } }),
    prisma.networkSample.deleteMany({ where: { checkedAt: { lt: new Date(now.getTime() - 7 * day) } } }),
    prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: now } } }),
  ]);
  return {
    tokens: tokens.count,
    emailMessages: emails.count,
    networkSamples: samples.count,
    rateLimitBuckets: buckets.count,
  };
}

// cycle ───────────────────────────────────────────────────────────────────────

export async function runMonitoringCycle(): Promise<CycleSummary> {
  const startedAt = Date.now();
  const samples = await recordNetworkSamples();
  const indexing = await indexWatchedAddresses();
  const delivery = await deliverPendingAlerts();
  const pruned = await pruneExpiredData();

  const summary: CycleSummary = {
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    networks: samples.health.map((item) => ({ id: item.id, status: item.status, latestBlock: item.latestBlock, latencyMs: item.latencyMs })),
    indexing,
    delivery,
    networkAlerts: samples.alerts,
    pruned,
  };

  await putState(HEARTBEAT_KEY, new Date().toISOString());
  await putState(CYCLE_KEY, JSON.stringify(summary));
  log("info", "monitor.cycle_complete", {
    durationMs: summary.durationMs,
    addresses: indexing.addresses,
    events: indexing.events,
    alerts: indexing.alerts,
    emailed: delivery.sent,
    queued: delivery.queued,
  });
  return summary;
}

/** Worker liveness for the dashboard and the readiness probe. */
export async function workerHealth() {
  const heartbeat = await getState(HEARTBEAT_KEY);
  const cycle = await getState(CYCLE_KEY);
  const heartbeatAt = heartbeat?.value ?? null;
  const ageMs = heartbeatAt ? Date.now() - new Date(heartbeatAt).getTime() : null;
  return {
    heartbeatAt,
    ageMs,
    stale: ageMs === null || ageMs > WORKER_STALE_AFTER_MS,
    lastCycle: cycle?.value ? (JSON.parse(cycle.value) as CycleSummary) : null,
  };
}

export function networkNameFor(chainId: number | null | undefined) {
  if (!chainId) return null;
  return networkByChainId(chainId)?.name ?? `Chain ${chainId}`;
}

export type { NetworkDefinition };

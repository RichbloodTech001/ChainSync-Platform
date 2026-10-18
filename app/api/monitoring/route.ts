import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";
import { getState, workerHealth } from "@/lib/monitor";
import { NETWORKS } from "@/lib/rpc";
import { runtimeConfig } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Monitoring status for the signed-in account: worker liveness, indexer cursors, recent events. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to view monitoring status." }, { status: 401, headers: { "Cache-Control": "no-store" } });

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [health, watchAddresses, events24h, alerts24h, unreadAlerts, recentEvents, cursors, samples] = await Promise.all([
      workerHealth(),
      prisma.watchAddress.count({ where: { userId: user.id } }),
      prisma.monitorEvent.count({ where: { userId: user.id, detectedAt: { gte: since } } }),
      prisma.alert.count({ where: { userId: user.id, createdAt: { gte: since } } }),
      prisma.alert.count({ where: { userId: user.id, readAt: null } }),
      prisma.monitorEvent.findMany({
        where: { userId: user.id },
        orderBy: { detectedAt: "desc" },
        take: 10,
        select: { id: true, kind: true, chainId: true, blockNumber: true, detail: true, detectedAt: true },
      }),
      Promise.all(NETWORKS.map(async (network) => ({ network: network.id, value: (await getState(`indexer:${network.id}`))?.value ?? null }))),
      Promise.all(
        NETWORKS.map(async (network) => {
          const sample = await prisma.networkSample.findFirst({ where: { networkId: network.id }, orderBy: { checkedAt: "desc" } });
          return {
            id: network.id,
            name: network.name,
            chainId: network.chain.id,
            status: sample?.status ?? "unknown",
            latestBlock: sample?.latestBlock?.toString() ?? null,
            latencyMs: sample?.latencyMs ?? null,
            checkedAt: sample?.checkedAt ?? null,
          };
        }),
      ),
    ]);

    return NextResponse.json(
      {
        worker: { heartbeatAt: health.heartbeatAt, ageMs: health.ageMs, stale: health.stale, lastCycle: health.lastCycle },
        networks: samples,
        indexer: Object.fromEntries(cursors.map((cursor) => [cursor.network, cursor.value])),
        totals: { watchAddresses, events24h, alerts24h, unreadAlerts },
        email: { provider: runtimeConfig().emailProvider },
        canRunCycle: user.role === "ADMIN" || process.env.BASE44_PREVIEW_MODE === "1",
        recentEvents: recentEvents.map((event) => ({ ...event, blockNumber: event.blockNumber?.toString() ?? null })),
        readOnly: true,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Monitoring status is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

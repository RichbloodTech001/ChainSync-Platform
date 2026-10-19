import { NextResponse } from "next/server";
import { NETWORKS, checkNetwork } from "@/lib/rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const networks = await Promise.all(NETWORKS.map((network) => checkNetwork(network)));
  return NextResponse.json({ networks, checkedAt: new Date().toISOString(), readOnly: true }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

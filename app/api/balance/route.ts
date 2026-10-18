import { NextRequest, NextResponse } from "next/server";
import { formatEther, isAddress } from "viem";
import { createClient, networkById } from "@/lib/rpc";
import { rateLimit, rateLimitResponse, requestKey } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")?.trim();
  const network = request.nextUrl.searchParams.get("network") ?? "ethereum";
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "A valid public EVM address is required." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const selected = networkById(network);
  if (!selected) {
    return NextResponse.json({ error: "Unsupported network. Use ethereum or sepolia." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  // Shared limiter: this read-only endpoint is public, so it is throttled per client.
  const rate = await rateLimit(requestKey(request, "balance"), 60, 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);

  try {
    const client = createClient(selected);
    const [balance, blockNumber] = await Promise.all([
      client.getBalance({ address }),
      client.getBlockNumber(),
    ]);
    return NextResponse.json({
      address,
      network,
      chainId: selected.chain.id,
      nativeCurrency: selected.chain.nativeCurrency.symbol,
      balance: formatEther(balance),
      blockNumber: blockNumber.toString(),
      fetchedAt: new Date().toISOString(),
      source: "public-rpc",
      readOnly: true,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    // Avoid returning provider URLs, credentials, or internal exception details.
    return NextResponse.json({ error: "Blockchain provider is temporarily unavailable. Try again shortly." }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } });
  }
}

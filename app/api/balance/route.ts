import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, formatEther, http, isAddress, type Chain } from "viem";
import { mainnet, sepolia } from "viem/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NETWORKS: Record<string, { chain: Chain; env: string; fallback: string }> = {
  ethereum: { chain: mainnet, env: "ETHEREUM_RPC_URL", fallback: "https://cloudflare-eth.com" },
  sepolia: { chain: sepolia, env: "SEPOLIA_RPC_URL", fallback: "https://ethereum-sepolia-rpc.publicnode.com" },
};

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")?.trim();
  const network = request.nextUrl.searchParams.get("network") ?? "ethereum";
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "A valid public EVM address is required." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const selected = NETWORKS[network];
  if (!selected) {
    return NextResponse.json({ error: "Unsupported network. Use ethereum or sepolia." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const rpcUrl = process.env[selected.env] || selected.fallback;
    const client = createPublicClient({ chain: selected.chain, transport: http(rpcUrl, { timeout: 8_000, retryCount: 1 }) });
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

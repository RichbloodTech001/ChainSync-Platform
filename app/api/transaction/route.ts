import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, formatEther, http, isHash, type Chain } from "viem";
import { mainnet, sepolia } from "viem/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NETWORKS: Record<string, { chain: Chain; env: string; fallback: string }> = {
  ethereum: { chain: mainnet, env: "ETHEREUM_RPC_URL", fallback: "https://cloudflare-eth.com" },
  sepolia: { chain: sepolia, env: "SEPOLIA_RPC_URL", fallback: "https://ethereum-sepolia-rpc.publicnode.com" },
};

export async function GET(request: NextRequest) {
  const hash = request.nextUrl.searchParams.get("hash")?.trim();
  const network = request.nextUrl.searchParams.get("network") ?? "ethereum";
  if (!hash || !isHash(hash)) {
    return NextResponse.json({ error: "A valid 32-byte transaction hash is required." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const selected = NETWORKS[network];
  if (!selected) {
    return NextResponse.json({ error: "Unsupported network. Use ethereum or sepolia." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const client = createPublicClient({
      chain: selected.chain,
      transport: http(process.env[selected.env] || selected.fallback, { timeout: 8_000, retryCount: 1 }),
    });
    const transaction = await client.getTransaction({ hash: hash as `0x${string}` });
    const [receipt, blockNumber] = await Promise.all([
      client.getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null),
      client.getBlockNumber(),
    ]);
    const block = transaction.blockNumber
      ? await client.getBlock({ blockNumber: transaction.blockNumber }).catch(() => null)
      : null;

    return NextResponse.json({
      hash: transaction.hash,
      network,
      chainId: selected.chain.id,
      from: transaction.from,
      to: transaction.to,
      value: formatEther(transaction.value),
      nativeCurrency: selected.chain.nativeCurrency.symbol,
      nonce: transaction.nonce,
      gas: transaction.gas.toString(),
      gasPrice: transaction.gasPrice?.toString() ?? null,
      transactionBlock: transaction.blockNumber?.toString() ?? null,
      observedBlock: blockNumber.toString(),
      timestamp: block ? new Date(Number(block.timestamp) * 1000).toISOString() : null,
      status: receipt ? (receipt.status === "success" ? "success" : "reverted") : transaction.blockNumber ? "receipt-unavailable" : "pending",
      confirmations: transaction.blockNumber ? Math.max(0, Number(blockNumber - transaction.blockNumber + 1n)) : 0,
      fetchedAt: new Date().toISOString(),
      readOnly: true,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Transaction was not found or the blockchain provider is temporarily unavailable." }, {
      status: 404,
      headers: { "Cache-Control": "no-store", "Retry-After": "5" },
    });
  }
}

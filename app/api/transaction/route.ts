import { NextRequest, NextResponse } from "next/server";
import { formatEther, isHash } from "viem";
import { createClient, networkById } from "@/lib/rpc";
import { rateLimit, rateLimitResponse, requestKey } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const hash = request.nextUrl.searchParams.get("hash")?.trim();
  const network = request.nextUrl.searchParams.get("network") ?? "ethereum";
  if (!hash || !isHash(hash)) {
    return NextResponse.json({ error: "A valid 32-byte transaction hash is required." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const selected = networkById(network);
  if (!selected) {
    return NextResponse.json({ error: "Unsupported network. Use ethereum or sepolia." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const rate = await rateLimit(requestKey(request, "transaction"), 60, 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);

  try {
    const client = createClient(selected);
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

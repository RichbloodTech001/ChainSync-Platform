import { NextResponse } from "next/server";
import { createPublicClient, http, type Chain } from "viem";
import { mainnet, sepolia } from "viem/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NETWORKS: Array<{ id: string; name: string; chain: Chain; env: string; fallback: string; explorer: string }> = [
  { id: "ethereum", name: "Ethereum Mainnet", chain: mainnet, env: "ETHEREUM_RPC_URL", fallback: "https://cloudflare-eth.com", explorer: "https://etherscan.io" },
  { id: "sepolia", name: "Sepolia Testnet", chain: sepolia, env: "SEPOLIA_RPC_URL", fallback: "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io" },
];

export async function GET() {
  const networks = await Promise.all(NETWORKS.map(async (network) => {
    const started = Date.now();
    try {
      const client = createPublicClient({
        chain: network.chain,
        transport: http(process.env[network.env] || network.fallback, { timeout: 5_000, retryCount: 0 }),
      });
      const [blockNumber, chainId] = await Promise.all([client.getBlockNumber(), client.getChainId()]);
      if (chainId !== network.chain.id) throw new Error("RPC chain ID mismatch");
      return {
        id: network.id, name: network.name, chainId: network.chain.id,
        configured: Boolean(process.env[network.env]), status: "connected",
        latestBlock: blockNumber.toString(), latencyMs: Date.now() - started,
        explorer: network.explorer,
      };
    } catch {
      return {
        id: network.id, name: network.name, chainId: network.chain.id,
        configured: Boolean(process.env[network.env]), status: "unavailable",
        latestBlock: null, latencyMs: Date.now() - started, explorer: network.explorer,
      };
    }
  }));
  return NextResponse.json({ networks, checkedAt: new Date().toISOString(), readOnly: true }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

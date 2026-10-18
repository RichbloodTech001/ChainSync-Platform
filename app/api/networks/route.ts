import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({
    networks: [
      { id: "ethereum", name: "Ethereum Mainnet", chainId: 1, configured: Boolean(process.env.ETHEREUM_RPC_URL), explorer: "https://etherscan.io" },
      { id: "sepolia", name: "Sepolia Testnet", chainId: 11155111, configured: Boolean(process.env.SEPOLIA_RPC_URL), explorer: "https://sepolia.etherscan.io" },
    ],
  }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}

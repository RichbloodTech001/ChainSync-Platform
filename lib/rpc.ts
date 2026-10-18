import { createPublicClient, http, type Chain, type PublicClient } from "viem";
import { mainnet, sepolia } from "viem/chains";

export type PublicNetworkId = "ethereum" | "sepolia";

export type NetworkDefinition = {
  id: PublicNetworkId;
  name: string;
  chain: Chain;
  env: string;
  fallback: string;
  explorer: string;
};

/**
 * The two networks ChainSync monitors. `env` names the environment variable
 * that provides a provider URL; `fallback` is a public development endpoint used
 * when it is unset. Provider URLs and credentials are never returned to clients.
 */
export const NETWORKS: NetworkDefinition[] = [
  { id: "ethereum", name: "Ethereum Mainnet", chain: mainnet, env: "ETHEREUM_RPC_URL", fallback: "https://cloudflare-eth.com", explorer: "https://etherscan.io" },
  { id: "sepolia", name: "Sepolia Testnet", chain: sepolia, env: "SEPOLIA_RPC_URL", fallback: "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io" },
];

export function networkById(id: string) {
  return NETWORKS.find((network) => network.id === id);
}

export function networkByChainId(chainId: number) {
  return NETWORKS.find((network) => network.chain.id === chainId);
}

export function rpcUrl(network: NetworkDefinition) {
  return process.env[network.env] || network.fallback;
}

export function isRpcConfigured(network: NetworkDefinition) {
  return Boolean(process.env[network.env]);
}

export function createClient(network: NetworkDefinition, timeout = 8_000): PublicClient {
  return createPublicClient({
    chain: network.chain,
    transport: http(rpcUrl(network), { timeout, retryCount: 1 }),
  }) as PublicClient;
}

export type NetworkHealth = {
  id: PublicNetworkId;
  name: string;
  chainId: number;
  configured: boolean;
  status: "connected" | "unavailable";
  latestBlock: string | null;
  latencyMs: number;
  explorer: string;
  checkedAt: string;
};

/** Single read-only connectivity probe used by the API and the monitoring worker. */
export async function checkNetwork(network: NetworkDefinition): Promise<NetworkHealth> {
  const started = Date.now();
  const base = {
    id: network.id,
    name: network.name,
    chainId: network.chain.id,
    configured: isRpcConfigured(network),
    explorer: network.explorer,
    checkedAt: new Date().toISOString(),
  };
  try {
    const client = createClient(network, 5_000);
    const [blockNumber, chainId] = await Promise.all([client.getBlockNumber(), client.getChainId()]);
    if (chainId !== network.chain.id) throw new Error("RPC chain ID mismatch");
    return { ...base, status: "connected", latestBlock: blockNumber.toString(), latencyMs: Date.now() - started };
  } catch {
    return { ...base, status: "unavailable", latestBlock: null, latencyMs: Date.now() - started };
  }
}

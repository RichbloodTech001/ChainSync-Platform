"use client";

import { FormEvent, useState } from "react";

type BalanceResult = {
  address: string;
  network: string;
  chainId: number;
  nativeCurrency: string;
  balance: string;
  blockNumber: string;
  fetchedAt: string;
  source: string;
  readOnly: boolean;
};

export default function WalletCheckPage() {
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("ethereum");
  const [result, setResult] = useState<BalanceResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function checkBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ address: address.trim(), network });
      const response = await fetch(`/api/balance?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to retrieve balance.");
      setResult(payload as BalanceResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="check-shell">
      <header className="check-header">
        <a href="/" className="check-brand"><span>◇</span> ChainSync</a>
        <span className="check-mode">READ-ONLY · NO WALLET CONNECTION</span>
      </header>
      <section className="check-content">
        <a className="back-link" href="/">← Back to dashboard</a>
        <p className="eyebrow">PUBLIC BLOCKCHAIN DATA</p>
        <h1>Check a wallet balance</h1>
        <p className="check-lead">Look up the native ETH balance of a public address on Ethereum Mainnet or Sepolia. No wallet connection, private key, or recovery phrase is needed.</p>
        <form className="check-form" onSubmit={checkBalance}>
          <label htmlFor="wallet-address">Public wallet address</label>
          <input id="wallet-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} required />
          <label htmlFor="wallet-network">Network</label>
          <select id="wallet-network" value={network} onChange={e => setNetwork(e.target.value)}>
            <option value="ethereum">Ethereum Mainnet</option>
            <option value="sepolia">Sepolia Testnet</option>
          </select>
          <button type="submit" disabled={loading}>{loading ? "Checking blockchain…" : "Check balance"}</button>
        </form>
        {error && <div className="check-error" role="alert">{error}</div>}
        {result && <section className="balance-result" aria-live="polite">
          <p className="eyebrow">NATIVE BALANCE</p>
          <h2>{Number(result.balance).toLocaleString(undefined, { maximumFractionDigits: 8 })} <span>{result.nativeCurrency}</span></h2>
          <dl>
            <div><dt>Network</dt><dd>{result.network === "ethereum" ? "Ethereum Mainnet" : "Sepolia Testnet"}</dd></div>
            <div><dt>Chain ID</dt><dd>{result.chainId}</dd></div>
            <div><dt>Observed block</dt><dd>{Number(result.blockNumber).toLocaleString()}</dd></div>
            <div><dt>Data retrieved</dt><dd>{new Date(result.fetchedAt).toLocaleString()}</dd></div>
          </dl>
          <p className="result-address">{result.address}</p>
          <p className="result-note">Read-only public RPC data. Balance is a point-in-time observation and does not include token holdings.</p>
        </section>}
        <aside className="check-safety"><strong>Safety by design</strong><p>Only enter a public address. Never enter a seed phrase or private key. ChainSync will not ask you to connect a wallet or authorize a transaction.</p></aside>
      </section>
    </main>
  );
}

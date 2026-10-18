"use client";

import { FormEvent, useState } from "react";

type TransactionResult = {
  hash: string; network: string; chainId: number; from: string; to: string | null;
  value: string; nativeCurrency: string; nonce: number; gas: string; gasPrice: string | null;
  transactionBlock: string | null; observedBlock: string; timestamp: string | null;
  status: string; confirmations: number; fetchedAt: string; readOnly: boolean;
};

const short = (value: string | null) => value ? `${value.slice(0, 12)}…${value.slice(-8)}` : "Contract creation / not available";

export default function TransactionCheckPage() {
  const [hash, setHash] = useState("");
  const [network, setNetwork] = useState("ethereum");
  const [result, setResult] = useState<TransactionResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setResult(null); setLoading(true);
    try {
      const params = new URLSearchParams({ hash: hash.trim(), network });
      const response = await fetch(`/api/transaction?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to look up transaction.");
      setResult(payload as TransactionResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed. Please try again.");
    } finally { setLoading(false); }
  }

  const statusLabel = (status: string) => status === "success" ? "Confirmed · Success" : status === "reverted" ? "Confirmed · Reverted" : status === "pending" ? "Pending" : "Receipt unavailable";
  return <main className="check-shell">
    <header className="check-header"><a href="/" className="check-brand"><span>◇</span> ChainSync</a><span className="check-mode">READ-ONLY · TRANSACTION EXPLORER</span></header>
    <section className="check-content">
      <a className="back-link" href="/">← Back to dashboard</a>
      <p className="eyebrow">PUBLIC BLOCKCHAIN DATA</p>
      <h1>Explore a transaction</h1>
      <p className="check-lead">Inspect a transaction hash on Ethereum Mainnet or Sepolia, including sender, recipient, native value, block, and confirmation status. No wallet connection is required.</p>
      <form className="check-form" onSubmit={lookup}>
        <label htmlFor="tx-hash">Transaction hash</label>
        <input id="tx-hash" value={hash} onChange={e => setHash(e.target.value)} placeholder="0x… 64 hexadecimal characters" autoComplete="off" spellCheck={false} required />
        <label htmlFor="tx-network">Network</label>
        <select id="tx-network" value={network} onChange={e => setNetwork(e.target.value)}><option value="ethereum">Ethereum Mainnet</option><option value="sepolia">Sepolia Testnet</option></select>
        <button type="submit" disabled={loading}>{loading ? "Searching blockchain…" : "Find transaction"}</button>
      </form>
      {error && <div className="check-error" role="alert">{error}</div>}
      {result && <section className="balance-result" aria-live="polite">
        <p className="eyebrow">TRANSACTION STATUS</p><h2>{statusLabel(result.status)}</h2>
        <dl>
          <div><dt>Native value</dt><dd>{Number(result.value).toLocaleString(undefined, { maximumFractionDigits: 8 })} {result.nativeCurrency}</dd></div>
          <div><dt>Network / chain ID</dt><dd>{result.network === "ethereum" ? "Ethereum Mainnet" : "Sepolia"} · {result.chainId}</dd></div>
          <div><dt>From</dt><dd title={result.from}>{short(result.from)}</dd></div>
          <div><dt>To</dt><dd title={result.to ?? ""}>{short(result.to)}</dd></div>
          <div><dt>Transaction block</dt><dd>{result.transactionBlock ?? "Not mined yet"}</dd></div>
          <div><dt>Confirmations</dt><dd>{result.confirmations.toLocaleString()}</dd></div>
          <div><dt>Nonce</dt><dd>{result.nonce}</dd></div>
          <div><dt>Gas limit</dt><dd>{Number(result.gas).toLocaleString()}</dd></div>
          <div><dt>Block timestamp</dt><dd>{result.timestamp ? new Date(result.timestamp).toLocaleString() : "Pending"}</dd></div>
        </dl>
        <p className="result-address">{result.hash}</p>
        <p className="result-note">Transaction status is read from the selected public RPC. “Receipt unavailable” does not mean success; retry after the provider responds.</p>
      </section>}
      <aside className="check-safety"><strong>Read-only by design</strong><p>This tool only reads public blockchain data. It cannot send, sign, cancel, or modify transactions.</p></aside>
    </section>
  </main>;
}

"use client";

import { useEffect, useState } from "react";

type Network = { id: string; name: string; chainId: number; configured: boolean; status: "connected" | "unavailable"; latestBlock: string | null; latencyMs: number; explorer: string };
type Payload = { networks: Network[]; checkedAt: string; readOnly: boolean };

export default function NetworkStatusPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/networks", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error("Unable to check network status.");
      setData(payload as Payload);
    } catch (err) { setError(err instanceof Error ? err.message : "Network status request failed."); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  return <main className="check-shell">
    <header className="check-header"><a href="/" className="check-brand"><span>◇</span> ChainSync</a><span className="check-mode">NETWORK HEALTH · READ-ONLY</span></header>
    <section className="check-content">
      <a className="back-link" href="/">← Back to dashboard</a><p className="eyebrow">CONNECTIVITY MONITOR</p><h1>Network status</h1>
      <p className="check-lead">ChainSync checks the configured RPC or development fallback, verifies the chain ID, and reads the latest block. A successful check confirms connectivity at this moment, not guaranteed uptime.</p>
      <div className="network-actions"><button className="secondary" onClick={refresh} disabled={loading}>{loading ? "Checking…" : "Refresh status"}</button>{data && <span className="result-note">Checked {new Date(data.checkedAt).toLocaleString()}</span>}</div>
      {error && <div className="check-error" role="alert">{error}</div>}
      {loading && !data && <section className="panel">Checking public RPC providers…</section>}
      {data?.networks.map(network => <section className="panel status-card" key={network.id}>
        <div className="panel-head"><div><h2>{network.name}</h2><p>Chain ID {network.chainId}</p></div><span className={network.status === "connected" ? "network-status connected" : "network-status unavailable"}><i/> {network.status === "connected" ? "Connected" : "Unavailable"}</span></div>
        <dl className="status-details"><div><dt>Latest block</dt><dd>{network.latestBlock ? Number(network.latestBlock).toLocaleString() : "Not available"}</dd></div><div><dt>RPC response</dt><dd>{network.latencyMs} ms</dd></div><div><dt>Custom RPC configured</dt><dd>{network.configured ? "Yes" : "No — development fallback"}</dd></div></dl>
        <a className="back-link" href={network.explorer} target="_blank" rel="noreferrer">Open block explorer ↗</a>
      </section>)}
      <aside className="check-safety"><strong>Provider configuration</strong><p>For production, use reputable RPC providers with monitored quotas and availability. Provider URLs and credentials are never returned by this endpoint.</p></aside>
    </section>
  </main>;
}

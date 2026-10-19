"use client";

import { useCallback, useEffect, useState } from "react";

type Alert = {
  id: string;
  kind: "WATCH_ACTIVITY" | "NETWORK_HEALTH" | "ACCOUNT";
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  body: string;
  chainId: number | null;
  emailStatus: string;
  emailedAt: string | null;
  readAt: string | null;
  createdAt: string;
};

type Monitoring = {
  worker: { heartbeatAt: string | null; ageMs: number | null; stale: boolean };
  networks: Array<{ id: string; name: string; chainId: number; status: string; latestBlock: string | null; latencyMs: number | null; checkedAt: string | null }>;
  indexer: Record<string, string | null>;
  totals: { watchAddresses: number; events24h: number; alerts24h: number; unreadAlerts: number };
  email: { provider: "smtp" | "outbox" };
  canRunCycle: boolean;
  recentEvents: Array<{ id: string; kind: string; chainId: number; blockNumber: string | null; detail: string | null; detectedAt: string }>;
};

const NETWORK_NAMES: Record<number, string> = { 1: "Ethereum Mainnet", 11155111: "Sepolia Testnet" };

function severityClass(severity: Alert["severity"]) {
  if (severity === "CRITICAL") return "check-error";
  if (severity === "WARNING") return "badge";
  return "notice";
}

export default function AlertsPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unread, setUnread] = useState(0);
  const [monitoring, setMonitoring] = useState<Monitoring | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
    const session = await sessionResponse.json();
    if (!session.user) { setSignedIn(false); return; }
    setSignedIn(true);
    const [alertsResponse, monitoringResponse] = await Promise.all([
      fetch("/api/alerts?limit=50", { cache: "no-store" }),
      fetch("/api/monitoring", { cache: "no-store" }),
    ]);
    const alertsData = await alertsResponse.json();
    if (alertsResponse.ok) {
      setAlerts(alertsData.items ?? []);
      setUnread(alertsData.unreadCount ?? 0);
    } else setError(alertsData.error || "Alerts are temporarily unavailable.");
    const monitoringData = await monitoringResponse.json();
    if (monitoringResponse.ok) setMonitoring(monitoringData as Monitoring);
  }, []);

  useEffect(() => { load().catch(() => setError("Could not load monitoring data. Check database configuration.")); }, [load]);

  async function markRead(ids?: string[]) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/alerts/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : { all: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update alerts.");
      await load();
      setMessage(ids ? "Alert marked as read." : "All alerts marked as read.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runCycle() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/monitoring/run", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to run a monitoring cycle.");
      await load();
      setMessage(`Monitoring cycle complete: ${data.summary.indexing.addresses} address(es) checked, ${data.summary.indexing.events} event(s), ${data.summary.indexing.alerts} new alert(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  const workerLabel = monitoring ? (monitoring.worker.stale ? "Not running" : "Running") : "Unknown";
  const workerNote = monitoring?.worker.heartbeatAt
    ? `Last cycle ${new Date(monitoring.worker.heartbeatAt).toLocaleString()}`
    : "The monitoring worker has not reported yet";

  return (
    <main className="check-shell">
      <header className="check-header">
        <a href="/" className="check-brand"><span>◇</span> ChainSync</a>
        <span className="check-mode">ALERTS · MONITORING STATUS</span>
      </header>
      <section className="check-content account-content">
        <a className="back-link" href="/">← Back to dashboard</a>
        <p className="eyebrow">MONITORING</p>
        <h1>Alerts and indexer status</h1>
        <p className="check-lead">Every change the indexer observes for your watched addresses is recorded here before any email is attempted, so nothing is lost if delivery fails.</p>

        {error && <div className="check-error" role="alert">{error}</div>}
        {message && <div className="notice" role="status">{message}</div>}

        {signedIn === false && <section className="panel">
          <div className="panel-head"><div><h2>Sign in to view alerts</h2><p>Alerts are delivered per account and only cover addresses you watch.</p></div></div>
          <p><a className="link" href="/account">Sign in or create an account →</a></p>
        </section>}

        {signedIn && <>
          <div className="metrics">
            <article className="metric"><span className="metric-icon">♧</span><small>Unread alerts</small><strong>{unread}</strong><p>{monitoring?.totals.alerts24h ?? 0} created in the last 24 hours</p></article>
            <article className="metric"><span className="metric-icon">⇄</span><small>Indexed events</small><strong>{monitoring?.totals.events24h ?? 0}</strong><p>Detected in the last 24 hours</p></article>
            <article className="metric"><span className="metric-icon">◈</span><small>Watched addresses</small><strong>{monitoring?.totals.watchAddresses ?? 0}</strong><p>Sampled every monitoring cycle</p></article>
            <article className="metric"><span className="metric-icon">⌁</span><small>Monitoring worker</small><strong>{workerLabel}</strong><p>{workerNote}</p></article>
          </div>

          <section className="panel">
            <div className="panel-head">
              <div><h2>Network checks</h2><p>Scheduled RPC probes recorded by the monitoring worker.</p></div>
              {monitoring?.canRunCycle && <button className="secondary" type="button" disabled={busy} onClick={runCycle}>{busy ? "Running…" : "Run cycle now"}</button>}
            </div>
            {monitoring?.networks.length ? monitoring.networks.map(network => (
              <div className="network" key={network.id} style={{ marginBottom: 10 }}>
                <b className="eth">Ξ</b>
                <span>
                  <strong>{network.name}</strong>
                  <small>{network.status === "connected" ? `Latest block ${network.latestBlock ? Number(network.latestBlock).toLocaleString() : "—"} · ${network.latencyMs ?? "—"} ms` : "Unreachable — checks will resume automatically"}{network.checkedAt ? ` · checked ${new Date(network.checkedAt).toLocaleTimeString()}` : ""}</small>
                </span>
                <em>{network.status === "connected" ? "Connected" : "Unavailable"}</em>
              </div>
            )) : <div className="empty"><b>No network checks recorded yet</b><p>The worker records a sample every cycle. Start the worker with <code>npm run worker</code> if this stays empty.</p></div>}
            {monitoring && <p className="hint">Indexed through block {Object.entries(monitoring.indexer).map(([network, block]) => `${network}: ${block ? Number(block).toLocaleString() : "—"}`).join(" · ")}. Alert email delivery: {monitoring.email.provider === "smtp" ? "SMTP configured" : "development outbox (no SMTP configured)"}.</p>}
          </section>

          <section className="panel">
            <div className="panel-head">
              <div><h2>Alerts</h2><p>Newest first. Email delivery status is shown per alert.</p></div>
              {unread > 0 && <button className="link" type="button" disabled={busy} onClick={() => markRead()}>Mark all as read</button>}
            </div>
            {alerts.length ? <div className="saved-list">{alerts.map(alert => (
              <article key={alert.id}>
                <span>
                  <strong>{alert.readAt ? alert.title : `● ${alert.title}`}</strong>
                  <small>{alert.body}</small>
                  <em>
                    {new Date(alert.createdAt).toLocaleString()}
                    {alert.chainId ? ` · ${NETWORK_NAMES[alert.chainId] ?? `Chain ${alert.chainId}`}` : ""}
                    {` · email: ${alert.emailStatus.toLowerCase()}`}
                  </em>
                </span>
                {!alert.readAt && <button className="plain" type="button" disabled={busy} onClick={() => markRead([alert.id])}>Mark read</button>}
              </article>
            ))}</div> : <div className="empty"><span>♧</span><b>No alerts yet</b><p>Alerts appear when the indexer detects activity for a watched address or a network check changes state.</p></div>}
          </section>

          <section className="panel">
            <div className="panel-head"><div><h2>Recent indexer activity</h2><p>Latest observations recorded for your addresses.</p></div></div>
            {monitoring?.recentEvents.length ? <div className="saved-list">{monitoring.recentEvents.map(event => (
              <article key={event.id}>
                <span>
                  <strong>{event.kind === "BALANCE_CHANGE" ? "Balance change" : "Outgoing transaction"}</strong>
                  <small>{event.detail}</small>
                  <em>{new Date(event.detectedAt).toLocaleString()}{event.blockNumber ? ` · block ${Number(event.blockNumber).toLocaleString()}` : ""}</em>
                </span>
              </article>
            ))}</div> : <div className="empty"><b>No indexed events yet</b><p>Events are recorded once a watched address shows a change between two monitoring cycles.</p></div>}
          </section>
        </>}

        <aside className="check-safety">
          <strong>How delivery works</strong>
          <p>An alert is stored in your account the moment it is detected. Email delivery is then attempted separately with retries, and the outcome is recorded on the alert — so a mail outage can never hide monitoring activity.</p>
        </aside>
      </section>
    </main>
  );
}

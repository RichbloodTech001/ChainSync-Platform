"use client";

import { FormEvent, useEffect, useState } from "react";

type User = { id: string; email: string; displayName: string | null; role?: string };
type WatchItem = { id: string; address: string; label: string; chainId: number; createdAt: string };

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [items, setItems] = useState<WatchItem[]>([]);
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [chainId, setChainId] = useState("1");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadSession() {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const data = await response.json();
    setUser(data.user ?? null);
    if (data.user) {
      const watchResponse = await fetch("/api/watchlists", { cache: "no-store" });
      const watchData = await watchResponse.json();
      if (watchResponse.ok) setItems(watchData.items ?? []);
    } else setItems([]);
  }
  useEffect(() => { loadSession().catch(() => setError("Could not load account status. Check database configuration.")); }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Authentication failed.");
      setUser(data.user); setPassword(""); setMessage(mode === "register" ? "Account created. Email verification is not enabled yet; public launch requires it." : "Signed in successfully.");
      const watchResponse = await fetch("/api/watchlists", { cache: "no-store" });
      const watchData = await watchResponse.json();
      if (watchResponse.ok) setItems(watchData.items ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Unable to sign out.");
      setUser(null); setItems([]); setMessage("Signed out.");
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed."); }
    finally { setBusy(false); }
  }

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/watchlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address, label, chainId: Number(chainId) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save address.");
      setItems(current => [data.item, ...current]); setAddress(""); setLabel(""); setMessage("Public address saved to your account.");
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed."); }
    finally { setBusy(false); }
  }

  async function removeAddress(id: string) {
    setError(""); setMessage("");
    try {
      const response = await fetch(`/api/watchlists/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to remove address.");
      setItems(current => current.filter(item => item.id !== id)); setMessage("Address removed.");
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed."); }
  }

  return <main className="check-shell">
    <header className="check-header"><a href="/" className="check-brand"><span>◇</span> ChainSync</a><span className="check-mode">ACCOUNT · SAVED WATCHLIST</span></header>
    <section className="check-content account-content">
      <a className="back-link" href="/">← Back to dashboard</a>
      <p className="eyebrow">PERSONAL WORKSPACE</p><h1>{user ? "Your account" : "Create your ChainSync account"}</h1>
      <p className="check-lead">Sign in to save public addresses to your account. ChainSync is read-only and never needs private keys or recovery phrases.</p>
      {error && <div className="check-error" role="alert">{error}</div>}
      {message && <div className="notice" role="status">{message}</div>}
      {!user ? <form className="check-form" onSubmit={submitAuth}>
        <div className="account-mode"><button type="button" className={mode === "register" ? "selected" : ""} onClick={() => setMode("register")}>Create account</button><button type="button" className={mode === "login" ? "selected" : ""} onClick={() => setMode("login")}>Sign in</button></div>
        {mode === "register" && <><label htmlFor="display-name">Display name (optional)</label><input id="display-name" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={80} autoComplete="name" /></>}
        <label htmlFor="account-email">Email address</label><input id="account-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
        <label htmlFor="account-password">Password {mode === "register" ? "(12–128 characters)" : ""}</label><input id="account-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 12 : 1} maxLength={128} required />
        <button type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}</button>
        <p className="result-note">Requires a configured PostgreSQL database and a strong SESSION_SECRET. Account verification and password recovery are not yet available.</p>
      </form> : <>
        <section className="panel account-panel"><div className="panel-head"><div><h2>{user.displayName || user.email}</h2><p>{user.email}</p></div><button type="button" className="secondary" disabled={busy} onClick={signOut}>Sign out</button></div>
          <h2>Saved public addresses</h2><p className="result-note">Saved to the database for this account only.</p>
          <form className="account-add" onSubmit={addAddress}>
            <label htmlFor="watch-label">Label</label><input id="watch-label" value={label} onChange={e => setLabel(e.target.value)} maxLength={80} placeholder="My wallet" />
            <label htmlFor="watch-address">Public address</label><input id="watch-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} required />
            <label htmlFor="watch-network">Network</label><select id="watch-network" value={chainId} onChange={e => setChainId(e.target.value)}><option value="1">Ethereum Mainnet</option><option value="11155111">Sepolia Testnet</option></select>
            <button type="submit" disabled={busy}>Save address</button>
          </form>
          {items.length ? <div className="saved-list">{items.map(item => <article key={item.id}><span><strong>{item.label}</strong><small>{item.address.slice(0, 12)}…{item.address.slice(-8)}</small><em>{item.chainId === 1 ? "Ethereum Mainnet" : "Sepolia Testnet"}</em></span><button type="button" className="plain" onClick={() => removeAddress(item.id)}>Remove</button></article>)}</div> : <div className="empty"><b>No saved addresses yet</b><p>Add a public address above to begin your watchlist.</p></div>}
        </section>
      </>}
      <aside className="check-safety"><strong>Production readiness note</strong><p>This account foundation uses hashed passwords and signed, expiring HttpOnly sessions. Before public launch, configure shared edge rate limits, email verification, password reset, monitoring, and database migration backups.</p></aside>
    </section>
  </main>;
}

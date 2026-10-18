"use client";

import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token");
    setToken(value);
    setReady(true);
  }, []);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to start password recovery.");
      setMessage(data.message ?? "If an account exists for that address, a reset link has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function choosePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage("");
    if (password !== confirm) { setError("Both passwords must match."); return; }
    if (password.length < 12 || password.length > 128) { setError("Password must be between 12 and 128 characters."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to reset the password.");
      setDone(true);
      setPassword(""); setConfirm("");
      setMessage("Your password has been changed and every existing session was signed out.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const withToken = Boolean(token);

  return (
    <main className="check-shell">
      <header className="check-header">
        <a href="/" className="check-brand"><span>◇</span> ChainSync</a>
        <span className="check-mode">ACCOUNT · PASSWORD RECOVERY</span>
      </header>
      <section className="check-content">
        <a className="back-link" href="/account">← Back to account</a>
        <p className="eyebrow">PASSWORD RECOVERY</p>
        <h1>{withToken ? "Choose a new password" : "Reset your password"}</h1>
        <p className="check-lead">
          {withToken
            ? "Set a new password for your account. The link can be used once and expires one hour after it was sent."
            : "Enter the email address on your account and we will send a single-use reset link. For privacy, we always give the same answer."}
        </p>
        {error && <div className="check-error" role="alert">{error}</div>}
        {message && <div className="notice" role="status">{message}</div>}

        {!ready ? null : withToken ? (
          done ? (
            <p><a className="link" href="/account">Sign in with your new password →</a></p>
          ) : (
            <form className="check-form" onSubmit={choosePassword}>
              <label htmlFor="reset-password">New password (12–128 characters)</label>
              <input id="reset-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required />
              <label htmlFor="reset-confirm">Confirm new password</label>
              <input id="reset-confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required />
              <button type="submit" disabled={busy}>{busy ? "Saving…" : "Set new password"}</button>
              <p className="result-note">Changing your password signs out every existing session, including any that were open elsewhere.</p>
            </form>
          )
        ) : (
          <form className="check-form" onSubmit={requestLink}>
            <label htmlFor="reset-email">Email address</label>
            <input id="reset-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
            <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
            <p className="result-note">The link expires after one hour. If a reset was not requested, no account action is needed.</p>
          </form>
        )}

        <aside className="check-safety">
          <strong>Never share this link</strong>
          <p>Anyone with the link can change the password, and it stops working once used. ChainSync will never ask for a seed phrase or private key.</p>
        </aside>
      </section>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";

type State = "idle" | "verifying" | "verified" | "failed";

export default function VerifyEmailPage() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token");
    setToken(value);
    if (!value) {
      setState("failed");
      setMessage("This page needs the verification link from your email. Open the link again, or request a new one from your account.");
      return;
    }
    setState("verifying");
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error || "Verification failed.");
        setEmail(data.email ?? "");
        setState("verified");
      } catch (error) {
        if (cancelled) return;
        setState("failed");
        setMessage(error instanceof Error ? error.message : "Verification failed. Request a new link from your account.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="check-shell">
      <header className="check-header">
        <a href="/" className="check-brand"><span>◇</span> ChainSync</a>
        <span className="check-mode">ACCOUNT · EMAIL VERIFICATION</span>
      </header>
      <section className="check-content">
        <a className="back-link" href="/account">← Back to account</a>
        <p className="eyebrow">CONFIRM YOUR ADDRESS</p>
        <h1>{state === "verified" ? "Email confirmed" : "Confirming your email"}</h1>
        <p className="check-lead">
          {state === "verified"
            ? "Your address is verified. Account recovery and email alerts are now fully enabled for this account."
            : "We are confirming the single-use link from your verification email."}
        </p>
        {state === "verifying" && <div className="notice" role="status">Checking your verification link…</div>}
        {state === "verified" && <div className="notice" role="status">{email ? `${email} is now verified.` : "Your email address is now verified."}</div>}
        {state === "failed" && <div className="check-error" role="alert">{message}</div>}
        <aside className="check-safety">
          <strong>Links are single use</strong>
          <p>Each verification link can be used once and expires 24 hours after it was sent. Signed in and still unverified? Open your account page and request a fresh link.</p>
        </aside>
        <p><a className="link" href="/account">Go to your account →</a></p>
      </section>
    </main>
  );
}

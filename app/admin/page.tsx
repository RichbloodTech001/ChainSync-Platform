"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminProjectsTable, AdminUsersTable } from "@/components/AdminTables";
import MetricCard from "@/components/MetricCard";
import { PROJECT_STATUS_LABELS, projectNeedsAttention, type AdminOverview, type ProjectStatus } from "@/lib/projects";

type SessionUser = { id: string; email: string; displayName: string | null; role: "USER" | "ADMIN" };
type Filter = "ALL" | ProjectStatus | "ATTENTION";
const POLL_MS = 5000;

export default function AdminPanelPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [updatedAt, setUpdatedAt] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/overview", { cache: "no-store" });
    const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
    const session = await sessionResponse.json();
    setUser(session.user ?? null);
    if (response.status === 401 || response.status === 403) { setDenied(true); setOverview(null); return; }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load the administrator overview.");
    setDenied(false);
    setOverview(payload as AdminOverview);
    setUpdatedAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await load(); }
      catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : "Admin request failed."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [load]);

  useEffect(() => {
    if (denied) return;
    const timer = setInterval(() => { load().catch(() => { /* retried on the next tick */ }); }, POLL_MS);
    return () => clearInterval(timer);
  }, [load, denied]);

  const summary = overview?.summary;
  const projects = useMemo(() => overview?.projects ?? [], [overview]);

  const visible = useMemo(() => {
    if (filter === "ALL") return projects;
    if (filter === "ATTENTION") return projects.filter(project => projectNeedsAttention(project));
    return projects.filter(project => project.status === filter);
  }, [projects, filter]);

  const filters = useMemo(() => ([
    { id: "ALL" as Filter, label: "All", count: projects.length },
    { id: "ACTIVE" as Filter, label: PROJECT_STATUS_LABELS.ACTIVE, count: projects.filter(project => project.status === "ACTIVE").length },
    { id: "PENDING" as Filter, label: PROJECT_STATUS_LABELS.PENDING, count: projects.filter(project => project.status === "PENDING").length },
    { id: "COMPLETE" as Filter, label: PROJECT_STATUS_LABELS.COMPLETE, count: projects.filter(project => project.status === "COMPLETE").length },
    { id: "ATTENTION" as Filter, label: "Needs attention", count: projects.filter(project => projectNeedsAttention(project)).length },
  ]), [projects]);

  return <main className="check-shell">
    <header className="check-header">
      <a href="/" className="check-brand"><span>◇</span> ChainSync</a>
      <span className="check-mode">ADMIN PANEL · RESTRICTED</span>
    </header>
    <section className="check-content wide-content">
      <a className="back-link" href="/dashboard">← Back to sync dashboard</a>
      <div className="dash-head">
        <div>
          <p className="eyebrow">WORKSPACE CONTROL</p>
          <h1>Admin panel</h1>
          <p className="check-lead">Every account and every sync project in one place, so you can see which syncs are running and which need attention across the whole workspace.</p>
        </div>
        <div className="dash-actions">
          {!denied && <span className="live-chip"><i />Live{updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString()}` : ""}</span>}
          {user && <span className="count-chip">{user.email}</span>}
          <span className={user?.role === "ADMIN" ? "role-badge admin" : "role-badge"}>{user?.role === "ADMIN" ? "Admin" : "No admin role"}</span>
        </div>
      </div>

      {error && <div className="check-error" role="alert">{error}</div>}

      {loading ? <section className="panel">Loading the workspace overview…</section>
        : denied ? <section className="panel">
          <div className="panel-head"><div><h2>Administrator access required</h2><p>This panel is limited to allowlisted administrator accounts. {user ? `${user.email} does not have administrator access.` : "Sign in with an administrator account to continue."}</p></div></div>
          <p className="result-note">Administrator emails are configured with the <code>ADMIN_EMAILS</code> environment variable.</p>
          <div className="actions">{user ? <a className="secondary" href="/dashboard">Go to sync dashboard</a> : <a className="secondary" href="/account">Sign in</a>}</div>
        </section>
        : summary && <>
          <div className="metrics metrics-4">
            <MetricCard title="Accounts" value={String(summary.users)} note="Registered users" icon="◎" />
            <MetricCard title="Sync projects" value={String(summary.projects)} note={`${summary.active} active · ${summary.pending} pending`} icon="◈" />
            <MetricCard title="Needs attention" value={String(summary.needsAttention)} note="Stalled or not started" icon="!" tone={summary.needsAttention ? "alert" : undefined} />
            <MetricCard title="Complete" value={String(summary.complete)} note="Finished syncs" icon="✓" tone="good" />
          </div>
          <AdminUsersTable users={overview.users} />
          <section className="panel">
            <div className="panel-head">
              <div><h2>Project filters</h2><p>Focus the project list on a status or on everything needing attention.</p></div>
              <span className="count-chip">{visible.length} of {projects.length}</span>
            </div>
            <div className="filters">
              {filters.map(option => <button
                key={option.id}
                type="button"
                aria-pressed={filter === option.id}
                className={filter === option.id ? "selected" : ""}
                onClick={() => setFilter(option.id)}
              >{option.label}<b>{option.count}</b></button>)}
            </div>
          </section>
          <AdminProjectsTable projects={visible} />
        </>}
    </section>
  </main>;
}

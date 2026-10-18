"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import MetricCard from "@/components/MetricCard";
import ProjectCard, { type NetworkHealthLite } from "@/components/ProjectCard";
import { PROJECT_NETWORKS, PROJECT_STATUS_LABELS, projectNeedsAttention, type ProjectDTO, type ProjectStatus } from "@/lib/projects";

type SessionUser = { id: string; email: string; displayName: string | null; role: "USER" | "ADMIN" };
type Filter = "ALL" | ProjectStatus | "ATTENTION";
const POLL_MS = 5000;

export default function SyncDashboardPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [networks, setNetworks] = useState<NetworkHealthLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [updatedAt, setUpdatedAt] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [network, setNetwork] = useState<string>("ethereum");

  const loadSession = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const payload = await response.json();
    setUser(payload.user ?? null);
  }, []);

  const loadProjects = useCallback(async () => {
    const response = await fetch("/api/projects", { cache: "no-store" });
    if (response.status === 401) { setProjects([]); return; }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load your projects.");
    setProjects(payload.items as ProjectDTO[]);
    setUpdatedAt(new Date().toISOString());
  }, []);

  const loadNetworks = useCallback(async () => {
    const response = await fetch("/api/networks", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setNetworks((payload.networks ?? []) as NetworkHealthLite[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await loadSession(); await Promise.all([loadProjects(), loadNetworks()]); }
      catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : "Dashboard request failed."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [loadSession, loadProjects, loadNetworks]);

  // Live view: project state every 5s, chain health and session every 30s.
  useEffect(() => {
    const fast = setInterval(() => { loadProjects().catch(() => { /* retried on the next tick */ }); }, POLL_MS);
    const slow = setInterval(() => { loadNetworks().catch(() => { /* optional enrichment */ }); loadSession().catch(() => { /* optional */ }); }, POLL_MS * 6);
    return () => { clearInterval(fast); clearInterval(slow); };
  }, [loadProjects, loadNetworks, loadSession]);

  const counts = useMemo(() => ({
    ACTIVE: projects.filter(project => project.status === "ACTIVE").length,
    PENDING: projects.filter(project => project.status === "PENDING").length,
    COMPLETE: projects.filter(project => project.status === "COMPLETE").length,
    ATTENTION: projects.filter(project => projectNeedsAttention(project)).length,
  }), [projects]);

  const filters = useMemo(() => ([
    { id: "ALL" as Filter, label: "All", count: projects.length },
    { id: "ACTIVE" as Filter, label: PROJECT_STATUS_LABELS.ACTIVE, count: counts.ACTIVE },
    { id: "PENDING" as Filter, label: PROJECT_STATUS_LABELS.PENDING, count: counts.PENDING },
    { id: "COMPLETE" as Filter, label: PROJECT_STATUS_LABELS.COMPLETE, count: counts.COMPLETE },
    { id: "ATTENTION" as Filter, label: "Needs attention", count: counts.ATTENTION },
  ]), [projects.length, counts]);

  const visible = useMemo(() => {
    if (filter === "ALL") return projects;
    if (filter === "ATTENTION") return projects.filter(project => projectNeedsAttention(project));
    return projects.filter(project => project.status === filter);
  }, [projects, filter]);

  const healthFor = (networkId: string) => networks.find(entry => entry.id === networkId);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("new"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, network }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to create this project.");
      setProjects(current => [payload.item as ProjectDTO, ...current]);
      setName(""); setDescription(""); setShowForm(false);
      setNotice("Project created as pending. Mark it active when its sync starts.");
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed."); }
    finally { setBusy(""); }
  }

  async function updateProject(id: string, patch: { status?: ProjectStatus; progress?: number }) {
    setBusy(id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update this project.");
      const item = payload.item as ProjectDTO;
      setProjects(current => current.map(project => project.id === id ? item : project));
      setNotice(patch.status ? `Status updated to ${PROJECT_STATUS_LABELS[patch.status]}.` : "Sync progress saved.");
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed."); }
    finally { setBusy(""); }
  }

  async function deleteProject(id: string) {
    setBusy(id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to delete this project.");
      setProjects(current => current.filter(project => project.id !== id));
      setNotice("Project deleted.");
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed."); }
    finally { setBusy(""); }
  }

  return <main className="check-shell">
    <header className="check-header">
      <a href="/" className="check-brand"><span>◇</span> ChainSync</a>
      <span className="check-mode">SYNC DASHBOARD · LIVE</span>
    </header>
    <section className="check-content wide-content">
      <a className="back-link" href="/">← Back to dashboard</a>
      <div className="dash-head">
        <div>
          <p className="eyebrow">PROJECT MONITORING</p>
          <h1>Sync dashboard</h1>
          <p className="check-lead">Mark each project active, pending or complete and watch its sync progress. This page keeps itself up to date, so running projects and ones needing attention are visible at a glance.</p>
        </div>
        <div className="dash-actions">
          <span className="live-chip"><i />Live{updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString()}` : ""}</span>
          {user?.role === "ADMIN" && <a className="badge account-link" href="/admin">Admin panel ↗</a>}
          <a className="badge account-link" href="/account">Account ↗</a>
        </div>
      </div>

      {error && <div className="check-error" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}

      {loading ? <section className="panel">Loading your sync projects…</section>
        : !user ? <section className="panel">
          <div className="panel-head"><div><h2>Sign in to track sync projects</h2><p>Projects are stored per account, so status and progress follow you between sessions.</p></div></div>
          <a className="inline-action" href="/account">Sign in or create an account →</a>
        </section>
        : <>
          <div className="metrics metrics-5">
            <MetricCard title="Total projects" value={String(projects.length)} note="All sync projects" icon="◈" />
            <MetricCard title="Active" value={String(counts.ACTIVE)} note="Syncing now" icon="◉" tone="good" />
            <MetricCard title="Pending" value={String(counts.PENDING)} note="Waiting to start" icon="◔" />
            <MetricCard title="Complete" value={String(counts.COMPLETE)} note="Finished syncs" icon="✓" />
            <MetricCard title="Needs attention" value={String(counts.ATTENTION)} note="Stalled or not started" icon="!" tone={counts.ATTENTION ? "alert" : undefined} />
          </div>

          <section className="panel add">
            <div className="panel-head">
              <div><h2>New sync project</h2><p>Name the project and choose the network its sync runs against.</p></div>
              <button className="primary" type="button" onClick={() => setShowForm(open => !open)}>{showForm ? "Close" : "＋ Add project"}</button>
            </div>
            {showForm && <form className="project-form" onSubmit={createProject}>
              <label>Project name<input id="project-name" value={name} onChange={event => setName(event.target.value)} maxLength={120} placeholder="Wallet indexer" required /></label>
              <label>Description (optional)<input id="project-description" value={description} onChange={event => setDescription(event.target.value)} maxLength={280} placeholder="What this sync covers" /></label>
              <label>Network<select id="project-network" value={network} onChange={event => setNetwork(event.target.value)}>
                {PROJECT_NETWORKS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select></label>
              <div className="actions">
                <button className="primary" type="submit" disabled={busy === "new"}>{busy === "new" ? "Adding…" : "Add project"}</button>
                <button className="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>}
          </section>

          <section className="panel">
            <div className="panel-head">
              <div><h2>Projects</h2><p>Status and sync progress for every project on this account.</p></div>
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
            {visible.length
              ? visible.map(project => <ProjectCard
                key={project.id}
                project={project}
                busy={busy === project.id}
                health={healthFor(project.network)}
                onUpdate={updateProject}
                onDelete={deleteProject}
              />)
              : <div className="empty"><span>◈</span><b>No projects here yet</b><p>{projects.length ? "No project matches this filter." : "Add a project to start tracking its sync progress."}</p></div>}
          </section>
        </>}

      <aside className="check-safety">
        <strong>How sync progress is measured</strong>
        <p>Status and progress are recorded per project by you or your team — a background indexer is not part of this repository, so ChainSync cannot advance them on its own. Chain tips come from live RPC checks. A project is flagged as needing attention when it is pending, or active without a progress update in the last 15 minutes.</p>
      </aside>
    </section>
  </main>;
}

"use client";

import { useEffect, useState } from "react";
import ProgressBar from "@/components/ProgressBar";
import StatusBadge from "@/components/StatusBadge";
import { NETWORK_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUSES, attentionReason, minutesSinceSync, type ProjectDTO, type ProjectStatus } from "@/lib/projects";

export type NetworkHealthLite = { id: string; status: "connected" | "unavailable"; latestBlock: string | null };

export default function ProjectCard({ project, busy, health, onUpdate, onDelete }: {
  project: ProjectDTO;
  busy: boolean;
  health?: NetworkHealthLite;
  onUpdate: (id: string, patch: { status?: ProjectStatus; progress?: number }) => void;
  onDelete: (id: string) => void;
}) {
  const [progress, setProgress] = useState(project.progress);
  useEffect(() => { setProgress(project.progress); }, [project.progress]);

  const reason = attentionReason(project);
  const minutes = minutesSinceSync(project.lastSyncedAt);
  const synced = project.lastSyncedAt ? (minutes === 0 ? "synced just now" : `synced ${minutes} min ago`) : "never synced";

  return <article className={reason ? "project-card attention-card" : "project-card"}>
    <div className="project-top">
      <div className="project-title">
        <strong>{project.name}</strong>
        <small>
          {NETWORK_LABELS[project.network] ?? project.network} · {synced}
          {health?.status === "connected" && health.latestBlock ? ` · chain tip ${Number(health.latestBlock).toLocaleString()}` : ""}
          {health?.status === "unavailable" ? " · RPC unavailable" : ""}
        </small>
      </div>
      <div className="project-badges">
        {reason && <span className="attention">{reason}</span>}
        <StatusBadge status={project.status} />
      </div>
    </div>
    {project.description && <p className="project-desc">{project.description}</p>}
    <ProgressBar value={project.progress} status={project.status} label={`Sync progress for ${project.name}`} />
    <div className="project-controls">
      <div className="status-picker" role="group" aria-label={`Set status for ${project.name}`}>
        {PROJECT_STATUSES.map(status => <button
          key={status}
          type="button"
          disabled={busy}
          aria-pressed={project.status === status}
          className={project.status === status ? "selected" : ""}
          onClick={() => onUpdate(project.id, { status })}
        >{PROJECT_STATUS_LABELS[status]}</button>)}
      </div>
      <div className="progress-picker">
        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          disabled={busy}
          aria-label={`Sync progress for ${project.name}`}
          onChange={event => setProgress(Number(event.target.value))}
        />
        <button type="button" className="secondary" disabled={busy || progress === project.progress} onClick={() => onUpdate(project.id, { progress })}>Save progress</button>
        <button type="button" className="plain" disabled={busy} onClick={() => onDelete(project.id)}>Delete</button>
      </div>
    </div>
  </article>;
}

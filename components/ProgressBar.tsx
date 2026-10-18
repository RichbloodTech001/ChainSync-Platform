import type { ProjectStatus } from "@/lib/projects";

export default function ProgressBar({ value, status, label = "Sync progress" }: { value: number; status: ProjectStatus; label?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return <div className="progress" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
    <span className={`progress-fill ${status.toLowerCase()}`} style={{ width: `${clamped}%` }} />
    <b>{clamped}%</b>
  </div>;
}

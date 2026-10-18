import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/projects";

export default function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`proj-status ${status.toLowerCase()}`}><i />{PROJECT_STATUS_LABELS[status]}</span>;
}

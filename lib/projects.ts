/** Shared project/sync vocabulary. Pure helpers only — safe to import from client components. */

export const PROJECT_STATUSES = ["ACTIVE", "PENDING", "COMPLETE"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: "Active",
  PENDING: "Pending",
  COMPLETE: "Complete",
};

export const PROJECT_NETWORKS = [
  { id: "ethereum", label: "Ethereum Mainnet" },
  { id: "sepolia", label: "Sepolia Testnet" },
] as const;

export type ProjectNetwork = (typeof PROJECT_NETWORKS)[number]["id"];

export const NETWORK_LABELS: Record<string, string> = {
  ethereum: "Ethereum Mainnet",
  sepolia: "Sepolia Testnet",
};

/** An ACTIVE project whose progress has not moved for this long needs attention. */
export const STALE_SYNC_MS = 15 * 60 * 1000;

export type ProjectDTO = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  progress: number;
  network: string;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserDTO = {
  id: string;
  email: string;
  displayName: string | null;
  role: "USER" | "ADMIN";
  createdAt: string;
  projectCount: number;
};

export type AdminProjectDTO = ProjectDTO & { ownerEmail: string; ownerName: string | null };

export type AdminOverview = {
  users: AdminUserDTO[];
  projects: AdminProjectDTO[];
  summary: { users: number; projects: number; active: number; pending: number; complete: number; needsAttention: number };
  checkedAt: string;
};

export function parseProjectStatus(value: unknown): ProjectStatus | null {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value) ? (value as ProjectStatus) : null;
}

export function parseProgress(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

export function isProjectNetwork(value: unknown): value is ProjectNetwork {
  return typeof value === "string" && PROJECT_NETWORKS.some(network => network.id === value);
}

/** Timestamps arrive as Date from Prisma and as ISO strings over JSON. */
export type SyncTiming = { status: ProjectStatus; lastSyncedAt: string | Date | null };

function toMillis(value: string | Date | null) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/** Minutes since the last recorded sync, or null when never synced. */
export function minutesSinceSync(lastSyncedAt: string | Date | null, now = Date.now()) {
  const synced = toMillis(lastSyncedAt);
  return synced === null ? null : Math.max(0, Math.round((now - synced) / 60000));
}

export function attentionReason(project: SyncTiming, now = Date.now()): string | null {
  if (project.status === "COMPLETE") return null;
  if (project.status === "PENDING") return "Waiting to start";
  const synced = toMillis(project.lastSyncedAt);
  if (synced === null) return "No sync recorded yet";
  return now - synced > STALE_SYNC_MS ? "Sync stalled" : null;
}

export function projectNeedsAttention(project: SyncTiming, now = Date.now()) {
  return attentionReason(project, now) !== null;
}

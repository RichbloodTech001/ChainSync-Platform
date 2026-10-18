import ProgressBar from "@/components/ProgressBar";
import StatusBadge from "@/components/StatusBadge";
import { NETWORK_LABELS, attentionReason, minutesSinceSync, type AdminProjectDTO, type AdminUserDTO } from "@/lib/projects";

export function AdminUsersTable({ users }: { users: AdminUserDTO[] }) {
  return <section className="panel">
    <div className="panel-head"><div><h2>Accounts</h2><p>Everyone with access to this workspace, and how much they are tracking.</p></div><span className="count-chip">{users.length} total</span></div>
    {users.length ? <div className="table-wrap"><table className="data-table">
      <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Projects</th><th>Joined</th></tr></thead>
      <tbody>{users.map(user => <tr key={user.id}>
        <td data-label="Email">{user.email}</td>
        <td data-label="Name">{user.displayName || "—"}</td>
        <td data-label="Role"><span className={user.role === "ADMIN" ? "role-badge admin" : "role-badge"}>{user.role === "ADMIN" ? "Admin" : "User"}</span></td>
        <td data-label="Projects">{user.projectCount}</td>
        <td data-label="Joined">{new Date(user.createdAt).toLocaleDateString()}</td>
      </tr>)}</tbody>
    </table></div> : <div className="empty"><span>◈</span><b>No accounts yet</b><p>Accounts appear here as soon as someone registers.</p></div>}
  </section>;
}

export function AdminProjectsTable({ projects }: { projects: AdminProjectDTO[] }) {
  return <section className="panel">
    <div className="panel-head"><div><h2>Sync projects</h2><p>Every project across all accounts, most recent first.</p></div><span className="count-chip">{projects.length} shown</span></div>
    {projects.length ? <div className="table-wrap"><table className="data-table">
      <thead><tr><th>Project</th><th>Owner</th><th>Status</th><th>Sync progress</th><th>Last sync</th><th>Attention</th></tr></thead>
      <tbody>{projects.map(project => {
        const reason = attentionReason(project);
        const minutes = minutesSinceSync(project.lastSyncedAt);
        return <tr key={project.id}>
          <td data-label="Project"><span className="cell-stack"><strong>{project.name}</strong><small>{NETWORK_LABELS[project.network] ?? project.network}</small></span></td>
          <td data-label="Owner">{project.ownerEmail}</td>
          <td data-label="Status"><StatusBadge status={project.status} /></td>
          <td data-label="Sync progress"><ProgressBar value={project.progress} status={project.status} label={`Sync progress for ${project.name}`} /></td>
          <td data-label="Last sync">{project.lastSyncedAt ? (minutes === 0 ? "Just now" : `${minutes} min ago`) : "—"}</td>
          <td data-label="Attention">{reason ? <span className="attention">{reason}</span> : <span className="ok-flag">On track</span>}</td>
        </tr>;
      })}</tbody>
    </table></div> : <div className="empty"><span>◈</span><b>No sync projects yet</b><p>Projects appear here as accounts create them.</p></div>}
  </section>;
}

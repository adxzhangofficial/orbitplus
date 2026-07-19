import { useMemo, useState } from "react";
import { Download, KeyRound, LockKeyhole, MoreHorizontal, ShieldCheck, UserCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/utils";
import type { Role } from "@/types";
import { platformUsers } from "./_data";
import { AdminDataNotice, adminApi, unsupported, useAdminResource } from "./_api";
import { useReasonPrompt } from "./_reason";
import { AdminButton, AdminPageHeader, Avatar, DetailGrid, Drawer, IconAction, Pagination, SearchBox, Stat, StatusPill, downloadCsv, usePagination } from "./_shared";

interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  organization: string;
  organizationId: string;
  role: Exclude<Role, "platform_admin">;
  status: string;
  joinedAt: string;
}

const fallbackUsers: DirectoryUser[] = platformUsers.map((user) => ({ id: user.id, name: user.name, email: user.email, organization: user.organization, organizationId: `demo_${user.organization}`, role: user.role === "platform_admin" ? "admin" : user.role, status: user.status, joinedAt: user.joinedAt }));

async function loadDirectoryUsers(): Promise<DirectoryUser[]> {
  const directory = await adminApi.directory();
  return directory.details.flatMap((detail) => detail.members.map((member) => ({ ...member, organization: detail.organization.name, organizationId: detail.organization.id })));
}

export function UsersAdminPage() {
  const resource = useAdminResource("admin-directory-users", fallbackUsers, loadDirectoryUsers);
  const prompt = useReasonPrompt();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [state, setState] = useState("all");
  const [selectedId, setSelectedId] = useState<string>();
  const filtered = useMemo(() => resource.data.filter((user) => `${user.name} ${user.email} ${user.organization}`.toLowerCase().includes(query.toLowerCase()) && (role === "all" || user.role === role) && (state === "all" || user.status === state)), [query, resource.data, role, state]);
  const pagination = usePagination(filtered, 8);
  const selected = resource.data.find((user) => user.id === selectedId);
  const organizationCount = new Set(resource.data.map((user) => user.organizationId)).size;

  function exportDirectory() {
    downloadCsv("orbit-users.csv", filtered.map((user) => ({ id: user.id, name: user.name, email: user.email, organization: user.organization, organizationId: user.organizationId, role: user.role, status: user.status, joinedAt: user.joinedAt })));
    toast.success("User directory exported");
  }

  return <>
    <AdminPageHeader title="Users & access" description="Platform-wide customer identity inventory sourced from tenant memberships." actions={<><AdminButton onClick={exportDirectory}><Download />Export directory</AdminButton><AdminButton variant="primary" onClick={() => unsupported("Platform user invitation")}><UserPlus />Invite user <small>API required</small></AdminButton></>} />
    <div className="mb-3"><AdminDataNotice source={resource.source} error={resource.error} /></div>
    <div className="adm-stats"><Stat label="Total identities" value={resource.data.length} detail="membership records" icon={Users} /><Stat label="Active users" value={resource.data.filter((user) => user.status === "active").length} detail="active memberships" icon={UserCheck} /><Stat label="Privileged members" value={resource.data.filter((user) => user.role === "owner" || user.role === "admin").length} detail="owners and admins" icon={ShieldCheck} /><Stat label="Organizations represented" value={organizationCount} detail="loaded customer page" icon={LockKeyhole} /></div>

    <div className="adm-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search user, email, or organization…" /><select className="adm-select" value={role} onChange={(event) => setRole(event.target.value)}><option value="all">All roles</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="developer">Developer</option><option value="operator">Operator</option><option value="viewer">Viewer</option></select><select className="adm-select" value={state} onChange={(event) => setState(event.target.value)}><option value="all">All status</option><option value="active">Active</option><option value="invited">Invited</option><option value="suspended">Suspended</option></select></div>
    <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>User</th><th>Organization</th><th>Role</th><th>Status</th><th>Joined</th><th>Authentication</th><th /></tr></thead><tbody>{pagination.rows.map((user) => <tr className="clickable" key={`${user.organizationId}-${user.id}`} onClick={() => setSelectedId(user.id)}><td><div className="adm-primary-cell"><Avatar name={user.name} /><div className="adm-cell-copy"><b>{user.name}</b><small>{user.email}</small></div></div></td><td>{user.organization}</td><td><StatusPill status="neutral" label={user.role} noDot /></td><td><StatusPill status={user.status} /></td><td>{relativeTime(user.joinedAt)}</td><td><StatusPill status="neutral" label="Not exposed by API" noDot /></td><td><IconAction label="Inspect user" onClick={(event) => { event.stopPropagation(); setSelectedId(user.id); }}><MoreHorizontal /></IconAction></td></tr>)}{!pagination.rows.length && <tr><td colSpan={7}><div className="adm-empty"><div><Users /><b>No identities match these filters</b><p>Clear a filter or search for a different user.</p></div></div></td></tr>}</tbody></table><Pagination {...pagination} onPage={pagination.setPage} /></div>

    <Drawer open={Boolean(selected)} onClose={() => setSelectedId(undefined)} title={selected?.name ?? "User"} description={selected?.email} footer={selected && <><AdminButton variant="danger" onClick={() => prompt.ask({ title: `Suspend ${selected.name}`, description: "Disables the account and signs out every session immediately.", confirmLabel: "Suspend account", destructive: true, run: (reason) => adminApi.suspendUser(selected.id, reason), onDone: () => void resource.refresh() })}>Suspend & revoke</AdminButton><AdminButton onClick={() => prompt.ask({ title: `Restore ${selected.name}`, description: "Re-enables the account. The person can sign in again.", confirmLabel: "Restore access", destructive: false, run: (reason) => adminApi.restoreUser(selected.id, reason), onDone: () => void resource.refresh() })}>Restore access</AdminButton></>}>
      {selected && <><div className="flex items-center gap-3 mb-4"><Avatar name={selected.name} /><div className="adm-cell-copy"><b>{selected.name}</b><small>{selected.organization}</small></div><span className="ml-auto"><StatusPill status={selected.status} /></span></div><DetailGrid items={[["Role", selected.role], ["Organization ID", <span className="adm-mono">{selected.organizationId}</span>], ["Membership status", selected.status], ["Joined", new Date(selected.joinedAt).toLocaleDateString()], ["MFA", "Not exposed by admin API"], ["Active sessions", "Not exposed by admin API"]]} />
        <p className="adm-section-label">Access controls</p><div className="adm-check-row"><span><b>Change tenant role</b><small>Requires a platform membership mutation endpoint.</small></span><IconAction label="Change role unsupported" onClick={() => unsupported("Tenant role update")}><KeyRound /></IconAction></div><div className="adm-check-row"><span><b>Reset authentication factors</b><small>Requires an identity-security endpoint.</small></span><IconAction label="Reset MFA unsupported" onClick={() => unsupported("Authentication factor reset")}><KeyRound /></IconAction></div><div className="adm-check-row"><span><b>Revoke active sessions</b><small>Requires a platform session endpoint.</small></span><IconAction label="Revoke every session" onClick={() => prompt.ask({ title: `Revoke sessions for ${selected.name}`, description: "Signs out every device without disabling the account.", confirmLabel: "Revoke sessions", destructive: true, run: (reason) => adminApi.revokeUserSessions(selected.id, reason) })}><LockKeyhole /></IconAction></div><div className="adm-notice mt-4"><ShieldCheck />Identity rows are live membership records. Authentication posture and access mutations are intentionally labeled unavailable because the current backend does not expose those platform-admin contracts.</div>
      </>}
    </Drawer>
    {prompt.element}
  </>;
}

export default UsersAdminPage;

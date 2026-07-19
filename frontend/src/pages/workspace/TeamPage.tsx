import { useMemo, useState } from "react";
import { KeyRound, MailPlus, SearchX, ShieldCheck, Trash2, UserPlus, Users, UserX } from "lucide-react";
import { toast } from "sonner";
import { WorkspaceDataStatus } from "@/components/workspace-data-status";
import { api } from "@/lib/api";
import { useLiveResource } from "@/lib/use-live-resource";
import { relativeTime } from "@/lib/utils";
import type { Role, TeamMember } from "@/types";
import { buttonClass, controlClass, EmptyState, IconButton, Modal, PageHeader, Panel, primaryButtonClass, SearchField, Stat, StatusBadge, tableClass, tableWrapClass, tdClass, thClass, pageContainerClass } from "./_shared";

type TeamRow = TeamMember & { membershipId?: string; invitationId?: string; kind?: "member" | "invitation"; accessReported?: boolean };
type BackendTeam = { members: Array<{ membershipId: string; id: string; name: string; email: string; role: Role; status: string; lastLoginAt?: string; joinedAt: string }>; invitations: Array<{ id: string; email: string; role: Role; status: string; expiresAt: string; createdAt: string }> };

function toTeamRows(data: BackendTeam): TeamRow[] {
  return [
    ...data.members.map((member): TeamRow => ({ id: member.id, membershipId: member.membershipId, kind: "member", name: member.name, email: member.email, role: member.role, status: member.status === "active" ? "active" : "suspended", lastActive: member.lastLoginAt ?? member.joinedAt, servers: 0, mfa: false, accessReported: false })),
    ...data.invitations.map((invite): TeamRow => ({ id: invite.id, invitationId: invite.id, kind: "invitation", name: invite.email.split("@")[0].replace(/[._-]/g, " "), email: invite.email, role: invite.role, status: "invited", lastActive: invite.createdAt, servers: 0, mfa: false, accessReported: false })),
  ];
}

export function TeamPage() {
  const resource = useLiveResource([] as TeamRow[], async () => toTeamRows(await api.get<BackendTeam>("/team/members")));
  const { data: members, setData: setMembers, live } = resource;
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", role: "developer" as "viewer" | "developer" | "admin" });
  const filtered = useMemo(() => members.filter((member) => (role === "all" || member.role === role) && `${member.name} ${member.email}`.toLowerCase().includes(query.toLowerCase())), [members, query, role]);

  async function sendInvite() {
    if (!/^\S+@\S+\.\S+$/.test(invite.email)) { toast.error("Enter a valid email address"); return; }
    if (live) {
      try {
        const created = await api.post<{ id: string; email: string; role: Role; status: string; expiresAt: string; createdAt: string }>("/team/invitations", invite);
        const row = toTeamRows({ members: [], invitations: [created] })[0];
        setMembers((current) => [...current, row]);
      } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to send invitation"); return; }
    } else {
      setMembers((current) => [...current, { id: `m_${Date.now()}`, name: invite.email.split("@")[0].replace(/[._-]/g, " "), email: invite.email, role: invite.role, status: "invited", lastActive: new Date().toISOString(), servers: 0, mfa: false }]);
    }
    setInvite((value) => ({ ...value, email: "" })); setOpen(false); toast.success(live ? "Invitation created" : "Preview invitation added");
  }

  async function changeRole(member: TeamRow, next: Role) {
    if (next === "operator" && live) { toast.info("The API supports viewer, developer, and admin roles; operator is preview-only."); return; }
    if (live) {
      if (!member.membershipId) return;
      try { await api.patch(`/team/members/${member.membershipId}`, { role: next }); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update role"); return; }
    }
    setMembers((rows) => rows.map((row) => row.id === member.id ? { ...row, role: next } : row)); toast.success(`${member.name}'s role updated`);
  }

  async function remove(member: TeamRow) {
    if (live) {
      const path = member.invitationId ? `/team/invitations/${member.invitationId}` : member.membershipId ? `/team/members/${member.membershipId}` : undefined;
      if (!path) return;
      try { await api.delete(path); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Unable to remove access"); return; }
    }
    setMembers((rows) => rows.filter((row) => row.id !== member.id)); toast.success(member.status === "invited" ? "Invitation cancelled" : "Member removed");
  }

  const active = members.filter((member) => member.status === "active").length;
  const mfaCoverage = active ? Math.round(members.filter((member) => member.status === "active" && member.mfa).length / active * 100) : 0;
  return <div className={pageContainerClass}>
    <PageHeader eyebrow="Access control" title="Team" description="Invite collaborators, assign least-privilege roles, and keep workspace access accountable." actions={<button className={primaryButtonClass} onClick={() => setOpen(true)}><UserPlus className="size-3.5" />Invite member</button>} />
    <WorkspaceDataStatus live={live} loading={resource.loading} error={resource.error} onRetry={() => void resource.refresh().catch(() => undefined)} />
    <div className="grid gap-3 sm:grid-cols-3"><Stat label="Workspace members" value={active} detail="Active memberships" icon={Users} /><Stat label="Pending invites" value={members.filter((member) => member.status === "invited").length} detail="Expire after 7 days" icon={MailPlus} tone="amber" /><Stat label="MFA coverage" value={live ? "Not reported" : `${mfaCoverage}%`} detail={live ? "Authentication factor state is private" : "Preview security posture"} icon={ShieldCheck} tone="emerald" /></div>
    <Panel title="Members and invitations" description={`${members.length} access records`} flush><div className="grid gap-2 border-b border-white/[0.06] p-3 sm:grid-cols-[minmax(0,1fr)_170px]"><SearchField value={query} onChange={setQuery} placeholder="Search name or email" /><select className={controlClass} value={role} onChange={(event) => setRole(event.target.value)}><option value="all">All roles</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="developer">Developer</option>{!live ? <option value="operator">Operator</option> : null}<option value="viewer">Viewer</option></select></div>{filtered.length ? <div className={tableWrapClass}><table className={tableClass}><thead><tr><th className={thClass}>Member</th><th className={thClass}>Role</th><th className={thClass}>Server access</th><th className={thClass}>Last active</th><th className={thClass}>MFA</th><th className={thClass}>Status</th><th className={thClass} /></tr></thead><tbody>{filtered.map((member) => <tr key={member.id} className="hover:bg-white/[0.02]"><td className={tdClass}><div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-indigo-500/30 to-violet-500/20 text-[9px] font-semibold text-zinc-200">{member.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><div><p className="font-medium capitalize text-zinc-200">{member.name}</p><p className="mt-1 text-[10px] text-zinc-600">{member.email}</p></div></div></td><td className={tdClass}>{member.role === "owner" || member.status === "invited" ? <StatusBadge status={member.role} /> : <select aria-label={`Role for ${member.name}`} className={`${controlClass} h-8 py-0`} value={member.role} onChange={(event) => void changeRole(member, event.target.value as Role)}><option value="admin">Admin</option><option value="developer">Developer</option>{!live ? <option value="operator">Operator</option> : null}<option value="viewer">Viewer</option></select>}</td><td className={tdClass}>{live ? "Workspace policy" : member.servers ? `${member.servers} servers` : "None yet"}</td><td className={tdClass}>{member.status === "invited" ? "Invite pending" : relativeTime(member.lastActive)}</td><td className={tdClass}>{live ? <span className="text-zinc-600">Not reported</span> : member.mfa ? <span className="inline-flex items-center gap-1 text-emerald-300"><KeyRound className="size-3.5" />Enabled</span> : <span className="text-amber-300">Not enabled</span>}</td><td className={tdClass}><StatusBadge status={member.status} /></td><td className={tdClass}>{member.role !== "owner" ? <div className="flex justify-end"><IconButton title={member.status === "invited" ? "Cancel invite" : "Remove member"} onClick={() => void remove(member)}>{member.status === "invited" ? <Trash2 className="size-3.5" /> : <UserX className="size-3.5" />}</IconButton></div> : null}</td></tr>)}</tbody></table></div> : <EmptyState icon={SearchX} title="No members found" description="Change the search or role filter to find a team member." />}</Panel>
    <Modal open={open} onClose={() => setOpen(false)} title="Invite a teammate" description="Create a seven-day invitation for the selected workspace role." footer={<><button className={buttonClass} onClick={() => setOpen(false)}>Cancel</button><button className={primaryButtonClass} onClick={() => void sendInvite()}><MailPlus className="size-3.5" />Send invite</button></>}><div className="space-y-4"><label className="text-xs text-zinc-400">Email address<input autoFocus type="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} placeholder="developer@company.com" className={`${controlClass} mt-1.5 w-full`} /></label><label className="text-xs text-zinc-400">Workspace role<select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value as typeof invite.role })} className={`${controlClass} mt-1.5 w-full`}><option value="admin">Admin · everything except ownership</option><option value="developer">Developer · files and deployments</option><option value="viewer">Viewer · read-only access</option></select></label><div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 text-[10px] leading-5 text-zinc-500">Access can be narrowed to specific servers after invitation acceptance when server grants are enabled.</div></div></Modal>
  </div>;
}

export default TeamPage;

import { useMemo, useState } from "react";
import { Building2, Download, ExternalLink, MoreHorizontal, Plus, Server, Shield, Users, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { formatBytes, relativeTime } from "@/lib/utils";
import { AdminDataNotice, adminApi, type AdminCustomer, type AdminCustomerDetail, unsupported, useAdminResource } from "./_api";
import { useReasonPrompt } from "./_reason";
import { AdminButton, AdminPageHeader, Avatar, DetailGrid, Drawer, IconAction, Pagination, ProgressBar, SearchBox, Stat, StatusPill, downloadCsv, usePagination } from "./_shared";

// No fabricated tenants: an unauthenticated or failing admin API shows an
// empty ledger rather than a fictional customer base.
const fallbackCustomers: AdminCustomer[] = [];

const planLabel = (plan: AdminCustomer["plan"]) => `${plan[0].toUpperCase()}${plan.slice(1)}`;

export function OrganizationsAdminPage() {
  const resource = useAdminResource("admin-customers", fallbackCustomers, adminApi.customers);
  const prompt = useReasonPrompt();
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<AdminCustomerDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [mutating, setMutating] = useState(false);

  const filtered = useMemo(() => resource.data.filter((organization) => `${organization.name} ${organization.slug} ${organization.id}`.toLowerCase().includes(query.toLowerCase()) && (plan === "all" || organization.plan === plan) && (status === "all" || organization.status === status)), [plan, query, resource.data, status]);
  const pagination = usePagination(filtered, 7);
  const selected = resource.data.find((organization) => organization.id === selectedId);
  const active = resource.data.filter((organization) => organization.status === "active" || organization.status === "trialing").length;
  const backupBytes = resource.data.reduce((sum, item) => sum + Number(item.backupBytes ?? 0), 0);

  async function openCustomer(id: string) {
    setSelectedId(id);
    setDetail(undefined);
    if (resource.source !== "live") return;
    setDetailLoading(true);
    try { setDetail(await adminApi.customer(id)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Customer detail could not be loaded"); }
    finally { setDetailLoading(false); }
  }

  async function patchCustomer(input: { plan?: AdminCustomer["plan"]; status?: AdminCustomer["status"] }, success: string) {
    if (!selected) return;
    if (resource.source !== "live") { unsupported("Customer update in demo mode"); return; }
    setMutating(true);
    try {
      await adminApi.updateCustomer(selected.id, input);
      await resource.refresh();
      setDetail(await adminApi.customer(selected.id));
      toast.success(success);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Customer update failed"); }
    finally { setMutating(false); }
  }

  function exportRows() {
    downloadCsv("orbit-organizations.csv", filtered.map((item) => ({ id: item.id, name: item.name, slug: item.slug, plan: item.plan, status: item.status, members: item.members, workspaces: item.workspaces ?? 0, servers: item.servers, backupBytes: Number(item.backupBytes ?? 0) })));
    toast.success(`${filtered.length} organizations exported`);
  }

  return <>
    <AdminPageHeader title="Organizations & customers" description="Inspect and govern every customer tenant from the authenticated platform ledger." actions={<><AdminButton onClick={exportRows}><Download />Export ledger</AdminButton><AdminButton variant="primary" onClick={() => unsupported("Organization provisioning")}><Plus />New organization <small>API required</small></AdminButton></>} />
    <div className="mb-3"><AdminDataNotice source={resource.source} error={resource.error} /></div>
    <div className="adm-stats"><Stat label="Total organizations" value={resource.data.length} detail="customer ledger" icon={Building2} /><Stat label="Active tenants" value={active} change={`${Math.round(active / Math.max(resource.data.length, 1) * 100)}%`} detail="active or trialing" icon={Shield} /><Stat label="Managed servers" value={resource.data.reduce((total, item) => total + item.servers, 0)} detail="across all tenants" icon={Server} /><Stat label="Protected storage" value={formatBytes(backupBytes)} detail="completed backups" icon={WalletCards} /></div>

    <div className="adm-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search name, slug, or organization ID…" /><select className="adm-select" value={plan} onChange={(event) => setPlan(event.target.value)}><option value="all">All plans</option><option value="free">Free</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select><select className="adm-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All status</option><option value="active">Active</option><option value="trialing">Trialing</option><option value="suspended">Suspended</option><option value="cancelled">Cancelled</option></select>{(query || plan !== "all" || status !== "all") && <AdminButton variant="ghost" size="small" onClick={() => { setQuery(""); setPlan("all"); setStatus("all"); }}>Clear filters</AdminButton>}</div>
    <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Organization</th><th>Plan</th><th>Status</th><th>Members</th><th>Workspaces</th><th>Servers</th><th>Backup storage</th><th>Joined</th><th /></tr></thead><tbody>{pagination.rows.map((organization) => <tr className="clickable" key={organization.id} onClick={() => void openCustomer(organization.id)}><td><div className="adm-primary-cell"><Avatar name={organization.name} /><div className="adm-cell-copy"><b>{organization.name}</b><small>{organization.slug}.orbit.run · {organization.id}</small></div></div></td><td><StatusPill status={organization.plan === "enterprise" ? "lime" : organization.plan === "pro" ? "info" : "neutral"} label={planLabel(organization.plan)} noDot /></td><td><StatusPill status={organization.status} /></td><td className="adm-num">{organization.members}</td><td className="adm-num">{organization.workspaces ?? "—"}</td><td className="adm-num">{organization.servers}</td><td className="adm-num">{formatBytes(Number(organization.backupBytes ?? 0))}</td><td>{relativeTime(organization.createdAt)}</td><td><IconAction label="Open organization" onClick={(event) => { event.stopPropagation(); void openCustomer(organization.id); }}><MoreHorizontal /></IconAction></td></tr>)}{!pagination.rows.length && <tr><td colSpan={9}><div className="adm-empty"><div><Building2 /><b>No organizations found</b><p>Try changing the plan, status, or search filters.</p></div></div></td></tr>}</tbody></table><Pagination {...pagination} onPage={pagination.setPage} /></div>

    <Drawer open={Boolean(selected)} onClose={() => { setSelectedId(undefined); setDetail(undefined); }} title={selected?.name ?? "Organization"} description={selected ? `${selected.slug}.orbit.run · ${selected.id}` : undefined} footer={selected && <><AdminButton variant="danger" disabled={mutating} onClick={() => prompt.ask(selected.status === "suspended" ? { title: `Restore ${selected.name}`, description: "Members can sign in and reach the workspace again.", confirmLabel: "Restore tenant", destructive: false, run: (reason: string) => adminApi.restoreOrganization(selected.id, reason), onDone: () => void resource.refresh() } : { title: `Suspend ${selected.name}`, description: "Signs out every member and blocks workspace access until restored.", confirmLabel: "Suspend tenant", destructive: true, run: (reason: string) => adminApi.suspendOrganization(selected.id, reason), onDone: () => void resource.refresh() })}>{selected.status === "suspended" ? "Restore access" : "Suspend tenant"}</AdminButton><AdminButton onClick={() => unsupported("Customer workspace impersonation")}><ExternalLink />Open workspace <small>Unsupported</small></AdminButton></>}>
      {selected && <><div className="flex items-center gap-3 mb-4"><Avatar name={selected.name} /><div className="adm-cell-copy"><b>{selected.name}</b><small>Customer since {new Date(selected.createdAt).toLocaleDateString()}</small></div><span className="ml-auto"><StatusPill status={selected.status} /></span></div><DetailGrid items={[["Plan", planLabel(selected.plan)], ["Members", detail?.members.length ?? selected.members], ["Workspaces", selected.workspaces ?? "—"], ["Servers", detail?.servers.length ?? selected.servers], ["Backups", detail?.usage.backups ?? "Loading…"], ["Deployments", detail?.usage.deployments ?? "Loading…"]]} />
        <p className="adm-section-label">Subscription controls</p><div className="adm-field"><label>Plan</label><select className="adm-select w-full" value={selected.plan} disabled={mutating} onChange={(event) => void patchCustomer({ plan: event.target.value as AdminCustomer["plan"] }, `Plan changed to ${event.target.value}`)}><option value="free">Free</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></div>
        <p className="adm-section-label">Customer inventory {detailLoading && "· loading"}</p>{detail && <><div className="adm-check-row"><span><b>Identity directory</b><small>{detail.members.map((member) => member.email).slice(0, 2).join(", ") || "No members"}</small></span><span>{detail.members.length}</span></div><div className="adm-check-row"><span><b>Server connections</b><small>{detail.servers.map((server) => server.name).slice(0, 2).join(", ") || "No servers"}</small></span><span>{detail.servers.length}</span></div><div className="adm-check-row"><span><b>Transfers</b><small>Tenant lifetime count</small></span><span>{detail.usage.transfers}</span></div></>}
        <p className="adm-section-label">Internal operator note</p><textarea className="adm-textarea" placeholder="Notes are not persisted by the current backend API." /><AdminButton className="mt-2" size="small" onClick={() => unsupported("Operator note persistence")}>Save note <small>Unsupported</small></AdminButton><div className="adm-notice mt-4"><Users />Customer details and plan/status mutations use the platform-admin API. Impersonation, invitations, secret rotation, and notes require additional endpoints.</div>
      </>}
    </Drawer>
    {prompt.element}
  </>;
}

export default OrganizationsAdminPage;

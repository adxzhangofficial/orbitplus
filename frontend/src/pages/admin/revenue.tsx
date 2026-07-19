import { useMemo, useState } from "react";
import { BarChart3, CircleDollarSign, CreditCard, Download, MoreHorizontal, RefreshCw, TrendingUp, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/utils";
import { organizations as seedOrganizations } from "@/lib/mock-data";
import { AdminDataNotice, adminApi, type AdminCustomer, type AdminOverview, unsupported, useAdminResource } from "./_api";
import { AdminButton, AdminPageHeader, BarChart, DetailGrid, Drawer, IconAction, Pagination, Panel, SearchBox, Stat, StatusPill, downloadCsv, formatCurrency, usePagination } from "./_shared";

interface RevenueData { overview: AdminOverview; customers: AdminCustomer[] }

const fallbackCustomers: AdminCustomer[] = seedOrganizations.map((item) => ({ id: item.id, name: item.name, slug: item.slug, plan: item.plan.toLowerCase() as AdminCustomer["plan"], status: item.status === "trial" || item.status === "past_due" ? "trialing" : item.status === "active" || item.status === "suspended" ? item.status : "cancelled", members: item.members, workspaces: 1, servers: item.servers, backupBytes: 0, createdAt: item.joinedAt }));
const fallback: RevenueData = { overview: { counts: { users: 1284, organizations: fallbackCustomers.length, servers: 319, activeTransfers: 18, criticalAlerts: 2, suspendedOrganizations: fallbackCustomers.filter((item) => item.status === "suspended").length }, revenue: { monthlyRecurringCents: 32_400_00, free: fallbackCustomers.filter((item) => item.plan === "free").length, pro: fallbackCustomers.filter((item) => item.plan === "pro").length, enterprise: fallbackCustomers.filter((item) => item.plan === "enterprise").length }, growth: [], infrastructure: { online: 302, offline: 9, unknown: 8 }, recentCustomers: [] }, customers: fallbackCustomers };

async function loadRevenue(): Promise<RevenueData> {
  const [overview, customers] = await Promise.all([adminApi.overview(), adminApi.customers()]);
  return { overview, customers };
}

export function RevenueAdminPage() {
  const resource = useAdminResource("admin-revenue", fallback, loadRevenue);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [mutating, setMutating] = useState(false);
  const selected = resource.data.customers.find((row) => row.id === selectedId);
  const filtered = useMemo(() => resource.data.customers.filter((row) => `${row.name} ${row.id} ${row.plan}`.toLowerCase().includes(query.toLowerCase()) && (status === "all" || row.status === status)), [query, resource.data.customers, status]);
  const pagination = usePagination(filtered, 8);
  const mrr = resource.data.overview.revenue.monthlyRecurringCents / 100;
  const paid = resource.data.overview.revenue.pro + resource.data.overview.revenue.enterprise;

  async function patchCustomer(input: { plan?: AdminCustomer["plan"]; status?: AdminCustomer["status"] }) {
    if (!selected) return;
    if (resource.source !== "live") { unsupported("Subscription update in demo mode"); return; }
    setMutating(true);
    try { await adminApi.updateCustomer(selected.id, input); await resource.refresh(); toast.success("Subscription ledger updated"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Subscription update failed"); }
    finally { setMutating(false); }
  }

  function exportLedger() {
    downloadCsv("orbit-subscriptions.csv", filtered.map((item) => ({ organizationId: item.id, organization: item.name, slug: item.slug, plan: item.plan, status: item.status, members: item.members, servers: item.servers, joinedAt: item.createdAt })));
    toast.success("Revenue ledger exported");
  }

  return <>
    <AdminPageHeader title="Usage & revenue" description="Live subscription mix and recurring revenue totals from the platform ledger." actions={<><AdminButton onClick={exportLedger}><Download />Export ledger</AdminButton><AdminButton variant="primary" onClick={() => unsupported("Billing-provider reconciliation")}><RefreshCw />Reconcile billing <small>API required</small></AdminButton></>} />
    <div className="mb-3"><AdminDataNotice source={resource.source} error={resource.error} /></div>
    <div className="adm-stats"><Stat label="Monthly recurring revenue" value={formatCurrency(mrr)} detail="active and trialing subscriptions" icon={CircleDollarSign} /><Stat label="Annual run rate" value={formatCurrency(mrr * 12)} detail="current MRR × 12" icon={TrendingUp} /><Stat label="Paid organizations" value={paid} detail="Pro and Enterprise" icon={WalletCards} /><Stat label="Suspended tenants" value={resource.data.overview.counts.suspendedOrganizations} detail="access restricted" icon={CreditCard} /></div>

    <div className="adm-grid two"><Panel title="Plan distribution" description="Current active and trialing subscription counts"><BarChart values={[resource.data.overview.revenue.free, resource.data.overview.revenue.pro, resource.data.overview.revenue.enterprise]} labels={["Free", "Pro", "Enterprise"]} /><div className="adm-metric-grid"><div className="adm-metric-box"><span>Free</span><b>{resource.data.overview.revenue.free}</b><small>Organizations</small></div><div className="adm-metric-box"><span>Pro</span><b>{resource.data.overview.revenue.pro}</b><small>Organizations</small></div><div className="adm-metric-box"><span>Enterprise</span><b>{resource.data.overview.revenue.enterprise}</b><small>Organizations</small></div></div></Panel><Panel title="Revenue API coverage" description="Commercial data available to platform operators"><div className="adm-kpi-row"><span>Aggregate monthly recurring revenue</span><StatusPill status="active" label="Live" /></div><div className="adm-kpi-row"><span>Subscription plan and tenant status</span><StatusPill status="active" label="Live + mutable" /></div><div className="adm-kpi-row"><span>Per-customer price and invoices</span><StatusPill status="neutral" label="Not exposed" noDot /></div><div className="adm-kpi-row"><span>Refunds and payment-provider actions</span><StatusPill status="neutral" label="Not exposed" noDot /></div><div className="adm-notice mt-3"><BarChart3 />Per-customer MRR is intentionally not estimated. The backend currently returns an authoritative aggregate only.</div></Panel></div>

    <div className="adm-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search subscription, organization, or plan…" /><select className="adm-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Any status</option><option value="active">Active</option><option value="trialing">Trialing</option><option value="suspended">Suspended</option><option value="cancelled">Cancelled</option></select></div><div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Subscription</th><th>Plan</th><th>Status</th><th>Members</th><th>Servers</th><th>MRR</th><th>Created</th><th /></tr></thead><tbody>{pagination.rows.map((row) => <tr className="clickable" key={row.id} onClick={() => setSelectedId(row.id)}><td><div className="adm-primary-cell"><span className="adm-cell-icon"><CreditCard /></span><div className="adm-cell-copy"><b>{row.name}</b><small className="adm-mono">{row.id}</small></div></div></td><td><StatusPill status={row.plan === "enterprise" ? "lime" : row.plan === "pro" ? "info" : "neutral"} label={row.plan} noDot /></td><td><StatusPill status={row.status} /></td><td>{row.members}</td><td>{row.servers}</td><td><StatusPill status="neutral" label="Aggregate only" noDot /></td><td>{relativeTime(row.createdAt)}</td><td><IconAction label="Inspect subscription" onClick={(event) => { event.stopPropagation(); setSelectedId(row.id); }}><MoreHorizontal /></IconAction></td></tr>)}</tbody></table><Pagination {...pagination} onPage={pagination.setPage} /></div>

    <Drawer open={Boolean(selected)} onClose={() => setSelectedId(undefined)} title={selected?.name ?? "Subscription"} description={selected?.id} footer={selected && <><AdminButton onClick={() => unsupported("Customer billing portal link")}>Portal link <small>Unsupported</small></AdminButton><AdminButton variant="danger" onClick={() => unsupported("Customer refund")}>Issue refund <small>Unsupported</small></AdminButton></>}>
      {selected && <><div className="flex items-center justify-between mb-4"><StatusPill status={selected.status} /><StatusPill status={selected.plan === "enterprise" ? "lime" : selected.plan === "pro" ? "info" : "neutral"} label={selected.plan} noDot /></div><DetailGrid items={[["Members", selected.members], ["Servers", selected.servers], ["Created", new Date(selected.createdAt).toLocaleDateString()], ["Per-customer MRR", "Not exposed"], ["Billing interval", "Not exposed"], ["Payment method", "Not exposed"]]} /><p className="adm-section-label">Live subscription controls</p><div className="adm-field"><label>Plan</label><select className="adm-select w-full" value={selected.plan} disabled={mutating} onChange={(event) => void patchCustomer({ plan: event.target.value as AdminCustomer["plan"] })}><option value="free">Free</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></div><div className="adm-field mt-3"><label>Tenant status</label><select className="adm-select w-full" value={selected.status} disabled={mutating} onChange={(event) => void patchCustomer({ status: event.target.value as AdminCustomer["status"] })}><option value="active">Active</option><option value="trialing">Trialing</option><option value="suspended">Suspended</option><option value="cancelled">Cancelled</option></select></div><div className="adm-notice mt-4"><BarChart3 />Plan and status changes call the authenticated PATCH customer endpoint. Refunds, invoices, portal links, and payment reconciliation remain unavailable until billing-provider endpoints are added.</div></>}
    </Drawer>
  </>;
}

export default RevenueAdminPage;

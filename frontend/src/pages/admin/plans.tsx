import { useState } from "react";
import { BadgePercent, Check, CircleDollarSign, Crown, Edit3, Gift, Plus, Save, Server, ShieldCheck, Sparkles, Users, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { AdminButton, AdminPageHeader, Modal, Panel, Stat, StatusPill, Toggle, formatCurrency } from "./_shared";

interface PlanDefinition {
  id: "free" | "pro" | "enterprise";
  name: string;
  description: string;
  monthly: number;
  annual: number;
  activeCustomers: number;
  mrr: number;
  servers: number | "Custom";
  users: number | "Unlimited";
  storage: string;
  support: string;
  published: boolean;
  featured: boolean;
}

const initialPlans: PlanDefinition[] = [
  { id: "free", name: "Free", description: "For individual developers exploring secure remote work.", monthly: 0, annual: 0, activeCustomers: 842, mrr: 0, servers: 2, users: 1, storage: "2 GB", support: "Community", published: true, featured: false },
  { id: "pro", name: "Pro", description: "For growing teams managing production infrastructure.", monthly: 29, annual: 290, activeCustomers: 317, mrr: 9193, servers: 25, users: 10, storage: "250 GB", support: "Priority email", published: true, featured: true },
  { id: "enterprise", name: "Enterprise", description: "For regulated organizations with advanced governance.", monthly: 499, annual: 4990, activeCustomers: 41, mrr: 20459, servers: "Custom", users: "Unlimited", storage: "Custom", support: "24/7 + SLA", published: true, featured: false },
];

const featureLabels = ["SFTP / FTP / FTPS connections", "File editor & terminal", "Automated backups", "Deployment workflows", "Team roles & permissions", "SSO / SCIM", "Immutable audit retention", "Private regional gateway", "Dedicated support SLA"];
const initialEntitlements: Record<PlanDefinition["id"], boolean[]> = {
  free: [true, true, false, false, false, false, false, false, false],
  pro: [true, true, true, true, true, false, false, false, false],
  enterprise: [true, true, true, true, true, true, true, true, true],
};

export function PlansAdminPage() {
  const [plans, setPlans] = useState(initialPlans);
  const [entitlements, setEntitlements] = useState(initialEntitlements);
  const [editingId, setEditingId] = useState<PlanDefinition["id"]>();
  const [draft, setDraft] = useState<PlanDefinition>();
  const [couponOpen, setCouponOpen] = useState(false);
  const [coupon, setCoupon] = useState({ code: "", amount: 20, duration: "3 months", maxRedemptions: 100 });

  function edit(plan: PlanDefinition) { setEditingId(plan.id); setDraft({ ...plan }); }
  function savePlan() {
    if (!draft) return;
    setPlans((current) => current.map((plan) => plan.id === draft.id ? draft : plan)); setEditingId(undefined); setDraft(undefined); toast.success(`${draft.name} plan updated`);
  }
  function createCoupon() {
    if (!coupon.code.trim()) { toast.error("Coupon code is required"); return; }
    setCouponOpen(false); toast.success(`${coupon.code.toUpperCase()} created`, { description: `${coupon.amount}% off for ${coupon.duration}` });
  }

  return <>
    <AdminPageHeader title="Plans & subscriptions" description="Own the product catalog, entitlements, billing intervals, discounts, and upgrade path across every customer tier." actions={<><AdminButton onClick={() => setCouponOpen(true)}><BadgePercent />Create coupon</AdminButton><AdminButton variant="primary" onClick={() => toast.success("Plan catalog published", { description: "Pricing and entitlements are now live." })}><Save />Publish catalog</AdminButton></>} />
    <div className="adm-stats"><Stat label="Active subscriptions" value={plans.reduce((sum, plan) => sum + plan.activeCustomers, 0).toLocaleString()} change="+42" detail="net this month" icon={WalletCards} /><Stat label="Subscription MRR" value={formatCurrency(plans.reduce((sum, plan) => sum + plan.mrr, 0))} change="+11.4%" detail="month over month" icon={CircleDollarSign} /><Stat label="Paid conversion" value="18.7%" change="+2.1%" detail="free to paid" icon={Sparkles} /><Stat label="Discount liability" value="$2,814" change="-4.8%" detail="next 30 days" icon={Gift} data={[25, 24, 23, 21, 18, 19, 16, 14]} /></div>

    <div className="adm-grid three">
      {plans.map((plan) => <section className="adm-panel" key={plan.id} style={plan.featured ? { borderColor: "rgba(216,255,79,.28)" } : undefined}>
        <header className="adm-panel-head"><div><div className="flex items-center gap-2"><h3>{plan.name}</h3>{plan.featured && <StatusPill status="lime" label="Default" noDot />}</div><p>{plan.activeCustomers.toLocaleString()} active customers</p></div><AdminButton size="small" onClick={() => edit(plan)}><Edit3 />Edit</AdminButton></header>
        <div className="adm-panel-body"><div className="flex items-end gap-1"><strong className="text-3xl tracking-tight">{formatCurrency(plan.monthly)}</strong><span className="text-[8px] text-zinc-500 mb-1">{plan.monthly ? "/ workspace / mo" : "forever"}</span></div><p className="text-[8px] leading-4 text-zinc-500 mt-3 min-h-8">{plan.description}</p><div className="adm-detail-list mt-4"><div className="adm-detail"><span>Servers</span><b>{plan.servers}</b></div><div className="adm-detail"><span>Users</span><b>{plan.users}</b></div><div className="adm-detail"><span>Storage</span><b>{plan.storage}</b></div><div className="adm-detail"><span>Support</span><b>{plan.support}</b></div></div><p className="adm-section-label">Included capabilities</p>{featureLabels.map((feature, index) => <div className="adm-check-row py-2" key={feature}><span className="flex items-center gap-2"><Check className={entitlements[plan.id][index] ? "text-[#d8ff4f]" : "text-zinc-700"} size={12} /> <b>{feature}</b></span><Toggle checked={entitlements[plan.id][index]} onChange={(checked) => setEntitlements((current) => ({ ...current, [plan.id]: current[plan.id].map((value, itemIndex) => itemIndex === index ? checked : value) }))} label={`${feature} on ${plan.name}`} /></div>)}</div>
        <footer className="flex items-center justify-between p-3 border-t border-white/10"><StatusPill status={plan.published ? "published" : "draft"} /><span className="adm-mono">plan_{plan.id}</span></footer>
      </section>)}
    </div>

    <div className="adm-grid two">
      <Panel title="Catalog guardrails" description="Billing behavior shared by all plans"><div className="adm-check-row"><span><b>Prorated upgrades</b><small>Credit unused time when a workspace upgrades mid-cycle.</small></span><Toggle checked onChange={() => toast.message("Proration is required while subscriptions are active") } label="Prorated upgrades" /></div><div className="adm-check-row"><span><b>Automatic tax calculation</b><small>Calculate regional VAT, GST, and sales tax at checkout.</small></span><Toggle checked onChange={() => toast.message("Tax calculation setting queued") } label="Automatic tax" /></div><div className="adm-check-row"><span><b>Three-day payment grace</b><small>Keep service active while a failed payment is retried.</small></span><Toggle checked onChange={() => toast.message("Grace period setting queued") } label="Payment grace" /></div></Panel>
      <Panel title="Upgrade funnel" description="Last 30 days"><div className="adm-metric-grid"><div className="adm-metric-box"><span>Free → Pro</span><b>52</b><small>12.4% conversion</small></div><div className="adm-metric-box"><span>Pro → Enterprise</span><b>7</b><small>18-day median</small></div><div className="adm-metric-box"><span>Downgrades</span><b>11</b><small>0.9% of paid</small></div></div><p className="adm-section-label">Top upgrade trigger</p><div className="adm-notice"><Server />Server limit reached drove 38% of plan upgrades this month, followed by backup storage at 27%.</div></Panel>
    </div>

    <Modal open={Boolean(editingId && draft)} onClose={() => { setEditingId(undefined); setDraft(undefined); }} title={`Edit ${draft?.name ?? "plan"}`} description="Changes stay in draft until the catalog is published." footer={<><AdminButton onClick={() => setEditingId(undefined)}>Cancel</AdminButton><AdminButton variant="primary" onClick={savePlan}><Save />Save draft</AdminButton></>}>
      {draft && <div className="adm-form-grid"><div className="adm-field"><label>Monthly price (USD)</label><input className="adm-input" type="number" min="0" value={draft.monthly} onChange={(event) => setDraft((current) => current && ({ ...current, monthly: Number(event.target.value) }))} /></div><div className="adm-field"><label>Annual price (USD)</label><input className="adm-input" type="number" min="0" value={draft.annual} onChange={(event) => setDraft((current) => current && ({ ...current, annual: Number(event.target.value) }))} /></div><div className="adm-field"><label>Server allowance</label><input className="adm-input" value={draft.servers} onChange={(event) => setDraft((current) => current && ({ ...current, servers: event.target.value === "Custom" ? "Custom" : Number(event.target.value) }))} /></div><div className="adm-field"><label>User allowance</label><input className="adm-input" value={draft.users} onChange={(event) => setDraft((current) => current && ({ ...current, users: event.target.value === "Unlimited" ? "Unlimited" : Number(event.target.value) }))} /></div><div className="adm-field"><label>Storage</label><input className="adm-input" value={draft.storage} onChange={(event) => setDraft((current) => current && ({ ...current, storage: event.target.value }))} /></div><div className="adm-field"><label>Support level</label><input className="adm-input" value={draft.support} onChange={(event) => setDraft((current) => current && ({ ...current, support: event.target.value }))} /></div><div className="adm-field span-2"><label>Customer-facing description</label><textarea className="adm-textarea" value={draft.description} onChange={(event) => setDraft((current) => current && ({ ...current, description: event.target.value }))} /></div><div className="adm-check-row span-2"><span><b>Published plan</b><small>Allow new subscriptions and upgrades to this plan.</small></span><Toggle checked={draft.published} onChange={(checked) => setDraft((current) => current && ({ ...current, published: checked }))} label="Published plan" /></div><div className="adm-check-row span-2"><span><b>Featured plan</b><small>Use as the recommended option on public pricing.</small></span><Toggle checked={draft.featured} onChange={(checked) => setDraft((current) => current && ({ ...current, featured: checked }))} label="Featured plan" /></div></div>}
    </Modal>

    <Modal open={couponOpen} onClose={() => setCouponOpen(false)} title="Create promotion code" description="Issue a controlled discount for customer acquisition or retention." footer={<><AdminButton onClick={() => setCouponOpen(false)}>Cancel</AdminButton><AdminButton variant="primary" onClick={createCoupon}><BadgePercent />Create coupon</AdminButton></>}><div className="adm-form-grid"><div className="adm-field span-2"><label>Promotion code</label><input autoFocus className="adm-input uppercase" value={coupon.code} onChange={(event) => setCoupon((current) => ({ ...current, code: event.target.value.toUpperCase().replaceAll(/[^A-Z0-9_-]/g, "") }))} placeholder="ORBIT20" /></div><div className="adm-field"><label>Percent off</label><input className="adm-input" type="number" min="1" max="100" value={coupon.amount} onChange={(event) => setCoupon((current) => ({ ...current, amount: Number(event.target.value) }))} /></div><div className="adm-field"><label>Duration</label><select className="adm-select w-full" value={coupon.duration} onChange={(event) => setCoupon((current) => ({ ...current, duration: event.target.value }))}><option>One month</option><option>3 months</option><option>Forever</option></select></div><div className="adm-field span-2"><label>Maximum redemptions</label><input className="adm-input" type="number" value={coupon.maxRedemptions} onChange={(event) => setCoupon((current) => ({ ...current, maxRedemptions: Number(event.target.value) }))} /></div></div><div className="adm-notice mt-4"><ShieldCheck />Promotion redemptions are recorded in the revenue audit stream and cannot be retroactively modified.</div></Modal>
  </>;
}

export default PlansAdminPage;

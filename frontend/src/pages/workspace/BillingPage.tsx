import { useState } from "react";
import { Check, CreditCard, Download, ExternalLink, Receipt, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { WorkspaceDataStatus } from "@/components/workspace-data-status";
import { api } from "@/lib/api";
import { useLiveResource } from "@/lib/use-live-resource";
import { cn } from "@/lib/utils";
import { buttonClass, controlClass, PageHeader, Panel, primaryButtonClass, Segmented, StatusBadge } from "./_shared";

const plans = [
  { id: "free", name: "Free", monthly: 0, description: "For personal servers and evaluation.", features: ["1 server", "1 member", "1 GB backups", "Community support"] },
  { id: "pro", name: "Pro", monthly: 29, description: "For growing engineering teams.", features: ["10 servers", "15 members", "50 GB backups", "Automations & audit", "Email support"] },
  { id: "enterprise", name: "Enterprise", monthly: 0, description: "For regulated and large-scale fleets.", features: ["Unlimited servers", "SAML & SCIM", "Custom retention", "Private runners", "24/7 support"] },
] as const;
type Subscription = { id?: string; plan: "free" | "pro" | "enterprise"; status: string; interval: "monthly" | "yearly"; amountCents: number | string; currency: string; currentPeriodStart?: string; currentPeriodEnd?: string; cancelAtPeriodEnd?: boolean };
type Invoice = { id: string; invoiceNumber: string; amountCents: number | string; currency: string; status: string; dueAt?: string; paidAt?: string; createdAt: string };
export type BillingUsage = { members: number; workspaces: number; servers: number; backupBytes: number | string; transferBytes: number | string };
export type BillingData = { subscription?: Subscription; usage: BillingUsage; invoices: Invoice[] };

const previewBilling: BillingData = {
  subscription: { plan: "pro", status: "active", interval: "monthly", amountCents: 2900, currency: "USD", currentPeriodEnd: "2026-08-19T00:00:00.000Z" },
  usage: { members: 5, workspaces: 2, servers: 5, backupBytes: 12_500_000_000, transferBytes: 284_000_000_000 },
  invoices: [
    { id: "preview-1", invoiceNumber: "INV-2026-0719", amountCents: 2900, currency: "USD", status: "paid", paidAt: "2026-07-19T00:00:00.000Z", createdAt: "2026-07-19T00:00:00.000Z" },
    { id: "preview-2", invoiceNumber: "INV-2026-0619", amountCents: 2900, currency: "USD", status: "paid", paidAt: "2026-06-19T00:00:00.000Z", createdAt: "2026-06-19T00:00:00.000Z" },
    { id: "preview-3", invoiceNumber: "INV-2026-0519", amountCents: 2900, currency: "USD", status: "paid", paidAt: "2026-05-19T00:00:00.000Z", createdAt: "2026-05-19T00:00:00.000Z" },
  ],
};
const emptyBilling: BillingData = { usage: { members: 0, workspaces: 0, servers: 0, backupBytes: 0, transferBytes: 0 }, invoices: [] };
function money(cents: number | string = 0, currency = "USD") { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(Number(cents) / 100); }
function planTitle(plan?: string) { return plan ? `${plan[0].toUpperCase()}${plan.slice(1)}` : "No plan"; }

export function BillingPage() {
  const resource = useLiveResource(emptyBilling, () => api.get<BillingData>("/billing"));
  const { data, setData, live } = resource;
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");
  const [coupon, setCoupon] = useState("");
  const [payment, setPayment] = useState("•••• 4242");
  const currentPlan = data.subscription?.plan;

  async function changePlan(plan: typeof plans[number]["id"]) {
    if (plan === "enterprise") { toast.info("Enterprise plans require a signed agreement. Contact sales to continue."); return; }
    if (!live) { setData((current) => ({ ...current, subscription: { ...current.subscription!, plan, interval: interval === "annual" ? "yearly" : "monthly", amountCents: plan === "pro" ? interval === "annual" ? 29000 : 2900 : 0, currency: "USD", status: "active" } })); toast.success(`Preview plan changed to ${planTitle(plan)}`); return; }
    try { const subscription = await api.patch<Subscription>("/billing/plan", { plan, interval: interval === "annual" ? "yearly" : "monthly" }); setData((current) => ({ ...current, subscription })); toast.success(`Plan changed to ${planTitle(plan)}`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to change plan"); }
  }

  return <div className="space-y-5">
    <PageHeader eyebrow="Subscription" title="Plan & billing" description="Manage your Orbit plan, invoices, and workspace consumption." actions={<button className={buttonClass} onClick={() => toast.info(live ? "A hosted billing portal endpoint is not configured." : "Preview billing portal opened")}><ExternalLink className="size-3.5" />Billing portal</button>} />
    <WorkspaceDataStatus live={live} loading={resource.loading} error={resource.error} onRetry={() => void resource.refresh().catch(() => undefined)} />
    <div className="grid overflow-hidden rounded-xl border border-white/[0.07] bg-[#101218] sm:grid-cols-4"><div className="p-4 sm:border-r sm:border-white/[0.06]"><p className="text-[9px] uppercase tracking-wider text-zinc-600">Current plan</p><div className="mt-2 flex items-center gap-2"><strong className="text-xl text-zinc-100">{planTitle(currentPlan)}</strong>{data.subscription ? <StatusBadge status={data.subscription.status} /> : null}</div></div><div className="border-t border-white/[0.06] p-4 sm:border-r sm:border-t-0"><p className="text-[9px] uppercase tracking-wider text-zinc-600">Renewal</p><p className="mt-2 text-lg font-semibold text-zinc-100">{data.subscription?.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString() : "Not scheduled"}</p></div><div className="border-t border-white/[0.06] p-4 sm:border-r sm:border-t-0"><p className="text-[9px] uppercase tracking-wider text-zinc-600">Next total</p><p className="mt-2 text-lg font-semibold text-zinc-100">{money(data.subscription?.amountCents, data.subscription?.currency)}</p></div><div className="border-t border-white/[0.06] p-4 sm:border-t-0"><p className="text-[9px] uppercase tracking-wider text-zinc-600">Payment</p><p className="mt-2 text-lg font-semibold text-zinc-100">{live ? "Provider managed" : `Visa ${payment}`}</p></div></div>
    <section><div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-base font-semibold text-zinc-100">Choose your plan</h2><p className="mt-1 text-xs text-zinc-500">Annual Pro billing includes two months free.</p></div><Segmented value={interval} onChange={setInterval} options={[{ value: "monthly", label: "Monthly" }, { value: "annual", label: "Annual · save 17%" }]} /></div><div className="grid gap-3 lg:grid-cols-3">{plans.map((plan) => { const current = plan.id === currentPlan; const price = interval === "annual" ? Math.round(plan.monthly * 10 / 12) : plan.monthly; return <article key={plan.id} className={cn("relative flex min-h-80 flex-col rounded-xl border bg-[#101218] p-5", current ? "border-indigo-400/40 ring-1 ring-indigo-400/15" : "border-white/[0.07]")}>{current ? <span className="absolute right-4 top-4 rounded-full bg-indigo-500/15 px-2 py-1 text-[9px] text-indigo-300">Current</span> : null}<h3 className="text-lg font-semibold text-zinc-100">{plan.name}</h3><p className="mt-2 min-h-10 text-xs leading-5 text-zinc-500">{plan.description}</p><p className="mt-5 text-3xl font-semibold text-white">{plan.id === "enterprise" ? "Custom" : `$${price}`}<span className="text-xs font-normal text-zinc-600">{plan.id !== "enterprise" ? "/month" : ""}</span></p><ul className="mt-5 flex-1 space-y-2.5">{plan.features.map((feature) => <li key={feature} className="flex items-center gap-2 text-xs text-zinc-400"><Check className="size-3.5 text-emerald-400" />{feature}</li>)}</ul><button disabled={current} className={`${current ? buttonClass : primaryButtonClass} mt-5 w-full`} onClick={() => void changePlan(plan.id)}>{current ? "Active plan" : plan.id === "enterprise" ? "Contact sales" : `Switch to ${plan.name}`}</button></article>; })}</div></section>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"><Panel title="Invoice history" description="Workspace billing records" flush>{data.invoices.length ? <div className="divide-y divide-white/[0.06]">{data.invoices.map((invoice) => <div key={invoice.id} className="grid grid-cols-[minmax(0,1fr)_100px_80px_auto] items-center gap-3 px-4 py-3"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-white/[0.04] text-zinc-500"><Receipt className="size-3.5" /></span><div><p className="font-mono text-xs text-zinc-300">{invoice.invoiceNumber}</p><p className="mt-1 text-[10px] text-zinc-600">{new Date(invoice.createdAt).toLocaleDateString()}</p></div></div><span className="text-xs text-zinc-400">{money(invoice.amountCents, invoice.currency)}</span><StatusBadge status={invoice.status} /><button onClick={() => toast.info(live ? "Invoice PDF download is not exposed by the API yet." : `${invoice.invoiceNumber}.pdf preview downloaded`)} className="grid size-8 place-items-center text-zinc-500"><Download className="size-3.5" /></button></div>)}</div> : <div className="p-6 text-center text-xs text-zinc-600">No invoices have been issued.</div>}</Panel><Panel title="Billing controls" description={live ? "Managed by the payment provider" : "Preview payment and discounts"}><label className="text-xs text-zinc-400">Payment method<div className="mt-1.5 flex gap-2"><input value={payment} onChange={(event) => setPayment(event.target.value)} disabled={live} className={`${controlClass} min-w-0 flex-1`} /><button className={buttonClass} onClick={() => toast.info(live ? "Payment method updates require the billing provider portal." : "Preview payment method updated")}><CreditCard className="size-3" />Update</button></div></label><label className="mt-4 block text-xs text-zinc-400">Coupon code<div className="mt-1.5 flex gap-2"><input value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase())} disabled={live} className={`${controlClass} min-w-0 flex-1`} placeholder="ORBIT20" /><button className={buttonClass} onClick={() => toast.info(live ? "Coupon validation is not exposed by the API." : coupon ? "Preview coupon validated" : "Enter a coupon code")}><Sparkles className="size-3" />Apply</button></div></label><div className="mt-5 flex gap-2 rounded-lg border border-white/[0.07] bg-black/10 p-3 text-[10px] leading-4 text-zinc-500"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />Card data remains outside Orbit and is handled by the configured payment provider.</div></Panel></div>
  </div>;
}

export const BillingSettingsPage = BillingPage;
export default BillingPage;

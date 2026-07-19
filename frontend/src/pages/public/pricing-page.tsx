import { useState } from "react";
import { ArrowRight, Check, CircleHelp, Minus, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui";
import { MarketingCTA, SectionHeading } from "@/components/marketing";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Free",
    description: "A serious toolkit for solo developers and small projects.",
    monthly: 0,
    annual: 0,
    suffix: "forever",
    cta: "Start free",
    to: "/register",
    features: ["1 workspace and 1 member", "2 SFTP servers", "Remote file explorer and editor", "Manual upload, download, and sync", "File history for 7 days", "1 GB encrypted backup storage", "Community support"],
  },
  {
    name: "Pro",
    description: "Collaborative operations for teams shipping every day.",
    monthly: 29,
    annual: 23,
    suffix: "per member / month",
    cta: "Start 14-day trial",
    to: "/register?plan=pro",
    popular: true,
    features: ["Unlimited workspaces and members", "25 servers included", "Live terminal and saved runbooks", "Scheduled syncs and backups", "Deployments, approvals, and rollback", "90-day file and audit history", "100 GB encrypted backup storage", "Monitoring, alerts, API, and webhooks", "Priority support"],
  },
  {
    name: "Enterprise",
    description: "Private infrastructure, governance, and support at scale.",
    monthly: null,
    annual: null,
    suffix: "tailored to your organization",
    cta: "Talk to sales",
    to: "/contact?topic=enterprise",
    features: ["Unlimited servers and private workers", "SAML SSO, SCIM, and custom RBAC", "VPC peering and egress controls", "BYOK and external secrets vault", "Approval policies and immutable audit", "Custom retention and data residency", "99.99% SLA and 24/7 support", "Security reviews and onboarding"],
  },
];

const comparison = [
  { group: "Workspace", rows: [["Members", "1", "Unlimited", "Unlimited"], ["Servers", "2", "25 included", "Unlimited"], ["Workspaces", "1", "Unlimited", "Unlimited"], ["Environments", "2", "Unlimited", "Unlimited"], ["Guest access", false, true, true]] },
  { group: "Files & transfers", rows: [["Remote explorer and editor", true, true, true], ["Atomic uploads", true, true, true], ["Transfer concurrency", "2", "20", "Custom"], ["Scheduled sync", false, true, true], ["Approval workflow", false, true, true], ["Private transfer workers", false, false, true]] },
  { group: "Recovery & security", rows: [["File version history", "7 days", "90 days", "Custom"], ["Backup storage", "1 GB", "100 GB", "Custom"], ["Encrypted credentials", true, true, true], ["SAML SSO and SCIM", false, false, true], ["Bring your own key", false, false, true], ["Immutable audit export", false, true, true]] },
] as Array<{ group: string; rows: Array<[string, string | boolean, string | boolean, string | boolean]> }>;

export function PricingPage() {
  const [annual, setAnnual] = useState(true);
  const [openFaq, setOpenFaq] = useState(0);
  return (
    <>
      <section className="marketing-glow px-4 pb-16 pt-24 text-center sm:px-6 lg:px-8"><div className="mx-auto max-w-3xl"><p className="text-[9px] font-medium uppercase tracking-[0.15em] text-blue-400">Simple, predictable pricing</p><h1 className="mt-5 text-balance text-5xl font-semibold tracking-tight sm:text-6xl">Start free. Scale without surprises.</h1><p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-500">Every plan includes secure SFTP, atomic writes, host-key verification, and a workspace your team will actually enjoy using.</p><div className="mx-auto mt-8 inline-flex rounded-lg border border-white/10 bg-white/[0.025] p-1"><button type="button" onClick={() => setAnnual(false)} className={cn("h-8 rounded-md px-4 text-[10px]", !annual ? "bg-zinc-100 text-black" : "text-zinc-500")}>Monthly</button><button type="button" onClick={() => setAnnual(true)} className={cn("h-8 rounded-md px-4 text-[10px]", annual ? "bg-zinc-100 text-black" : "text-zinc-500")}>Annual <span className={annual ? "text-emerald-700" : "text-emerald-400"}>−20%</span></button></div></div></section>

      <section className="px-4 pb-24 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-3">{plans.map((plan) => <article key={plan.name} className={cn("relative flex flex-col rounded-2xl border bg-[#111216] p-6", plan.popular ? "border-blue-400/35 shadow-[0_0_50px_rgba(62,86,200,.1)]" : "border-white/10")}>
        {plan.popular && <span className="absolute -top-3 left-6 rounded-full border border-blue-400/20 bg-[#182151] px-3 py-1 text-[8px] font-medium uppercase tracking-wider text-blue-200"><Sparkles className="mr-1 inline size-2.5" />Most popular</span>}
        <div><h2 className="text-2xl font-semibold">{plan.name}</h2><p className="mt-2 min-h-10 text-[11px] leading-5 text-zinc-500">{plan.description}</p></div>
        <div className="my-7 border-y border-white/8 py-6">{plan.monthly === null ? <div><strong className="text-4xl font-semibold">Custom</strong><p className="mt-2 text-[9px] text-zinc-600">{plan.suffix}</p></div> : <div className="flex items-end gap-2"><strong className="text-5xl font-semibold tracking-tight">${annual ? plan.annual : plan.monthly}</strong><span className="mb-1.5 text-[9px] leading-4 text-zinc-600">{plan.suffix}</span></div>}</div>
        <ul className="flex-1 space-y-3">{plan.features.map((feature) => <li key={feature} className="flex gap-2.5 text-[10px] leading-4 text-zinc-400"><Check className="mt-0.5 size-3 shrink-0 text-emerald-400" />{feature}</li>)}</ul>
        <Link to={plan.to} className="mt-8"><Button variant={plan.popular ? "primary" : "outline"} size="lg" className="w-full">{plan.cta}<ArrowRight /></Button></Link>
      </article>)}</div><p className="mt-5 text-center text-[9px] text-zinc-700">Prices exclude applicable taxes. Server overage on Pro is $4 per active server / month.</p></section>

      <section className="border-y border-white/8 bg-[#0c0d10] px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><SectionHeading align="center" eyebrow="Compare plans" title="The right controls at every stage." description="Core security is never an upsell. Higher plans add scale, automation, governance, and support." /><div className="mt-12 overflow-x-auto rounded-xl border border-white/10"><table className="w-full min-w-[760px] text-left text-[10px]"><thead className="bg-[#131418]"><tr><th className="w-[34%] p-4 text-[8px] uppercase tracking-wider text-zinc-600">Capability</th>{plans.map((plan) => <th key={plan.name} className="p-4 text-sm font-semibold">{plan.name}</th>)}</tr></thead><tbody>{comparison.map((section) => <FragmentSection key={section.group} section={section} />)}</tbody></table></div></div></section>

      <section className="px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[.7fr_1.3fr]"><SectionHeading eyebrow="Questions, answered" title="Pricing without footnotes." description="Still deciding? Start with Free—your workspace, files, and history move with you when you upgrade." /><div className="divide-y divide-white/8 border-y border-white/8">{[
        ["What counts as an active server?", "A server counts only when it is connected or used during the billing month. Archived connection profiles do not count."],
        ["Can I use Orbit without giving it production credentials?", "Yes. Start with a sandbox, use read-only credentials, or deploy a private worker so credentials never leave your network."],
        ["What happens if I exceed a Pro limit?", "We notify workspace owners before limits are reached. We never interrupt active transfers or block an emergency rollback."],
        ["Is backup storage included?", "Yes: 1 GB on Free and 100 GB on Pro. Enterprise storage and retention are tailored to your recovery requirements."],
        ["Can I cancel or export my data?", "Anytime. Export audit history, connection metadata, file versions, and backup manifests before closing the workspace."],
      ].map(([question, answer], index) => <div key={question}><button type="button" onClick={() => setOpenFaq(openFaq === index ? -1 : index)} className="flex w-full items-center justify-between gap-4 py-5 text-left text-xs font-medium"><span>{question}</span><CircleHelp className={cn("size-3.5 shrink-0 text-zinc-600 transition", openFaq === index && "rotate-45 text-zinc-300")} /></button>{openFaq === index && <p className="max-w-2xl pb-5 text-[10px] leading-5 text-zinc-500">{answer}</p>}</div>)}</div></div></section>

      <section className="px-4 pb-8 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-6xl gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-3">{[{ icon: ShieldCheck, title: "Security included", text: "Encryption, host-key checks, audit events, and atomic writes on every plan." }, { icon: Zap, title: "No painful migration", text: "Import existing SFTP profiles and keep your current folder mappings." }, { icon: Sparkles, title: "Human support", text: "Real operators answer product questions—even while you are on Free." }].map((item) => <div key={item.title} className="bg-[#111216] p-5"><item.icon className="size-4 text-blue-300" /><h3 className="mt-6 text-sm font-semibold">{item.title}</h3><p className="mt-2 text-[10px] leading-5 text-zinc-500">{item.text}</p></div>)}</div></section>
      <MarketingCTA title="Two servers. Every core workflow. Free forever." description="Connect your first server, browse remote files, and make a safe, reversible change today." />
    </>
  );
}

function FragmentSection({ section }: { section: { group: string; rows: Array<[string, string | boolean, string | boolean, string | boolean]> } }) {
  return <><tr><th colSpan={4} className="border-y border-white/8 bg-white/[0.025] px-4 py-2 text-[8px] uppercase tracking-[0.12em] text-zinc-500">{section.group}</th></tr>{section.rows.map(([name, ...values]) => <tr key={name} className="border-b border-white/[0.055] last:border-0"><td className="px-4 py-3 text-zinc-400">{name}</td>{values.map((value, index) => <td key={index} className="px-4 py-3 text-zinc-500">{typeof value === "boolean" ? value ? <Check className="size-3.5 text-emerald-400" /> : <Minus className="size-3.5 text-zinc-700" /> : value}</td>)}</tr>)}</>;
}

export default PricingPage;

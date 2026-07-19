import { useMemo, useState } from "react";
import { ArrowRight, Bell, Box, Braces, Cloud, Code2, Database, GitBranch, KeyRound, MessageSquare, Search, Server, ShieldCheck, Webhook, Workflow } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Input } from "@/components/ui";
import { MarketingCTA, SectionHeading } from "@/components/marketing";
import { cn } from "@/lib/utils";

const integrations = [
  ["GitHub", "Source control", GitBranch, "Deploy changed files, react to pushes, attach commits, and report deployment status.", "Popular"],
  ["GitLab", "Source control", GitBranch, "Connect repositories, pipelines, environments, merge approvals, and deployment evidence.", ""],
  ["Bitbucket", "Source control", GitBranch, "Build repository-driven deployments and branch-to-environment rules.", ""],
  ["Slack", "Notifications", MessageSquare, "Route alerts, approvals, job updates, and interactive incident actions.", "Popular"],
  ["Microsoft Teams", "Notifications", MessageSquare, "Send adaptive alerts, approval requests, and operational summaries.", ""],
  ["PagerDuty", "Notifications", Bell, "Create, deduplicate, acknowledge, and resolve incidents from Orbit alerts.", ""],
  ["Amazon S3", "Storage", Cloud, "Store encrypted backups, versions, exports, and recovery manifests.", "Popular"],
  ["Cloudflare R2", "Storage", Cloud, "Cost-efficient S3-compatible backup storage with flexible regions.", ""],
  ["Backblaze B2", "Storage", Box, "Retention-aware encrypted backup archives and restore targets.", ""],
  ["HashiCorp Vault", "Security", KeyRound, "Reference credentials without storing secrets in Orbit metadata.", "Enterprise"],
  ["AWS KMS", "Security", ShieldCheck, "Envelope encryption and customer-managed key rotation.", "Enterprise"],
  ["Okta", "Identity", ShieldCheck, "SAML SSO, SCIM provisioning, group mapping, and session policy.", "Enterprise"],
  ["Datadog", "Observability", Workflow, "Forward server metrics, transfer telemetry, audit signals, and incidents.", ""],
  ["Grafana", "Observability", Workflow, "Query Orbit metrics and link dashboards back to server resources.", ""],
  ["PostgreSQL", "Data", Database, "Use PostgreSQL for metadata, audit, jobs, and organization records.", "Built-in"],
  ["Webhooks", "Developer tools", Webhook, "Subscribe to signed, replayable events across the entire workspace.", "Built-in"],
  ["REST API", "Developer tools", Braces, "Automate every Orbit resource through a versioned, idempotent API.", "Built-in"],
  ["Orbit CLI", "Developer tools", Code2, "Connect local workflows and CI safely using scoped service tokens.", "Built-in"],
] as const;

export function IntegrationsPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const categories = ["All", ...Array.from(new Set(integrations.map((item) => item[1])))];
  const filtered = useMemo(() => integrations.filter((item) => (category === "All" || item[1] === category) && `${item[0]} ${item[1]} ${item[3]}`.toLowerCase().includes(query.toLowerCase())), [query, category]);
  return (
    <>
      <section className="marketing-glow px-4 pb-16 pt-24 text-center sm:px-6 lg:px-8"><div className="mx-auto max-w-3xl"><p className="text-[9px] font-medium uppercase tracking-[0.15em] text-blue-400">Integrations</p><h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight sm:text-6xl">Orbit fits the stack you already trust.</h1><p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-zinc-500">Connect source control, notifications, storage, identity, secrets, observability, and your own internal systems.</p></div></section>
      <section className="px-4 pb-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="flex flex-col gap-3 border-y border-white/8 py-4 lg:flex-row lg:items-center"><label className="relative block lg:w-80"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search integrations" className="pl-9" /></label><div className="flex min-w-0 gap-1 overflow-x-auto">{categories.map((item) => <button type="button" key={item} onClick={() => setCategory(item)} className={cn("h-8 shrink-0 rounded-md px-3 text-[9px]", category === item ? "bg-zinc-100 text-black" : "text-zinc-500 hover:bg-white/5 hover:text-white")}>{item}</button>)}</div></div>
        {filtered.length ? <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(([name, type, Icon, description, badge]) => <article key={name} className="group rounded-xl border border-white/10 bg-[#111216] p-5 transition hover:border-white/20"><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-lg border border-white/10 bg-white/[0.035] text-zinc-300"><Icon className="size-4" /></span>{badge && <span className="rounded-full border border-blue-400/15 bg-blue-400/5 px-2 py-1 text-[8px] text-blue-300">{badge}</span>}</div><h2 className="mt-7 text-base font-semibold">{name}</h2><p className="mt-1 text-[8px] uppercase tracking-wider text-zinc-700">{type}</p><p className="mt-3 min-h-10 text-[10px] leading-5 text-zinc-500">{description}</p><button type="button" className="mt-5 inline-flex items-center gap-1.5 text-[9px] text-zinc-600 group-hover:text-zinc-300">View integration<ArrowRight className="size-3" /></button></article>)}</div> : <div className="mt-8 grid min-h-64 place-items-center rounded-xl border border-dashed border-white/10 text-center"><div><Search className="mx-auto size-5 text-zinc-700" /><p className="mt-3 text-xs text-zinc-400">No integrations found</p><button type="button" onClick={() => { setQuery(""); setCategory("All"); }} className="mt-2 text-[9px] text-blue-400">Clear filters</button></div></div>}
      </div></section>
      <section className="border-y border-white/8 bg-[#0c0d10] px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2"><div><SectionHeading eyebrow="Build anything" title="A complete API, signed webhooks, and a CLI for the last mile." description="If a workflow matters to your organization, it should not depend on clicking the same button forever." /><div className="mt-7 flex gap-2"><Link to="/api"><Button>Explore the API<ArrowRight /></Button></Link><Link to="/docs"><Button variant="outline">Developer guides</Button></Link></div></div><div className="overflow-hidden rounded-xl border border-white/10 bg-[#101115]"><header className="border-b border-white/8 px-4 py-3 text-[8px] text-zinc-600">Create a safe deployment</header><pre className="overflow-x-auto p-4 text-[9px] leading-6 text-zinc-500"><span className="text-violet-300">const</span> deployment = <span className="text-violet-300">await</span> orbit.deployments.<span className="text-blue-300">create</span>({`{`}{"\n"}  server: <span className="text-amber-300">"srv_production"</span>,{"\n"}  source: {`{`} commit: <span className="text-amber-300">"4f32c1a"</span> {`}`},{"\n"}  dryRun: <span className="text-blue-300">true</span>,{"\n"}  snapshot: <span className="text-blue-300">true</span>,{"\n"}  requireApproval: <span className="text-blue-300">true</span>{"\n"}{`}`});</pre></div></div></section>
      <MarketingCTA title="Missing an integration? Build it—or ask us to." description="Use the API and webhooks today, or tell our team which system should join the Orbit integration catalog next." />
    </>
  );
}

export default IntegrationsPage;

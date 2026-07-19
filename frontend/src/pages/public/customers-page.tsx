import { useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Clock3,
  CloudCog,
  Code2,
  Database,
  FileClock,
  Gauge,
  Globe2,
  HeartPulse,
  Layers3,
  Search,
  Server,
  ShoppingBag,
  Sparkles,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Button, Input, Select } from "@/components/ui";
import { MarketingCTA, SectionHeading } from "@/components/marketing";
import { cn } from "@/lib/utils";

type Story = {
  company: string;
  industry: string;
  team: string;
  title: string;
  summary: string;
  quote: string;
  person: string;
  role: string;
  metrics: Array<[string, string]>;
  stack: string[];
  detail: string;
  icon: typeof Building2;
  accent: string;
  featured?: boolean;
};

const stories: Story[] = [
  { company: "Northstar Labs", industry: "SaaS", team: "26-100", title: "From twelve private key folders to one governed server workspace.", summary: "Northstar standardized production access, deployments, and backup evidence across five engineering groups without centralizing every operation in one team.", quote: "Orbit gave us the guardrails security wanted and the speed developers were afraid to lose.", person: "Maya Feld", role: "VP of Engineering", metrics: [["83", "servers governed"], ["74%", "faster access reviews"], ["0", "shared credentials"]], stack: ["AWS", "Ubuntu", "Okta", "Vault"], detail: "Connection profiles now belong to the organization, secrets resolve at execution time, and Okta groups map into resource-scoped roles. Production deployments require a preview and approval while staging stays fast. Quarterly access reviews that once took several days are generated from Orbit's immutable audit ledger.", icon: Layers3, accent: "from-blue-500/20 to-indigo-500/5", featured: true },
  { company: "Polaris Commerce", industry: "E-commerce", team: "101-500", title: "Safer releases across a seasonal commerce fleet.", summary: "Polaris replaced release-day scripts and chat approvals with reusable deployment plans, pre-change snapshots, and health-gated rollback.", quote: "Our busiest week was the quietest release week we have ever had.", person: "Theo Grant", role: "Director of Platform", metrics: [["11 min", "median deployment"], ["62%", "fewer failed releases"], ["4 min", "tested rollback"]], stack: ["GCP", "Debian", "GitHub", "PagerDuty"], detail: "A single runbook now builds a deterministic change plan, collects the required approvals, creates snapshots, deploys in waves, and checks the checkout path. If a probe misses its target, operators see the exact rollback candidate and can restore without reconstructing the previous release.", icon: ShoppingBag, accent: "from-violet-500/20 to-fuchsia-500/5" },
  { company: "Vector Health", industry: "Healthcare", team: "500+", title: "Private operations with evidence built in.", summary: "Vector deployed Orbit workers inside segmented networks and streams access, change, and restore evidence into its security operations platform.", quote: "The product understands that evidence is part of the operation, not paperwork after it.", person: "Dr. Lena Ortiz", role: "Chief Information Security Officer", metrics: [["121", "isolated hosts"], ["100%", "changes attributed"], ["8 hrs", "saved per audit"]], stack: ["Azure", "RHEL", "Entra ID", "Splunk"], detail: "Outbound-only private workers keep credentials and file content inside Vector's environment. Just-in-time grants expire automatically, session transcripts follow tailored retention, and every sensitive mutation links the policy decision, approval, snapshot, verification, and recovery target.", icon: HeartPulse, accent: "from-emerald-500/20 to-teal-500/5" },
  { company: "Juniper Studio", industry: "Agency", team: "6-25", title: "One tidy client workspace for every handoff.", summary: "Juniper organizes connections, folder mappings, backups, and client-specific permissions without passing SFTP profiles between freelancers.", quote: "Client handoff went from a scavenger hunt to a five-minute checklist.", person: "Aisha Bell", role: "Studio Founder", metrics: [["38", "client servers"], ["5 min", "new collaborator setup"], ["7 days", "version safety net"]], stack: ["WordPress", "Hetzner", "Cloudflare", "Slack"], detail: "Each client gets a workspace with a known root, environment labels, named owners, and a backup policy. Contractors receive only the access they need, then lose it automatically at the end of a project. File versions make small content and theme fixes easy to reverse.", icon: Sparkles, accent: "from-amber-500/20 to-orange-500/5" },
  { company: "Monarch Systems", industry: "Fintech", team: "101-500", title: "A controlled path from incident to production repair.", summary: "Monarch made emergency server changes faster to approve, easier to observe, and straightforward to review after the incident.", quote: "Break-glass no longer means breaking the audit trail.", person: "Irene Cho", role: "Head of Reliability", metrics: [["47%", "lower MTTR"], ["2 min", "approval latency"], ["100%", "emergency changes reviewed"]], stack: ["AWS", "Rocky Linux", "Duo", "Datadog"], detail: "An on-call engineer requests a time-limited elevation tied to an incident. Orbit captures the plan, approver, commands, changed files, checks, and final state. The grant closes automatically and the review arrives with a complete timeline rather than fragments from five tools.", icon: Gauge, accent: "from-cyan-500/20 to-blue-500/5" },
  { company: "Aperture Media", industry: "Media", team: "26-100", title: "Moving terabytes without losing the plot.", summary: "Aperture uses scheduled, resumable transfers with checksum verification to move production assets among regional partners.", quote: "We finally know what moved, what did not, and why - before someone asks.", person: "Ravi Mehta", role: "Media Operations Lead", metrics: [["3.8 TB", "weekly transfer volume"], ["99.9%", "first-pass completion"], ["38%", "higher throughput"]], stack: ["SFTP", "Wasabi", "macOS", "Teams"], detail: "Saved transfer plans encode source, destination, exclusions, concurrency, bandwidth policy, and notification rules. Failed chunks resume independently, hashes verify on arrival, and partner-facing manifests make delivery status clear without sharing infrastructure access.", icon: Database, accent: "from-rose-500/20 to-pink-500/5" },
];

const industries = ["All", "SaaS", "E-commerce", "Healthcare", "Agency", "Fintech", "Media"] as const;

export function CustomersPage() {
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState<(typeof industries)[number]>("All");
  const [team, setTeam] = useState("All teams");
  const [expanded, setExpanded] = useState<string | null>(stories[0].company);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return stories.filter((story) => (industry === "All" || story.industry === industry) && (team === "All teams" || story.team === team) && (!needle || `${story.company} ${story.title} ${story.summary} ${story.industry} ${story.stack.join(" ")}`.toLowerCase().includes(needle)));
  }, [industry, query, team]);

  return (
    <>
      <section className="marketing-glow px-4 pb-20 pt-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl text-center"><p className="text-[9px] font-medium uppercase tracking-[0.15em] text-blue-400">Customer stories</p><h1 className="mx-auto mt-5 max-w-5xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">The teams keeping real infrastructure beautifully under control.</h1><p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-500">From two client servers to a global fleet, Orbit helps teams move faster because the work is visible, governed, and recoverable.</p></div></section>

      <section className="border-y border-white/8 bg-[#0c0d10] px-4 py-14 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><p className="text-center text-[8px] uppercase tracking-[0.14em] text-zinc-700">Trusted by teams who operate what they ship</p><div className="mt-8 grid grid-cols-2 gap-y-7 text-center font-heading text-lg font-semibold text-zinc-600 sm:grid-cols-3 lg:grid-cols-6">{stories.map((story) => <span key={story.company} className="hover:text-zinc-300">{story.company.replace(/ (Labs|Commerce|Health|Studio|Systems|Media)/, "")}</span>)}</div></div></section>

      <section className="px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><SectionHeading eyebrow="Outcomes" title="Less operational friction. More confidence per change." description="Orbit consolidates the work around servers, then makes the important context available to the entire team." /><div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">{[[Clock3, "47%", "lower median recovery time"], [FileClock, "62%", "fewer failed deployments"], [Users, "74%", "faster access reviews"], [Server, "14k+", "servers managed in Orbit"]].map(([Icon, value, label]) => <div key={String(label)} className="bg-[#111216] p-5"><Icon className="size-4 text-blue-300" /><strong className="mt-8 block font-mono text-2xl">{String(value)}</strong><p className="mt-2 text-[9px] text-zinc-600">{String(label)}</p></div>)}</div><p className="mt-4 text-[8px] leading-4 text-zinc-700">Aggregated or customer-reported examples from selected workflows; results vary by environment, process, and configuration.</p></div></section>

      <section className="border-y border-white/8 bg-[#0c0d10] px-4 py-20 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[9px] uppercase tracking-[0.14em] text-blue-400">Find your pattern</p><h2 className="mt-3 text-3xl font-semibold">Stories from the server room.</h2></div><div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_150px] lg:w-[520px]"><label className="relative"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stories or technology" className="h-9 pl-9" /></label><Select value={team} onChange={(event) => setTeam(event.target.value)} className="h-9"><option>All teams</option><option>6-25</option><option>26-100</option><option>101-500</option><option>500+</option></Select></div></div><div className="mt-5 flex gap-1.5 overflow-x-auto pb-2">{industries.map((item) => <button type="button" key={item} onClick={() => setIndustry(item)} className={cn("h-7 shrink-0 rounded-full border px-3 text-[8px]", industry === item ? "border-blue-400/25 bg-blue-400/[0.08] text-blue-300" : "border-white/8 text-zinc-600 hover:text-zinc-300")}>{item}</button>)}</div>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">{visible.map((story) => { const open = expanded === story.company; const Icon = story.icon; return <article key={story.company} className={cn("overflow-hidden rounded-2xl border bg-[#111216]", open ? "border-blue-400/20" : "border-white/10")}><div className={cn("h-1 bg-gradient-to-r", story.accent)} /><button type="button" onClick={() => setExpanded(open ? null : story.company)} className="w-full p-5 text-left sm:p-6"><div className="flex items-start gap-4"><span className={cn("grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-gradient-to-br", story.accent)}><Icon className="size-4 text-zinc-200" /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="font-heading text-lg">{story.company}</strong>{story.featured && <Badge tone="info" dot>Featured</Badge>}<Badge>{story.industry}</Badge></span><h3 className="mt-5 text-xl font-semibold leading-7">{story.title}</h3><span className="mt-3 block text-[10px] leading-5 text-zinc-500">{story.summary}</span></span><ChevronDown className={cn("mt-2 size-4 shrink-0 text-zinc-700 transition", open && "rotate-180 text-zinc-300")} /></div><div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-white/8 bg-white/8">{story.metrics.map(([value, label]) => <span key={label} className="bg-black/15 p-3"><strong className="block font-mono text-sm">{value}</strong><span className="mt-1 block text-[7px] leading-3 text-zinc-700">{label}</span></span>)}</div></button>{open && <div className="border-t border-white/8 px-5 py-6 sm:px-6"><p className="text-[10px] leading-5 text-zinc-500">{story.detail}</p><blockquote className="mt-5 border-l border-blue-400/35 pl-4"><p className="font-heading text-lg leading-7 text-zinc-300">“{story.quote}”</p><footer className="mt-3 text-[8px] text-zinc-600">{story.person} · {story.role}</footer></blockquote><div className="mt-5 flex flex-wrap gap-1.5">{story.stack.map((item) => <span key={item} className="rounded border border-white/8 px-2 py-1 text-[8px] text-zinc-600">{item}</span>)}</div></div>}</article>; })}</div>
        {!visible.length && <div className="mt-8 rounded-xl border border-dashed border-white/10 py-16 text-center"><Search className="mx-auto size-5 text-zinc-700" /><h3 className="mt-4 text-lg font-semibold">No customer story matches</h3><p className="mt-2 text-[9px] text-zinc-600">Clear the filters to see every team.</p><Button variant="outline" className="mt-5" onClick={() => { setQuery(""); setIndustry("All"); setTeam("All teams"); }}>Clear filters</Button></div>}
      </div></section>

      <section className="px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[.85fr_1.15fr] lg:items-center"><div><p className="text-[9px] uppercase tracking-[0.14em] text-blue-400">Made for your operating model</p><h2 className="mt-4 text-4xl font-semibold">Start with the workflow that hurts most.</h2><p className="mt-4 text-sm leading-6 text-zinc-500">Teams rarely replace everything at once. Orbit can begin as a shared SFTP workspace, a safer backup layer, a deployment control, or the audited route into production.</p><Link to="/product" className="mt-6 inline-flex items-center gap-2 text-[9px] text-zinc-300 hover:text-white">Explore all workflows<ArrowRight className="size-3" /></Link></div><div className="grid gap-3 sm:grid-cols-2">{[[Code2, "Development teams", "Remote files, diffs, environments, deployments, and quick recovery."], [CloudCog, "Platform engineering", "Fleet standards, reusable runbooks, private workers, and observability."], [Globe2, "Agencies", "Isolated client workspaces, simple access, handoffs, and version history."], [Building2, "Regulated enterprise", "Identity lifecycle, policies, evidence, data controls, and tailored support."]].map(([Icon, title, copy]) => <div key={String(title)} className="rounded-xl border border-white/10 bg-[#111216] p-5"><Icon className="size-4 text-blue-300" /><h3 className="mt-6 text-sm font-semibold">{String(title)}</h3><p className="mt-2 text-[9px] leading-5 text-zinc-600">{String(copy)}</p><p className="mt-4 flex items-center gap-1.5 text-[8px] text-emerald-400"><Check className="size-3" />Guided onboarding available</p></div>)}</div></div></section>
      <MarketingCTA title="Make your next server story a calm one." description="Start with two servers free, or bring us your fleet, workflow, and security requirements for a tailored evaluation." />
    </>
  );
}

export default CustomersPage;

import { type FormEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  FileCode2,
  Filter,
  Gauge,
  GitPullRequest,
  Lightbulb,
  LockKeyhole,
  MessageSquare,
  Network,
  Plus,
  Search,
  Server,
  Sparkles,
  ThumbsUp,
  Workflow,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge, Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

type RoadmapStatus = "Now" | "Next" | "Later" | "Shipped";
type Category = "Files" | "Automation" | "Security" | "Platform" | "Observability";

type RoadmapItem = {
  id: string;
  title: string;
  description: string;
  detail: string;
  status: RoadmapStatus;
  category: Category;
  quarter: string;
  votes: number;
  comments: number;
  progress?: number;
  icon: typeof Server;
};

const items: RoadmapItem[] = [
  { id: "visual-diff", title: "Directory-level visual diff", description: "Compare complete local and remote trees before a sync or deployment.", detail: "The plan view will group additions, modifications, permission changes, conflicts, and deletes before any bytes move. Plans can be exported for approval.", status: "Now", category: "Files", quarter: "Q3 2026", votes: 482, comments: 36, progress: 78, icon: FileCode2 },
  { id: "recovery-drills", title: "Scheduled recovery drills", description: "Verify that backups restore cleanly and meet your recovery objectives.", detail: "Isolated restores, configurable probes, evidence reports, and alerts when an RPO or RTO target is missed.", status: "Now", category: "Observability", quarter: "Q3 2026", votes: 311, comments: 18, progress: 62, icon: Gauge },
  { id: "policy-code", title: "Policy as code", description: "Review workspace guardrails as versioned, testable configuration.", detail: "Define approvals, protected paths, deployment windows, terminal commands, and break-glass behavior in a signed policy bundle.", status: "Now", category: "Security", quarter: "Q3 2026", votes: 276, comments: 41, progress: 44, icon: LockKeyhole },
  { id: "workflow-builder", title: "Visual runbook builder", description: "Compose reliable operations from commands, transfers, checks, and approvals.", detail: "A graph editor with typed inputs, reusable steps, conditional branches, retry rules, secrets, and preview execution.", status: "Next", category: "Automation", quarter: "Q4 2026", votes: 628, comments: 57, icon: Workflow },
  { id: "fleet-search", title: "Cross-server content search", description: "Search allowed paths across a fleet without opening each server.", detail: "Customer-controlled indexing with path policy, file-type limits, result previews, and private-worker execution.", status: "Next", category: "Files", quarter: "Q4 2026", votes: 547, comments: 49, icon: Search },
  { id: "service-map", title: "Infrastructure service map", description: "Connect servers, deploy targets, monitors, backups, and owners in one graph.", detail: "See operational relationships and understand which teams, jobs, and services are affected before a change.", status: "Next", category: "Observability", quarter: "Q4 2026", votes: 205, comments: 12, icon: Network },
  { id: "mobile-approvals", title: "Mobile approvals", description: "Review and approve high-confidence change plans from a focused mobile view.", detail: "A secure mobile surface for diffs, policy results, health checks, and time-bound approvals. Execution remains in the control plane.", status: "Later", category: "Platform", quarter: "Exploring", votes: 414, comments: 63, icon: Check },
  { id: "session-replay", title: "Terminal session replay", description: "Replay audited terminal activity with commands, output, and timing.", detail: "Searchable, access-controlled replays with secret redaction, retention policies, and SIEM export.", status: "Later", category: "Security", quarter: "Exploring", votes: 233, comments: 26, icon: CircleDot },
  { id: "drift-remediation", title: "Automated drift remediation", description: "Turn a detected configuration drift into an approved repair workflow.", detail: "Link file baselines to a runbook, preview the repair, request approval, and verify the result automatically.", status: "Later", category: "Automation", quarter: "Exploring", votes: 361, comments: 31, icon: GitPullRequest },
  { id: "private-workers", title: "Private worker pools", description: "Keep every credential and operation inside your network boundary.", detail: "Region-aware pools, capacity policy, rolling upgrades, outbound-only connections, and detailed health diagnostics.", status: "Shipped", category: "Platform", quarter: "June 2026", votes: 588, comments: 72, icon: Server },
  { id: "draft-recovery", title: "Editor draft recovery", description: "Recover unsaved remote edits after a refresh or lost connection.", detail: "Local encrypted drafts are matched to the remote revision, then restored into the conflict-aware editor.", status: "Shipped", category: "Files", quarter: "July 2026", votes: 192, comments: 16, icon: FileCode2 },
  { id: "deployment-windows", title: "Deployment windows", description: "Define when environment changes are allowed and who can override a freeze.", detail: "Recurring schedules, workspace and server scopes, override reasons, and optional dual approval.", status: "Shipped", category: "Security", quarter: "July 2026", votes: 174, comments: 9, icon: Clock3 },
];

const columns: Array<{ status: RoadmapStatus; description: string; tone: string }> = [
  { status: "Now", description: "Actively in design or development", tone: "bg-blue-400" },
  { status: "Next", description: "Validated and ready to schedule", tone: "bg-violet-400" },
  { status: "Later", description: "Exploring the right solution", tone: "bg-amber-400" },
  { status: "Shipped", description: "Recently delivered to customers", tone: "bg-emerald-400" },
];

const categories = ["All", "Files", "Automation", "Security", "Platform", "Observability"] as const;

export function RoadmapPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [openItem, setOpenItem] = useState<string | null>("visual-diff");
  const [votes, setVotes] = useState<Set<string>>(() => new Set());
  const [requestOpen, setRequestOpen] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => (category === "All" || item.category === category) && (!needle || `${item.title} ${item.description} ${item.detail} ${item.category}`.toLowerCase().includes(needle)));
  }, [category, query]);

  function vote(id: string) {
    setVotes((current) => {
      const next = new Set(current);
      if (next.has(id)) { next.delete(id); toast("Vote removed"); } else { next.add(id); toast.success("Vote added to the roadmap"); }
      return next;
    });
  }

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    toast.success("Thanks. Your request is in the product inbox.");
    setRequestOpen(false);
  }

  return (
    <>
      <section className="marketing-glow border-b border-white/8 px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_360px] lg:items-end">
          <div className="max-w-3xl"><p className="text-[9px] font-medium uppercase tracking-[0.15em] text-blue-400">Public roadmap</p><h1 className="mt-5 text-balance text-5xl font-semibold tracking-tight sm:text-6xl">Built with operators, not around them.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-zinc-500">See what the team is designing, building, and learning. Vote on work that matters to you or add the missing piece.</p><div className="mt-8 flex flex-wrap gap-2"><Button size="lg" onClick={() => setRequestOpen(true)}><Plus />Suggest a feature</Button><Link to="/changelog"><Button size="lg" variant="outline">See what shipped<ArrowRight /></Button></Link></div></div>
          <div className="rounded-xl border border-white/10 bg-[#111216] p-5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg border border-violet-400/15 bg-violet-400/[0.05] text-violet-300"><Lightbulb className="size-4" /></span><div><p className="text-xs font-medium">How this roadmap works</p><p className="mt-1 text-[9px] text-zinc-600">Direction is public; dates are intentionally honest.</p></div></div><ul className="mt-4 space-y-2 text-[9px] leading-4 text-zinc-500"><li className="flex gap-2"><Check className="mt-0.5 size-3 shrink-0 text-emerald-400" />Votes help prioritize; they are not preorders.</li><li className="flex gap-2"><Check className="mt-0.5 size-3 shrink-0 text-emerald-400" />Security and reliability work may arrive unannounced.</li><li className="flex gap-2"><Check className="mt-0.5 size-3 shrink-0 text-emerald-400" />Scope and sequence can change as we learn.</li></ul></div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-8 flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0e0f12] p-3 sm:flex-row sm:items-center"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the roadmap" className="h-9 pl-9" /></label><div className="flex items-center gap-2"><Filter className="size-3.5 text-zinc-700" /><Select aria-label="Filter roadmap by category" value={category} onChange={(event) => setCategory(event.target.value as (typeof categories)[number])} className="h-9 min-w-40">{categories.map((item) => <option key={item}>{item}</option>)}</Select></div><span className="text-[8px] text-zinc-700 sm:px-2">{filtered.length} initiatives</span></div>

          <div className="grid gap-4 lg:grid-cols-4">
            {columns.map((column) => {
              const columnItems = filtered.filter((item) => item.status === column.status);
              return <section key={column.status} className="min-w-0"><header className="mb-3 flex items-start justify-between rounded-lg border border-white/8 bg-white/[0.018] p-3"><div><div className="flex items-center gap-2"><span className={cn("size-1.5 rounded-full", column.tone)} /><h2 className="text-sm font-semibold">{column.status}</h2><span className="text-[8px] text-zinc-700">{columnItems.length}</span></div><p className="mt-1.5 text-[8px] text-zinc-700">{column.description}</p></div></header><div className="space-y-3">{columnItems.map((item) => { const Icon = item.icon; const isOpen = openItem === item.id; const voted = votes.has(item.id); return <article key={item.id} className={cn("overflow-hidden rounded-xl border bg-[#111216] transition", isOpen ? "border-blue-400/20" : "border-white/10 hover:border-white/20")}><button type="button" onClick={() => setOpenItem(isOpen ? null : item.id)} className="w-full p-4 text-left"><div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/8 bg-white/[0.025] text-zinc-500"><Icon className="size-3.5" /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><Badge tone={item.status === "Shipped" ? "success" : item.category === "Security" ? "purple" : "neutral"}>{item.category}</Badge><span className="text-[8px] text-zinc-700">{item.quarter}</span></span><h3 className="mt-3 text-sm font-semibold leading-5">{item.title}</h3><span className="mt-2 block text-[9px] leading-4 text-zinc-600">{item.description}</span></span><ChevronDown className={cn("mt-1 size-3.5 shrink-0 text-zinc-700 transition", isOpen && "rotate-180 text-zinc-400")} /></div>{item.progress !== undefined && <span className="mt-4 block"><span className="mb-1.5 flex justify-between text-[8px] text-zinc-700"><span>Build progress</span><span>{item.progress}%</span></span><span className="block h-1 overflow-hidden rounded-full bg-zinc-800"><span className="block h-full rounded-full bg-blue-400" style={{ width: `${item.progress}%` }} /></span></span>}</button>{isOpen && <div className="border-t border-white/8 px-4 py-4"><p className="text-[9px] leading-5 text-zinc-500">{item.detail}</p></div>}<footer className="flex items-center gap-2 border-t border-white/8 px-3 py-2"><button type="button" onClick={() => vote(item.id)} className={cn("flex h-7 items-center gap-1.5 rounded-md border px-2 text-[8px] transition", voted ? "border-blue-400/25 bg-blue-400/[0.08] text-blue-300" : "border-white/8 text-zinc-600 hover:text-zinc-300")}><ThumbsUp className="size-3" />{item.votes + (voted ? 1 : 0)}</button><span className="flex items-center gap-1 text-[8px] text-zinc-700"><MessageSquare className="size-3" />{item.comments}</span>{item.status === "Shipped" && <span className="ml-auto flex items-center gap-1 text-[8px] text-emerald-400"><Sparkles className="size-3" />Available</span>}</footer></article>; })}{!columnItems.length && <div className="rounded-xl border border-dashed border-white/8 px-4 py-10 text-center"><p className="text-[9px] text-zinc-700">No matching work in {column.status.toLowerCase()}.</p></div>}</div></section>;
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-white/8 bg-[#0c0d10] px-4 py-20 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center"><div><p className="text-[9px] uppercase tracking-[0.14em] text-blue-400">A durable direction</p><h2 className="mt-4 text-3xl font-semibold sm:text-4xl">The promise is the problem we solve, not a date on a slide.</h2><p className="mt-4 max-w-xl text-sm leading-6 text-zinc-500">We speak with customers before committing, test risky infrastructure work behind explicit flags, and publish the result when it is ready for real servers.</p></div><div className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-3">{[["Weekly", "customer research"], ["14 days", "typical beta window"], ["100%", "changes reversible"]].map(([value, label]) => <div key={label} className="bg-[#111216] p-5"><strong className="font-mono text-xl">{value}</strong><p className="mt-2 text-[8px] text-zinc-600">{label}</p></div>)}</div></div></section>

      <Modal open={requestOpen} onClose={() => setRequestOpen(false)} title="Suggest a feature" description="Tell us about the job, the risk, and how you handle it today." footer={null}>
        <form onSubmit={submitRequest} className="space-y-4"><Field label="Work email"><Input required type="email" placeholder="you@company.com" /></Field><Field label="What are you trying to accomplish?"><Input required minLength={6} placeholder="For example, compare configs across a fleet" /></Field><Field label="How do you handle this today?" hint="Please avoid credentials, customer data, or other sensitive information."><Textarea required minLength={20} placeholder="Current workflow, frequency, scale, and where it becomes risky..." /></Field><Field label="Area"><Select className="w-full" defaultValue="Files"><option>Files</option><option>Automation</option><option>Security</option><option>Platform</option><option>Observability</option></Select></Field><div className="flex justify-end gap-2 border-t border-white/8 pt-4"><Button type="button" variant="ghost" onClick={() => setRequestOpen(false)}>Cancel</Button><Button type="submit">Send request</Button></div></form>
      </Modal>
    </>
  );
}

export default RoadmapPage;

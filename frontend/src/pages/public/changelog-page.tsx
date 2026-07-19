import { type FormEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  Bug,
  Check,
  ChevronDown,
  FileClock,
  Filter,
  Gauge,
  GitBranch,
  Mail,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge, Button, Input } from "@/components/ui";
import { MarketingCTA } from "@/components/marketing";
import { cn } from "@/lib/utils";

type ChangeKind = "New" | "Improved" | "Fixed" | "Security";

const releases = [
  {
    version: "2026.7.3",
    date: "July 17, 2026",
    title: "Recovery drills, without the drama",
    summary: "Run a complete restore rehearsal against an isolated destination, verify application checks, and keep the evidence beside the backup policy.",
    labels: ["Backups", "Enterprise"],
    featured: true,
    changes: [
      { kind: "New" as ChangeKind, text: "Recovery drills can restore snapshots into a temporary path or customer-hosted worker." },
      { kind: "New" as ChangeKind, text: "RPO and RTO reports now show policy compliance by server, environment, and owner." },
      { kind: "Improved" as ChangeKind, text: "Large restore jobs stream checksum progress and surface individual file retries." },
      { kind: "Fixed" as ChangeKind, text: "Resolved an edge case where excluded symlinks appeared in restore previews." },
    ],
  },
  {
    version: "2026.7.2",
    date: "July 10, 2026",
    title: "A calmer remote editor",
    summary: "The editor now protects long-running work with draft recovery, clearer remote revision checks, and a purpose-built conflict flow.",
    labels: ["Files", "Editor"],
    changes: [
      { kind: "New" as ChangeKind, text: "Unsaved drafts recover locally after a browser refresh or lost connection." },
      { kind: "Improved" as ChangeKind, text: "Diffs support side-by-side, unified, whitespace-aware, and word-level views." },
      { kind: "Improved" as ChangeKind, text: "Save warnings identify the actor and revision that changed the remote file." },
      { kind: "Fixed" as ChangeKind, text: "UTF-16 files retain their original byte order marker after an atomic save." },
    ],
  },
  {
    version: "2026.7.1",
    date: "July 3, 2026",
    title: "Policy-aware deployment windows",
    summary: "Teams can define when production changes are allowed, who may override a freeze, and which checks are required before execution.",
    labels: ["Deployments", "Governance"],
    changes: [
      { kind: "New" as ChangeKind, text: "Recurring deployment windows support workspace, environment, and server scopes." },
      { kind: "New" as ChangeKind, text: "Freeze overrides require a reason and can optionally require a second approver." },
      { kind: "Security" as ChangeKind, text: "Approval events now include the evaluated policy version in immutable audit exports." },
      { kind: "Improved" as ChangeKind, text: "Deployment plans group identical permission and ownership changes for faster review." },
    ],
  },
  {
    version: "2026.6.4",
    date: "June 24, 2026",
    title: "Private workers reach general availability",
    summary: "Run file operations, terminals, backups, and health checks inside your own network without exposing inbound access.",
    labels: ["Workers", "Enterprise"],
    changes: [
      { kind: "New" as ChangeKind, text: "Worker pools support region affinity, labels, capacity limits, and rolling upgrades." },
      { kind: "Security" as ChangeKind, text: "Short-lived task credentials are bound to a workspace, operation, and destination." },
      { kind: "Improved" as ChangeKind, text: "The diagnostics bundle redacts paths, hostnames, and secrets before download." },
      { kind: "Fixed" as ChangeKind, text: "Worker reconnects no longer duplicate completion events for long transfer jobs." },
    ],
  },
  {
    version: "2026.6.3",
    date: "June 12, 2026",
    title: "Faster transfers on high-latency links",
    summary: "A new adaptive transfer pipeline improves throughput while keeping concurrency inside host and workspace guardrails.",
    labels: ["Transfers", "Performance"],
    changes: [
      { kind: "Improved" as ChangeKind, text: "Adaptive chunk sizing increased median throughput by 38% in our long-distance tests." },
      { kind: "New" as ChangeKind, text: "Transfer details show queue, handshake, read, write, and verification timing." },
      { kind: "Fixed" as ChangeKind, text: "Retrying a directory sync now preserves the original include and exclude rules." },
    ],
  },
];

const kindStyle: Record<ChangeKind, { icon: typeof Sparkles; className: string }> = {
  New: { icon: Sparkles, className: "border-blue-400/20 bg-blue-400/[0.06] text-blue-300" },
  Improved: { icon: Gauge, className: "border-violet-400/20 bg-violet-400/[0.06] text-violet-300" },
  Fixed: { icon: Bug, className: "border-amber-400/20 bg-amber-400/[0.06] text-amber-300" },
  Security: { icon: ShieldCheck, className: "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300" },
};

const filters = ["All", "New", "Improved", "Fixed", "Security"] as const;

export function ChangelogPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [expanded, setExpanded] = useState<string[]>(releases.map((release) => release.version));
  const [email, setEmail] = useState("");

  const visibleReleases = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return releases
      .map((release) => ({
        ...release,
        changes: release.changes.filter((change) => filter === "All" || change.kind === filter),
      }))
      .filter((release) => {
        const matchesText = !needle || [release.title, release.summary, release.version, ...release.labels, ...release.changes.map((change) => change.text)].join(" ").toLowerCase().includes(needle);
        return matchesText && release.changes.length > 0;
      });
  }, [filter, query]);

  function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    toast.success("You are subscribed to Orbit release notes.");
    setEmail("");
  }

  function toggle(version: string) {
    setExpanded((current) => current.includes(version) ? current.filter((item) => item !== version) : [...current, version]);
  }

  return (
    <>
      <section className="marketing-glow border-b border-white/8 px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_380px] lg:items-end">
          <div className="max-w-3xl">
            <p className="text-[9px] font-medium uppercase tracking-[0.15em] text-blue-400">Product changelog</p>
            <h1 className="mt-5 text-balance text-5xl font-semibold tracking-tight sm:text-6xl">Every improvement, in the open.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-500">Follow new capabilities, reliability work, security updates, and the small details that make operating servers feel calmer.</p>
          </div>
          <form onSubmit={subscribe} className="rounded-xl border border-white/10 bg-[#111216] p-4">
            <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border border-blue-400/15 bg-blue-400/[0.05] text-blue-300"><Mail className="size-4" /></span><div><p className="text-xs font-medium text-zinc-200">Release notes, once a month</p><p className="mt-1 text-[9px] leading-4 text-zinc-600">A concise digest. No campaigns or tracking pixels.</p></div></div>
            <div className="mt-4 flex gap-2"><Input aria-label="Email address" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /><Button type="submit" size="sm">Subscribe</Button></div>
          </form>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="sticky top-16 z-20 -mx-2 mb-12 rounded-xl border border-white/8 bg-[#0b0c0f]/90 p-2 backdrop-blur-xl">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search releases, features, or version" className="h-9 pl-9" /></label>
              <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-white/8 bg-white/[0.018] p-1"><Filter className="mx-2 size-3.5 shrink-0 text-zinc-700" />{filters.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={cn("h-7 shrink-0 rounded-md px-3 text-[9px] transition", filter === item ? "bg-zinc-100 text-black" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200")}>{item}</button>)}</div>
            </div>
          </div>

          <div className="grid gap-10 lg:grid-cols-[170px_minmax(0,1fr)]">
            <aside className="hidden lg:block"><div className="sticky top-36"><p className="text-[8px] font-medium uppercase tracking-[0.14em] text-zinc-700">Release stream</p><div className="mt-4 space-y-3 text-[9px] text-zinc-600"><p className="flex items-center gap-2"><GitBranch className="size-3" />Cloud</p><p className="flex items-center gap-2"><Check className="size-3 text-emerald-400" />Generally available</p><p className="flex items-center gap-2"><FileClock className="size-3" />Weekly cadence</p></div><Link to="/roadmap" className="mt-7 flex items-center gap-2 text-[9px] text-zinc-400 hover:text-white">View the roadmap<ArrowRight className="size-3" /></Link></div></aside>
            <div className="space-y-5">
              {visibleReleases.map((release) => {
                const isExpanded = expanded.includes(release.version);
                return <article key={release.version} className={cn("overflow-hidden rounded-xl border bg-[#111216]", release.featured ? "border-blue-400/25 shadow-[0_20px_80px_rgba(39,56,145,.09)]" : "border-white/10")}>
                  <button type="button" onClick={() => toggle(release.version)} aria-expanded={isExpanded} className="flex w-full items-start gap-4 p-5 text-left sm:p-6">
                    <span className="mt-1 hidden size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.025] font-mono text-[8px] text-zinc-500 sm:grid">v{release.version.split(".").slice(-2).join(".")}</span>
                    <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><Badge tone={release.featured ? "info" : "neutral"}>{release.version}</Badge>{release.featured && <Badge tone="purple" dot>Featured</Badge>}<span className="text-[9px] text-zinc-700">{release.date}</span></span><h2 className="mt-4 text-2xl font-semibold text-zinc-100">{release.title}</h2><span className="mt-2 block max-w-3xl text-[10px] leading-5 text-zinc-500">{release.summary}</span><span className="mt-4 flex flex-wrap gap-1.5">{release.labels.map((label) => <span key={label} className="rounded border border-white/8 bg-white/[0.02] px-2 py-1 text-[8px] text-zinc-600">{label}</span>)}</span></span>
                    <ChevronDown className={cn("mt-2 size-4 shrink-0 text-zinc-600 transition-transform", isExpanded && "rotate-180 text-zinc-300")} />
                  </button>
                  {isExpanded && <div className="border-t border-white/8 px-5 py-5 sm:px-6"><div className="space-y-2">{release.changes.map((change) => { const style = kindStyle[change.kind]; const Icon = style.icon; return <div key={change.text} className="grid gap-2 rounded-lg border border-white/[0.06] bg-black/10 p-3 sm:grid-cols-[96px_1fr] sm:items-start"><span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-1 text-[8px] font-medium", style.className)}><Icon className="size-2.5" />{change.kind}</span><p className="text-[10px] leading-5 text-zinc-400">{change.text}</p></div>; })}</div></div>}
                </article>;
              })}
              {!visibleReleases.length && <div className="rounded-xl border border-dashed border-white/10 px-6 py-16 text-center"><Wrench className="mx-auto size-6 text-zinc-700" /><h2 className="mt-4 text-xl font-semibold">No matching release notes</h2><p className="mt-2 text-[10px] text-zinc-600">Try a broader search or clear the change-type filter.</p><Button type="button" variant="outline" className="mt-5" onClick={() => { setQuery(""); setFilter("All"); }}>Clear filters</Button></div>}
            </div>
          </div>
        </div>
      </section>
      <MarketingCTA title="See what we are building next." description="Explore the public roadmap, vote on planned capabilities, and tell us what would make your server work safer." primary="Start free" />
    </>
  );
}

export default ChangelogPage;

import { useState } from "react";
import {
  Activity,
  ArrowRight,
  ArchiveRestore,
  Bot,
  Check,
  CircleCheck,
  CloudUpload,
  Code2,
  FileCode2,
  Folder,
  GitCompare,
  KeyRound,
  Layers3,
  LockKeyhole,
  Play,
  RefreshCw,
  Rocket,
  Server,
  ShieldCheck,
  Terminal,
  Workflow,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Progress } from "@/components/ui";
import { CheckList, MarketingCTA, SectionHeading } from "@/components/marketing";
import { cn } from "@/lib/utils";

const surfaces = [
  { id: "connect", label: "Connect", icon: Server },
  { id: "files", label: "Files", icon: FileCode2 },
  { id: "ship", label: "Ship", icon: Rocket },
  { id: "recover", label: "Recover", icon: ArchiveRestore },
  { id: "automate", label: "Automate", icon: Bot },
];

function SurfacePreview({ surface }: { surface: string }) {
  if (surface === "files") return <div className="grid h-full grid-cols-[180px_minmax(0,1fr)]"><aside className="border-r border-white/8 p-3"><p className="text-[8px] text-zinc-600">/var/www/app</p><div className="mt-3 space-y-0.5">{["config", "public", "src", "storage"].map((name) => <div key={name} className="flex h-7 items-center gap-2 rounded px-2 text-[8px] text-zinc-500 hover:bg-white/5"><Folder className="size-3" />{name}</div>)}</div></aside><div className="p-4 font-mono text-[8px] leading-5"><p><span className="text-violet-300">export const</span> <span className="text-blue-300">config</span> = &#123;</p><p className="pl-4"><span className="text-zinc-500">port:</span> <span className="text-amber-300">8080</span>,</p><p className="pl-4"><span className="text-zinc-500">atomicWrites:</span> <span className="text-blue-300">true</span>,</p><p className="pl-4"><span className="text-zinc-500">backupBeforeSave:</span> <span className="text-blue-300">true</span>,</p><p>&#125;;</p><div className="mt-8 rounded-md border border-emerald-400/15 bg-emerald-400/5 p-3 text-emerald-300">Revision matches · safe to save atomically</div></div></div>;
  if (surface === "ship") return <div className="p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-medium">Deploy main → production</p><p className="mt-1 font-mono text-[8px] text-zinc-600">4f32c1a · 16 changed files</p></div><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[8px] text-emerald-300">Ready</span></div><div className="mt-6 space-y-3">{["Dry-run file plan", "Owner approval", "Pre-deploy snapshot", "Atomic upload", "Health verification"].map((item, index) => <div key={item} className="flex items-center gap-3 rounded-md border border-white/8 bg-white/[0.02] p-3"><span className="grid size-6 place-items-center rounded-full bg-emerald-400/8 text-emerald-300"><Check className="size-3" /></span><span className="text-[9px] text-zinc-300">{item}</span><span className="ml-auto font-mono text-[7px] text-zinc-600">{index < 3 ? "complete" : "queued"}</span></div>)}</div></div>;
  if (surface === "recover") return <div className="p-5"><p className="text-[10px] font-medium">Recovery points</p><p className="mt-1 text-[8px] text-zinc-600">Production API · encrypted snapshots</p><div className="mt-5 space-y-2">{[{ name: "Before deployment 4f32c1a", time: "17 min ago", size: "4.6 GB" }, { name: "Nightly incremental", time: "8 hours ago", size: "1.2 GB" }, { name: "Weekly full", time: "4 days ago", size: "7.1 GB" }].map((item, index) => <div key={item.name} className={cn("flex items-center gap-3 rounded-md border p-3", index === 0 ? "border-blue-400/20 bg-blue-400/5" : "border-white/8")}><ArchiveRestore className="size-3.5 text-zinc-500" /><span className="min-w-0 flex-1"><strong className="block truncate text-[9px] font-medium">{item.name}</strong><span className="mt-0.5 block text-[7px] text-zinc-600">{item.time} · {item.size}</span></span><button type="button" className="h-6 rounded border border-white/10 px-2 text-[8px] text-zinc-400">Restore</button></div>)}</div></div>;
  if (surface === "automate") return <div className="p-5"><div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3">{[{ icon: GitCompare, title: "Git push", detail: "main" }, { icon: ShieldCheck, title: "Policy", detail: "production" }, { icon: Rocket, title: "Deploy", detail: "3 servers" }].map((node, index) => <div key={node.title} className="contents"><div className="rounded-lg border border-white/10 bg-white/[0.025] p-4 text-center"><node.icon className="mx-auto size-4 text-blue-300" /><p className="mt-3 text-[9px] font-medium">{node.title}</p><p className="mt-1 text-[7px] text-zinc-600">{node.detail}</p></div>{index < 2 && <ArrowRight className="size-3.5 text-zinc-700" />}</div>)}</div><div className="mt-5 rounded-md border border-white/8 p-3"><div className="flex justify-between text-[8px]"><span className="text-zinc-400">Next scheduled run</span><span className="font-mono text-zinc-600">02:00 UTC</span></div><Progress value={72} className="mt-3 h-px" indicatorClassName="bg-blue-400" /></div></div>;
  return <div className="p-5"><div className="grid gap-3 sm:grid-cols-2">{[{ name: "Production API", host: "api-01.internal", region: "Virginia", latency: "31 ms" }, { name: "Frontend Cluster", host: "web-01.internal", region: "Ireland", latency: "44 ms" }, { name: "Staging", host: "staging.internal", region: "Oregon", latency: "118 ms" }, { name: "Analytics Worker", host: "analytics.internal", region: "Singapore", latency: "76 ms" }].map((server, index) => <div key={server.name} className="rounded-lg border border-white/8 bg-white/[0.018] p-3"><div className="flex items-center gap-2"><span className={cn("size-1.5 rounded-full", index === 2 ? "bg-amber-400" : "bg-emerald-400")} /><strong className="text-[9px] font-medium">{server.name}</strong><span className="ml-auto font-mono text-[7px] text-zinc-600">{server.latency}</span></div><p className="mt-2 font-mono text-[7px] text-zinc-600">{server.host}</p><p className="mt-1 text-[7px] text-zinc-700">SFTP · {server.region}</p></div>)}</div><div className="mt-4 flex items-center gap-2 rounded-md border border-emerald-400/15 bg-emerald-400/[0.035] p-3 text-[8px] text-emerald-300"><LockKeyhole className="size-3.5" />4 connections verified · credentials encrypted</div></div>;
}

export function ProductPage() {
  const [surface, setSurface] = useState("connect");
  return (
    <>
      <section className="marketing-glow px-4 pb-20 pt-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl text-center"><p className="text-[9px] font-medium uppercase tracking-[0.15em] text-blue-400">Orbit server workspace</p><h1 className="text-balance mx-auto mt-6 max-w-4xl text-5xl font-semibold tracking-tight sm:text-6xl">The operational layer between your team and every server.</h1><p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-zinc-500">A single, secure surface for files, transfers, terminals, deployments, backups, monitoring, automation, and the full story behind every change.</p><div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row"><Link to="/register"><Button size="lg">Start free<ArrowRight /></Button></Link><button type="button" onClick={() => document.getElementById("tour")?.scrollIntoView({ behavior: "smooth" })}><Button size="lg" variant="outline"><Play />Tour the workspace</Button></button></div></div>
        <div id="tour" className="mx-auto mt-16 max-w-5xl overflow-hidden rounded-xl border border-white/10 bg-[#101115] shadow-2xl shadow-black/60"><div className="grid grid-cols-5 border-b border-white/8">{surfaces.map((item) => <button type="button" key={item.id} onClick={() => setSurface(item.id)} className={cn("flex h-12 items-center justify-center gap-2 border-r border-white/8 text-[9px] text-zinc-600 last:border-0 hover:text-white", surface === item.id && "bg-white/[0.04] text-white")}><item.icon className="size-3.5" /><span className="hidden sm:inline">{item.label}</span></button>)}</div><div className="h-[350px] overflow-hidden"><SurfacePreview surface={surface} /></div></div>
      </section>

      <section className="border-y border-white/8 bg-[#0c0d10] px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><SectionHeading eyebrow="Connected by design" title="One operation model, from quick edit to global rollout." description="The same safe engine powers the file browser, transfer queue, deployments, backups, automations, API, and CLI." /><div className="mt-12 grid gap-4 lg:grid-cols-3">{[
        { step: "01", icon: Layers3, title: "Plan", description: "Resolve paths, profiles, permissions, policies, conflicts, and the exact operations required before touching a remote byte.", items: ["Canonical root enforcement", "Dry-run preview", "Content hash comparison"] },
        { step: "02", icon: Workflow, title: "Execute", description: "Run a persisted, cancellable job with bounded concurrency, retries, atomic replacement, and live progress.", items: ["Tenant-scoped workers", "Unique temporary paths", "Per-item outcomes"] },
        { step: "03", icon: RefreshCw, title: "Verify & recover", description: "Validate the result, emit immutable evidence, notify the right people, and preserve a direct rollback pointer.", items: ["Checksum verification", "Health probes", "Version and snapshot link"] },
      ].map((item) => <article key={item.title} className="rounded-xl border border-white/10 bg-[#111216] p-6"><div className="flex items-center justify-between"><item.icon className="size-5 text-blue-300" /><span className="font-mono text-[8px] text-zinc-700">{item.step}</span></div><h3 className="mt-8 text-xl font-semibold">{item.title}</h3><p className="mt-3 text-[10px] leading-5 text-zinc-500">{item.description}</p><ul className="mt-6 space-y-2 border-t border-white/8 pt-5">{item.items.map((point) => <li key={point} className="flex items-center gap-2 text-[9px] text-zinc-400"><CircleCheck className="size-3 text-emerald-400" />{point}</li>)}</ul></article>)}</div></div></section>

      <section className="px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2"><div className="rounded-xl border border-white/10 bg-[#111216] p-3"><div className="overflow-hidden rounded-lg border border-white/8 bg-[#0b0c0e]"><header className="flex h-10 items-center gap-2 border-b border-white/8 px-3"><Terminal className="size-3.5 text-zinc-500" /><span className="text-[8px] text-zinc-500">Production API · secure session</span><span className="ml-auto flex items-center gap-1.5 text-[7px] text-emerald-300"><span className="size-1.5 rounded-full bg-emerald-400" />recording audit</span></header><pre className="min-h-72 overflow-x-auto p-4 text-[9px] leading-6 text-zinc-500"><span className="text-blue-300">deploy@api-01</span>:<span className="text-violet-300">/var/www/api</span>$ orbit status{"\n"}✓ Host key verified{"\n"}✓ Workspace policy loaded{"\n"}✓ Recovery snapshot current{"\n"}{"\n"}<span className="text-blue-300">deploy@api-01</span>:<span className="text-violet-300">/var/www/api</span>$ git status --short{"\n"}<span className="text-amber-300"> M</span> src/server.ts{"\n"}<span className="text-amber-300"> M</span> docker-compose.yml{"\n"}{"\n"}<span className="text-zinc-600"># Commands are filtered, scoped, and recorded.</span></pre></div></div><div><SectionHeading eyebrow="Terminal, without the blind spot" title="Powerful enough for operators. Governed enough for production." description="Launch an SSH session in context, share approved runbooks, mask sensitive output, and attach every command to the same resource and audit timeline." /><CheckList className="mt-7" items={["Short-lived sessions with explicit server and root scope", "Saved runbooks with typed inputs and approval policies", "Live collaboration and optional session recording", "Command allowlists, timeouts, and recursive secret redaction"]} /></div></div></section>

      <section className="border-y border-white/8 bg-[#0c0d10] px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><SectionHeading align="center" eyebrow="Everything belongs together" title="Replace the tabs. Keep the capability." description="Orbit brings the full server lifecycle into one consistent information architecture." /><div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">{[
        [Server, "Connections", "SFTP, SSH, bastions, profiles, host keys, health, and access policies."], [FileCode2, "Remote files", "Browse, search, edit, diff, rename, chmod, archive, sync, and version."], [CloudUpload, "Transfers", "Queued, resumable uploads and downloads with priorities, retry, and cancellation."], [Rocket, "Deployments", "Git-aware change plans, environment promotion, checks, approvals, rollback."], [ArchiveRestore, "Backups", "Full, incremental, snapshots, schedules, retention, encryption, restore drills."], [Activity, "Monitoring", "CPU, memory, disk, network, services, uptime, logs, alerts, incidents."], [Bot, "Automations", "Schedules, webhooks, Git events, conditional steps, notifications, approvals."], [ShieldCheck, "Governance", "Roles, policies, identity, audit, API keys, sessions, billing, compliance."],
      ].map(([Icon, title, text]) => { const FeatureIcon = Icon as typeof Server; return <article key={String(title)} className="bg-[#111216] p-5"><FeatureIcon className="size-4 text-blue-300" /><h3 className="mt-7 text-sm font-semibold">{String(title)}</h3><p className="mt-2 text-[10px] leading-5 text-zinc-500">{String(text)}</p></article>; })}</div><div className="mt-8 text-center"><Link to="/features" className="inline-flex items-center gap-2 text-xs text-zinc-300 hover:text-white">Explore all features<ArrowRight className="size-3.5" /></Link></div></div></section>

      <MarketingCTA />
    </>
  );
}

export default ProductPage;

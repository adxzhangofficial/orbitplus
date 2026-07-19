import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArchiveRestore,
  Bot,
  Check,
  ChevronRight,
  CircleCheck,
  CloudUpload,
  Code2,
  FileCode2,
  Folder,
  Gauge,
  GitBranch,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Rocket,
  Server,
  ShieldCheck,
  Terminal,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Progress, StatusBadge } from "@/components/ui";
import { CheckList, Eyebrow, MarketingCTA, SectionHeading } from "@/components/marketing";
import { cn } from "@/lib/utils";

function ProductWindow() {
  const [activeServer, setActiveServer] = useState(0);
  const [connected, setConnected] = useState(true);
  const demoServers = [
    { name: "Production API", host: "api-01.acme.internal", status: "online", cpu: 38, memory: 64, region: "Virginia" },
    { name: "Frontend Cluster", host: "web-01.acme.internal", status: "online", cpu: 22, memory: 51, region: "Ireland" },
    { name: "Staging", host: "staging.acme.internal", status: "degraded", cpu: 81, memory: 74, region: "Oregon" },
  ];
  const server = demoServers[activeServer];
  return (
    <div className="relative mx-auto mt-14 max-w-6xl px-2 sm:px-6">
      <div className="absolute -inset-12 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(74,96,210,.18),transparent_55%)] blur-2xl" />
      <div className="overflow-hidden rounded-xl border border-white/12 bg-[#0d0e11] shadow-2xl shadow-black/70">
        <header className="flex h-10 items-center gap-3 border-b border-white/8 px-3"><div className="flex gap-1.5"><span className="size-2.5 rounded-full bg-red-400/70" /><span className="size-2.5 rounded-full bg-amber-400/70" /><span className="size-2.5 rounded-full bg-emerald-400/70" /></div><div className="mx-auto flex h-6 w-56 items-center justify-center rounded-md bg-white/[0.035] text-[8px] text-zinc-600">app.orbit.dev/workspace</div><div className="w-10" /></header>
        <div className="grid min-h-[500px] grid-cols-[156px_minmax(0,1fr)] sm:grid-cols-[200px_minmax(0,1fr)]">
          <aside className="border-r border-white/8 bg-[#141517] p-2.5">
            <div className="flex h-8 items-center gap-2 px-2"><span className="grid size-5 place-items-center rounded bg-zinc-100 text-black"><RefreshCw className="size-3" /></span><span className="font-heading text-[11px] font-semibold">Orbit<span className="text-blue-400">+</span></span></div>
            <p className="mb-1 mt-4 px-2 text-[7px] uppercase tracking-wider text-zinc-600">Workspace</p>
            {[{ icon: Gauge, label: "Overview" }, { icon: Server, label: "Servers", active: true }, { icon: CloudUpload, label: "Transfers" }, { icon: Rocket, label: "Deployments" }, { icon: ArchiveRestore, label: "Backups" }, { icon: Terminal, label: "Terminal" }].map((item) => <div key={item.label} className={cn("flex h-7 items-center gap-2 rounded px-2 text-[8px]", item.active ? "bg-zinc-800 text-white" : "text-zinc-600")}><item.icon className="size-3" />{item.label}</div>)}
            <p className="mb-1 mt-4 px-2 text-[7px] uppercase tracking-wider text-zinc-600">Servers</p>
            {demoServers.map((item, index) => <button type="button" key={item.name} onClick={() => { setActiveServer(index); setConnected(true); }} className={cn("flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[8px]", index === activeServer ? "bg-white/[0.055] text-zinc-200" : "text-zinc-600 hover:bg-white/[0.03]")}><span className={cn("size-1.5 rounded-full", item.status === "online" ? "bg-emerald-400" : "bg-amber-400")} /><span className="truncate">{item.name}</span></button>)}
          </aside>
          <main className="min-w-0">
            <header className="flex min-h-16 items-center justify-between gap-3 border-b border-white/8 px-4 sm:px-6"><div><h3 className="text-sm font-semibold">{server.name}</h3><p className="mt-0.5 hidden text-[8px] text-zinc-600 sm:block">{server.host} · SFTP · {server.region}</p></div><div className="flex items-center gap-2"><StatusBadge status={connected ? server.status : "offline"} /><button type="button" onClick={() => setConnected((value) => !value)} className="hidden h-7 rounded border border-white/10 px-2 text-[8px] text-zinc-400 hover:bg-white/5 sm:block">{connected ? "Disconnect" : "Connect"}</button></div></header>
            <div className="p-3 sm:p-5">
              <div className="grid grid-cols-2 border-y border-white/8 lg:grid-cols-4">
                {[{ label: "CPU load", value: `${connected ? server.cpu : 0}%`, icon: Activity }, { label: "Memory", value: `${connected ? server.memory : 0}%`, icon: Gauge }, { label: "Latency", value: connected ? "31 ms" : "—", icon: Zap }, { label: "Uptime", value: connected ? "99.997%" : "—", icon: CircleCheck }].map((metric, index) => <div key={metric.label} className={cn("p-3", index % 2 === 0 && "border-r", index < 2 && "border-b lg:border-b-0", index < 3 && "lg:border-r")}><div className="flex items-center gap-2 text-[7px] text-zinc-600"><metric.icon className="size-3" />{metric.label}</div><strong className="mt-2 block text-sm tabular-nums sm:text-lg">{metric.value}</strong></div>)}
              </div>
              <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
                <div><div className="mb-2 flex items-center justify-between"><div><p className="text-[9px] font-medium">Remote files</p><p className="mt-0.5 text-[7px] text-zinc-600">/var/www/api</p></div><span className="text-[7px] text-zinc-600">Modified 6m ago</span></div><div className="overflow-hidden border-y border-white/8">
                  {[{ name: "src", type: "folder", meta: "8 items", changed: true }, { name: "public", type: "folder", meta: "24 items" }, { name: "docker-compose.yml", type: "file", meta: "3.1 KB", changed: true }, { name: "package.json", type: "file", meta: "2.2 KB" }, { name: "server.ts", type: "file", meta: "6.8 KB", changed: true }, { name: "README.md", type: "file", meta: "9.4 KB" }].map((file) => <div key={file.name} className="flex h-9 items-center gap-2.5 border-b border-white/[0.055] px-2 last:border-0 hover:bg-white/[0.025]"><span className="grid size-6 place-items-center rounded bg-white/[0.035] text-zinc-500">{file.type === "folder" ? <Folder className="size-3" /> : <FileCode2 className="size-3" />}</span><span className="min-w-0 flex-1 truncate text-[8px] text-zinc-300">{file.name}</span>{file.changed && <span className="size-1.5 rounded-full bg-blue-400" />}<span className="text-[7px] text-zinc-700">{file.meta}</span></div>)}
                </div></div>
                <aside><div className="mb-2"><p className="text-[9px] font-medium">Live health</p><p className="mt-0.5 text-[7px] text-zinc-600">Last 30 minutes</p></div><div className="rounded-md border border-white/8 bg-white/[0.018] p-3"><div className="flex h-24 items-end gap-1">{[34, 42, 38, 52, 48, 41, 57, 62, 55, 47, 43, 38, 44, 39, 36, 42, 38, 35, 41, 38].map((height, index) => <span key={index} className="min-w-0 flex-1 rounded-t-sm bg-blue-400/55" style={{ height: `${height}%` }} />)}</div><div className="mt-3 space-y-3"><div><div className="mb-1 flex justify-between text-[7px] text-zinc-600"><span>Memory</span><span>{server.memory}%</span></div><Progress value={server.memory} className="h-px" indicatorClassName="bg-zinc-400" /></div><div><div className="mb-1 flex justify-between text-[7px] text-zinc-600"><span>Disk</span><span>47%</span></div><Progress value={47} className="h-px" indicatorClassName="bg-zinc-400" /></div></div></div><div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-400/10 bg-emerald-400/[0.035] p-2.5 text-[7px] text-emerald-300"><ShieldCheck className="size-3.5" />Host key verified · AES-256 encrypted</div></aside>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  const [typed, setTyped] = useState(0);
  const command = "orbit deploy production --safe";
  useEffect(() => {
    const timer = window.setInterval(() => setTyped((value) => value >= command.length ? 0 : value + 1), 85);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <>
      <section className="marketing-glow relative overflow-hidden px-4 pb-20 pt-24 sm:px-6 sm:pt-32 lg:px-8">
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-5xl text-center">
          <Eyebrow>The server workspace for modern teams</Eyebrow>
          <h1 className="text-balance mx-auto mt-7 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-7xl">All your servers.<br /><span className="bg-gradient-to-r from-zinc-100 via-blue-200 to-zinc-400 bg-clip-text text-transparent">One calm workspace.</span></h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-7 text-zinc-500 sm:text-lg">Connect, explore, edit, deploy, back up, monitor, and roll back—without juggling terminals, credentials, or fragile scripts.</p>
          <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row"><Link to="/register"><Button size="lg">Start building free<ArrowRight /></Button></Link><Link to="/product"><Button size="lg" variant="outline">See how it works<ChevronRight /></Button></Link></div>
          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[9px] text-zinc-600"><span className="flex items-center gap-1.5"><Check className="size-3 text-emerald-400" />No credit card</span><span className="flex items-center gap-1.5"><Check className="size-3 text-emerald-400" />Two servers free</span><span className="flex items-center gap-1.5"><Check className="size-3 text-emerald-400" />Setup in 60 seconds</span></div>
        </div>
        <ProductWindow />
      </section>

      <section className="border-y border-white/8 px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto flex max-w-6xl flex-col items-center gap-6 lg:flex-row"><p className="shrink-0 text-[9px] uppercase tracking-[0.14em] text-zinc-700">Trusted where uptime matters</p><div className="grid w-full grid-cols-3 gap-6 text-center font-heading text-sm font-semibold text-zinc-600 sm:grid-cols-6"><span>Northstar</span><span>Vercelity</span><span>Acme</span><span>Juniper</span><span>Polaris</span><span>Monarch</span></div></div></section>

      <section className="px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><SectionHeading eyebrow="One control plane" title={<>Work on infrastructure the way you work on code.</>} description="Orbit turns scattered SFTP clients, shell scripts, backup jobs, and status tabs into one coherent, audited workflow." />
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 md:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Server, title: "Every server, instantly clear", text: "Organize SFTP and SSH connections by workspace, environment, region, provider, and team—with live health at a glance.", tint: "text-blue-300" },
            { icon: FileCode2, title: "A remote editor that feels local", text: "Browse huge trees, preview safely, edit with syntax awareness, compare versions, and save atomically with conflict detection.", tint: "text-violet-300" },
            { icon: ArchiveRestore, title: "Every change is reversible", text: "Automatic pre-change snapshots, version history, encrypted backups, retention rules, and one-click point-in-time restores.", tint: "text-emerald-300" },
            { icon: Rocket, title: "Deploy with guardrails", text: "Dry-run changed files, request approvals, promote across environments, verify checksums, and roll back without guesswork.", tint: "text-amber-300" },
            { icon: Workflow, title: "Automate the careful parts", text: "Schedule syncs and backups, trigger webhooks, run approved playbooks, and build policies around destructive operations.", tint: "text-cyan-300" },
            { icon: Activity, title: "Know before users do", text: "Monitor CPU, memory, disk, network, services, transfers, and uptime—with routing that respects your on-call workflow.", tint: "text-rose-300" },
          ].map((feature) => <article key={feature.title} className="group bg-[#111216] p-6 transition-colors hover:bg-[#15161a]"><span className={cn("grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.035]", feature.tint)}><feature.icon className="size-4" /></span><h3 className="mt-8 text-lg font-semibold">{feature.title}</h3><p className="mt-3 text-[11px] leading-5 text-zinc-500">{feature.text}</p><Link to="/features" className="mt-6 inline-flex items-center gap-1.5 text-[9px] text-zinc-500 transition group-hover:text-white">Learn more<ArrowRight className="size-3" /></Link></article>)}
        </div>
      </div></section>

      <section className="border-y border-white/8 bg-[#0c0d10] px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2"><div><SectionHeading eyebrow="Safe by default" title="Ship fast without making production feel fragile." description="The risky path should never be the easy path. Orbit builds validation, visibility, and recovery into every operation." /><CheckList className="mt-8" items={["Dry-run plans show every file before sync or deployment", "Unique temporary uploads and atomic rename protect live files", "Content hashes and revision locks prevent silent overwrites", "Pre-change versions create an immediate rollback pointer", "Tenant-scoped credentials are encrypted and never reach the browser"]} /><Link to="/security" className="mt-7 inline-flex items-center gap-2 text-xs text-zinc-300 hover:text-white">Explore the security model<ArrowRight className="size-3.5" /></Link></div>
          <div className="relative"><div className="absolute -inset-8 bg-blue-500/5 blur-3xl" /><div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#111216]"><header className="flex h-11 items-center justify-between border-b border-white/8 px-4"><div className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-emerald-300" /><span className="text-[10px] font-medium">Production deployment plan</span></div><span className="rounded-full border border-emerald-400/15 bg-emerald-400/5 px-2 py-1 text-[8px] text-emerald-300">All checks passed</span></header><div className="p-4 sm:p-5">
            {[{ icon: GitBranch, title: "Compare source and destination", result: "14 changed · 2 new · 0 deleted" }, { icon: LockKeyhole, title: "Validate access policy", result: "Owner approval recorded" }, { icon: ArchiveRestore, title: "Create recovery snapshot", result: "bkp_20260719_0214" }, { icon: CloudUpload, title: "Upload using atomic replacement", result: "Checksums verified" }, { icon: Activity, title: "Run post-deploy health checks", result: "HTTP 200 · 31 ms" }].map((step, index) => <div key={step.title} className="relative flex gap-3 pb-5 last:pb-0"><div className="absolute bottom-0 left-[13px] top-7 w-px bg-white/8 last:hidden" /><span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300"><step.icon className="size-3" /></span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-medium">{index + 1}. {step.title}</p><Check className="size-3 text-emerald-400" /></div><p className="mt-1 font-mono text-[8px] text-zinc-600">{step.result}</p></div></div>)}
          </div><footer className="flex items-center justify-between border-t border-white/8 px-4 py-3"><span className="text-[8px] text-zinc-600">Plan signed by Adeel Khan · 2m ago</span><button type="button" className="h-7 rounded-md bg-zinc-100 px-3 text-[9px] font-medium text-black">Deploy safely</button></footer></div></div>
        </div></section>

      <section className="px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><SectionHeading align="center" eyebrow="From intent to done" title="A workflow your whole team can trust." description="Manual action or automated runbook, everything uses the same policy-aware job engine and leaves the same clear audit trail." />
        <div className="mt-14 grid gap-4 lg:grid-cols-4">
          {[
            { number: "01", icon: Terminal, title: "Connect", text: "SFTP, SSH key, agent, bastion, or private worker—host keys always verified." },
            { number: "02", icon: Code2, title: "Change", text: "Edit, sync, deploy, restore, chmod, or execute an approved runbook." },
            { number: "03", icon: ShieldCheck, title: "Verify", text: "Hash checks, health probes, policy decisions, and approvals happen automatically." },
            { number: "04", icon: RefreshCw, title: "Recover", text: "Every mutation links to a version, snapshot, and audited rollback path." },
          ].map((step, index) => <article key={step.title} className="relative rounded-xl border border-white/10 bg-[#111216] p-5"><span className="text-[8px] font-mono text-zinc-700">{step.number}</span><step.icon className="mt-8 size-5 text-zinc-300" /><h3 className="mt-5 text-base font-semibold">{step.title}</h3><p className="mt-2 text-[10px] leading-5 text-zinc-500">{step.text}</p>{index < 3 && <ArrowRight className="absolute -right-3.5 top-1/2 z-10 hidden size-6 rounded-full border border-white/10 bg-[#0a0b0d] p-1.5 text-zinc-600 lg:block" />}</article>)}
        </div>
        <div className="mx-auto mt-10 max-w-2xl rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[10px] text-zinc-500"><span className="text-emerald-400">$ </span>{command.slice(0, typed)}<span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-zinc-400 align-middle" /></div>
      </div></section>

      <section className="border-y border-white/8 bg-[#0c0d10] px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><SectionHeading align="center" eyebrow="Teams, not credential spreadsheets" title="Access that scales with responsibility." description="Give developers speed, operators control, auditors evidence, and security teams the policies they need." /><div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">{[
        { icon: Users, title: "Granular roles", text: "Owner, admin, developer, operator, viewer, and custom resource-scoped roles." },
        { icon: KeyRound, title: "No shared secrets", text: "Encrypted vault references, short-lived access, API keys, SSO, and SCIM." },
        { icon: ShieldCheck, title: "Policy approvals", text: "Require reviewers for production deletes, syncs, restores, and shell commands." },
        { icon: Activity, title: "Immutable audit", text: "Who, what, where, when, approval, checksum, IP, and outcome—exportable anytime." },
      ].map((item) => <div key={item.title} className="bg-[#111216] p-5"><item.icon className="size-4 text-blue-300" /><h3 className="mt-7 text-sm font-semibold">{item.title}</h3><p className="mt-2 text-[10px] leading-5 text-zinc-500">{item.text}</p></div>)}</div></div></section>

      <section className="px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_1.4fr]"><div><SectionHeading eyebrow="Loved by operators" title="“We stopped treating SFTP like a personal desktop tool.”" description="Orbit gave the whole engineering team one operational history and a safe way to move quickly." /><div className="mt-6"><p className="text-xs font-medium">Sara Malik</p><p className="mt-1 text-[9px] text-zinc-600">VP Engineering · Acme</p></div></div><div className="grid gap-3 sm:grid-cols-2">{[
        { value: "73%", label: "fewer failed deployments", icon: Rocket },
        { value: "11h", label: "saved per operator / month", icon: Zap },
        { value: "41s", label: "mean rollback time", icon: RefreshCw },
        { value: "100%", label: "production changes audited", icon: ShieldCheck },
      ].map((metric) => <div key={metric.label} className="rounded-xl border border-white/10 bg-[#111216] p-5"><metric.icon className="size-4 text-zinc-500" /><strong className="mt-8 block text-3xl font-semibold tabular-nums">{metric.value}</strong><p className="mt-1 text-[9px] text-zinc-600">{metric.label}</p></div>)}</div></div></section>

      <MarketingCTA />
    </>
  );
}

export default HomePage;

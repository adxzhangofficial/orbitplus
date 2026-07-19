import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowRight,
  Bell,
  Bot,
  Braces,
  Check,
  CircleCheck,
  CloudDownload,
  CloudUpload,
  Code2,
  FileClock,
  FileCode2,
  FileDiff,
  FileSearch,
  Fingerprint,
  GitBranch,
  Globe2,
  KeyRound,
  ListChecks,
  LockKeyhole,
  Network,
  PackageCheck,
  RefreshCw,
  Rocket,
  Search,
  Server,
  ShieldCheck,
  Terminal,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui";
import { MarketingCTA, SectionHeading } from "@/components/marketing";

const groups = [
  {
    id: "servers",
    eyebrow: "Connections",
    title: "A live inventory of every server.",
    description: "Move beyond personal connection profiles. Orbit creates a shared, policy-aware server catalog with health, ownership, environments, and access in one place.",
    icon: Server,
    features: [
      [Fingerprint, "Verified SFTP and SSH", "Password, key, agent, and keyboard-interactive authentication with pinned host fingerprints."],
      [Network, "Bastion and private networks", "Single or multi-hop connections, private workers, proxy support, and tenant-scoped egress policies."],
      [Globe2, "Profiles and environments", "Map development, staging, and production roots once, then target them consistently everywhere."],
      [Activity, "Connection intelligence", "Latency, uptime, disconnect reasons, algorithm negotiation, concurrent sessions, and health history."],
    ],
  },
  {
    id: "files",
    eyebrow: "Remote workspace",
    title: "Your fastest path from finding a file to safely changing it.",
    description: "The remote explorer is built for real repositories and operational trees: quick, keyboard-friendly, context-rich, and careful with large or sensitive content.",
    icon: FileCode2,
    features: [
      [FileSearch, "Fast remote explorer", "Breadcrumbs, fuzzy search, hidden-file controls, filters, sorting, multi-select, favorites, and virtualized trees."],
      [Code2, "Preview and edit", "Syntax-aware editing, encoding detection, line endings, size limits, binary previews, formatting, and save-on-command."],
      [FileDiff, "Compare before saving", "Remote versus local, working copy versus remote revision, or any two historical versions."],
      [PackageCheck, "Atomic, conflict-safe writes", "Unique temporary paths, permission preservation, hash verification, optimistic revision locking, and atomic rename."],
      [Archive, "Full file operations", "Create, rename, move, copy, chmod, chown, symlink, checksum, compress, extract, and recycle."],
      [Search, "Cross-server search", "Find names or content across allowed roots without downloading whole trees into the browser."],
    ],
  },
  {
    id: "transfers",
    eyebrow: "Move & sync",
    title: "Transfers that stay fast, observable, and recoverable.",
    description: "Every upload, download, and sync becomes a persistent job with item-level status—not a spinner you have to trust.",
    icon: CloudUpload,
    features: [
      [CloudUpload, "Resumable uploads", "Drag and drop files or trees, resume interrupted jobs, prioritize urgent changes, and cap bandwidth."],
      [CloudDownload, "Streaming downloads", "Secure streaming, archive-on-the-fly, expiring links, integrity checks, and download audit."],
      [RefreshCw, "Dry-run synchronization", "One-way or bidirectional plans with explicit create, update, delete, ignore, and conflict actions."],
      [Zap, "Concurrent job engine", "Per-tenant limits, priorities, retry policies, cancellation, cleanup, progress events, and final aggregate outcomes."],
    ],
  },
  {
    id: "backups",
    eyebrow: "Protect & recover",
    title: "Rollback is a product feature, not a hopeful command.",
    description: "File versions, pre-change snapshots, server backups, and deployment releases all connect to a common recovery model.",
    icon: ArchiveRestore,
    features: [
      [FileClock, "Version every edit", "Keep content hashes, author, timestamp, reason, size, permissions, and a diff for every safe save."],
      [ArchiveRestore, "Encrypted snapshots", "Manual, scheduled, and policy-triggered full or incremental backups to local, S3, or private storage."],
      [RefreshCw, "Granular restore", "Restore one file, a folder, a server root, or a full deployment release—with a dry run first."],
      [ListChecks, "Recovery drills", "Automatically verify archives, sample checksums, restore to an isolated path, and report recovery readiness."],
    ],
  },
  {
    id: "automation",
    eyebrow: "Deploy & automate",
    title: "Turn the way your best operator works into a repeatable system.",
    description: "Build workflows from the same guarded primitives available in the interface and API, with approvals at precisely the risky steps.",
    icon: Workflow,
    features: [
      [GitBranch, "Git-aware deployments", "Ship only changed files, map renames and deletes, pin commits, promote between environments, and verify health."],
      [Bot, "Visual automations", "Schedule, trigger, branch, retry, wait, approve, transfer, back up, deploy, run a check, and notify."],
      [Terminal, "Approved runbooks", "Typed parameters, secret inputs, structured commands, allowlists, timeouts, masked output, and session evidence."],
      [Braces, "API, CLI, and webhooks", "Everything in the workspace is programmable through scoped tokens and idempotent operations."],
    ],
  },
  {
    id: "governance",
    eyebrow: "Observe & govern",
    title: "Operational context for teams, security, and compliance.",
    description: "Orbit connects infrastructure signals with human changes so incidents are faster to understand and safer to resolve.",
    icon: ShieldCheck,
    features: [
      [Activity, "Metrics and service health", "CPU, memory, disk, network, processes, ports, service checks, uptime, and anomaly thresholds."],
      [Bell, "Actionable alerts", "Email, Slack, Teams, PagerDuty, webhooks, maintenance windows, deduplication, and escalation."],
      [Users, "RBAC and approvals", "Workspace and resource roles, environment scope, just-in-time grants, break-glass workflows, and review chains."],
      [LockKeyhole, "Immutable audit trail", "Identity, IP, server, path, command, policy, approval, checksums, result, and recovery pointer."],
      [KeyRound, "Enterprise identity", "SAML SSO, OIDC, SCIM, MFA enforcement, session policies, trusted devices, and API key governance."],
      [ShieldCheck, "Security posture", "Host-key rotation, weak algorithm blocking, secret scanning, suspicious access, and policy findings."],
    ],
  },
];

export function FeaturesPage() {
  return (
    <>
      <section className="marketing-glow px-4 pb-20 pt-24 text-center sm:px-6 lg:px-8"><div className="mx-auto max-w-4xl"><p className="text-[9px] font-medium uppercase tracking-[0.15em] text-blue-400">Platform capabilities</p><h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight sm:text-6xl">Hundreds of sharp tools.<br />One coherent workspace.</h1><p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-zinc-500">Everything developers and operators need to connect, change, move, recover, automate, observe, and govern server infrastructure.</p><div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row"><Link to="/register"><Button size="lg">Explore it free<ArrowRight /></Button></Link><Link to="/docs"><Button size="lg" variant="outline">Read the docs</Button></Link></div></div>
        <nav className="mx-auto mt-14 flex max-w-5xl gap-1 overflow-x-auto rounded-lg border border-white/10 bg-white/[0.02] p-1">{groups.map((group) => <a key={group.id} href={`#${group.id}`} className="flex h-9 flex-1 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-[9px] text-zinc-500 hover:bg-white/5 hover:text-white"><group.icon className="size-3.5" />{group.eyebrow}</a>)}</nav>
      </section>

      {groups.map((group, groupIndex) => <section id={group.id} key={group.id} className={groupIndex % 2 === 0 ? "border-y border-white/8 bg-[#0c0d10] px-4 py-24 sm:px-6 lg:px-8" : "px-4 py-24 sm:px-6 lg:px-8"}><div className="mx-auto max-w-7xl"><div className="grid gap-12 lg:grid-cols-[.7fr_1.3fr]"><div className="lg:sticky lg:top-28 lg:self-start"><span className="grid size-10 place-items-center rounded-lg border border-blue-400/15 bg-blue-400/[0.05] text-blue-300"><group.icon className="size-4.5" /></span><SectionHeading className="mt-6" eyebrow={group.eyebrow} title={group.title} description={group.description} /></div><div className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2">{group.features.map(([Icon, title, description]) => <article key={String(title)} className="bg-[#111216] p-5"><Icon className="size-4 text-zinc-400" /><h3 className="mt-7 text-sm font-semibold">{String(title)}</h3><p className="mt-2 text-[10px] leading-5 text-zinc-500">{String(description)}</p><div className="mt-5 flex items-center gap-1.5 text-[8px] text-emerald-400"><CircleCheck className="size-3" />Available in Orbit</div></article>)}</div></div></div></section>)}

      <section className="px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><SectionHeading align="center" eyebrow="The long tail, covered" title="The details that make a workspace feel complete." description="Small capabilities add up to less context switching, fewer scripts, and fewer dangerous shortcuts." /><div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        "Favorite servers and paths", "Recent files and sessions", "Custom connection tags", "Workspace templates", "Permission presets", "Ignore patterns", "Encoding detection", "Line-ending controls", "Binary previews", "Checksum tools", "Archive and extract", "Recycle bin", "Transfer priorities", "Bandwidth limits", "Retry policies", "Maintenance windows", "Alert routing", "Saved filters", "CSV and JSON exports", "Webhook signing", "API usage analytics", "Secret redaction", "Session management", "Trusted devices", "Invoice history", "Usage budgets", "Feature entitlements", "Workspace cloning", "Environment promotion", "Public status pages", "Incident timelines", "Support diagnostics",
      ].map((feature) => <div key={feature} className="flex items-center gap-2.5 rounded-md border border-white/8 bg-white/[0.018] px-3 py-3 text-[9px] text-zinc-400"><Check className="size-3 shrink-0 text-blue-400" />{feature}</div>)}</div></div></section>
      <MarketingCTA />
    </>
  );
}

export default FeaturesPage;

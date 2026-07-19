import {
  Activity,
  ArrowRight,
  Award,
  Check,
  CloudCog,
  Database,
  EyeOff,
  Fingerprint,
  GlobeLock,
  HardDriveDownload,
  KeyRound,
  LockKeyhole,
  Network,
  ScrollText,
  Server,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui";
import { CheckList, MarketingCTA, SectionHeading } from "@/components/marketing";

export function SecurityPage() {
  return (
    <>
      <section className="marketing-glow px-4 pb-24 pt-24 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_.95fr]"><div><div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/5 px-3 py-1 text-[9px] uppercase tracking-wider text-emerald-300"><ShieldCheck className="size-3" />Secure by architecture</div><h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight sm:text-6xl">Infrastructure access deserves infrastructure-grade controls.</h1><p className="mt-6 max-w-2xl text-base leading-7 text-zinc-500">Orbit is designed around least privilege, encrypted secrets, verified hosts, isolated execution, recoverable changes, and evidence you can trust.</p><div className="mt-8 flex flex-col gap-2 sm:flex-row"><Link to="/contact?topic=security"><Button size="lg">Request security pack<ArrowRight /></Button></Link><Link to="/docs/security"><Button size="lg" variant="outline">Read security docs</Button></Link></div></div>
        <div className="relative"><div className="absolute -inset-10 bg-emerald-500/5 blur-3xl" /><div className="relative rounded-2xl border border-white/10 bg-[#111216] p-5"><header className="flex items-center justify-between border-b border-white/8 pb-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg border border-emerald-400/20 bg-emerald-400/5 text-emerald-300"><ShieldCheck className="size-4" /></span><div><p className="text-[11px] font-medium">Workspace security posture</p><p className="mt-0.5 text-[8px] text-zinc-600">Acme Engineering · Production</p></div></div><strong className="text-2xl text-emerald-300">A</strong></header><div className="mt-5 space-y-2">{[{ label: "Host keys verified", value: "14 / 14" }, { label: "Credentials encrypted", value: "14 / 14" }, { label: "Members using MFA", value: "8 / 8" }, { label: "Production approval policy", value: "Enforced" }, { label: "Backup recovery check", value: "Passed" }].map((item) => <div key={item.label} className="flex items-center gap-3 rounded-md border border-white/8 bg-white/[0.018] p-3"><span className="grid size-5 place-items-center rounded-full bg-emerald-400/8 text-emerald-300"><Check className="size-3" /></span><span className="flex-1 text-[9px] text-zinc-400">{item.label}</span><span className="font-mono text-[8px] text-zinc-600">{item.value}</span></div>)}</div><p className="mt-4 text-center text-[7px] text-zinc-700">Continuously evaluated · updated 12 seconds ago</p></div></div>
      </div></section>

      <section className="border-y border-white/8 bg-[#0c0d10] px-4 py-20 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-7xl gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">{([
        [Fingerprint, "Host identity", "Pinned SSH fingerprints and audited rotation"], [KeyRound, "Secret protection", "AES-256-GCM envelope encryption and vault references"], [Network, "Isolated execution", "Tenant-scoped workers, pools, limits, and egress"], [ScrollText, "Complete evidence", "Immutable, exportable activity and approval audit"],
      ] as const).map(([Icon, title, text]) => <div key={title} className="bg-[#111216] p-5"><Icon className="size-4 text-emerald-300" /><h2 className="mt-6 text-sm font-semibold">{title}</h2><p className="mt-2 text-[9px] leading-4 text-zinc-500">{text}</p></div>)}</div></section>

      <section className="px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><SectionHeading eyebrow="Defense in depth" title="Protection at every boundary." description="Security controls follow the full lifecycle: identity, authorization, secrets, network, remote host, operation, stored data, and audit." /><div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{([
        [UserCheck, "Identity & sessions", ["SAML SSO and OIDC", "SCIM lifecycle management", "MFA and trusted-device enforcement", "Short-lived, revocable sessions", "IP and geographic policies"]],
        [LockKeyhole, "Roles & policy", ["Tenant-isolated resources", "Built-in and custom roles", "Environment and path scope", "Just-in-time grants", "Multi-step production approvals"]],
        [KeyRound, "Credentials & keys", ["No secrets in the browser", "Envelope encryption at rest", "Vault and KMS integrations", "Recursive log redaction", "Audited credential rotation"]],
        [GlobeLock, "Network & hosts", ["SFTP-first protocol policy", "SSH host-key pinning", "Weak algorithm blocking", "DNS rebinding protection", "Private workers and VPC peering"]],
        [CloudCog, "Safe execution", ["Canonical path enforcement", "Unique atomic temporary writes", "Bounded recursive operations", "Content hashes and revision locks", "Timeouts, quotas, and circuit breakers"]],
        [Database, "Data & recovery", ["Encrypted database and backups", "Configurable regional storage", "Retention and deletion policies", "Integrity and restore checks", "Exportable customer data"]],
      ] as const).map(([Icon, title, items]) => <article key={title} className="rounded-xl border border-white/10 bg-[#111216] p-6"><Icon className="size-5 text-zinc-300" /><h3 className="mt-7 text-lg font-semibold">{title}</h3><ul className="mt-5 space-y-2.5">{items.map((item) => <li key={item} className="flex gap-2 text-[9px] leading-4 text-zinc-500"><Check className="mt-0.5 size-3 shrink-0 text-emerald-400" />{item}</li>)}</ul></article>)}</div></div></section>

      <section className="border-y border-white/8 bg-[#0c0d10] px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-7xl gap-16 lg:grid-cols-2"><div><SectionHeading eyebrow="A safer mutation pipeline" title="Risk is addressed before the operation, not after the incident." description="Every destructive or production-impacting action passes through a consistent sequence with explicit failure states." /><CheckList className="mt-8" items={["Plan and dry-run with canonical source and destination paths", "Evaluate role, resource policy, risk, and approval requirements", "Create an encrypted pre-change snapshot or version pointer", "Execute an idempotent, cancellable, tenant-scoped job", "Verify checksums and configured health probes", "Write immutable audit evidence with a direct rollback target"]} /></div><div className="space-y-2">{["Plan / dry run", "Policy & approval", "Pre-change snapshot", "Queued execution", "Integrity verification", "Immutable audit + rollback"].map((step, index) => <div key={step} className="flex items-center gap-4 rounded-lg border border-white/10 bg-[#111216] p-4"><span className="grid size-7 shrink-0 place-items-center rounded-full border border-emerald-400/20 bg-emerald-400/5 font-mono text-[8px] text-emerald-300">{String(index + 1).padStart(2, "0")}</span><span className="text-[10px] font-medium">{step}</span><Activity className="ml-auto size-3.5 text-zinc-700" /></div>)}</div></div></section>

      <section className="px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><SectionHeading align="center" eyebrow="Trust & compliance" title="Controls ready for your review." description="Orbit provides the documentation, agreements, monitoring, and operational practices security teams expect." /><div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">{([
        [Award, "SOC 2 program", "Controls mapped across security, availability, and confidentiality."], [HardDriveDownload, "Data portability", "Workspace metadata, audit history, and manifests export on demand."], [EyeOff, "Privacy by default", "No advertising profiles, no sale of data, and minimal operational telemetry."], [Server, "Enterprise deployment", "Private workers, data regions, BYOK, VPC connectivity, and tailored retention."],
      ] as const).map(([Icon, title, text]) => <article key={title} className="bg-[#111216] p-5"><Icon className="size-4 text-blue-300" /><h3 className="mt-7 text-sm font-semibold">{title}</h3><p className="mt-2 text-[9px] leading-5 text-zinc-500">{text}</p></article>)}</div><p className="mx-auto mt-6 max-w-2xl text-center text-[9px] leading-4 text-zinc-700">Compliance certifications describe an operational program and require independent verification; contact us for the current audit scope and reports.</p></div></section>
      <MarketingCTA title="Give your security team the same clarity as your operators." description="Review the architecture, threat model, subprocessors, data flows, and enterprise deployment options with an Orbit security engineer." primary="Request security review" />
    </>
  );
}

export default SecurityPage;

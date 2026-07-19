import { type FormEvent, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Cloud,
  Database,
  Gauge,
  Globe2,
  History,
  Mail,
  RadioTower,
  Server,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

type Service = {
  name: string;
  description: string;
  icon: typeof Cloud;
  uptime: string;
  latency: Record<string, string>;
  status: "Operational" | "Degraded";
  samples: number[];
};

const services: Service[] = [
  { name: "Web application", description: "Dashboard, authentication, and workspace APIs", icon: Globe2, uptime: "99.998%", latency: { Global: "82 ms", Americas: "64 ms", Europe: "72 ms", Asia: "96 ms" }, status: "Operational", samples: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] },
  { name: "Connection relay", description: "Managed SFTP and SSH connection plane", icon: RadioTower, uptime: "99.994%", latency: { Global: "118 ms", Americas: "91 ms", Europe: "104 ms", Asia: "147 ms" }, status: "Operational", samples: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] },
  { name: "Transfer workers", description: "Uploads, downloads, syncs, and verification", icon: Server, uptime: "99.991%", latency: { Global: "41 ms", Americas: "35 ms", Europe: "39 ms", Asia: "49 ms" }, status: "Operational", samples: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] },
  { name: "Terminal sessions", description: "Interactive terminals and shared session transport", icon: TerminalSquare, uptime: "99.987%", latency: { Global: "136 ms", Americas: "102 ms", Europe: "121 ms", Asia: "165 ms" }, status: "Operational", samples: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] },
  { name: "Backups and versions", description: "Encrypted snapshot storage and restore jobs", icon: Database, uptime: "99.999%", latency: { Global: "55 ms", Americas: "44 ms", Europe: "51 ms", Asia: "68 ms" }, status: "Operational", samples: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] },
  { name: "Monitoring and alerts", description: "Health checks, metrics, and notification delivery", icon: Activity, uptime: "99.995%", latency: { Global: "73 ms", Americas: "58 ms", Europe: "66 ms", Asia: "89 ms" }, status: "Operational", samples: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] },
];

const incidents = [
  {
    id: "2026-06-29-relay",
    date: "June 29, 2026",
    title: "Elevated connection latency in Frankfurt",
    duration: "31 minutes",
    impact: "Minor",
    summary: "Some EU customers saw slower SFTP handshakes. Established sessions and file transfers were not interrupted.",
    updates: [
      ["14:42 UTC", "Resolved", "Traffic is fully restored to the primary pool. We are monitoring handshake latency."],
      ["14:29 UTC", "Monitoring", "A failed network appliance was removed and traffic is returning to normal."],
      ["14:11 UTC", "Investigating", "We are investigating elevated connection setup time in eu-central."],
    ],
  },
  {
    id: "2026-05-18-terminal",
    date: "May 18, 2026",
    title: "Intermittent terminal reconnects",
    duration: "18 minutes",
    impact: "Minor",
    summary: "A subset of shared terminal sessions reconnected once. Commands and session transcripts were preserved.",
    updates: [
      ["09:36 UTC", "Resolved", "The affected transport nodes have been replaced and error rates are normal."],
      ["09:18 UTC", "Identified", "A release exposed a connection-draining regression; rollback is in progress."],
    ],
  },
  {
    id: "2026-03-07-webhook",
    date: "March 7, 2026",
    title: "Delayed webhook deliveries",
    duration: "47 minutes",
    impact: "Degraded",
    summary: "Webhook deliveries were delayed by up to eleven minutes. Events remained durable and were delivered in order after recovery.",
    updates: [
      ["21:03 UTC", "Resolved", "The queue is drained and delivery latency is within target."],
      ["20:31 UTC", "Identified", "One delivery shard is saturated; capacity has been added."],
      ["20:16 UTC", "Investigating", "We are investigating delayed workspace webhooks."],
    ],
  },
];

const regions = ["Global", "Americas", "Europe", "Asia"] as const;

export function StatusPage() {
  const [region, setRegion] = useState<(typeof regions)[number]>("Global");
  const [historyRange, setHistoryRange] = useState<"90 days" | "2026">("90 days");
  const [openIncident, setOpenIncident] = useState(incidents[0].id);
  const [email, setEmail] = useState("");

  const visibleIncidents = useMemo(() => historyRange === "90 days" ? incidents.slice(0, 2) : incidents, [historyRange]);

  function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    toast.success("Status notifications are now enabled.");
    setEmail("");
  }

  return (
    <>
      <section className="marketing-glow border-b border-white/8 px-4 pb-14 pt-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div><p className="text-[9px] font-medium uppercase tracking-[0.15em] text-blue-400">Orbit system status</p><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Reliable infrastructure, documented plainly.</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-500">Live service health, regional performance, incident updates, and a complete record of how we respond.</p></div>
            <div className="flex items-center gap-2 text-[9px] text-zinc-600"><Clock3 className="size-3.5" />Last checked moments ago</div>
          </div>
          <div className="mt-10 overflow-hidden rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.045]">
            <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center"><span className="grid size-12 shrink-0 place-items-center rounded-full border border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300"><CheckCircle2 className="size-6" /></span><div><h2 className="text-2xl font-semibold text-emerald-100">All systems operational</h2><p className="mt-1 text-[10px] leading-5 text-emerald-100/55">No active incidents or scheduled maintenance. All regions are serving traffic normally.</p></div><Badge tone="success" dot className="sm:ml-auto">Healthy</Badge></div>
            <div className="grid border-t border-emerald-400/10 sm:grid-cols-3">{[["99.994%", "platform uptime, 90 days"], ["112 ms", "global connection p95"], ["0", "active incidents"]].map(([value, label]) => <div key={label} className="border-b border-emerald-400/10 p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><strong className="font-mono text-lg text-emerald-100">{value}</strong><p className="mt-1 text-[8px] text-emerald-100/40">{label}</p></div>)}</div>
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[9px] uppercase tracking-[0.14em] text-blue-400">Live components</p><h2 className="mt-3 text-3xl font-semibold">Service health by component</h2></div><div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-white/10 bg-white/[0.02] p-1">{regions.map((item) => <button type="button" key={item} onClick={() => setRegion(item)} className={cn("h-7 shrink-0 rounded-md px-3 text-[9px]", region === item ? "bg-zinc-100 text-black" : "text-zinc-600 hover:text-zinc-200")}>{item}</button>)}</div></div>
          <div className="mt-8 overflow-hidden rounded-xl border border-white/10 bg-[#111216]">
            {services.map((service, index) => <article key={service.name} className={cn("grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_110px_1fr] sm:items-center sm:p-5", index !== services.length - 1 && "border-b border-white/8")}>
              <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/8 bg-white/[0.025] text-zinc-500"><service.icon className="size-4" /></span><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{service.name}</h3><p className="mt-1 truncate text-[8px] text-zinc-600">{service.description}</p></div></div>
              <div><p className="font-mono text-[10px] text-zinc-300">{service.latency[region]}</p><p className="mt-1 text-[8px] text-zinc-700">p95 in {region.toLowerCase()}</p></div>
              <div className="min-w-0"><div className="mb-2 flex items-center justify-between"><span className="text-[8px] text-zinc-700">45-day availability</span><span className="flex items-center gap-1.5 text-[8px] text-emerald-300"><span className="size-1.5 rounded-full bg-emerald-400" />{service.status} · {service.uptime}</span></div><div className="flex h-7 items-end gap-[2px]">{service.samples.map((sample, sampleIndex) => <span key={sampleIndex} title={sample === 4 ? "Operational" : sample === 3 ? "Partial degradation" : "Degraded"} className={cn("min-w-[2px] flex-1 rounded-[1px]", sample === 4 ? "h-full bg-emerald-400/55" : sample === 3 ? "h-4/5 bg-amber-400/70" : "h-3/5 bg-red-400/70")} />)}</div></div>
            </article>)}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[8px] text-zinc-700"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-400/70" />Operational</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-amber-400/70" />Partial degradation</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-red-400/70" />Major outage</span></div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#0c0d10] px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div><div className="flex items-end justify-between gap-4"><div><p className="text-[9px] uppercase tracking-[0.14em] text-blue-400">Incident history</p><h2 className="mt-3 text-3xl font-semibold">The record, not just the headline.</h2></div><div className="hidden rounded-lg border border-white/10 p-1 sm:flex">{(["90 days", "2026"] as const).map((range) => <button type="button" key={range} onClick={() => setHistoryRange(range)} className={cn("h-7 rounded-md px-3 text-[8px]", historyRange === range ? "bg-white/10 text-zinc-200" : "text-zinc-600")}>{range}</button>)}</div></div>
            <div className="mt-7 divide-y divide-white/8 border-y border-white/8">{visibleIncidents.map((incident) => { const isOpen = openIncident === incident.id; return <article key={incident.id}><button type="button" onClick={() => setOpenIncident(isOpen ? "" : incident.id)} className="flex w-full items-start gap-4 py-5 text-left"><span className="mt-1 size-2 shrink-0 rounded-full bg-amber-400" /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-[8px] text-zinc-700">{incident.date}</span><Badge tone="warning">{incident.impact} impact</Badge></span><h3 className="mt-2 text-base font-semibold">{incident.title}</h3><span className="mt-1 block text-[9px] text-zinc-600">Resolved in {incident.duration}</span></span><ChevronDown className={cn("mt-1 size-4 text-zinc-600 transition", isOpen && "rotate-180 text-zinc-300")} /></button>{isOpen && <div className="pb-6 pl-6"><p className="max-w-2xl text-[10px] leading-5 text-zinc-500">{incident.summary}</p><ol className="mt-5 space-y-3 border-l border-white/10 pl-5">{incident.updates.map(([time, status, copy]) => <li key={time} className="relative"><span className="absolute -left-[23px] top-1 size-1.5 rounded-full bg-zinc-500 ring-4 ring-[#0c0d10]" /><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[8px] text-zinc-600">{time}</span><span className="text-[8px] font-medium text-zinc-300">{status}</span></div><p className="mt-1 text-[9px] leading-4 text-zinc-600">{copy}</p></li>)}</ol></div>}</article>; })}</div>
          </div>
          <aside className="space-y-4">
            <form onSubmit={subscribe} className="rounded-xl border border-white/10 bg-[#111216] p-5"><span className="grid size-9 place-items-center rounded-lg border border-blue-400/15 bg-blue-400/[0.05] text-blue-300"><Bell className="size-4" /></span><h3 className="mt-5 text-lg font-semibold">Know before your team asks.</h3><p className="mt-2 text-[9px] leading-5 text-zinc-600">Get incident and maintenance updates by email. Subscribe to only the components you use.</p><Input aria-label="Work email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ops@company.com" className="mt-5" /><Button type="submit" className="mt-2 w-full">Subscribe to updates</Button></form>
            <div className="rounded-xl border border-white/10 p-5"><p className="text-[8px] font-medium uppercase tracking-[0.12em] text-zinc-700">Our reliability practice</p><div className="mt-4 space-y-3">{[[ShieldCheck, "Blameless reviews", "Material incidents receive a written review."], [Gauge, "Measured objectives", "Core services have published internal SLOs."], [History, "Durable updates", "Every incident timeline remains available."]].map(([Icon, title, copy]) => <div key={String(title)} className="flex gap-3"><Icon className="mt-0.5 size-3.5 shrink-0 text-zinc-500" /><div><p className="text-[9px] font-medium text-zinc-300">{String(title)}</p><p className="mt-1 text-[8px] leading-4 text-zinc-700">{String(copy)}</p></div></div>)}</div></div>
          </aside>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8"><div className="mx-auto flex max-w-6xl flex-col gap-5 rounded-xl border border-white/10 bg-[#111216] p-6 sm:flex-row sm:items-center"><span className="grid size-10 shrink-0 place-items-center rounded-full border border-emerald-400/20 text-emerald-300"><Check className="size-4" /></span><div><h2 className="text-lg font-semibold">Need to report something?</h2><p className="mt-1 text-[9px] text-zinc-600">For a security issue, use our responsible disclosure channel. For service trouble, our operators are online.</p></div><div className="flex gap-2 sm:ml-auto"><Button variant="outline" onClick={() => { window.location.href = "mailto:security@orbit.run"; }}><ShieldCheck />Security</Button><Button onClick={() => { window.location.href = "mailto:support@orbit.run"; }}><Mail />Contact support</Button></div></div></section>
    </>
  );
}

export default StatusPage;

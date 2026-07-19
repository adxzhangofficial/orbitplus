import { useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Code2,
  Compass,
  Globe2,
  HeartHandshake,
  MapPin,
  Network,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui";
import { MarketingCTA, SectionHeading } from "@/components/marketing";
import { cn } from "@/lib/utils";

const principles = [
  {
    title: "Calm is an engineering outcome",
    summary: "Good operations software reduces uncertainty before it adds speed.",
    detail: "Orbit makes state, scope, impact, ownership, and recovery visible before an operator commits a change. The interface should answer the next anxious question without demanding a meeting or a terminal archaeology session.",
    icon: Compass,
  },
  {
    title: "Safety belongs in the path",
    summary: "A warning at the end cannot replace a safe workflow from the beginning.",
    detail: "Previews, policies, snapshots, checksums, approvals, and rollback targets are product primitives. We design destructive operations so the safest way is also the shortest and clearest way.",
    icon: ShieldCheck,
  },
  {
    title: "Operators deserve excellent tools",
    summary: "Infrastructure work should not be punished with careless interfaces.",
    detail: "We care about keyboard flow, information density, readable diffs, honest progress, resilient reconnects, and the tiny details that matter during an incident at two in the morning.",
    icon: Wrench,
  },
  {
    title: "Trust grows through evidence",
    summary: "Clear limitations and durable records matter more than broad promises.",
    detail: "We document incidents, distinguish shipped capability from future direction, expose audit evidence, and say when a control depends on customer configuration or independent verification.",
    icon: HeartHandshake,
  },
];

const milestones = [
  ["2023", "A safer SFTP client", "Orbit began as a focused desktop workflow for remote files: host-key verification, atomic saves, useful diffs, and automatic local recovery."],
  ["2024", "The shared workspace", "Teams asked to share connections without sharing credentials. We built roles, vault-backed secrets, activity history, and collaborative file workflows."],
  ["2025", "From files to operations", "Backups, deployments, monitoring, terminals, runbooks, and approvals brought the complete server workflow into one control plane."],
  ["2026", "A global operating layer", "Private workers, enterprise identity, regional data controls, policy as code, and recovery evidence made Orbit ready for larger fleets."],
];

const team = [
  { name: "Mira Chen", role: "Co-founder, Product", initials: "MC", location: "Singapore", focus: "Operator workflows" },
  { name: "Elias Hart", role: "Co-founder, Engineering", initials: "EH", location: "Berlin", focus: "Distributed systems" },
  { name: "Sara Okafor", role: "VP, Customer Engineering", initials: "SO", location: "London", focus: "Infrastructure adoption" },
  { name: "Nico Alvarez", role: "Head of Security", initials: "NA", location: "Toronto", focus: "Product security" },
  { name: "Priya Raman", role: "Design Director", initials: "PR", location: "Bengaluru", focus: "Complex systems" },
  { name: "Jon Bell", role: "Staff Reliability Engineer", initials: "JB", location: "Portland", focus: "Control-plane resilience" },
];

export function AboutPage() {
  const [openPrinciple, setOpenPrinciple] = useState(0);

  return (
    <>
      <section className="marketing-glow overflow-hidden border-b border-white/8 px-4 pb-20 pt-24 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
          <div><p className="text-[9px] font-medium uppercase tracking-[0.15em] text-blue-400">About Orbit</p><h1 className="mt-5 text-balance text-5xl font-semibold tracking-tight sm:text-6xl">We build calm software for high-stakes server work.</h1><p className="mt-6 max-w-2xl text-base leading-7 text-zinc-500">Infrastructure is complicated enough. Orbit gives developers and operators one clear, secure place to connect, understand, change, recover, and collaborate across every server.</p><div className="mt-8 flex flex-wrap gap-2"><Link to="/product"><Button size="lg">Explore the product<ArrowRight /></Button></Link><Link to="/contact"><Button size="lg" variant="outline">Talk with us</Button></Link></div></div>
          <div className="relative min-h-[390px] overflow-hidden rounded-2xl border border-white/10 bg-[#0f1014] p-6"><div className="surface-grid absolute inset-0 opacity-60" /><div className="absolute left-1/2 top-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-400/15" /><div className="absolute left-1/2 top-1/2 size-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-400/20" /><div className="absolute left-1/2 top-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-blue-300/30 bg-blue-400/10 shadow-[0_0_80px_rgba(65,89,210,.3)]"><RadioTower className="size-7 text-blue-200" /></div>{[["top-[14%] left-[18%]", "Berlin"], ["top-[23%] right-[12%]", "Singapore"], ["bottom-[17%] left-[10%]", "Toronto"], ["bottom-[12%] right-[20%]", "Bengaluru"]].map(([position, label]) => <div key={label} className={cn("absolute", position)}><span className="block size-2 rounded-full bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,.7)]" /><span className="mt-2 block text-[8px] text-zinc-600">{label}</span></div>)}<div className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-lg border border-white/8 bg-black/30 px-4 py-3 backdrop-blur"><span className="flex items-center gap-2 text-[9px] text-zinc-400"><Globe2 className="size-3.5 text-blue-300" />One team, across nine time zones</span><span className="font-mono text-[8px] text-emerald-300">REMOTE / CONNECTED</span></div></div>
        </div>
      </section>

      <section className="border-b border-white/8 bg-[#0c0d10] px-4 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-7xl grid-cols-2 lg:grid-cols-4">{[["38", "people on the team"], ["19", "countries represented"], ["14k+", "servers managed"], ["99.994%", "90-day platform uptime"]].map(([value, label], index) => <div key={label} className={cn("px-3 py-8 text-center", index % 2 === 0 && "border-r border-white/8", index < 2 && "border-b border-white/8 lg:border-b-0", index !== 3 && "lg:border-r lg:border-white/8")}><strong className="font-mono text-2xl sm:text-3xl">{value}</strong><p className="mt-2 text-[8px] text-zinc-600">{label}</p></div>)}</div></section>

      <section className="px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-7xl gap-16 lg:grid-cols-[.85fr_1.15fr]"><SectionHeading eyebrow="Why we are here" title="The last mile of infrastructure deserves a first-class workspace." description="Cloud consoles made resources easier to provision. Code platforms made software easier to review. But the daily work on real servers is still scattered across terminals, saved passwords, local folders, scripts, chat messages, and hope." /><div className="space-y-4 text-sm leading-7 text-zinc-500"><p>We have been the developer carefully editing a production config over SFTP. The operator reconstructing who changed a file. The teammate searching for the one laptop with the current connection profile. The person discovering, too late, that a backup had never been tested.</p><p>Orbit exists to make that work legible and reversible. It brings connection state, remote files, deployments, backups, terminals, automation, monitoring, permissions, and audit evidence into one shared model.</p><p className="text-zinc-300">Our ambition is simple: when someone must touch a server, Orbit should help them understand the impact, make the change safely, and know exactly how to recover.</p></div></div></section>

      <section className="border-y border-white/8 bg-[#0c0d10] px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><SectionHeading eyebrow="How we build" title="Principles that survive contact with production." description="These are product decisions, operating habits, and standards we use when the easy answer competes with the durable one." /><div className="mt-12 grid gap-3 lg:grid-cols-2">{principles.map((principle, index) => { const Icon = principle.icon; const open = openPrinciple === index; return <article key={principle.title} className={cn("overflow-hidden rounded-xl border bg-[#111216]", open ? "border-blue-400/20" : "border-white/10")}><button type="button" onClick={() => setOpenPrinciple(open ? -1 : index)} className="flex w-full items-start gap-4 p-5 text-left"><span className={cn("grid size-9 shrink-0 place-items-center rounded-lg border", open ? "border-blue-400/20 bg-blue-400/[0.06] text-blue-300" : "border-white/8 text-zinc-600")}><Icon className="size-4" /></span><span className="min-w-0 flex-1"><h3 className="text-base font-semibold">{principle.title}</h3><span className="mt-1.5 block text-[9px] leading-4 text-zinc-600">{principle.summary}</span></span><ChevronDown className={cn("mt-1 size-4 text-zinc-700 transition", open && "rotate-180 text-zinc-300")} /></button>{open && <p className="border-t border-white/8 px-5 py-5 text-[10px] leading-5 text-zinc-500">{principle.detail}</p>}</article>; })}</div></div></section>

      <section className="px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><SectionHeading align="center" eyebrow="Our path" title="From one careful file save to an operating system for servers." description="Each chapter came from the same customer request: make the work safer without making the operator slower." /><div className="relative mx-auto mt-14 max-w-4xl"><div className="absolute bottom-0 left-[19px] top-0 w-px bg-white/10 sm:left-1/2" />{milestones.map(([year, title, copy], index) => <article key={year} className={cn("relative mb-8 grid gap-6 pl-14 sm:grid-cols-2 sm:pl-0", index % 2 === 0 ? "sm:text-right" : "sm:[&>div:first-child]:col-start-2")}><span className="absolute left-2 top-1 grid size-6 place-items-center rounded-full border border-blue-400/25 bg-[#111216] font-mono text-[7px] text-blue-300 sm:left-1/2 sm:-translate-x-1/2">{year.slice(2)}</span><div className={cn("rounded-xl border border-white/10 bg-[#111216] p-5", index % 2 === 1 && "sm:col-start-2")}><span className="font-mono text-[8px] text-blue-400">{year}</span><h3 className="mt-2 text-lg font-semibold">{title}</h3><p className="mt-2 text-[9px] leading-5 text-zinc-600">{copy}</p></div></article>)}</div></div></section>

      <section className="border-y border-white/8 bg-[#0c0d10] px-4 py-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><SectionHeading eyebrow="The team" title="Infrastructure people, product people, and careful generalists." description="Orbit is an independent, remote-first company. We hire where the work is, not where an office happens to be." /><Link to="/contact?topic=careers" className="inline-flex items-center gap-2 text-[9px] text-zinc-400 hover:text-white">Ask about open roles<ArrowRight className="size-3" /></Link></div><div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{team.map((person) => <article key={person.name} className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#111216] p-4"><span className="grid size-11 shrink-0 place-items-center rounded-full border border-white/10 bg-gradient-to-br from-blue-500/15 to-violet-500/10 font-mono text-[10px] text-zinc-300">{person.initials}</span><div className="min-w-0"><h3 className="text-sm font-semibold">{person.name}</h3><p className="mt-1 text-[8px] text-zinc-500">{person.role}</p><p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[8px] text-zinc-700"><span className="flex items-center gap-1"><MapPin className="size-2.5" />{person.location}</span><span className="flex items-center gap-1"><Code2 className="size-2.5" />{person.focus}</span></p></div></article>)}</div></div></section>

      <section className="px-4 py-20 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-6xl gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-3">{[[Users, "Customer-shaped", "Engineers speak with customers every week and support rotates through the whole company."], [Network, "Remote by design", "Written decisions, clear ownership, and thoughtful overlap make the team work across time zones."], [Sparkles, "Craft with restraint", "We prefer fewer, coherent systems over a catalogue of disconnected features."]].map(([Icon, title, copy]) => <div key={String(title)} className="bg-[#111216] p-6"><Icon className="size-4 text-blue-300" /><h3 className="mt-6 text-base font-semibold">{String(title)}</h3><p className="mt-2 text-[9px] leading-5 text-zinc-600">{String(copy)}</p></div>)}</div></section>
      <MarketingCTA title="Help us make server work feel a little more human." description="Start with two servers free, or talk with the team about the infrastructure problem you wish someone would solve properly." />
    </>
  );
}

export default AboutPage;

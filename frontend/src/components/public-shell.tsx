import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Building2,
  ChevronDown,
  Code2,
  FileClock,
  FolderTree,
  Github,
  LifeBuoy,
  Menu,
  RadioTower,
  Rocket,
  Server,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const productLinks = [
  { to: "/product", label: "Server workspace", detail: "Every server in one calm control plane", icon: Server },
  { to: "/features#files", label: "Remote files", detail: "Edit, diff and ship without context switching", icon: FolderTree },
  { to: "/features#backups", label: "Backups & rollback", detail: "Safe snapshots before every change", icon: FileClock },
  { to: "/features#automation", label: "Automations", detail: "Turn runbooks into reliable workflows", icon: Workflow },
];

const resourceLinks = [
  { to: "/docs", label: "Documentation", icon: BookOpen },
  { to: "/api", label: "API reference", icon: Code2 },
  { to: "/changelog", label: "Changelog", icon: Sparkles },
  { to: "/status", label: "System status", icon: RadioTower },
  { to: "/contact", label: "Support", icon: LifeBuoy },
];

export function PublicShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menu, setMenu] = useState<"product" | "resources" | null>(null);
  const location = useLocation();
  useEffect(() => { setMobileOpen(false); setMenu(null); window.scrollTo({ top: 0, behavior: "instant" }); }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#08090b] text-zinc-100">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/8 bg-[#08090b]/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-7 px-4 sm:px-6 lg:px-8">
          <Brand />
          <nav className="hidden h-full items-center gap-1 md:flex" aria-label="Main navigation">
            <div className="relative h-full">
              <button type="button" onClick={() => setMenu(menu === "product" ? null : "product")} className={cn("flex h-full items-center gap-1 px-3 text-xs text-zinc-400 transition hover:text-white", menu === "product" && "text-white")}>Product<ChevronDown className={cn("size-3 transition-transform", menu === "product" && "rotate-180")} /></button>
              {menu === "product" && (
                <div className="absolute left-0 top-[calc(100%+1px)] w-[480px] rounded-b-xl border border-t-0 border-white/10 bg-[#111216] p-3 shadow-2xl shadow-black/60">
                  <div className="grid grid-cols-2 gap-1">
                    {productLinks.map((item) => <Link key={item.label} to={item.to} className="group flex gap-3 rounded-lg p-3 hover:bg-white/5"><span className="grid size-8 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.035] text-zinc-400 group-hover:text-white"><item.icon className="size-3.5" /></span><span><strong className="block text-[11px] font-medium text-zinc-200">{item.label}</strong><span className="mt-1 block text-[9px] leading-4 text-zinc-500">{item.detail}</span></span></Link>)}
                  </div>
                  <Link to="/features" className="mt-2 flex items-center justify-between border-t border-white/8 px-3 pt-3 text-[10px] text-zinc-400 hover:text-white"><span>Explore all platform capabilities</span><ArrowRight className="size-3.5" /></Link>
                </div>
              )}
            </div>
            <NavLink to="/pricing" className={({ isActive }) => cn("flex h-full items-center px-3 text-xs text-zinc-400 transition hover:text-white", isActive && "text-white")}>Pricing</NavLink>
            <NavLink to="/enterprise" className={({ isActive }) => cn("flex h-full items-center px-3 text-xs text-zinc-400 transition hover:text-white", isActive && "text-white")}>Enterprise</NavLink>
            <NavLink to="/security" className={({ isActive }) => cn("flex h-full items-center px-3 text-xs text-zinc-400 transition hover:text-white", isActive && "text-white")}>Security</NavLink>
            <div className="relative h-full">
              <button type="button" onClick={() => setMenu(menu === "resources" ? null : "resources")} className={cn("flex h-full items-center gap-1 px-3 text-xs text-zinc-400 transition hover:text-white", menu === "resources" && "text-white")}>Resources<ChevronDown className={cn("size-3 transition-transform", menu === "resources" && "rotate-180")} /></button>
              {menu === "resources" && (
                <div className="absolute left-0 top-[calc(100%+1px)] w-64 rounded-b-xl border border-t-0 border-white/10 bg-[#111216] p-2 shadow-2xl shadow-black/60">
                  {resourceLinks.map((item) => <Link key={item.label} to={item.to} className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[10px] text-zinc-400 hover:bg-white/5 hover:text-white"><item.icon className="size-3.5" />{item.label}</Link>)}
                </div>
              )}
            </div>
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Link to="/sign-in" className="px-3 text-xs text-zinc-400 hover:text-white">Sign in</Link>
            <Link to="/register"><Button size="sm">Start free<ArrowRight /></Button></Link>
          </div>
          <button type="button" onClick={() => setMobileOpen((value) => !value)} className="ml-auto grid size-9 place-items-center rounded-md text-zinc-400 hover:bg-white/5 md:hidden" aria-label={mobileOpen ? "Close menu" : "Open menu"}>{mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}</button>
        </div>
        {mobileOpen && (
          <div className="border-t border-white/8 bg-[#0d0e11] px-4 py-4 md:hidden">
            <nav className="space-y-1">
              {[{ to: "/product", label: "Product", icon: Server }, { to: "/features", label: "Features", icon: Sparkles }, { to: "/pricing", label: "Pricing", icon: Rocket }, { to: "/enterprise", label: "Enterprise", icon: Building2 }, { to: "/security", label: "Security", icon: ShieldCheck }, { to: "/integrations", label: "Integrations", icon: Workflow }, { to: "/docs", label: "Documentation", icon: BookOpen }].map((item) => <Link key={item.to} to={item.to} className="flex h-10 items-center gap-3 rounded-md px-3 text-xs text-zinc-400 hover:bg-white/5 hover:text-white"><item.icon className="size-4" />{item.label}</Link>)}
            </nav>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/8 pt-4"><Link to="/sign-in"><Button variant="outline" className="w-full">Sign in</Button></Link><Link to="/register"><Button className="w-full">Start free</Button></Link></div>
          </div>
        )}
      </header>
      {menu && <button type="button" aria-label="Close menu" onClick={() => setMenu(null)} className="fixed inset-0 z-40 hidden bg-transparent md:block" />}
      <main className="pt-16"><Outlet /></main>
      <footer className="border-t border-white/8 bg-[#090a0c]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(4,1fr)]">
            <div><Brand /><p className="mt-4 max-w-xs text-[11px] leading-5 text-zinc-500">One secure, beautifully organized workspace for every server, file, deployment, backup, and operator.</p><div className="mt-5 flex items-center gap-2"><a href="https://github.com" aria-label="GitHub" className="grid size-8 place-items-center rounded-md border border-white/10 text-zinc-500 hover:text-white"><Github className="size-3.5" /></a><span className="flex items-center gap-2 rounded-md border border-emerald-400/15 bg-emerald-400/5 px-2.5 py-1.5 text-[9px] text-emerald-300"><span className="size-1.5 rounded-full bg-emerald-400" />All systems operational</span></div></div>
            {[
              { title: "Product", links: [["Overview", "/product"], ["Features", "/features"], ["Integrations", "/integrations"], ["Pricing", "/pricing"], ["Roadmap", "/roadmap"]] },
              { title: "Solutions", links: [["Developers", "/product"], ["Agencies", "/customers"], ["Enterprise", "/enterprise"], ["Security", "/security"], ["API", "/api"]] },
              { title: "Resources", links: [["Documentation", "/docs"], ["Changelog", "/changelog"], ["System status", "/status"], ["Support", "/contact"], ["About", "/about"]] },
              { title: "Legal", links: [["Privacy", "/privacy"], ["Terms", "/terms"], ["Acceptable use", "/acceptable-use"], ["DPA", "/security"], ["Contact", "/contact"]] },
            ].map((column) => <div key={column.title}><p className="mb-3 text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-300">{column.title}</p><ul className="space-y-2.5">{column.links.map(([label, to]) => <li key={label}><Link to={to} className="text-[10px] text-zinc-600 hover:text-zinc-300">{label}</Link></li>)}</ul></div>)}
          </div>
          <div className="mt-12 flex flex-col gap-3 border-t border-white/8 pt-6 text-[9px] text-zinc-700 sm:flex-row sm:items-center sm:justify-between"><span>© 2026 Orbit Systems, Inc. All rights reserved.</span><span>Built for the people who keep the internet running.</span></div>
        </div>
      </footer>
    </div>
  );
}

import { type ComponentType, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArchiveRestore,
  Bell,
  Blocks,
  Bot,
  ChevronDown,
  CircleHelp,
  CloudUpload,
  Code2,
  CreditCard,
  Gauge,
  KeyRound,
  ListChecks,
  LogOut,
  Menu,
  MoonStar,
  ReceiptText,
  Rocket,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Terminal,
  User,
  Users,
  X,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Brand } from "@/components/brand";
import { CommandPalette } from "@/components/command-palette";
import { Avatar, Badge, IconButton, Kbd } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: string;
}

const navigation: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Workspace",
    items: [
      { label: "Overview", to: "/workspace", icon: Gauge },
      { label: "Servers", to: "/workspace/servers", icon: Server },
      { label: "Transfers", to: "/workspace/transfers", icon: CloudUpload, badge: "2" },
    ],
  },
  {
    group: "Operate",
    items: [
      { label: "Deployments", to: "/workspace/deployments", icon: Rocket },
      { label: "Backups & restore", to: "/workspace/backups", icon: ArchiveRestore },
      { label: "Terminal", to: "/workspace/terminal", icon: Terminal },
      { label: "Runbooks", to: "/workspace/runbooks", icon: ListChecks },
      { label: "Automations", to: "/workspace/automations", icon: Bot },
    ],
  },
  {
    group: "Observe",
    items: [
      { label: "Monitoring", to: "/workspace/monitoring", icon: Activity, badge: "1" },
      { label: "Activity & audit", to: "/workspace/activity", icon: ShieldCheck },
      { label: "Notifications", to: "/workspace/notifications", icon: Bell, badge: "3" },
    ],
  },
  {
    group: "Manage",
    items: [
      { label: "Team", to: "/workspace/team", icon: Users },
      { label: "Integrations", to: "/workspace/integrations", icon: Blocks },
      { label: "API keys", to: "/workspace/api-keys", icon: KeyRound },
      { label: "Usage", to: "/workspace/usage", icon: ReceiptText },
      { label: "Plan & billing", to: "/workspace/billing", icon: CreditCard },
      { label: "Settings", to: "/workspace/settings/workspace", icon: Settings },
    ],
  },
];

export function WorkspaceShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const activeServer = useMemo(() => location.pathname.includes("/servers/"), [location.pathname]);

  const sidebar = (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-sidebar p-3">
      <header className="px-2 pb-4">
        <Brand to="/workspace" />
      </header>
      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="mb-3 flex h-8 items-center gap-2 rounded-md border border-border bg-black/10 px-2.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Search className="size-3.5" /><span className="min-w-0 flex-1 text-left">Search or jump to</span><Kbd>⌘K</Kbd>
      </button>
      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" aria-label="Workspace navigation">
        {navigation.map((section) => (
          <div key={section.group}>
            <p className="mb-1 px-2.5 text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{section.group}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isServers = item.to === "/workspace/servers";
                return (
                  <NavLink
                    key={item.to}
                    end={item.to === "/workspace" || isServers}
                    to={item.to}
                    className={({ isActive }) => cn(
                      "flex h-8 items-center gap-2 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      (isActive || (isServers && activeServer)) && "bg-muted text-foreground",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" strokeWidth={1.8} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge && <span className="grid min-w-4 place-items-center rounded-full bg-white/10 px-1 text-[8px] text-zinc-400">{item.badge}</span>}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <footer className="relative mt-3 border-t border-border pt-3">
        <button type="button" onClick={() => setAccountOpen((value) => !value)} className="flex w-full items-center gap-2 rounded-md p-1 text-left hover:bg-muted">
          <Avatar name={user?.name ?? "Orbit User"} className="size-7" />
          <span className="min-w-0 flex-1"><strong className="block truncate text-[10px] font-medium">{user?.name ?? "Orbit user"}</strong><span className="block truncate text-[9px] capitalize text-muted-foreground">{user?.role ?? "owner"} · {user?.plan ?? "Pro"}</span></span>
          <ChevronDown className={cn("size-3.5 text-zinc-600 transition-transform", accountOpen && "rotate-180")} />
        </button>
        {accountOpen && (
          <div className="absolute bottom-11 left-0 z-30 w-full overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-2xl shadow-black/50">
            <Link to="/workspace/settings/profile" className="flex h-8 items-center gap-2 rounded-md px-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"><User className="size-3.5" />Profile</Link>
            <Link to="/workspace/settings/security" className="flex h-8 items-center gap-2 rounded-md px-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"><ShieldCheck className="size-3.5" />Security</Link>
            <Link to="/docs" className="flex h-8 items-center gap-2 rounded-md px-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"><CircleHelp className="size-3.5" />Help & docs</Link>
            <button type="button" onClick={() => void signOut().then(() => navigate("/"))} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut className="size-3.5" />Sign out</button>
          </div>
        )}
      </footer>
    </aside>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-sidebar px-4 md:hidden">
        <Brand to="/workspace" />
        <div className="flex items-center gap-1">
          <IconButton label="Search" onClick={() => setCommandOpen(true)}><Search /></IconButton>
          <IconButton label={mobileOpen ? "Close navigation" : "Open navigation"} onClick={() => setMobileOpen((value) => !value)}>{mobileOpen ? <X /> : <Menu />}</IconButton>
        </div>
      </header>
      <div className="fixed inset-y-0 left-0 z-40 hidden md:block">{sidebar}</div>
      {mobileOpen && <button type="button" className="fixed inset-x-0 bottom-0 top-14 z-30 bg-black/65 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />}
      <div className={cn("fixed bottom-0 left-0 top-14 z-40 transition-transform md:hidden", mobileOpen ? "translate-x-0" : "-translate-x-full")}>{sidebar}</div>
      <main className="min-h-screen pt-14 md:pl-56 md:pt-0"><Outlet /></main>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
      <button type="button" title="Midnight theme active" aria-label="Midnight theme active" className="fixed bottom-4 right-4 z-20 hidden size-8 place-items-center rounded-full border border-border bg-card text-zinc-600 shadow-lg lg:grid"><MoonStar className="size-3.5" /></button>
    </div>
  );
}

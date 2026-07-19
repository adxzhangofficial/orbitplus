import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  Building2,
  ChevronDown,
  CircleDollarSign,
  CloudCog,
  DatabaseBackup,
  FileClock,
  Flag,
  Gauge,
  Headphones,
  LifeBuoy,
  LogOut,
  Menu,
  Megaphone,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ServerCog,
  Settings2,
  ShieldAlert,
  TerminalSquare,
  Users,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { cn, initials } from "@/lib/utils";
import "./admin.css";

export interface AdminNavItem {
  label: string;
  path: string;
  icon: typeof Gauge;
  badge?: string;
}

export const adminNavigation: Array<{ label: string; items: AdminNavItem[] }> = [
  {
    label: "Control",
    items: [
      { label: "Overview", path: "/admin", icon: Gauge },
      { label: "Organizations", path: "/admin/organizations", icon: Building2 },
      { label: "Users & access", path: "/admin/users", icon: Users },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { label: "Server fleet", path: "/admin/servers", icon: Network, badge: "5" },
      { label: "Jobs & queues", path: "/admin/jobs", icon: Zap, badge: "18" },
      { label: "Backups & storage", path: "/admin/backups", icon: DatabaseBackup },
    ],
  },
  {
    label: "Commercial",
    items: [
      { label: "Plans & billing", path: "/admin/plans", icon: WalletCards },
      { label: "Usage & revenue", path: "/admin/revenue", icon: CircleDollarSign },
    ],
  },
  {
    label: "Trust & operations",
    items: [
      { label: "Security incidents", path: "/admin/security", icon: ShieldAlert, badge: "2" },
      { label: "Audit log", path: "/admin/audit", icon: FileClock },
      { label: "Support desk", path: "/admin/support", icon: Headphones, badge: "7" },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Feature flags", path: "/admin/features", icon: Flag },
      { label: "Announcements", path: "/admin/announcements", icon: Megaphone },
      { label: "System settings", path: "/admin/system", icon: Settings2 },
    ],
  },
];

const commandItems = adminNavigation.flatMap((group) => group.items);

function OrbitAdminMark() {
  return (
    <span className="adm-logo-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function AdminShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [environment, setEnvironment] = useState("Production");

  const current = useMemo(
    () => commandItems.find((item) => item.path === location.pathname) ?? commandItems[0],
    [location.pathname],
  );
  const currentGroup = adminNavigation.find((group) => group.items.some((item) => item.path === current.path));
  const filteredCommands = commandItems.filter((item) => item.label.toLowerCase().includes(commandQuery.toLowerCase()));

  useEffect(() => {
    setMobileOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setNotificationsOpen(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  function go(path: string) {
    navigate(path);
    setCommandOpen(false);
    setCommandQuery("");
  }

  return (
    <div className={cn("admin-app", collapsed && "adm-is-collapsed")}>
      <header className="adm-mobile-header">
        <button className="adm-icon-button" type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
          <Menu />
        </button>
        <NavLink to="/admin" className="adm-brand adm-brand-mobile">
          <OrbitAdminMark />
          <span><b>ORBIT</b><small>CONTROL PLANE</small></span>
        </NavLink>
        <button className="adm-icon-button" type="button" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Notifications">
          <Bell /><i className="adm-notification-dot" />
        </button>
      </header>

      {mobileOpen && <button className="adm-scrim" type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}

      <aside className={cn("adm-sidebar", mobileOpen && "adm-sidebar-open")}>
        <div className="adm-sidebar-head">
          <NavLink to="/admin" className="adm-brand">
            <OrbitAdminMark />
            <span className="adm-brand-copy"><b>ORBIT</b><small>CONTROL PLANE</small></span>
          </NavLink>
          <button className="adm-icon-button adm-close-mobile" type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X /></button>
        </div>

        <div className="adm-platform-state">
          <span className="adm-status-live" />
          <span className="adm-collapse-copy"><b>Platform operational</b><small>14 services healthy</small></span>
          <Activity className="adm-platform-wave" />
        </div>

        <nav className="adm-nav" aria-label="Platform administration">
          {adminNavigation.map((group) => (
            <div className="adm-nav-group" key={group.label}>
              <p className="adm-collapse-copy">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    end={item.path === "/admin"}
                    key={item.path}
                    to={item.path}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) => cn("adm-nav-link", isActive && "active")}
                  >
                    <Icon />
                    <span className="adm-collapse-copy">{item.label}</span>
                    {item.badge && <em className="adm-nav-badge adm-collapse-copy">{item.badge}</em>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="adm-sidebar-foot">
          <button className="adm-sidebar-action" type="button" onClick={() => toast.success("Secure shell diagnostic opened") }>
            <TerminalSquare /><span className="adm-collapse-copy">Diagnostics</span>
          </button>
          <div className="adm-admin-card">
            <span className="adm-avatar">{initials(user?.name ?? "Orbit Admin")}</span>
            <span className="adm-admin-copy adm-collapse-copy"><b>{user?.name ?? "Orbit Admin"}</b><small>Platform administrator</small></span>
            <button className="adm-icon-button adm-collapse-copy" type="button" onClick={() => void signOut().then(() => navigate("/sign-in", { replace: true }))} aria-label="Sign out"><LogOut /></button>
          </div>
        </div>
      </aside>

      <main className="adm-main">
        <header className="adm-topbar">
          <div className="adm-topbar-title">
            <button className="adm-icon-button adm-collapse-button" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </button>
            <div>
              <p>ADMIN / {currentGroup?.label.toUpperCase()}</p>
              <h1>{current.label}</h1>
            </div>
          </div>
          <div className="adm-topbar-actions">
            <label className="adm-environment-select">
              <span className={cn("adm-env-dot", environment === "Production" ? "live" : environment === "Staging" ? "warn" : "dev")} />
              <select value={environment} onChange={(event) => { setEnvironment(event.target.value); toast.message(`Control-plane scope changed to ${event.target.value}`); }} aria-label="Environment">
                <option>Production</option>
                <option>Staging</option>
                <option>Development</option>
              </select>
              <ChevronDown />
            </label>
            <button className="adm-command-trigger" type="button" onClick={() => setCommandOpen(true)}>
              <Search /><span>Search controls</span><kbd>⌘ K</kbd>
            </button>
            <button className="adm-icon-button adm-bell" type="button" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Notifications">
              <Bell /><i className="adm-notification-dot" />
            </button>
          </div>
        </header>

        {notificationsOpen && (
          <div className="adm-notification-panel">
            <div className="adm-popover-head"><div><b>Operations inbox</b><small>3 unread signals</small></div><button className="adm-text-button" type="button" onClick={() => { setNotificationsOpen(false); toast.success("All signals marked as read"); }}>Mark all read</button></div>
            {[
              ["Critical", "Storage latency exceeded threshold", "Backup worker · 4m"],
              ["Warning", "Polaris Commerce payment failed", "Billing · 18m"],
              ["Info", "Fleet certificate rotation completed", "Security · 1h"],
            ].map(([tone, title, meta]) => <button className="adm-signal" type="button" key={title} onClick={() => toast.message(title)}><i data-tone={tone.toLowerCase()} /><span><b>{title}</b><small>{meta}</small></span></button>)}
            <button className="adm-popover-footer" type="button" onClick={() => go("/admin/security")}>Open operations center</button>
          </div>
        )}

        <div className="adm-page"><Outlet /></div>
      </main>

      {commandOpen && (
        <div className="adm-command-layer" role="dialog" aria-modal="true" aria-label="Command palette">
          <button className="adm-command-backdrop" type="button" onClick={() => setCommandOpen(false)} aria-label="Close command palette" />
          <div className="adm-command-box">
            <label><Search /><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Navigate to a control or search the platform…" /><kbd>ESC</kbd></label>
            <p>GO TO</p>
            <div className="adm-command-results">
              {filteredCommands.map((item) => { const Icon = item.icon; return <button type="button" key={item.path} onClick={() => go(item.path)}><Icon /><span>{item.label}</span><small>{adminNavigation.find((group) => group.items.includes(item))?.label}</small></button>; })}
              {!filteredCommands.length && <div className="adm-command-empty">No control-plane destinations match “{commandQuery}”.</div>}
            </div>
            <footer><span><kbd>↑↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span>ORBIT ADMIN <CloudCog /></span></footer>
          </div>
        </div>
      )}

      <Toaster theme="dark" position="bottom-right" toastOptions={{ className: "adm-toast" }} />
    </div>
  );
}

export default AdminShell;

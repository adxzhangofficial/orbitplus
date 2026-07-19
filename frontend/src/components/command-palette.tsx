import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArchiveRestore,
  Bell,
  Bot,
  CloudUpload,
  Code2,
  Command,
  CreditCard,
  FolderTree,
  Gauge,
  KeyRound,
  Rocket,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Terminal,
  Users,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui";

const actions = [
  { label: "Workspace overview", detail: "Go to dashboard", to: "/workspace", icon: Gauge, group: "Navigate" },
  { label: "Servers", detail: "Manage every connection", to: "/workspace/servers", icon: Server, group: "Navigate" },
  { label: "Remote files", detail: "Production API", to: "/workspace/servers/srv_prod_01/files", icon: FolderTree, group: "Navigate" },
  { label: "Open terminal", detail: "Start a secure SSH session", to: "/workspace/terminal", icon: Terminal, group: "Operate" },
  { label: "New transfer", detail: "Upload or download files", to: "/workspace/transfers", icon: CloudUpload, group: "Operate" },
  { label: "Create backup", detail: "Encrypted server snapshot", to: "/workspace/backups", icon: ArchiveRestore, group: "Operate" },
  { label: "Deploy release", detail: "Promote changed files", to: "/workspace/deployments", icon: Rocket, group: "Operate" },
  { label: "New automation", detail: "Schedule a server workflow", to: "/workspace/automations", icon: Bot, group: "Operate" },
  { label: "Monitoring", detail: "Metrics, alerts and uptime", to: "/workspace/monitoring", icon: Activity, group: "Observe" },
  { label: "Notifications", detail: "Review workspace updates", to: "/workspace/notifications", icon: Bell, group: "Observe" },
  { label: "Team members", detail: "Roles and invitations", to: "/workspace/team", icon: Users, group: "Manage" },
  { label: "API keys", detail: "Developer access", to: "/workspace/api-keys", icon: KeyRound, group: "Manage" },
  { label: "Integrations", detail: "GitHub, Slack, S3 and more", to: "/workspace/integrations", icon: Code2, group: "Manage" },
  { label: "Security settings", detail: "Sessions, MFA and policies", to: "/workspace/settings/security", icon: ShieldCheck, group: "Manage" },
  { label: "Plan and billing", detail: "Subscription and invoices", to: "/workspace/billing", icon: CreditCard, group: "Manage" },
  { label: "Workspace settings", detail: "Defaults and retention", to: "/workspace/settings/workspace", icon: Settings, group: "Manage" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return actions;
    return actions.filter((item) => `${item.label} ${item.detail} ${item.group}`.toLowerCase().includes(normalized));
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
    }
  }, [open]);

  useEffect(() => setSelected(0), [query]);

  function choose(index: number) {
    const item = filtered[index];
    if (!item) return;
    onClose();
    void navigate(item.to);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command menu">
      <button type="button" aria-label="Close command menu" onClick={onClose} className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className="relative h-fit max-h-[70vh] w-full max-w-xl overflow-hidden rounded-xl border border-white/15 bg-[#151517] shadow-2xl shadow-black/70">
        <div className="flex h-12 items-center gap-3 border-b border-border px-4">
          <Search className="size-4 text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setSelected((value) => Math.min(filtered.length - 1, value + 1)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setSelected((value) => Math.max(0, value - 1)); }
              if (event.key === "Enter") { event.preventDefault(); choose(selected); }
              if (event.key === "Escape") onClose();
            }}
            placeholder="Search pages and actions…"
            className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-zinc-600"
          />
          <button type="button" onClick={onClose} className="text-zinc-600 hover:text-zinc-300"><X className="size-4" /></button>
        </div>
        <div className="max-h-[calc(70vh-76px)] overflow-y-auto p-2">
          {filtered.length ? filtered.map((item, index) => {
            const Icon = item.icon;
            const showGroup = index === 0 || filtered[index - 1]?.group !== item.group;
            return (
              <div key={item.to}>
                {showGroup && <p className="px-2.5 pb-1 pt-3 text-[8px] font-medium uppercase tracking-[0.12em] text-zinc-600 first:pt-1">{item.group}</p>}
                <button
                  type="button"
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => choose(index)}
                  className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left", selected === index ? "bg-zinc-800 text-white" : "text-zinc-400")}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-black/20"><Icon className="size-3.5" /></span>
                  <span className="min-w-0 flex-1"><strong className="block truncate text-[10px] font-medium text-zinc-200">{item.label}</strong><span className="block truncate text-[9px] text-zinc-600">{item.detail}</span></span>
                  <span className="text-[8px] text-zinc-700">{item.group}</span>
                </button>
              </div>
            );
          }) : <div className="grid min-h-40 place-items-center text-center"><div><Command className="mx-auto size-5 text-zinc-700" /><p className="mt-3 text-xs text-zinc-400">No matching command</p><p className="mt-1 text-[9px] text-zinc-600">Try searching for a server, file, or setting.</p></div></div>}
        </div>
        <footer className="flex h-7 items-center gap-3 border-t border-border px-3 text-[8px] text-zinc-600"><span><Kbd>↑↓</Kbd> navigate</span><span><Kbd>↵</Kbd> open</span><span><Kbd>esc</Kbd> close</span></footer>
      </div>
    </div>
  );
}

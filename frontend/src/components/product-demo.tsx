import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  Blocks,
  Bot,
  ChevronRight,
  CircleCheck,
  CircleDollarSign,
  CloudUpload,
  Copy,
  Cpu,
  Database,
  File,
  FileCode2,
  Folder,
  Gauge,
  KeyRound,
  ListChecks,
  MoreHorizontal,
  RefreshCw,
  Rocket,
  Server as ServerIcon,
  ShieldCheck,
  Star,
  Terminal,
  Unplug,
  Users,
  Zap,
} from "lucide-react";
import { Badge, Progress, StatusBadge } from "@/components/ui";
import { SECTIONS } from "@/components/product-demo-sections";
import { cn } from "@/lib/utils";

/**
 * The workspace, as a visitor can try it before signing up.
 *
 * Every sidebar entry goes somewhere and every section mirrors the real page it
 * represents — the same header, the same stat tiles, the same table columns —
 * so what someone clicks through here is what they get afterwards. It runs on
 * fixed sample data: no account, no API, nothing to configure.
 *
 * Disconnecting shows dashes rather than zeros, exactly as the product does,
 * because "not measured" and "measured at zero" are different facts and the
 * preview should not teach the opposite.
 */

/* -------------------------------------------------------------------------
 * Sample data
 * ---------------------------------------------------------------------- */

interface DemoFile {
  name: string;
  type: "directory" | "file";
  size: string;
  permissions: string;
  owner: string;
  modified: string;
  changed?: boolean;
  children?: DemoFile[];
}

interface DemoServer {
  name: string;
  host: string;
  username: string;
  port: number;
  rootPath: string;
  region: string;
  status: "online" | "degraded";
  cpu: number;
  memory: number;
  disk: number;
  latency: number;
  transfers: number;
  files: DemoFile[];
  deployments: Array<{ version: string; branch: string; author: string; status: string; when: string }>;
  activity: Array<{ actor: string; action: string; target: string; when: string }>;
}

const SERVERS: DemoServer[] = [
  {
    name: "Production API",
    host: "api-01.acme.internal",
    username: "deploy",
    port: 22,
    rootPath: "/var/www/api",
    region: "Virginia",
    status: "online",
    cpu: 38,
    memory: 64,
    disk: 47,
    latency: 31,
    transfers: 128,
    files: [
      {
        name: "src", type: "directory", size: "8 items", permissions: "drwxr-xr-x", owner: "deploy", modified: "6 minutes ago", changed: true,
        children: [
          { name: "routes", type: "directory", size: "12 items", permissions: "drwxr-xr-x", owner: "deploy", modified: "6 minutes ago" },
          { name: "server.ts", type: "file", size: "6.8 KB", permissions: "-rw-r--r--", owner: "deploy", modified: "6 minutes ago", changed: true },
          { name: "config.ts", type: "file", size: "1.4 KB", permissions: "-rw-r--r--", owner: "deploy", modified: "2 hours ago" },
          { name: "db.ts", type: "file", size: "3.2 KB", permissions: "-rw-r--r--", owner: "deploy", modified: "yesterday" },
        ],
      },
      {
        name: "public", type: "directory", size: "24 items", permissions: "drwxr-xr-x", owner: "deploy", modified: "3 days ago",
        children: [
          { name: "assets", type: "directory", size: "18 items", permissions: "drwxr-xr-x", owner: "deploy", modified: "3 days ago" },
          { name: "index.html", type: "file", size: "2.1 KB", permissions: "-rw-r--r--", owner: "deploy", modified: "3 days ago" },
        ],
      },
      { name: "docker-compose.yml", type: "file", size: "3.1 KB", permissions: "-rw-r--r--", owner: "deploy", modified: "6 minutes ago", changed: true },
      { name: "package.json", type: "file", size: "2.2 KB", permissions: "-rw-r--r--", owner: "deploy", modified: "2 days ago" },
      { name: "server.ts", type: "file", size: "6.8 KB", permissions: "-rw-r--r--", owner: "deploy", modified: "6 minutes ago", changed: true },
      { name: "README.md", type: "file", size: "9.4 KB", permissions: "-rw-r--r--", owner: "deploy", modified: "last week" },
    ],
    deployments: [
      { version: "release-2026.07.19", branch: "main", author: "Maya Chen", status: "succeeded", when: "6 minutes ago" },
      { version: "release-2026.07.18", branch: "main", author: "Jon Bell", status: "succeeded", when: "yesterday" },
      { version: "release-2026.07.17", branch: "hotfix/rate-limit", author: "Maya Chen", status: "rolled_back", when: "2 days ago" },
    ],
    activity: [
      { actor: "Maya Chen", action: "file.write", target: "/var/www/api/server.ts", when: "6 minutes ago" },
      { actor: "Deploy bot", action: "deployment.succeeded", target: "release-2026.07.19", when: "6 minutes ago" },
      { actor: "Jon Bell", action: "file.delete", target: "/var/www/api/.env.bak", when: "2 hours ago" },
      { actor: "Maya Chen", action: "backup.completed", target: "nightly-production", when: "8 hours ago" },
    ],
  },
  {
    name: "Frontend Cluster",
    host: "web-01.acme.internal",
    username: "deploy",
    port: 22,
    rootPath: "/srv/web",
    region: "Ireland",
    status: "online",
    cpu: 22,
    memory: 51,
    disk: 33,
    latency: 18,
    transfers: 64,
    files: [
      {
        name: "dist", type: "directory", size: "142 items", permissions: "drwxr-xr-x", owner: "deploy", modified: "22 minutes ago", changed: true,
        children: [
          { name: "assets", type: "directory", size: "138 items", permissions: "drwxr-xr-x", owner: "deploy", modified: "22 minutes ago" },
          { name: "index.html", type: "file", size: "1.8 KB", permissions: "-rw-r--r--", owner: "deploy", modified: "22 minutes ago", changed: true },
        ],
      },
      { name: "nginx.conf", type: "file", size: "4.2 KB", permissions: "-rw-r--r--", owner: "root", modified: "last week" },
      { name: "robots.txt", type: "file", size: "128 B", permissions: "-rw-r--r--", owner: "deploy", modified: "a month ago" },
    ],
    deployments: [
      { version: "web-2026.07.20", branch: "main", author: "Sara Malik", status: "succeeded", when: "22 minutes ago" },
      { version: "web-2026.07.14", branch: "main", author: "Sara Malik", status: "succeeded", when: "6 days ago" },
    ],
    activity: [
      { actor: "Sara Malik", action: "deployment.succeeded", target: "web-2026.07.20", when: "22 minutes ago" },
      { actor: "Sara Malik", action: "file.write", target: "/srv/web/dist/index.html", when: "22 minutes ago" },
    ],
  },
  {
    name: "Staging",
    host: "staging.acme.internal",
    username: "root",
    port: 2222,
    rootPath: "/opt/staging",
    region: "Oregon",
    status: "degraded",
    cpu: 81,
    memory: 74,
    disk: 88,
    latency: 240,
    transfers: 12,
    files: [
      {
        name: "logs", type: "directory", size: "308 items", permissions: "drwxr-xr-x", owner: "root", modified: "a minute ago", changed: true,
        children: [
          { name: "app.log", type: "file", size: "1.2 GB", permissions: "-rw-r--r--", owner: "root", modified: "a minute ago", changed: true },
          { name: "error.log", type: "file", size: "864 MB", permissions: "-rw-r--r--", owner: "root", modified: "a minute ago", changed: true },
        ],
      },
      { name: "app", type: "directory", size: "16 items", permissions: "drwxr-xr-x", owner: "root", modified: "4 hours ago" },
      { name: ".env", type: "file", size: "412 B", permissions: "-rw-------", owner: "root", modified: "4 hours ago" },
    ],
    deployments: [
      { version: "staging-2026.07.20", branch: "feat/checkout", author: "Jon Bell", status: "failed", when: "4 hours ago" },
    ],
    activity: [
      { actor: "Orbit monitor", action: "alert.opened", target: "Disk above 85%", when: "a minute ago" },
      { actor: "Jon Bell", action: "deployment.failed", target: "staging-2026.07.20", when: "4 hours ago" },
    ],
  },
];

/** Mirrors the real workspace shell's groups and badges. */
const NAVIGATION = [
  { group: "Workspace", items: [
    { label: "Overview", icon: Gauge },
    { label: "Servers", icon: ServerIcon },
    { label: "Transfers", icon: CloudUpload, badge: "2" },
  ] },
  { group: "Operate", items: [
    { label: "Deployments", icon: Rocket },
    { label: "Backups & restore", icon: ArchiveRestore },
    { label: "Terminal", icon: Terminal },
    { label: "Runbooks", icon: ListChecks },
    { label: "Automations", icon: Bot },
  ] },
  { group: "Observe", items: [
    { label: "Monitoring", icon: Activity, badge: "1" },
    { label: "Activity & audit", icon: ShieldCheck },
    { label: "Notifications", icon: Bell, badge: "3" },
  ] },
  { group: "Manage", items: [
    { label: "Team", icon: Users },
    { label: "Integrations", icon: Blocks },
    { label: "API keys", icon: KeyRound },
    { label: "Usage", icon: Cpu },
    { label: "Plan & billing", icon: CircleDollarSign },
    { label: "Settings", icon: Blocks },
  ] },
];

const TABS = ["Overview", "Files", "Deployments", "Activity"] as const;
type Tab = (typeof TABS)[number];

/* -------------------------------------------------------------------------
 * Live readings
 * ---------------------------------------------------------------------- */

/**
 * Walks each reading a little every couple of seconds.
 *
 * A dashboard whose numbers never move looks like a screenshot, which is the
 * thing this exists not to be. The walk is bounded around each server's own
 * baseline, so a busy host stays busy and an idle one stays idle rather than
 * drifting somewhere unrepresentative.
 */
function useLiveReadings(server: DemoServer, connected: boolean) {
  const [readings, setReadings] = useState({ cpu: server.cpu, memory: server.memory, disk: server.disk, latency: server.latency });
  const [series, setSeries] = useState<number[]>(() =>
    Array.from({ length: 20 }, (_, index) => server.cpu + Math.sin(index / 2.2) * 9),
  );

  // Held in a ref so the interval below never has to restart.
  const baseline = useRef(server);
  baseline.current = server;

  useEffect(() => {
    setReadings({ cpu: server.cpu, memory: server.memory, disk: server.disk, latency: server.latency });
    setSeries(Array.from({ length: 20 }, (_, index) => server.cpu + Math.sin(index / 2.2) * 9));
  }, [server]);

  useEffect(() => {
    if (!connected) return;
    const drift = (value: number, base: number, spread: number) =>
      Math.max(1, Math.min(99, value + (Math.random() - 0.5) * spread + (base - value) * 0.25));

    const timer = setInterval(() => {
      setReadings((current) => ({
        cpu: drift(current.cpu, baseline.current.cpu, 9),
        memory: drift(current.memory, baseline.current.memory, 3),
        // Disk moves far more slowly than the rest. Treating it like CPU would
        // show a filesystem gaining and losing gigabytes every two seconds.
        disk: drift(current.disk, baseline.current.disk, 0.4),
        latency: Math.round(drift(current.latency, baseline.current.latency, baseline.current.latency * 0.3)),
      }));
      setSeries((current) => [...current.slice(1), drift(current.at(-1) ?? 40, baseline.current.cpu, 12)]);
    }, 2_000);
    return () => clearInterval(timer);
  }, [connected]);

  return { readings, series };
}

/* -------------------------------------------------------------------------
 * Component
 * ---------------------------------------------------------------------- */

export function ProductDemo() {
  const [section, setSection] = useState("Servers");
  const [activeServer, setActiveServer] = useState(0);
  const [connected, setConnected] = useState(true);
  const [tab, setTab] = useState<Tab>("Overview");
  const [trail, setTrail] = useState<string[]>([]);
  const [starred, setStarred] = useState(false);
  const [copied, setCopied] = useState(false);

  const server = SERVERS[activeServer]!;
  const { readings, series } = useLiveReadings(server, connected);

  // The folder currently open, found by walking the trail from the root.
  const listing = useMemo(() => {
    let entries = server.files;
    for (const segment of trail) {
      const next = entries.find((entry) => entry.name === segment && entry.type === "directory");
      if (!next?.children) break;
      entries = next.children;
    }
    return [...entries].sort((a, b) => (a.type === b.type ? 0 : a.type === "directory" ? -1 : 1));
  }, [server, trail]);

  const currentPath = [server.rootPath, ...trail].join("/").replace(/\/+/g, "/");

  function selectServer(index: number) {
    setSection("Servers");
    setActiveServer(index);
    setConnected(true);
    setTrail([]);
    setStarred(false);
  }

  // A disconnected server has no current reading, so it shows a dash. Zero
  // would claim it is idle, which is a different and untrue statement.
  const pct = (value: number) => (connected ? `${Math.round(value)}%` : "—");

  const metrics = [
    { label: "CPU", value: pct(readings.cpu), icon: Activity, detail: connected ? "ssh" : "disconnected" },
    { label: "Memory", value: pct(readings.memory), icon: Gauge, detail: connected ? "ssh" : "disconnected" },
    { label: "Disk", value: pct(readings.disk), icon: Database, detail: connected ? "ssh" : "disconnected" },
    { label: "Latency", value: connected ? `${readings.latency} ms` : "—", icon: Zap, detail: connected ? "just now" : "not probed" },
    { label: "Status", value: connected ? server.status : "offline", icon: CircleCheck, detail: connected ? "last check" : "no checks" },
    { label: "Transfers", value: String(server.transfers), icon: CloudUpload, detail: "last 30 days" },
  ];

  return (
    <div className="relative mx-auto mt-14 max-w-6xl px-2 sm:px-6">
      <div className="absolute -inset-12 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(74,96,210,.18),transparent_55%)] blur-2xl" />
      <div className="overflow-hidden rounded-xl border border-white/12 bg-[#0d0e11] shadow-2xl shadow-black/70">
        <header className="flex h-10 items-center gap-3 border-b border-white/8 px-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-red-400/70" />
            <span className="size-2.5 rounded-full bg-amber-400/70" />
            <span className="size-2.5 rounded-full bg-emerald-400/70" />
          </div>
          <div className="mx-auto flex h-6 w-56 items-center justify-center rounded-md bg-white/[0.035] text-[8px] text-zinc-600">app.orbit.dev/workspace</div>
          <div className="w-10" />
        </header>

        {/* Tall enough for the full sidebar, so nothing is hidden behind a scroll. */}
        <div className="grid min-h-[700px] grid-cols-[156px_minmax(0,1fr)] sm:grid-cols-[200px_minmax(0,1fr)]">
          <aside aria-label="Workspace navigation" className="border-r border-white/8 bg-[#141517] p-2.5">
            <div className="flex h-8 items-center gap-2 px-2">
              <span className="grid size-5 place-items-center rounded bg-zinc-100 text-black"><RefreshCw className="size-3" /></span>
              <span className="font-heading text-[11px] font-semibold">Orbit<span className="text-blue-400">+</span></span>
            </div>

            {NAVIGATION.map((group) => (
              <div key={group.group}>
                <p className="mb-1 mt-4 px-2 text-[7px] uppercase tracking-wider text-zinc-600">{group.group}</p>
                {group.items.map((item) => (
                  // Kept as a div so the class string stays exactly the one the
                  // design specifies. A button would need w-full and text-left
                  // to fill the row the way this does, and those would change
                  // the string. The role, tabIndex, and key handler give it the
                  // keyboard behaviour a button would have had.
                  <div
                    key={item.label}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSection(item.label)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSection(item.label);
                      }
                    }}
                    className={cn("flex h-7 items-center gap-2 rounded px-2 text-[8px] text-zinc-600", section === item.label ? "bg-zinc-800 text-white" : "cursor-pointer hover:bg-white/[0.03]")}
                  >
                    <item.icon className="size-3 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.badge && <span className="ml-auto rounded bg-white/[0.07] px-1 text-[6px] text-zinc-400">{item.badge}</span>}
                  </div>
                ))}
              </div>
            ))}

            <p className="mb-1 mt-4 px-2 text-[7px] uppercase tracking-wider text-zinc-600">Servers</p>
            {SERVERS.map((item, index) => (
              <button
                type="button"
                key={item.name}
                onClick={() => selectServer(index)}
                className={cn("flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[8px]", index === activeServer && section === "Servers" ? "bg-white/[0.055] text-zinc-200" : "text-zinc-600 hover:bg-white/[0.03]")}
              >
                <span className={cn("size-1.5 shrink-0 rounded-full", item.status === "online" ? "bg-emerald-400" : "bg-amber-400")} />
                <span className="truncate">{item.name}</span>
              </button>
            ))}
          </aside>

          <main className="flex min-w-0 flex-col">
            {section !== "Servers" ? (
              <div className="min-w-0 flex-1 p-3 sm:p-5">{SECTIONS[section]?.render()}</div>
            ) : (
              <>
                <div className="border-b border-white/8 px-3 pt-4 sm:px-5">
                  <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/8 bg-white/[0.03] text-zinc-500">
                        <ServerIcon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-base font-semibold">{server.name}</h3>
                          <StatusBadge status={connected ? server.status : "offline"} />
                        </div>
                        <p className="mt-0.5 truncate font-mono text-[8px] text-zinc-600">
                          {server.username}@{server.host}:{server.port} · {server.rootPath}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 lg:ml-auto">
                      <button
                        type="button"
                        onClick={() => setStarred((value) => !value)}
                        title="Favorite"
                        className="grid size-7 place-items-center rounded border border-white/8 text-zinc-500 transition hover:bg-white/5"
                      >
                        <Star className={cn("size-3", starred && "fill-amber-300 text-amber-300")} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setCopied(true); window.setTimeout(() => setCopied(false), 1400); }}
                        className="flex h-7 items-center gap-1.5 rounded border border-white/8 px-2 text-[8px] text-zinc-400 transition hover:bg-white/5"
                      >
                        <Copy className="size-3" />{copied ? "Copied" : "Copy host"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSection("Terminal")}
                        className="hidden h-7 items-center gap-1.5 rounded border border-white/8 px-2 text-[8px] text-zinc-400 transition hover:bg-white/5 sm:flex"
                      >
                        <Terminal className="size-3" />Terminal
                      </button>
                      <button
                        type="button"
                        onClick={() => setConnected((value) => !value)}
                        className={cn(
                          "flex h-7 items-center gap-1.5 rounded px-2.5 text-[8px] font-medium transition",
                          connected
                            ? "border border-rose-400/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                            : "border border-indigo-400/30 bg-indigo-500 text-white hover:bg-indigo-400",
                        )}
                      >
                        {connected ? <><Unplug className="size-3" />Disconnect</> : <><Zap className="size-3" />Connect</>}
                      </button>
                      <button type="button" className="grid size-7 place-items-center rounded text-zinc-600 transition hover:bg-white/5">
                        <MoreHorizontal className="size-3" />
                      </button>
                    </div>
                  </div>

                  <nav className="flex min-w-0 gap-1 overflow-x-auto" aria-label="Server sections">
                    {TABS.map((item) => (
                      <button
                        type="button"
                        key={item}
                        onClick={() => setTab(item)}
                        className={cn(
                          "relative flex h-8 shrink-0 items-center px-2.5 text-[9px] transition",
                          tab === item
                            ? "text-zinc-100 after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-white"
                            : "text-zinc-600 hover:text-zinc-300",
                        )}
                      >
                        {item}
                      </button>
                    ))}
                  </nav>
                </div>

                <div className="min-w-0 flex-1 p-3 sm:p-5">
                  <section className="grid grid-cols-2 border-y border-white/8 lg:grid-cols-6">
                    {metrics.map((item, index) => (
                      <div
                        key={item.label}
                        className={cn(
                          "flex items-center gap-2.5 p-3",
                          index % 2 === 0 && "border-r border-white/8",
                          index < 4 && "border-b border-white/8 lg:border-b-0",
                          index < 5 && "lg:border-r lg:border-white/8",
                        )}
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white/[0.04] text-zinc-500">
                          <item.icon className="size-3" />
                        </span>
                        <span className="min-w-0">
                          <strong className={cn("block text-sm tabular-nums transition-colors", !connected && "text-zinc-600")}>{item.value}</strong>
                          <span className="block truncate text-[7px] text-zinc-600">{item.label} · {item.detail}</span>
                        </span>
                      </div>
                    ))}
                  </section>

                  {(tab === "Overview" || tab === "Files") && (
                    <div className={cn("mt-4 grid gap-4", tab === "Overview" && "xl:grid-cols-[1.35fr_.65fr]")}>
                      <FileTable
                        path={currentPath}
                        trail={trail}
                        listing={listing}
                        wide={tab === "Files"}
                        onOpen={(entry) => entry.type === "directory" && entry.children && setTrail((value) => [...value, entry.name])}
                        onUp={() => setTrail((value) => value.slice(0, -1))}
                      />
                      {tab === "Overview" && (
                        <aside>
                          <div className="mb-2">
                            <p className="text-[9px] font-medium">Live health</p>
                            <p className="mt-0.5 text-[7px] text-zinc-600">{connected ? "Updating every 2 seconds" : "Paused while disconnected"}</p>
                          </div>
                          <div className="rounded-md border border-white/8 bg-white/[0.018] p-3">
                            <div className="flex h-24 items-end gap-1">
                              {series.map((height, index) => (
                                <span
                                  key={index}
                                  className={cn("min-w-0 flex-1 rounded-t-sm transition-all duration-700", connected ? "bg-blue-400/55" : "bg-zinc-700/40")}
                                  style={{ height: `${Math.max(6, height)}%` }}
                                />
                              ))}
                            </div>
                            <div className="mt-3 space-y-3">
                              {([["Memory", readings.memory], ["Disk", readings.disk]] as const).map(([label, value]) => (
                                <div key={label}>
                                  <div className="mb-1 flex justify-between text-[7px] text-zinc-600">
                                    <span>{label}</span>
                                    <span className="tabular-nums">{connected ? `${Math.round(value)}%` : "—"}</span>
                                  </div>
                                  <Progress
                                    value={connected ? value : 0}
                                    className="h-px"
                                    indicatorClassName={cn("transition-all duration-700", value > 85 ? "bg-rose-400" : "bg-zinc-400")}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-400/10 bg-emerald-400/[0.035] p-2.5 text-[7px] text-emerald-300">
                            <ShieldCheck className="size-3.5 shrink-0" />Host key verified · AES-256 encrypted
                          </div>
                        </aside>
                      )}
                    </div>
                  )}

                  {tab === "Deployments" && (
                    <div className="mt-4 overflow-hidden border-y border-white/8">
                      <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-white/8 px-2 py-1.5 text-[7px] uppercase tracking-wider text-zinc-700">
                        <span>Release</span><span>Status</span>
                      </div>
                      {server.deployments.map((item) => (
                        <div key={item.version} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-white/[0.055] px-2 py-2 last:border-0 hover:bg-white/[0.02]">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-[8px] text-zinc-300">{item.version}</p>
                            <p className="mt-0.5 truncate text-[7px] text-zinc-600">{item.branch} · {item.author} · {item.when}</p>
                          </div>
                          <StatusBadge status={item.status} />
                        </div>
                      ))}
                    </div>
                  )}

                  {tab === "Activity" && (
                    <div className="mt-4 overflow-hidden border-y border-white/8">
                      {server.activity.map((item, index) => (
                        <div key={index} className="flex items-start gap-2.5 border-b border-white/[0.055] px-2 py-2 last:border-0 hover:bg-white/[0.02]">
                          <span className="grid size-6 shrink-0 place-items-center rounded bg-white/[0.04] text-zinc-500"><ShieldCheck className="size-3" /></span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[8px] text-zinc-300">
                              <span className="text-zinc-500">{item.actor}</span> · <span className="font-mono">{item.action}</span>
                            </p>
                            <p className="mt-0.5 truncate font-mono text-[7px] text-zinc-600">{item.target}</p>
                          </div>
                          <span className="shrink-0 text-[7px] text-zinc-700">{item.when}</span>
                        </div>
                      ))}
                      <div className="px-2 py-2 text-[7px] text-zinc-700">
                        Every change is recorded with the person, the time, and the previous contents.
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      <p className="mt-3 text-center text-[9px] text-zinc-600">
        A working preview with sample data — open any section, switch servers, browse folders, disconnect. Nothing here touches a real host.
      </p>
    </div>
  );
}

/** The file table, matching the columns the real explorer shows. */
function FileTable({
  path, trail, listing, onOpen, onUp, wide = false,
}: {
  path: string;
  trail: string[];
  listing: DemoFile[];
  onOpen: (entry: DemoFile) => void;
  onUp: () => void;
  wide?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {trail.length > 0 && (
            <button
              type="button"
              onClick={onUp}
              title="Up one level"
              className="grid size-5 shrink-0 place-items-center rounded text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
            >
              <ArrowLeft className="size-3" />
            </button>
          )}
          <div className="min-w-0">
            <p className="text-[9px] font-medium">Remote files</p>
            <p className="mt-0.5 truncate font-mono text-[7px] text-zinc-600">{path}</p>
          </div>
        </div>
        <Badge tone="info">{listing.length} items</Badge>
      </div>

      <div className="overflow-hidden border-y border-white/8">
        <div className={cn("grid gap-2 border-b border-white/8 px-2 py-1.5 text-[7px] uppercase tracking-wider text-zinc-700", wide ? "grid-cols-[1fr_60px_80px_60px_84px]" : "grid-cols-[1fr_auto]")}>
          <span>Name</span>
          {wide && <><span>Size</span><span>Permissions</span><span>Owner</span></>}
          <span className={wide ? "" : "text-right"}>Modified</span>
        </div>

        {listing.map((entry) => {
          const openable = entry.type === "directory" && Boolean(entry.children);
          return (
            <button
              type="button"
              key={entry.name}
              onClick={() => onOpen(entry)}
              disabled={!openable}
              className={cn(
                "grid w-full items-center gap-2 border-b border-white/[0.055] px-2 py-1.5 text-left last:border-0",
                wide ? "grid-cols-[1fr_60px_80px_60px_84px]" : "grid-cols-[1fr_auto]",
                openable ? "cursor-pointer hover:bg-white/[0.03]" : "cursor-default",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn("grid size-6 shrink-0 place-items-center rounded bg-white/[0.035]", entry.type === "directory" ? "text-blue-300" : "text-zinc-500")}>
                  {entry.type === "directory" ? <Folder className="size-3" /> : /\.(ts|js|json|yml)$/.test(entry.name) ? <FileCode2 className="size-3" /> : <File className="size-3" />}
                </span>
                <span className="truncate text-[8px] text-zinc-300">{entry.name}</span>
                {entry.changed && <span className="size-1.5 shrink-0 rounded-full bg-blue-400" title="Changed recently" />}
                {openable && <ChevronRight className="size-2.5 shrink-0 text-zinc-700" />}
              </span>
              {wide && <>
                <span className="truncate font-mono text-[7px] text-zinc-600">{entry.size}</span>
                <span className="truncate font-mono text-[7px] text-zinc-600">{entry.permissions}</span>
                <span className="truncate text-[7px] text-zinc-600">{entry.owner}</span>
              </>}
              <span className={cn("truncate text-[7px] text-zinc-600", !wide && "text-right")}>
                {wide ? entry.modified : entry.size}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

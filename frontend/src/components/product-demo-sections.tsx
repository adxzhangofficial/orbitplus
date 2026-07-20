import type { ReactNode } from "react";
import {
  Activity,
  ArchiveRestore,
  Bell,
  Blocks,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CloudUpload,
  Cpu,
  Database,
  Gauge,
  KeyRound,
  ListChecks,
  Rocket,
  Server as ServerIcon,
  ShieldCheck,
  Terminal,
  Users,
  Zap,
} from "lucide-react";
import { Badge, Progress, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * The workspace sections, as the homepage preview shows them.
 *
 * Each one mirrors the real page: the same header, the same stat tiles, the
 * same table columns. Someone clicking through the sidebar before signing up
 * sees the actual product rather than a placeholder.
 *
 * The data is fixed sample content — this runs with no account and no API.
 */

/* -------------------------------------------------------------------------
 * Shared pieces, matching the real pages' shells
 * ---------------------------------------------------------------------- */

export function DemoHeader({ eyebrow, title, description, action }: {
  eyebrow: string; title: string; description: string; action?: string;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-[7px] uppercase tracking-wider text-zinc-600">{eyebrow}</p>
        <h3 className="mt-1 text-base font-semibold">{title}</h3>
        <p className="mt-1 text-[8px] text-zinc-600">{description}</p>
      </div>
      {action && (
        <span className="flex h-7 shrink-0 items-center gap-1.5 rounded border border-indigo-400/30 bg-indigo-500 px-2.5 text-[8px] font-medium text-white">
          {action}
        </span>
      )}
    </div>
  );
}

/** The four-tile strip the real pages open with. */
export function StatRow({ items }: { items: Array<{ label: string; value: string; icon: typeof Gauge; detail: string }> }) {
  return (
    <section className="grid grid-cols-2 border-y border-white/8 lg:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn(
            "flex items-center gap-2.5 p-3",
            index % 2 === 0 && "border-r border-white/8",
            index < 2 && "border-b border-white/8 lg:border-b-0",
            index < 3 && "lg:border-r lg:border-white/8",
          )}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white/[0.04] text-zinc-500">
            <item.icon className="size-3" />
          </span>
          <span className="min-w-0">
            <strong className="block text-sm tabular-nums">{item.value}</strong>
            <span className="block truncate text-[7px] text-zinc-600">{item.label} · {item.detail}</span>
          </span>
        </div>
      ))}
    </section>
  );
}

export function DemoTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  const template = `grid-cols-[1.6fr_repeat(${columns.length - 1},minmax(0,1fr))]`;
  return (
    <div className="overflow-hidden border-y border-white/8">
      <div className={cn("grid gap-2 border-b border-white/8 px-2 py-1.5 text-[7px] uppercase tracking-wider text-zinc-700", template)}>
        {columns.map((column) => <span key={column} className="truncate">{column}</span>)}
      </div>
      {rows.map((row, index) => (
        <div key={index} className={cn("grid items-center gap-2 border-b border-white/[0.055] px-2 py-2 text-[8px] last:border-0 hover:bg-white/[0.02]", template)}>
          {row.map((cell, cellIndex) => <div key={cellIndex} className="min-w-0 truncate">{cell}</div>)}
        </div>
      ))}
    </div>
  );
}

function Primary({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-zinc-300">{children}</p>
      {sub && <p className="mt-0.5 truncate font-mono text-[7px] text-zinc-600">{sub}</p>}
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-white/8 bg-white/[0.018]">
      <div className="border-b border-white/8 px-3 py-2">
        <p className="text-[9px] font-medium">{title}</p>
        {description && <p className="mt-0.5 text-[7px] text-zinc-600">{description}</p>}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Sections
 * ---------------------------------------------------------------------- */

function OverviewSection() {
  return (
    <>
      <DemoHeader eyebrow="Workspace" title="Overview" description="Every server, transfer, and release across Acme Engineering." />
      <StatRow items={[
        { label: "Servers", value: "3", icon: ServerIcon, detail: "2 online, 1 degraded" },
        { label: "Transfers", value: "204", icon: CloudUpload, detail: "last 30 days" },
        { label: "Releases", value: "18", icon: Rocket, detail: "this month" },
        { label: "Open alerts", value: "1", icon: Activity, detail: "disk above 85%" },
      ]} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Servers" description="Live connection state">
          <div className="space-y-2">
            {[
              { name: "Production API", host: "api-01.acme.internal", status: "online", cpu: 38 },
              { name: "Frontend Cluster", host: "web-01.acme.internal", status: "online", cpu: 22 },
              { name: "Staging", host: "staging.acme.internal", status: "degraded", cpu: 81 },
            ].map((item) => (
              <div key={item.name} className="flex items-center gap-2.5">
                <span className={cn("size-1.5 shrink-0 rounded-full", item.status === "online" ? "bg-emerald-400" : "bg-amber-400")} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[8px] text-zinc-300">{item.name}</p>
                  <p className="truncate font-mono text-[7px] text-zinc-600">{item.host}</p>
                </div>
                <div className="w-16 shrink-0">
                  <Progress value={item.cpu} className="h-px" indicatorClassName={item.cpu > 75 ? "bg-rose-400" : "bg-zinc-400"} />
                </div>
                <span className="w-7 shrink-0 text-right text-[7px] tabular-nums text-zinc-600">{item.cpu}%</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Recent activity" description="Who changed what">
          <div className="space-y-2">
            {[
              { actor: "Maya Chen", action: "file.write", target: "server.ts", when: "6m" },
              { actor: "Deploy bot", action: "deployment.succeeded", target: "release-2026.07.19", when: "6m" },
              { actor: "Jon Bell", action: "file.delete", target: ".env.bak", when: "2h" },
              { actor: "Orbit monitor", action: "alert.opened", target: "Disk above 85%", when: "1m" },
            ].map((item, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded bg-white/[0.04] text-zinc-500"><ShieldCheck className="size-2.5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[8px] text-zinc-300"><span className="text-zinc-500">{item.actor}</span> · <span className="font-mono">{item.action}</span></p>
                  <p className="truncate font-mono text-[7px] text-zinc-600">{item.target}</p>
                </div>
                <span className="shrink-0 text-[7px] text-zinc-700">{item.when}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

function TransfersSection() {
  return (
    <>
      <DemoHeader eyebrow="Workspace" title="Transfers" description="Every upload and download, with the checksum that proved it arrived." action="New transfer" />
      <StatRow items={[
        { label: "Completed", value: "204", icon: CheckCircle2, detail: "last 30 days" },
        { label: "In flight", value: "2", icon: CloudUpload, detail: "running now" },
        { label: "Moved", value: "48.2 GB", icon: Database, detail: "this month" },
        { label: "Failed", value: "0", icon: Zap, detail: "auto-retried" },
      ]} />
      <div className="mt-4">
        <DemoTable
          columns={["Transfer", "Direction", "Progress", "Speed / ETA", "Status"]}
          rows={[
            [<Primary sub="/var/www/api">release-2026.07.19.tar.gz</Primary>, "Upload", <Progress value={68} className="h-1" indicatorClassName="bg-blue-400" />, "18.4 MB/s · 4s", <StatusBadge status="running" />],
            [<Primary sub="/srv/web/dist">web-bundle.zip</Primary>, "Upload", <Progress value={31} className="h-1" indicatorClassName="bg-blue-400" />, "9.1 MB/s · 22s", <StatusBadge status="running" />],
            [<Primary sub="/opt/staging/logs">app.log</Primary>, "Download", <Progress value={100} className="h-1" indicatorClassName="bg-emerald-400" />, "—", <StatusBadge status="completed" />],
            [<Primary sub="/var/www/api">docker-compose.yml</Primary>, "Upload", <Progress value={100} className="h-1" indicatorClassName="bg-emerald-400" />, "—", <StatusBadge status="completed" />],
          ]}
        />
      </div>
    </>
  );
}

function DeploymentsSection() {
  return (
    <>
      <DemoHeader eyebrow="Operate" title="Deployments" description="Releases, approvals, and one-click rollback to any previous version." action="Deploy" />
      <StatRow items={[
        { label: "Releases", value: "18", icon: Rocket, detail: "this month" },
        { label: "Success rate", value: "94%", icon: CheckCircle2, detail: "last 30 days" },
        { label: "Median time", value: "3m 12s", icon: Clock3, detail: "build to live" },
        { label: "Rollbacks", value: "1", icon: ArchiveRestore, detail: "this month" },
      ]} />
      <div className="mt-4">
        <DemoTable
          columns={["Release", "Environment", "Author", "Duration", "Status"]}
          rows={[
            [<Primary sub="main · a91f3c2">release-2026.07.19</Primary>, "Production", "Maya Chen", "3m 04s", <StatusBadge status="succeeded" />],
            [<Primary sub="main · 7de1b04">web-2026.07.20</Primary>, "Production", "Sara Malik", "2m 41s", <StatusBadge status="succeeded" />],
            [<Primary sub="feat/checkout · 3b8ea11">staging-2026.07.20</Primary>, "Staging", "Jon Bell", "1m 08s", <StatusBadge status="failed" />],
            [<Primary sub="hotfix/rate-limit · c02d99a">release-2026.07.17</Primary>, "Production", "Maya Chen", "3m 55s", <StatusBadge status="rolled_back" />],
          ]}
        />
      </div>
    </>
  );
}

function BackupsSection() {
  return (
    <>
      <DemoHeader eyebrow="Operate" title="Backups & restore" description="Scheduled snapshots, encrypted at rest, restorable to any point in the window." action="New backup" />
      <StatRow items={[
        { label: "Snapshots", value: "42", icon: ArchiveRestore, detail: "across 3 servers" },
        { label: "Stored", value: "18.4 GB", icon: Database, detail: "after deduplication" },
        { label: "Last backup", value: "8h", icon: Clock3, detail: "nightly schedule" },
        { label: "Restores", value: "2", icon: CheckCircle2, detail: "both verified" },
      ]} />
      <div className="mt-4">
        <DemoTable
          columns={["Backup", "Type", "Contents", "Retention", "Status"]}
          rows={[
            [<Primary sub="Production API">nightly-production</Primary>, "Full", "1,284 files · 4.2 GB", "30 days", <StatusBadge status="completed" />],
            [<Primary sub="Frontend Cluster">nightly-web</Primary>, "Full", "3,902 files · 1.1 GB", "30 days", <StatusBadge status="completed" />],
            [<Primary sub="Production API">pre-release-2026.07.19</Primary>, "Partial", "412 files · 890 MB", "90 days", <StatusBadge status="completed" />],
            [<Primary sub="Staging">staging-weekly</Primary>, "Full", "—", "7 days", <StatusBadge status="running" />],
          ]}
        />
      </div>
    </>
  );
}

function TerminalSection() {
  const lines = [
    { prompt: true, text: "systemctl status orbit-api" },
    { text: "● orbit-api.service — Orbit API" },
    { text: "   Loaded: loaded (/etc/systemd/system/orbit-api.service; enabled)", dim: true },
    { text: "   Active: active (running) since Mon 2026-07-14 09:12:04 UTC; 6 days ago", ok: true },
    { text: " Main PID: 1841 (node)", dim: true },
    { text: "    Tasks: 23 (limit: 9216)", dim: true },
    { prompt: true, text: "df -h /var/www" },
    { text: "Filesystem      Size  Used Avail Use% Mounted on", dim: true },
    { text: "/dev/nvme0n1p2   96G   45G   47G  47% /" },
    { prompt: true, text: "" },
  ];
  return (
    <>
      <DemoHeader eyebrow="Operate" title="Terminal" description="A real shell on the selected server. Every session is recorded and replayable." />
      <div className="overflow-hidden rounded-md border border-white/8 bg-[#0a0b0d]">
        <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          <span className="font-mono text-[8px] text-zinc-500">deploy@api-01.acme.internal</span>
          <Badge tone="info" className="ml-auto">recording</Badge>
        </div>
        <div className="space-y-0.5 p-3 font-mono text-[8px] leading-relaxed">
          {lines.map((line, index) => (
            <div key={index} className="flex gap-2">
              {line.prompt && <span className="shrink-0 text-emerald-400">$</span>}
              <span className={cn(line.prompt ? "text-zinc-200" : line.ok ? "text-emerald-300" : line.dim ? "text-zinc-600" : "text-zinc-400")}>
                {line.text}
                {line.prompt && line.text === "" && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-zinc-400 align-middle" />}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-400/10 bg-amber-400/[0.035] p-2.5 text-[7px] text-amber-200/80">
        <ShieldCheck className="size-3.5 shrink-0" />
        Destructive commands are screened before they run, and the full session is written to the audit trail.
      </div>
    </>
  );
}

function RunbooksSection() {
  return (
    <>
      <DemoHeader eyebrow="Operate" title="Runbooks" description="Reviewed procedures your team runs the same way every time." action="New runbook" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { name: "Rotate database credentials", steps: 7, owner: "Platform", last: "3 days ago", risk: "high" },
          { name: "Restore from nightly backup", steps: 5, owner: "Platform", last: "last week", risk: "high" },
          { name: "Scale the API tier", steps: 4, owner: "Infrastructure", last: "yesterday", risk: "medium" },
          { name: "Clear the CDN cache", steps: 2, owner: "Frontend", last: "2 hours ago", risk: "low" },
        ].map((item) => (
          <div key={item.name} className="rounded-md border border-white/8 bg-white/[0.018] p-3">
            <div className="flex items-start gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white/[0.04] text-zinc-500"><ListChecks className="size-3" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[9px] font-medium text-zinc-200">{item.name}</p>
                <p className="mt-0.5 text-[7px] text-zinc-600">{item.steps} steps · {item.owner} · run {item.last}</p>
              </div>
              <StatusBadge status={item.risk} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function AutomationsSection() {
  return (
    <>
      <DemoHeader eyebrow="Operate" title="Automations" description="Scheduled work that runs whether or not anyone is watching." action="New automation" />
      <DemoTable
        columns={["Automation", "Trigger", "Target", "Last run", "Status"]}
        rows={[
          [<Primary sub="Full snapshot, 30-day retention">Nightly backup</Primary>, "Daily 02:00", "All servers", "8 hours ago", <StatusBadge status="active" />],
          [<Primary sub="Removes files older than 14 days">Log rotation</Primary>, "Daily 04:00", "Staging", "6 hours ago", <StatusBadge status="active" />],
          [<Primary sub="Alerts when disk exceeds 85%">Disk watch</Primary>, "Every 5 min", "All servers", "a minute ago", <StatusBadge status="active" />],
          [<Primary sub="Rebuilds the file index">Reindex tree</Primary>, "Weekly Sun", "Production API", "4 days ago", <StatusBadge status="paused" />],
        ]}
      />
    </>
  );
}

function MonitoringSection() {
  return (
    <>
      <DemoHeader eyebrow="Observe" title="Monitoring" description="Resource readings taken from each host, and the alerts they raised." />
      <StatRow items={[
        { label: "Healthy", value: "2", icon: CheckCircle2, detail: "of 3 servers" },
        { label: "Open alerts", value: "1", icon: Activity, detail: "1 critical" },
        { label: "Median latency", value: "31 ms", icon: Zap, detail: "last hour" },
        { label: "Uptime", value: "99.997%", icon: Gauge, detail: "30 days" },
      ]} />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_.6fr]">
        <DemoTable
          columns={["Server", "CPU", "Memory", "Disk", "Status"]}
          rows={[
            [<Primary sub="api-01.acme.internal">Production API</Primary>, "38%", "64%", "47%", <StatusBadge status="healthy" />],
            [<Primary sub="web-01.acme.internal">Frontend Cluster</Primary>, "22%", "51%", "33%", <StatusBadge status="healthy" />],
            [<Primary sub="staging.acme.internal">Staging</Primary>, "81%", "74%", "88%", <StatusBadge status="warning" />],
          ]}
        />
        <Panel title="Open alerts" description="Newest first">
          <div className="rounded border border-rose-400/15 bg-rose-400/[0.04] p-2.5">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-rose-400" />
              <p className="text-[8px] font-medium text-rose-200">Disk above 85%</p>
            </div>
            <p className="mt-1 text-[7px] leading-4 text-zinc-500">Staging is at 88% on /. Log rotation is scheduled in 4 hours.</p>
            <p className="mt-1.5 text-[7px] text-zinc-700">opened a minute ago</p>
          </div>
          <p className="mt-2.5 text-[7px] leading-4 text-zinc-600">
            Alerts fire on a transition, not on every sweep, so a host that is simply down does not send one a minute.
          </p>
        </Panel>
      </div>
    </>
  );
}

function ActivitySection() {
  return (
    <>
      <DemoHeader eyebrow="Observe" title="Activity & audit" description="Who changed what, when, and what it looked like before." />
      <DemoTable
        columns={["Actor", "Action", "Resource", "Address", "When"]}
        rows={[
          ["Maya Chen", <span className="font-mono text-zinc-300">file.write</span>, <span className="font-mono text-zinc-500">/var/www/api/server.ts</span>, <span className="font-mono text-zinc-600">10.4.1.22</span>, "6 minutes ago"],
          ["Deploy bot", <span className="font-mono text-zinc-300">deployment.succeeded</span>, <span className="font-mono text-zinc-500">release-2026.07.19</span>, <span className="font-mono text-zinc-600">10.4.1.9</span>, "6 minutes ago"],
          ["Jon Bell", <span className="font-mono text-zinc-300">file.delete</span>, <span className="font-mono text-zinc-500">/var/www/api/.env.bak</span>, <span className="font-mono text-zinc-600">10.4.1.31</span>, "2 hours ago"],
          ["Maya Chen", <span className="font-mono text-zinc-300">backup.completed</span>, <span className="font-mono text-zinc-500">nightly-production</span>, <span className="font-mono text-zinc-600">system</span>, "8 hours ago"],
          ["Sara Malik", <span className="font-mono text-zinc-300">server.connect</span>, <span className="font-mono text-zinc-500">web-01.acme.internal</span>, <span className="font-mono text-zinc-600">10.4.1.18</span>, "yesterday"],
        ]}
      />
      <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-400/10 bg-emerald-400/[0.035] p-2.5 text-[7px] text-emerald-300">
        <ShieldCheck className="size-3.5 shrink-0" />
        Every entry is signed. A record altered in the database is detected and refused rather than served.
      </div>
    </>
  );
}

function NotificationsSection() {
  return (
    <>
      <DemoHeader eyebrow="Observe" title="Notifications" description="What needs your attention, and what has already been handled." />
      <div className="space-y-2">
        {[
          { title: "Staging disk above 85%", body: "Log rotation runs in 4 hours. Consider clearing /opt/staging/logs sooner.", tone: "critical", when: "a minute ago", unread: true },
          { title: "Deployment failed", body: "staging-2026.07.20 on feat/checkout failed at the build step.", tone: "warning", when: "4 hours ago", unread: true },
          { title: "Backup completed", body: "nightly-production captured 1,284 files (4.2 GB).", tone: "success", when: "8 hours ago", unread: true },
          { title: "New member joined", body: "Sara Malik accepted an invitation as Developer.", tone: "info", when: "yesterday" },
        ].map((item, index) => (
          <div key={index} className={cn("flex items-start gap-2.5 rounded-md border p-2.5", item.unread ? "border-white/10 bg-white/[0.03]" : "border-white/8")}>
            <span className={cn("mt-0.5 size-1.5 shrink-0 rounded-full",
              item.tone === "critical" ? "bg-rose-400" : item.tone === "warning" ? "bg-amber-400" : item.tone === "success" ? "bg-emerald-400" : "bg-zinc-600")} />
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-[8px]", item.unread ? "font-medium text-zinc-200" : "text-zinc-500")}>{item.title}</p>
              <p className="mt-0.5 text-[7px] leading-4 text-zinc-600">{item.body}</p>
            </div>
            <span className="shrink-0 text-[7px] text-zinc-700">{item.when}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function TeamSection() {
  return (
    <>
      <DemoHeader eyebrow="Manage" title="Team" description="Who can reach which servers, and what they are allowed to do there." action="Invite member" />
      <DemoTable
        columns={["Member", "Role", "Server access", "Last active", "MFA"]}
        rows={[
          [<Primary sub="maya@acme.com">Maya Chen</Primary>, <StatusBadge status="owner" />, "All servers", "6 minutes ago", <Badge tone="success">Enabled</Badge>],
          [<Primary sub="jon@acme.com">Jon Bell</Primary>, <StatusBadge status="admin" />, "All servers", "2 hours ago", <Badge tone="success">Enabled</Badge>],
          [<Primary sub="sara@acme.com">Sara Malik</Primary>, <StatusBadge status="developer" />, "Frontend Cluster", "22 minutes ago", <Badge tone="success">Enabled</Badge>],
          [<Primary sub="audit@acme.com">Compliance</Primary>, <StatusBadge status="viewer" />, "Read-only, all", "last week", <Badge tone="warning">Pending</Badge>],
        ]}
      />
    </>
  );
}

function IntegrationsSection() {
  return (
    <>
      <DemoHeader eyebrow="Manage" title="Integrations" description="Where Orbit sends events, and what it sends them for." action="Add integration" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { name: "Slack", detail: "#ops-alerts", events: "6 events", status: "active", icon: Bell },
          { name: "PagerDuty", detail: "Production escalation", events: "2 events", status: "active", icon: Activity },
          { name: "Webhook", detail: "hooks.acme.com/…/orbit", events: "10 events", status: "active", icon: Blocks },
          { name: "Discord", detail: "Not configured", events: "—", status: "inactive", icon: Bell },
        ].map((item) => (
          <div key={item.name} className="rounded-md border border-white/8 bg-white/[0.018] p-3">
            <div className="flex items-start gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white/[0.04] text-zinc-500"><item.icon className="size-3" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[9px] font-medium text-zinc-200">{item.name}</p>
                <p className="mt-0.5 truncate font-mono text-[7px] text-zinc-600">{item.detail}</p>
                <p className="mt-1 text-[7px] text-zinc-700">{item.events}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[7px] leading-4 text-zinc-600">
        Deliveries are signed with a timestamp, so a captured payload cannot be replayed against your endpoint.
      </p>
    </>
  );
}

function ApiKeysSection() {
  return (
    <>
      <DemoHeader eyebrow="Manage" title="API keys" description="Scoped credentials for CI and the command line. A read-only key cannot write." action="Create key" />
      <DemoTable
        columns={["Key", "Scopes", "Last used", "Expires", "Status"]}
        rows={[
          [<Primary sub="orb_8_TNud…UEE2">CI deploy pipeline</Primary>, "files:write, deployments:write", "6 minutes ago", "in 11 months", <StatusBadge status="active" />],
          [<Primary sub="orb_zk2F…9nQ1">Monitoring exporter</Primary>, "monitoring:read", "a minute ago", "in 5 months", <StatusBadge status="active" />],
          [<Primary sub="orb_p3Lm…KX07">Backup verifier</Primary>, "backups:read", "8 hours ago", "in 2 months", <StatusBadge status="active" />],
          [<Primary sub="orb_qq18…ZZ44">Old laptop</Primary>, "files:read", "3 months ago", "expired", <StatusBadge status="revoked" />],
        ]}
      />
      <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-400/10 bg-emerald-400/[0.035] p-2.5 text-[7px] text-emerald-300">
        <KeyRound className="size-3.5 shrink-0" />
        Scopes are enforced per request. A key without <span className="font-mono">files:write</span> is refused, not warned.
      </div>
    </>
  );
}

function UsageSection() {
  return (
    <>
      <DemoHeader eyebrow="Manage" title="Usage" description="What this workspace has consumed against the Pro plan this cycle." />
      <StatRow items={[
        { label: "Servers", value: "3 / 25", icon: ServerIcon, detail: "Pro plan" },
        { label: "Transfers", value: "204", icon: CloudUpload, detail: "unlimited" },
        { label: "Storage", value: "18.4 GB", icon: Database, detail: "of 100 GB" },
        { label: "Members", value: "4 / 15", icon: Users, detail: "Pro plan" },
      ]} />
      <div className="mt-4 grid gap-3">
        {[
          { label: "Backup storage", used: 18.4, total: 100, unit: "GB" },
          { label: "Servers connected", used: 3, total: 25, unit: "" },
          { label: "Team members", used: 4, total: 15, unit: "" },
          { label: "API requests", used: 41_200, total: 250_000, unit: "" },
        ].map((item) => {
          const percent = (item.used / item.total) * 100;
          return (
            <div key={item.label}>
              <div className="mb-1 flex justify-between text-[8px]">
                <span className="text-zinc-400">{item.label}</span>
                <span className="tabular-nums text-zinc-600">
                  {item.used.toLocaleString()}{item.unit && ` ${item.unit}`} of {item.total.toLocaleString()}{item.unit && ` ${item.unit}`}
                </span>
              </div>
              <Progress value={percent} className="h-1" indicatorClassName={percent > 85 ? "bg-rose-400" : "bg-zinc-400"} />
            </div>
          );
        })}
      </div>
    </>
  );
}

function BillingSection() {
  return (
    <>
      <DemoHeader eyebrow="Manage" title="Plan & billing" description="Your subscription, payment method, and every invoice." action="Change plan" />
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Current plan" description="Renews 1 August 2026">
          <div className="flex items-baseline gap-2">
            <strong className="text-xl">Pro</strong>
            <span className="text-[9px] text-zinc-500">$99 / month</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {["Up to 25 servers", "15 team members", "100 GB backup storage", "90-day audit retention", "Priority support"].map((line) => (
              <p key={line} className="flex items-center gap-1.5 text-[7px] text-zinc-500">
                <CheckCircle2 className="size-2.5 shrink-0 text-emerald-400" />{line}
              </p>
            ))}
          </div>
        </Panel>
        <Panel title="Payment method" description="Charged monthly">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-md bg-white/[0.04] text-zinc-500"><CircleDollarSign className="size-3" /></span>
            <div>
              <p className="text-[9px] text-zinc-300">Visa ending 4242</p>
              <p className="mt-0.5 text-[7px] text-zinc-600">Expires 04 / 2029</p>
            </div>
          </div>
          <div className="mt-3 space-y-1.5 border-t border-white/8 pt-3">
            {[
              { id: "INV-2026-07", amount: "$99.00", when: "1 July 2026" },
              { id: "INV-2026-06", amount: "$99.00", when: "1 June 2026" },
              { id: "INV-2026-05", amount: "$99.00", when: "1 May 2026" },
            ].map((invoice) => (
              <div key={invoice.id} className="flex items-center gap-2 text-[7px]">
                <span className="font-mono text-zinc-500">{invoice.id}</span>
                <span className="text-zinc-700">{invoice.when}</span>
                <span className="ml-auto tabular-nums text-zinc-400">{invoice.amount}</span>
                <Badge tone="success">Paid</Badge>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

function SettingsSection() {
  return (
    <>
      <DemoHeader eyebrow="Manage" title="Settings" description="Shared defaults and governance for Acme Engineering." action="Save changes" />
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Workspace identity" description="Organization-wide profile">
          <div className="space-y-2.5">
            {[["Workspace name", "Acme Engineering"], ["Workspace URL", "orbit.dev/acme"], ["Default timezone", "UTC"], ["Default environment", "Production"]].map(([label, value]) => (
              <div key={label}>
                <p className="mb-1 text-[7px] text-zinc-600">{label}</p>
                <div className="flex h-7 items-center rounded border border-white/8 bg-[#0b0d12] px-2 text-[8px] text-zinc-300">{value}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Governance" description="Enforced by the API, not the interface">
          <div className="divide-y divide-white/[0.06]">
            {[
              { title: "Require a pinned host key", on: true },
              { title: "Allow password authentication", on: false },
              { title: "Require deployment approval", on: true },
              { title: "Record terminal sessions", on: true },
            ].map((policy) => (
              <div key={policy.title} className="flex items-center justify-between gap-3 py-2">
                <p className="text-[8px] text-zinc-400">{policy.title}</p>
                <span className={cn("flex h-3.5 w-6 shrink-0 items-center rounded-full px-0.5 transition", policy.on ? "justify-end bg-indigo-500" : "justify-start bg-white/10")}>
                  <span className="size-2.5 rounded-full bg-white" />
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[7px] leading-4 text-zinc-600">
            <ShieldCheck className="mt-px size-2.5 shrink-0" />
            Checked server-side when a connection is created, so they hold whichever client is used.
          </p>
        </Panel>
      </div>
    </>
  );
}

/**
 * Every sidebar destination except Servers, which is the detail view the
 * preview opens on. Keyed by the label so a rename on one side without the
 * other is caught by the test rather than rendering an empty panel.
 */
export const SECTIONS: Record<string, { icon: typeof Gauge; render: () => ReactNode }> = {
  Overview: { icon: Gauge, render: () => <OverviewSection /> },
  Transfers: { icon: CloudUpload, render: () => <TransfersSection /> },
  Deployments: { icon: Rocket, render: () => <DeploymentsSection /> },
  "Backups & restore": { icon: ArchiveRestore, render: () => <BackupsSection /> },
  Terminal: { icon: Terminal, render: () => <TerminalSection /> },
  Runbooks: { icon: ListChecks, render: () => <RunbooksSection /> },
  Automations: { icon: Bot, render: () => <AutomationsSection /> },
  Monitoring: { icon: Activity, render: () => <MonitoringSection /> },
  "Activity & audit": { icon: ShieldCheck, render: () => <ActivitySection /> },
  Notifications: { icon: Bell, render: () => <NotificationsSection /> },
  Team: { icon: Users, render: () => <TeamSection /> },
  Integrations: { icon: Blocks, render: () => <IntegrationsSection /> },
  "API keys": { icon: KeyRound, render: () => <ApiKeysSection /> },
  Usage: { icon: Cpu, render: () => <UsageSection /> },
  "Plan & billing": { icon: CircleDollarSign, render: () => <BillingSection /> },
  Settings: { icon: Blocks, render: () => <SettingsSection /> },
};

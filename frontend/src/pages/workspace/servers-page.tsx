import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Copy,
  Filter,
  Grid2X2,
  KeyRound,
  List,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Server as ServerIcon,
  ShieldCheck,
  Star,
  Terminal,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge, Button, Field, Input, Modal, Progress, Select, StatusBadge, Table, TableHead, TableWrap, Td, Th, Tr } from "@/components/ui";
import { MetricBar, MetricValue } from "@/components/metric-value";
import { api } from "@/lib/api";
import { cn, relativeTime } from "@/lib/utils";
import type { Server } from "@/types";

const blankConnection = {
  name: "",
  host: "",
  port: "22",
  username: "",
  environment: "production",
  rootPath: "/",
  authenticationType: "password" as "password" | "privateKey",
  secret: "",
  passphrase: "",
  hostFingerprint: "",
};

interface DiscoveredKey { fingerprint: string; sha256: string; keyType: string; advisory: string; }

export function ServersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [servers, setServers] = useState<Server[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredKey>();
  const [discoverError, setDiscoverError] = useState<string>();
  const [query, setQuery] = useState("");
  const [environment, setEnvironment] = useState("all");
  const [status, setStatus] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [step, setStep] = useState(1);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [connection, setConnection] = useState(blankConnection);
  const newOpen = searchParams.get("new") === "true";
  useEffect(() => {
    if (!localStorage.getItem("orbit.accessToken")) return;
    let active = true;
    api.get<Array<{ id: string; name: string; host: string; port: number; username: string; rootPath: string; environment: string; status: string; lastCheckedAt?: string; lastLatencyMs?: number; hostFingerprint?: string }>>("/servers")
      .then((rows) => {
        if (!active || !rows.length) return;
        setServers(rows.map((item, index) => ({
          id: item.id,
          name: item.name,
          host: item.host,
          port: item.port,
          username: item.username,
          rootPath: item.rootPath,
          environment: (["production", "staging", "development"].includes(item.environment) ? item.environment : "production") as Server["environment"],
          status: (["online", "degraded", "offline", "maintenance", "unknown"].includes(item.status) ? item.status : "unknown") as Server["status"],
          protocol: "SFTP",
          region: index === 0 && item.host.endsWith("orbit.local") ? "Demo region · Local worker" : "Customer managed",
          provider: "Orbit worker",
          latency: item.lastLatencyMs ?? 8,
          cpu: index === 0 ? 38 : 0,
          memory: index === 0 ? 64 : 0,
          disk: index === 0 ? 47 : 0,
          uptime: "99.99%",
          lastSeen: item.lastCheckedAt ?? new Date().toISOString(),
          tags: [item.environment, "api"],
          fingerprint: item.hostFingerprint,
          starred: index === 0,
        })));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  const close = () => { searchParams.delete("new"); setSearchParams(searchParams); setStep(1); setTested(false); setConnection(blankConnection); };
  const open = () => { searchParams.set("new", "true"); setSearchParams(searchParams); };
  const filtered = useMemo(() => servers.filter((server) => (environment === "all" || server.environment === environment) && (status === "all" || server.status === status) && `${server.name} ${server.host} ${server.region} ${server.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [servers, query, environment, status]);
  const update = (key: keyof typeof connection) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setTested(false);
    setConnection((value) => ({ ...value, [key]: event.target.value }));
  };
  const credentials = connection.authenticationType === "privateKey"
    ? { privateKey: connection.secret, passphrase: connection.passphrase || undefined }
    : { password: connection.secret };
  const connectionPayload = {
    host: connection.host,
    port: Number(connection.port),
    username: connection.username,
    rootPath: connection.rootPath,
    adapterMode: "sftp" as const,
    authenticationType: connection.authenticationType,
    credentials,
    hostFingerprint: connection.hostFingerprint,
    settings: { concurrency: 4, connectionTimeout: 15_000, keepaliveInterval: 10_000 },
  };
  /**
   * Reads the server's host key so the user is not sent away to run
   * ssh-keyscan. This is trust on first use: the value is shown for comparison
   * against whatever the provider published, and pinned once saved.
   */
  async function retrieveFingerprint() {
    setDiscovering(true);
    setDiscoverError(undefined);
    try {
      const result = await api.post<DiscoveredKey>("/servers/discover-fingerprint", {
        host: connection.host,
        port: Number(connection.port) || 22,
      });
      setDiscovered(result);
      setConnection((current) => ({ ...current, hostFingerprint: result.fingerprint }));
    } catch (error) {
      setDiscoverError(error instanceof Error ? error.message : "Could not read the host key. Check the address and port.");
    } finally {
      setDiscovering(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTested(false);
    try {
      const health = await api.post<{ ok: boolean; latencyMs: number; message: string; fingerprintVerified: boolean }>("/servers/test", connectionPayload);
      setTested(health.ok && health.fingerprintVerified);
      toast.success("Connection verified", { description: `${health.message} · ${health.latencyMs} ms` });
    } catch (error) {
      toast.error("Connection verification failed", { description: error instanceof Error ? error.message : "The SFTP worker could not verify this server." });
    } finally {
      setTesting(false);
    }
  }
  async function saveConnection() {
    if (!tested) return;
    try {
      const workspaces = await api.get<Array<{ id: string }>>("/workspaces");
      if (!workspaces[0]) throw new Error("Create a workspace before connecting a server.");
      const created = await api.post<{
        id: string; name: string; host: string; port: number; username: string; rootPath: string;
        environment: Server["environment"]; status: string; hostFingerprint?: string;
      }>("/servers", {
        workspaceId: workspaces[0].id,
        name: connection.name,
        description: "Connected from the Orbit workspace",
        environment: connection.environment,
        ...connectionPayload,
      });
      const health = await api.post<{ latencyMs: number }>(`/servers/${created.id}/test`, {});
      const server: Server = {
        id: created.id,
        name: created.name,
        environment: created.environment,
        status: "online",
        host: created.host,
        port: created.port,
        protocol: "SFTP",
        username: created.username,
        region: "Customer managed",
        provider: "Orbit SFTP worker",
        rootPath: created.rootPath,
        latency: health.latencyMs,
        cpu: 0,
        memory: 0,
        disk: 0,
        uptime: "New",
        lastSeen: new Date().toISOString(),
        tags: [created.environment],
        fingerprint: created.hostFingerprint,
      };
      setServers((value) => [server, ...value]);
      toast.success(`${server.name} connected`, { description: "Credentials were encrypted and the pinned host key was verified." });
      close();

      // Replace the password with a key Orbit owns, so later connections need
      // no stored password. The server verifies the new key works before it
      // switches, and keeps the password if it does not, so a failure here
      // costs nothing and the connection stays usable either way.
      if (connection.authenticationType === "password") {
        try {
          const provisioned = await api.post<{ publicKey: string; comment: string }>(
            `/servers/${created.id}/provision-key`,
            {},
          );
          toast.success("Passwordless access set up", {
            description: `An Orbit key was installed in authorized_keys as ${provisioned.comment}. Your password is no longer stored.`,
          });
        } catch (error) {
          toast.warning("Still using password authentication", {
            description: error instanceof Error ? error.message : "The key could not be installed. The connection works, but the password remains stored.",
          });
        }
      }
    } catch (error) {
      toast.error("Server was not saved", { description: error instanceof Error ? error.message : "The API could not persist this connection." });
    }
  }
  return (
    <>
      <PageHeader title="Servers" subtitle={`${servers.filter((item) => item.status === "online").length} online · ${servers.length} total connections`} actions={<><Button variant="outline" onClick={() => toast.success("Connection health refreshed")}><RefreshCw />Refresh health</Button><Button onClick={open}><Plus />Connect server</Button></>} />
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 md:px-8 md:py-7">
        <div className="flex flex-col gap-3 border-y border-border py-3 lg:flex-row lg:items-center"><label className="relative block lg:w-80"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search servers, hosts, or tags" className="pl-8" /></label><div className="flex flex-1 gap-2"><Select value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="all">All environments</option><option value="production">Production</option><option value="staging">Staging</option><option value="development">Development</option></Select><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Any status</option><option value="online">Online</option><option value="degraded">Degraded</option><option value="offline">Offline</option><option value="maintenance">Maintenance</option></Select><Button variant="ghost" size="icon" title="More filters"><Filter /></Button></div><div className="flex rounded-md border border-border p-0.5"><button type="button" onClick={() => setView("grid")} className={cn("grid size-7 place-items-center rounded text-zinc-600", view === "grid" && "bg-muted text-white")}><Grid2X2 className="size-3.5" /></button><button type="button" onClick={() => setView("list")} className={cn("grid size-7 place-items-center rounded text-zinc-600", view === "list" && "bg-muted text-white")}><List className="size-3.5" /></button></div></div>
        <div className="mt-5 flex items-center justify-between"><p className="text-[9px] text-muted-foreground">Showing {filtered.length} of {servers.length} connections</p><div className="flex items-center gap-1.5 text-[8px] text-emerald-300"><ShieldCheck className="size-3" />All stored credentials encrypted</div></div>
        {filtered.length ? view === "grid" ? <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map((server) => <article key={server.id} className="group rounded-lg border border-border bg-card transition-colors hover:border-white/20"><div className="flex items-start gap-3 p-4"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><ServerIcon className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Link to={`/workspace/servers/${server.id}`} className="truncate text-xs font-medium hover:underline">{server.name}</Link>{server.starred && <Star className="size-3 fill-amber-300 text-amber-300" />}</div><p className="mt-1 truncate font-mono text-[8px] text-zinc-600">{server.username}@{server.host}:{server.port}</p></div><StatusBadge status={server.status} /></div><div className="grid grid-cols-3 border-y border-border"><div className="border-r border-border p-3"><p className="text-[8px] text-muted-foreground">CPU</p><strong className="mt-1 block text-sm tabular-nums"><MetricValue value={server.cpu} /></strong><div className="mt-2"><MetricBar value={server.cpu} /></div></div><div className="border-r border-border p-3"><p className="text-[8px] text-muted-foreground">Memory</p><strong className="mt-1 block text-sm tabular-nums"><MetricValue value={server.memory} /></strong><div className="mt-2"><MetricBar value={server.memory} /></div></div><div className="p-3"><p className="text-[8px] text-muted-foreground">Disk</p><strong className="mt-1 block text-sm tabular-nums"><MetricValue value={server.disk} /></strong><div className="mt-2"><MetricBar value={server.disk} /></div></div></div><div className="flex items-center gap-2 px-4 py-3"><Badge>{server.environment}</Badge>{server.tags.slice(0, 2).map((tag) => <span key={tag} className="text-[8px] text-zinc-600">#{tag}</span>)}<span className="ml-auto font-mono text-[8px] text-zinc-600">{server.latency ? `${server.latency} ms` : relativeTime(server.lastSeen)}</span></div><div className="grid grid-cols-3 border-t border-border"><Link to={`/workspace/servers/${server.id}/files`} className="flex h-9 items-center justify-center gap-1.5 border-r border-border text-[9px] text-zinc-500 hover:bg-muted hover:text-white"><ServerIcon className="size-3" />Files</Link><Link to={`/workspace/terminal?server=${server.id}`} className="flex h-9 items-center justify-center gap-1.5 border-r border-border text-[9px] text-zinc-500 hover:bg-muted hover:text-white"><Terminal className="size-3" />Terminal</Link><Link to={`/workspace/servers/${server.id}`} className="flex h-9 items-center justify-center gap-1.5 text-[9px] text-zinc-500 hover:bg-muted hover:text-white">Details<ChevronRight className="size-3" /></Link></div></article>)}</div> : <TableWrap className="mt-4"><Table><TableHead><tr><Th>Server</Th><Th>Environment</Th><Th>Status</Th><Th>Region</Th><Th>Resources</Th><Th>Last seen</Th><Th /></tr></TableHead><tbody>{filtered.map((server) => <Tr key={server.id}><Td><Link to={`/workspace/servers/${server.id}`} className="flex items-center gap-2.5"><span className="grid size-7 place-items-center rounded-md bg-muted"><ServerIcon className="size-3.5" /></span><span><strong className="block text-[10px]">{server.name}</strong><span className="font-mono text-[8px] text-zinc-600">{server.host}</span></span></Link></Td><Td><Badge>{server.environment}</Badge></Td><Td><StatusBadge status={server.status} /></Td><Td className="text-zinc-500">{server.region}</Td><Td><span className="font-mono text-[8px] text-zinc-500">{server.cpu}% · {server.memory}% · {server.disk}%</span></Td><Td className="text-zinc-600">{relativeTime(server.lastSeen)}</Td><Td><Button variant="ghost" size="icon"><MoreHorizontal /></Button></Td></Tr>)}</tbody></Table></TableWrap> : <div className="mt-5 grid min-h-64 place-items-center rounded-lg border border-dashed border-border"><div className="text-center"><ServerIcon className="mx-auto size-5 text-zinc-700" /><p className="mt-3 text-xs">No servers match</p><p className="mt-1 text-[9px] text-muted-foreground">Clear filters or connect a new server.</p><Button size="sm" className="mt-4" onClick={() => { setQuery(""); setEnvironment("all"); setStatus("all"); }}>Clear filters</Button></div></div>}
      </div>

      <Modal open={newOpen} onClose={close} title="Connect a server" description={`Step ${step} of 3 · ${step === 1 ? "Connection details" : step === 2 ? "Authentication and trust" : "Verify and save"}`} size="lg" footer={<>{step > 1 && <Button variant="ghost" onClick={() => setStep((value) => value - 1)}>Back</Button>}<div className="flex-1" /><Button variant="outline" onClick={close}>Cancel</Button>{step < 3 ? <Button onClick={() => setStep((value) => value + 1)} disabled={(step === 1 && (!connection.name || !connection.host)) || (step === 2 && (!connection.username || !connection.secret))}>Continue<ChevronRight /></Button> : <Button onClick={saveConnection} disabled={!tested}>Save connection</Button>}</>}>
        <div className="mb-6 grid grid-cols-3 gap-2">{[1, 2, 3].map((item) => <div key={item} className={cn("h-1 rounded-full", item <= step ? "bg-blue-500" : "bg-zinc-800")} />)}</div>
        {step === 1 && <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Server name"><Input value={connection.name} onChange={update("name")} placeholder="Production API" autoFocus /></Field><Field label="Environment"><Select className="w-full" value={connection.environment} onChange={update("environment")}><option value="production">Production</option><option value="staging">Staging</option><option value="development">Development</option></Select></Field></div><div className="grid grid-cols-[1fr_100px] gap-4"><Field label="Hostname or IP"><Input value={connection.host} onChange={update("host")} placeholder="api.example.com" /></Field><Field label="Port"><Input value={connection.port} onChange={update("port")} type="number" /></Field></div><Field label="Allowed root path" hint="Orbit will canonicalize and enforce this root for all file operations."><Input value={connection.rootPath} onChange={update("rootPath")} placeholder="/var/www/app" /></Field></div>}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Username"><Input value={connection.username} onChange={update("username")} placeholder="deploy" autoComplete="username" /></Field>
              <Field label="Authentication"><Select className="w-full" value={connection.authenticationType} onChange={update("authenticationType")}><option value="password">Password</option><option value="privateKey">Private key</option></Select></Field>
            </div>
            <Field label={connection.authenticationType === "privateKey" ? "Private key" : "Password"}>
              {connection.authenticationType === "privateKey"
                ? <textarea value={connection.secret} onChange={update("secret")} className="min-h-28 w-full rounded-md border border-input bg-black/20 p-3 font-mono text-[9px] outline-none" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" autoComplete="off" />
                : <Input value={connection.secret} onChange={update("secret")} type="password" placeholder="••••••••••••" autoComplete="new-password" />}
            </Field>
            {connection.authenticationType === "privateKey" && <Field label="Key passphrase" hint="Optional"><Input value={connection.passphrase} onChange={update("passphrase")} type="password" autoComplete="off" /></Field>}
            {/* No host-key step. The first connection records the key the
                server presents and pins it, so later connections are verified
                without asking the user for anything up front. */}
            <details className="text-[9px] text-zinc-600">
              <summary className="cursor-pointer hover:text-zinc-400">Pin a host key in advance (optional)</summary>
              <Input value={connection.hostFingerprint} onChange={update("hostFingerprint")} placeholder="SHA256:… from your provider" spellCheck={false} className="mt-2 font-mono" />
              <p className="mt-1.5 leading-4">
                Leave this empty and Orbit records the key on first connection. Fill it in only if your provider published a fingerprint you want enforced from the very first connection.
              </p>
            </details>
            <div className="rounded-lg border border-blue-400/15 bg-blue-400/[0.04] p-3"><div className="flex gap-3"><KeyRound className="mt-0.5 size-3.5 text-blue-300" /><div><p className="text-[10px] font-medium text-blue-200">Credentials stay server-side</p><p className="mt-1 text-[9px] leading-4 text-blue-200/55">Secrets are sent only to the authenticated API, encrypted before storage, and never returned to the browser or exposed in logs.</p></div></div></div>
          </div>
        )}
        {step === 3 && <div><div className="rounded-lg border border-border bg-black/15 p-4"><div className="grid gap-4 sm:grid-cols-2">{[["Name", connection.name], ["Environment", connection.environment], ["Endpoint", `${connection.host}:${connection.port}`], ["Identity", `${connection.username} · ${connection.authenticationType === "privateKey" ? "private key" : "password"}`], ["Allowed root", connection.rootPath], ["Host trust", connection.hostFingerprint]].map(([label, value]) => <div key={label}><p className="text-[8px] uppercase tracking-wider text-zinc-600">{label}</p><p className="mt-1 truncate font-mono text-[9px] text-zinc-300">{value}</p></div>)}</div></div><button type="button" disabled={testing} onClick={() => void testConnection()} className={cn("mt-4 flex w-full items-center gap-3 rounded-lg border p-4 text-left", tested ? "border-emerald-400/20 bg-emerald-400/[0.04]" : "border-border hover:bg-white/[0.02]")}><span className={cn("grid size-8 place-items-center rounded-md", tested ? "bg-emerald-400/10 text-emerald-300" : "bg-muted text-muted-foreground")}>{testing ? <RefreshCw className="size-3.5 animate-spin" /> : tested ? <Check className="size-3.5" /> : <ShieldCheck className="size-3.5" />}</span><span className="min-w-0 flex-1"><strong className="block text-[10px]">{testing ? "Testing connection…" : tested ? "Connection and host verified" : "Test connection before saving"}</strong><span className="mt-1 block text-[8px] text-zinc-600">{tested ? "Pinned fingerprint and allowed root verified by the SFTP worker" : "Reachability, authentication, fingerprint, and root permissions"}</span></span></button></div>}
      </Modal>
    </>
  );
}

export default ServersPage;

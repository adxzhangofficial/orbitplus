import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUpToLine,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  Copy,
  Download,
  Eye,
  File,
  FileCode2,
  FileDiff,
  FilePlus2,
  Folder,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  GitCompare,
  History,
  Info,
  ListFilter,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge, Breadcrumbs, Button, Field, IconButton, Input, Modal, Progress, SearchInput, Tabs } from "@/components/ui";
import { remoteFiles, sampleFileContent, servers } from "@/lib/mock-data";
import { api } from "@/lib/api";
import { cn, formatBytes, relativeTime } from "@/lib/utils";
import type { RemoteFile } from "@/types";

const folderTree = [
  { name: "api", open: true, children: [{ name: ".github" }, { name: "config", children: [{ name: "environments" }, { name: "services" }] }, { name: "public" }, { name: "src", open: true, children: [{ name: "controllers" }, { name: "lib" }, { name: "routes" }, { name: "services" }] }, { name: "storage", children: [{ name: "logs" }, { name: "uploads" }] }] },
];

const versions = [
  { id: "v_194", author: "Adeel Khan", label: "Current version", createdAt: new Date(Date.now() - 6 * 60_000).toISOString(), size: 6844, change: "+8 −2", reason: "Raise graceful shutdown timeout" },
  { id: "v_193", author: "CI Pipeline", label: "Deployment 4f32c1a", createdAt: new Date(Date.now() - 47 * 60_000).toISOString(), size: 6721, change: "+21 −9", reason: "Production release" },
  { id: "v_192", author: "Sara Malik", label: "Manual save", createdAt: new Date(Date.now() - 390 * 60_000).toISOString(), size: 6398, change: "+4 −4", reason: "Update server lifecycle" },
  { id: "v_191", author: "Adeel Khan", label: "Pre-deploy snapshot", createdAt: new Date(Date.now() - 1_455 * 60_000).toISOString(), size: 6320, change: "+12 −1", reason: "Before 4f32c1a" },
];

function TreeItem({ item, level = 0 }: { item: { name: string; open?: boolean; children?: Array<{ name: string; open?: boolean; children?: Array<{ name: string }> }> }; level?: number }) {
  const [open, setOpen] = useState(Boolean(item.open));
  return <div><button type="button" onClick={() => setOpen((value) => !value)} className={cn("flex h-7 w-full items-center gap-1.5 rounded px-1.5 text-left text-[9px] text-zinc-500 hover:bg-muted hover:text-zinc-200", item.name === "src" && "bg-muted/60 text-zinc-200")} style={{ paddingLeft: `${6 + level * 13}px` }}>{item.children ? open ? <ChevronDown className="size-3 shrink-0 text-zinc-600" /> : <ChevronRight className="size-3 shrink-0 text-zinc-600" /> : <span className="w-3" />} {open ? <FolderOpen className="size-3.5 shrink-0 text-blue-300" /> : <Folder className="size-3.5 shrink-0 text-zinc-500" />}<span className="truncate">{item.name}</span></button>{open && item.children?.map((child) => <TreeItem key={child.name} item={child} level={level + 1} />)}</div>;
}

export function FileExplorerPage() {
  const { serverId = "srv_prod_01" } = useParams();
  const [server, setServer] = useState(() => servers.find((item) => item.id === serverId) ?? servers[0]);
  const [files, setFiles] = useState(remoteFiles);
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(true);
  const [selected, setSelected] = useState<RemoteFile | undefined>(() => remoteFiles.find((file) => file.name === "server.ts"));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [panel, setPanel] = useState(true);
  const [tab, setTab] = useState("editor");
  const [content, setContent] = useState(sampleFileContent);
  const [savedContent, setSavedContent] = useState(sampleFileContent);
  const [remoteChecksum, setRemoteChecksum] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState<"file" | "folder" | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(true);
  const unsaved = content !== savedContent;
  const visibleFiles = useMemo(() => files.filter((file) => (showHidden || !file.name.startsWith(".")) && file.name.toLowerCase().includes(query.toLowerCase())), [files, showHidden, query]);
  const lineCount = content.split("\n").length;

  useEffect(() => {
    if (!localStorage.getItem("orbit.accessToken")) return;
    let active = true;
    Promise.all([
      api.get<{ id: string; name: string; host: string; port: number; username: string; rootPath: string; environment: ServerEnvironment; status: string; lastLatencyMs?: number; hostFingerprint?: string }>(`/servers/${serverId}`),
      api.get<Array<{ name: string; path: string; type: string; size: number; permissions?: string; modifiedAt: string }>>(`/servers/${serverId}/files?path=/`),
    ]).then(([remoteServer, entries]) => {
      if (!active) return;
      setServer({ id: remoteServer.id, name: remoteServer.name, host: remoteServer.host, port: remoteServer.port, username: remoteServer.username, rootPath: remoteServer.rootPath, environment: remoteServer.environment, status: remoteServer.status === "offline" ? "offline" : "online", protocol: "SFTP", region: "Demo region · Local worker", provider: "Orbit worker", latency: remoteServer.lastLatencyMs ?? 8, cpu: 38, memory: 64, disk: 47, uptime: "99.99%", lastSeen: new Date().toISOString(), tags: [remoteServer.environment], fingerprint: remoteServer.hostFingerprint });
      setFiles(entries.map((entry, index) => ({ id: `remote_${index}_${entry.path}`, name: entry.name, path: entry.path, type: entry.type === "directory" ? "directory" : entry.type === "symlink" ? "symlink" : "file", size: entry.size, permissions: entry.permissions ?? (entry.type === "directory" ? "755" : "644"), modifiedAt: entry.modifiedAt, owner: remoteServer.username, extension: entry.name.includes(".") ? entry.name.split(".").pop() : undefined })));
      setSelected(undefined);
      setPanel(false);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [serverId]);

  async function openFile(file: RemoteFile) {
    if (file.type === "directory") { toast.info(`Opened ${file.name}`); return; }
    if (unsaved && selected?.id !== file.id && !window.confirm("Discard unsaved changes?")) return;
    let nextContent = file.name === "server.ts" ? sampleFileContent : file.name.endsWith("json") ? `{\n  "name": "orbit-service",\n  "private": true,\n  "version": "1.0.0"\n}` : `# ${file.name}\n\nRemote file preview loaded safely from ${server.name}.`;
    if (localStorage.getItem("orbit.accessToken")) {
      try {
        const remote = await api.get<{ content: string; encoding: "utf8" | "base64"; checksum: string }>(`/servers/${serverId}/files/content?path=${encodeURIComponent(file.path)}`);
        nextContent = remote.encoding === "base64" ? "Binary file preview is not editable." : remote.content;
        setRemoteChecksum(remote.checksum);
      } catch { setRemoteChecksum(undefined); }
    }
    setSelected(file); setPanel(true); setTab("editor"); setContent(nextContent); setSavedContent(nextContent);
  }
  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      if (localStorage.getItem("orbit.accessToken")) {
        const result = await api.put<{ checksum: string; versionNumber: number }>(`/servers/${serverId}/files/content`, { path: selected.path, content, encoding: "utf8", expectedChecksum: remoteChecksum, note: "Edited in Orbit web workspace" });
        setRemoteChecksum(result.checksum);
        toast.success(`${selected.name} saved atomically`, { description: `Version ${result.versionNumber} created · checksum verified` });
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        toast.success(`${selected.name} saved atomically`, { description: "Version v_195 created · checksum verified" });
      }
      setSavedContent(content);
    } catch (error) {
      toast.error("Save paused", { description: error instanceof Error ? error.message : "The remote revision changed." });
    } finally { setSaving(false); }
  }
  async function create() {
    if (!newName.trim() || !createOpen) return;
    const next: RemoteFile = { id: `f_${Date.now()}`, name: newName.trim(), path: `${server.rootPath}/${newName.trim()}`, type: createOpen === "folder" ? "directory" : "file", size: 0, permissions: createOpen === "folder" ? "drwxr-xr-x" : "-rw-r--r--", modifiedAt: new Date().toISOString(), owner: server.username, extension: newName.split(".").pop(), gitStatus: "untracked" };
    try {
      if (localStorage.getItem("orbit.accessToken")) {
        if (createOpen === "folder") await api.post(`/servers/${serverId}/files/directory`, { path: next.path });
        else await api.put(`/servers/${serverId}/files/content`, { path: next.path, content: "", encoding: "utf8", note: "Created in Orbit web workspace" });
      }
      setFiles((value) => [...value, next]); setNewName(""); setCreateOpen(null); toast.success(`${createOpen === "folder" ? "Folder" : "File"} created`);
    } catch (error) { toast.error("Could not create item", { description: error instanceof Error ? error.message : undefined }); }
  }
  function removeSelected() {
    const ids = selectedIds.length ? selectedIds : selected ? [selected.id] : [];
    setFiles((value) => value.filter((file) => !ids.includes(file.id))); setSelectedIds([]); if (selected && ids.includes(selected.id)) { setSelected(undefined); setPanel(false); } setDeleteOpen(false); toast.success(`${ids.length} item${ids.length === 1 ? "" : "s"} moved to recycle bin`);
  }
  return (
    <div className="flex h-[calc(100vh-56px)] min-h-[640px] flex-col md:h-screen">
      <header className="flex min-h-14 items-center gap-3 border-b border-border px-3 sm:px-4"><Link to={`/workspace/servers/${server.id}`} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft className="size-3.5" /></Link><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate text-xs font-medium">{server.name}</h1><Badge tone="success" dot>Connected</Badge></div><p className="mt-0.5 hidden font-mono text-[8px] text-zinc-600 sm:block">{server.username}@{server.host} · SFTP</p></div><div className="hidden items-center gap-2 sm:flex"><Button variant="outline" size="sm" onClick={() => toast.success("Directory refreshed")}><RefreshCw />Refresh</Button><Button variant="outline" size="sm" onClick={() => toast.info("Sync planner opened")}><ArrowRightLeft />Sync</Button><Button size="sm" onClick={() => toast.info("Choose files to upload")}><Upload />Upload</Button></div><IconButton label="More actions"><MoreHorizontal /></IconButton></header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-sidebar/50 lg:flex"><div className="flex h-10 items-center justify-between border-b border-border px-3"><span className="text-[8px] font-medium uppercase tracking-wider text-zinc-600">Remote explorer</span><IconButton label="New folder" className="size-6" onClick={() => setCreateOpen("folder")}><FolderPlus /></IconButton></div><div className="flex-1 overflow-y-auto p-2">{folderTree.map((item) => <TreeItem key={item.name} item={item} />)}<div className="mt-4 border-t border-border pt-3"><button type="button" className="flex h-7 w-full items-center gap-2 rounded px-2 text-[9px] text-zinc-600 hover:bg-muted hover:text-zinc-300"><Star className="size-3.5" />Favorites</button><button type="button" className="flex h-7 w-full items-center gap-2 rounded px-2 text-[9px] text-zinc-600 hover:bg-muted hover:text-zinc-300"><Clock3 className="size-3.5" />Recent files</button><button type="button" className="flex h-7 w-full items-center gap-2 rounded px-2 text-[9px] text-zinc-600 hover:bg-muted hover:text-zinc-300"><Trash2 className="size-3.5" />Recycle bin</button></div></div><div className="border-t border-border p-3"><div className="flex items-center gap-2 text-[8px] text-emerald-300"><ShieldCheck className="size-3" />Root scope enforced</div><p className="mt-1 truncate font-mono text-[7px] text-zinc-700">{server.rootPath}</p></div></aside>

        <main className={cn("flex min-w-0 flex-1 flex-col", panel && "xl:border-r xl:border-border")}>
          <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-border px-3"><Breadcrumbs items={[{ label: "root" }, { label: "var" }, { label: "www" }, { label: "api" }]} /><div className="ml-auto flex items-center gap-1"><SearchInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter current folder" containerClassName="hidden w-48 sm:block" className="h-7 text-[9px]" /><IconButton label="Filter" className="size-7"><ListFilter /></IconButton><IconButton label="New file" className="size-7" onClick={() => setCreateOpen("file")}><FilePlus2 /></IconButton><IconButton label="New folder" className="size-7" onClick={() => setCreateOpen("folder")}><FolderPlus /></IconButton></div></div>
          {selectedIds.length > 0 && <div className="flex min-h-10 items-center gap-2 border-b border-blue-400/15 bg-blue-400/[0.04] px-3"><span className="text-[9px] text-blue-200">{selectedIds.length} selected</span><Button size="xs" variant="ghost"><Download />Download</Button><Button size="xs" variant="ghost"><Archive />Archive</Button><Button size="xs" variant="ghost" onClick={() => setDeleteOpen(true)}><Trash2 />Delete</Button><button type="button" className="ml-auto text-blue-300" onClick={() => setSelectedIds([])}><X className="size-3.5" /></button></div>}
          <div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[690px] border-collapse text-left text-[9px]"><thead className="sticky top-0 z-10 border-b border-border bg-[#0d0e10]/95 text-[8px] uppercase tracking-wider text-zinc-600 backdrop-blur"><tr><th className="w-10 px-3 py-2"><input type="checkbox" checked={selectedIds.length === visibleFiles.length && visibleFiles.length > 0} onChange={(event) => setSelectedIds(event.target.checked ? visibleFiles.map((file) => file.id) : [])} className="size-3 accent-blue-500" /></th><th className="py-2">Name</th><th>Size</th><th>Permissions</th><th>Owner</th><th>Modified</th><th className="w-10" /></tr></thead><tbody>{visibleFiles.map((file) => <tr key={file.id} onDoubleClick={() => openFile(file)} className={cn("border-b border-border/70 hover:bg-white/[0.025]", selected?.id === file.id && "bg-blue-400/[0.045]")}><td className="px-3 py-2.5"><input type="checkbox" checked={selectedIds.includes(file.id)} onChange={(event) => setSelectedIds((value) => event.target.checked ? [...value, file.id] : value.filter((id) => id !== file.id))} className="size-3 accent-blue-500" /></td><td><button type="button" onClick={() => openFile(file)} className="flex max-w-[280px] items-center gap-2.5 text-left"><span className={cn("grid size-7 shrink-0 place-items-center rounded-md bg-muted", file.type === "directory" ? "text-blue-300" : "text-zinc-500")}>{file.type === "directory" ? <Folder className="size-3.5" /> : file.extension === "ts" ? <FileCode2 className="size-3.5" /> : <File className="size-3.5" />}</span><span className="truncate text-zinc-300">{file.name}</span>{file.gitStatus && <span className={cn("size-1.5 shrink-0 rounded-full", file.gitStatus === "modified" ? "bg-amber-400" : "bg-emerald-400")} title={file.gitStatus} />}</button></td><td className="font-mono text-[8px] text-zinc-600">{file.type === "directory" ? "—" : formatBytes(file.size)}</td><td className="font-mono text-[8px] text-zinc-600">{file.permissions}</td><td className="text-zinc-600">{file.owner}</td><td className="text-zinc-600">{relativeTime(file.modifiedAt)}</td><td><IconButton label={`Actions for ${file.name}`} className="size-7"><MoreHorizontal /></IconButton></td></tr>)}</tbody></table>{!visibleFiles.length && <div className="grid min-h-64 place-items-center text-center"><div><Search className="mx-auto size-5 text-zinc-700" /><p className="mt-3 text-xs">No matching files</p><button type="button" onClick={() => setQuery("")} className="mt-2 text-[9px] text-blue-400">Clear filter</button></div></div>}</div>
          <footer className="flex h-7 items-center gap-4 border-t border-border px-3 text-[7px] text-zinc-700"><span>{visibleFiles.filter((item) => item.type === "directory").length} folders</span><span>{visibleFiles.filter((item) => item.type === "file").length} files</span><label className="ml-auto flex items-center gap-1.5"><input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} className="size-2.5 accent-blue-500" />Show hidden</label><span>UTF-8</span></footer>
        </main>

        {panel && selected && <aside className="fixed inset-0 z-50 flex min-w-0 flex-col bg-background sm:left-auto sm:w-[560px] sm:border-l sm:border-border xl:static xl:z-auto xl:w-[46%] xl:max-w-[720px] xl:bg-card/20"><header className="flex min-h-11 items-center gap-2 border-b border-border px-3"><FileCode2 className="size-3.5 text-blue-300" /><span className="min-w-0 flex-1 truncate text-[10px] font-medium">{selected.name}</span>{unsaved && <Badge tone="warning">Unsaved</Badge>}<IconButton label="Close editor" className="size-7" onClick={() => { if (!unsaved || window.confirm("Discard unsaved changes?")) setPanel(false); }}><X /></IconButton></header><Tabs value={tab} onChange={setTab} items={[{ value: "editor", label: "Editor" }, { value: "diff", label: "Changes", count: unsaved ? 1 : 0 }, { value: "history", label: "History", count: versions.length }, { value: "info", label: "Details" }]} />
          {tab === "editor" && <div className="flex min-h-0 flex-1 flex-col"><div className="flex min-h-10 items-center gap-1 border-b border-border px-2"><IconButton label="Save" className="size-7" onClick={save}><Save /></IconButton><IconButton label="Compare" className="size-7" onClick={() => setTab("diff")}><GitCompare /></IconButton><IconButton label="History" className="size-7" onClick={() => setTab("history")}><History /></IconButton><span className="mx-1 h-4 w-px bg-border" /><span className="text-[7px] text-zinc-700">TypeScript · UTF-8 · LF</span><div className="ml-auto flex gap-1"><Button size="xs" variant="ghost" onClick={() => setContent(savedContent)} disabled={!unsaved}>Discard</Button><Button size="xs" onClick={save} loading={saving} disabled={!unsaved}><Save />Save atomically</Button></div></div><div className="relative min-h-0 flex-1 overflow-hidden bg-[#0b0c0e]"><div className="pointer-events-none absolute inset-y-0 left-0 w-10 border-r border-white/[0.045] bg-black/10 py-3 text-right font-mono text-[8px] leading-5 text-zinc-800">{Array.from({ length: lineCount }, (_, index) => <div key={index} className="pr-2">{index + 1}</div>)}</div><textarea value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} className="absolute inset-0 resize-none bg-transparent py-3 pl-12 pr-3 font-mono text-[9px] leading-5 text-zinc-400 outline-none" /></div><footer className="flex h-7 items-center gap-3 border-t border-border px-3 text-[7px] text-zinc-700"><span>Ln {lineCount}, Col 1</span><span>{formatBytes(new Blob([content]).size)}</span><span className="ml-auto flex items-center gap-1 text-emerald-400"><ShieldCheck className="size-2.5" />revision locked</span></footer></div>}
          {tab === "diff" && <div className="min-h-0 flex-1 overflow-auto p-3"><div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-medium">Working copy ↔ remote</p><p className="mt-0.5 text-[8px] text-zinc-600">Content and revision comparison</p></div><Badge tone={unsaved ? "warning" : "success"}>{unsaved ? "1 file changed" : "No changes"}</Badge></div>{unsaved ? <pre className="overflow-x-auto rounded-lg border border-border bg-[#0b0c0e] p-4 font-mono text-[8px] leading-5"><span className="text-zinc-600">@@ -8,6 +8,8 @@</span>{"\n"}<span className="text-red-300">-server.close(() =&gt; process.exit(0));</span>{"\n"}<span className="bg-emerald-400/5 text-emerald-300">+server.close(() =&gt; &#123;</span>{"\n"}<span className="bg-emerald-400/5 text-emerald-300">+  process.exit(0);</span>{"\n"}<span className="bg-emerald-400/5 text-emerald-300">+&#125;);</span></pre> : <div className="grid min-h-52 place-items-center rounded-lg border border-dashed border-border text-center"><div><Check className="mx-auto size-5 text-emerald-400" /><p className="mt-3 text-xs">Working copy matches remote</p><p className="mt-1 text-[9px] text-zinc-600">Revision v_194 · checksum verified</p></div></div>}<div className="mt-3 rounded-md border border-blue-400/15 bg-blue-400/[0.04] p-3 text-[8px] leading-4 text-blue-200/60">Orbit rechecks the remote revision immediately before saving. If another operator changed the file, your save pauses for conflict resolution.</div></div>}
          {tab === "history" && <div className="min-h-0 flex-1 overflow-y-auto"><div className="p-3"><p className="text-[10px] font-medium">Version history</p><p className="mt-1 text-[8px] text-zinc-600">Every safe save and pre-change recovery point</p></div><div className="divide-y divide-border border-y border-border">{versions.map((version, index) => <article key={version.id} className="p-3 hover:bg-white/[0.02]"><div className="flex items-start gap-3"><span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", index === 0 ? "bg-blue-400/10 text-blue-300" : "bg-muted text-muted-foreground")}><History className="size-3" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-[10px] font-medium">{version.label}</p>{index === 0 && <Badge tone="info">Current</Badge>}</div><p className="mt-1 text-[8px] text-zinc-600">{version.author} · {relativeTime(version.createdAt)}</p><p className="mt-2 text-[9px] text-zinc-400">{version.reason}</p><div className="mt-2 flex gap-3 font-mono text-[7px] text-zinc-700"><span>{version.id}</span><span>{formatBytes(version.size)}</span><span>{version.change}</span></div></div>{index > 0 && <div className="flex gap-1"><IconButton label="Compare version" className="size-7" onClick={() => setTab("diff")}><FileDiff /></IconButton><IconButton label="Restore version" className="size-7" onClick={() => toast.success(`Restored ${version.id}`, { description: "A new version was created; history was preserved." })}><RefreshCw /></IconButton></div>}</div></article>)}</div></div>}
          {tab === "info" && <div className="min-h-0 flex-1 overflow-y-auto p-4"><div className="rounded-lg border border-border"><div className="divide-y divide-border">{[["Path", selected.path], ["Size", formatBytes(selected.size)], ["Permissions", selected.permissions], ["Owner", selected.owner], ["Modified", new Date(selected.modifiedAt).toLocaleString()], ["Encoding", "UTF-8"], ["Line endings", "LF"], ["Checksum", "sha256:8af31b…d921"]].map(([label, value]) => <div key={label} className="grid grid-cols-[90px_1fr] gap-3 px-3 py-3 text-[8px]"><span className="text-zinc-600">{label}</span><span className="break-all font-mono text-zinc-300">{value}</span></div>)}</div></div><div className="mt-3 grid grid-cols-2 gap-2"><Button variant="outline" size="sm"><ArrowDownToLine />Download</Button><Button variant="outline" size="sm"><Copy />Copy path</Button><Button variant="outline" size="sm"><Pencil />Rename</Button><Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}><Trash2 />Recycle</Button></div></div>}
        </aside>}
      </div>

      {transferOpen && <div className="fixed bottom-3 left-3 right-3 z-40 rounded-lg border border-blue-400/20 bg-[#15161a]/95 p-3 shadow-2xl shadow-black/50 backdrop-blur md:left-60 xl:right-auto xl:w-[390px]"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-md bg-blue-400/10 text-blue-300"><ArrowUpToLine className="size-3.5" /></span><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="truncate text-[9px] font-medium">release-2026.07.19.tar.gz</p><span className="text-[8px] text-blue-300">68%</span></div><Progress value={68} className="mt-2 h-1" indicatorClassName="bg-blue-400" /><p className="mt-1.5 text-[7px] text-zinc-600">148 MB / 217 MB · 18.4 MB/s · 4 sec remaining</p></div><IconButton label="Close transfer" className="size-7" onClick={() => setTransferOpen(false)}><X /></IconButton></div></div>}

      <Modal open={Boolean(createOpen)} onClose={() => setCreateOpen(null)} title={`Create ${createOpen ?? "item"}`} description={`Inside ${server.rootPath}`} size="sm" footer={<><Button variant="outline" onClick={() => setCreateOpen(null)}>Cancel</Button><Button onClick={create}>Create</Button></>}><Field label={createOpen === "folder" ? "Folder name" : "File name"}><Input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && create()} placeholder={createOpen === "folder" ? "new-folder" : "config.ts"} /></Field><p className="mt-3 text-[8px] text-zinc-600">Permissions will use the server profile default and can be changed after creation.</p></Modal>
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Move to recycle bin?" description="This action is recoverable until the workspace retention period expires." size="sm" footer={<><Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="danger" onClick={removeSelected}><Trash2 />Move to recycle bin</Button></>}><div className="rounded-md border border-border bg-black/20 p-3 text-[9px] text-zinc-400">{selectedIds.length ? `${selectedIds.length} selected items` : selected?.name ?? "Selected item"}</div></Modal>
    </div>
  );
}

type ServerEnvironment = "production" | "staging" | "development";

export default FileExplorerPage;

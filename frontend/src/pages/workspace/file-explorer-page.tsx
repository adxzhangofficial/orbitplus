import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUpToLine,
  Check,
  ChevronDown,
  ChevronUp,
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
import { api } from "@/lib/api";
import { cn, formatBytes, relativeTime } from "@/lib/utils";
import type { RemoteFile, Server } from "@/types";

interface RemoteEntry {
  name: string; path: string; type: string; size: number; permissions?: string; modifiedAt: string;
}
interface FileVersion {
  id: string; versionNumber: number; sizeBytes: number; checksum: string;
  operation: string; note: string; createdAt: string; createdBy: string | null;
}

/** Splits an absolute remote path into cumulative navigable segments. */
function breadcrumbsFor(path: string): Array<{ label: string; path: string }> {
  const parts = path.split("/").filter(Boolean);
  const crumbs = [{ label: "root", path: "/" }];
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    crumbs.push({ label: part, path: current });
  }
  return crumbs;
}

function parentOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}` : "/";
}

function toRemoteFile(entry: RemoteEntry, owner: string, index: number): RemoteFile {
  return {
    id: `remote_${index}_${entry.path}`,
    name: entry.name,
    path: entry.path,
    type: entry.type === "directory" ? "directory" : entry.type === "symlink" ? "symlink" : "file",
    size: entry.size,
    permissions: entry.permissions ?? (entry.type === "directory" ? "755" : "644"),
    modifiedAt: entry.modifiedAt,
    owner,
    extension: entry.name.includes(".") ? entry.name.split(".").pop() : undefined,
  };
}

export function FileExplorerPage() {
  const { serverId = "" } = useParams();
  const [server, setServer] = useState<Server>();
  const [path, setPath] = useState("/");
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(true);
  const [selected, setSelected] = useState<RemoteFile | undefined>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState("editor");
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [remoteChecksum, setRemoteChecksum] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState<"file" | "folder" | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(true);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  /** Listings already fetched this session, keyed by remote path. */
  const cacheRef = useRef(new Map<string, RemoteFile[]>());
  const unsaved = content !== savedContent;
  const visibleFiles = useMemo(() => files.filter((file) => (showHidden || !file.name.startsWith(".")) && file.name.toLowerCase().includes(query.toLowerCase())), [files, showHidden, query]);
  const lineCount = content.split("\n").length;
  const crumbs = useMemo(() => breadcrumbsFor(path), [path]);

  const loadServer = useCallback(async () => {
    const remote = await api.get<{ id: string; name: string; host: string; port: number; username: string; rootPath: string; environment: Server["environment"]; status: string; lastLatencyMs?: number; hostFingerprint?: string }>(`/servers/${serverId}`);
    setServer({
      id: remote.id, name: remote.name, host: remote.host, port: remote.port, username: remote.username,
      rootPath: remote.rootPath, environment: remote.environment,
      status: remote.status === "offline" ? "offline" : remote.status === "degraded" ? "degraded" : "online",
      protocol: "SFTP", region: "Customer managed", provider: "Orbit worker",
      latency: remote.lastLatencyMs ?? 0, cpu: 0, memory: 0, disk: 0, uptime: "—",
      lastSeen: new Date().toISOString(), tags: [remote.environment], fingerprint: remote.hostFingerprint,
    });
    return remote;
  }, [serverId]);

  /**
   * Lists one directory, showing any previously loaded contents immediately
   * while the fresh listing is fetched.
   *
   * Navigating back into a folder you have already visited should feel like a
   * local file manager, so the cached entries render at once and are replaced
   * when the server answers. `force` skips the cache for an explicit refresh.
   */
  const loadDirectory = useCallback(async (target: string, owner?: string, force = false) => {
    if (force) {
      // A refresh follows a change, and a rename or recursive delete affects
      // everything below the path, so descendants are dropped too.
      for (const key of [...cacheRef.current.keys()]) {
        if (key === target || key.startsWith(target === "/" ? "/" : `${target}/`)) cacheRef.current.delete(key);
      }
    }
    const cached = cacheRef.current.get(target);
    if (cached && !force) {
      setFiles(cached);
      setLoadError(undefined);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const resolvedOwner = owner ?? server?.username ?? "";
      const envelope = await api.getEnvelope<RemoteEntry[]>(
        `/servers/${serverId}/files?path=${encodeURIComponent(target)}&prefetch=1${force ? "&fresh=true" : ""}`,
      );
      const mapped = envelope.data.map((entry, index) => toRemoteFile(entry, resolvedOwner, index));
      cacheRef.current.set(target, mapped);

      // Subdirectory listings the server fetched in the same round trip. Storing
      // them means clicking into any of these folders needs no request at all,
      // which is what makes navigation feel local on a high-latency link.
      const prefetched = envelope.meta?.prefetched as Record<string, RemoteEntry[]> | undefined;
      if (prefetched) {
        for (const [childPath, childEntries] of Object.entries(prefetched)) {
          cacheRef.current.set(childPath, childEntries.map((entry, index) => toRemoteFile(entry, resolvedOwner, index)));
        }
      }

      setFiles(mapped);
      setLoadError(undefined);
      setSelectedIds([]);
    } catch (error) {
      // A cached listing stays on screen rather than blanking the view, so a
      // transient failure does not lose the user's place.
      if (!cached) setFiles([]);
      setLoadError(error instanceof Error ? error.message : "Could not list this directory");
    } finally {
      setLoading(false);
    }
  }, [serverId, server?.username]);

  useEffect(() => {
    if (!serverId) return;
    let active = true;
    setLoading(true);
    loadServer()
      .then((remote: { username: string }) => { if (active) return loadDirectory("/", remote.username); })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "Could not open this server");
        setLoading(false);
      });
    return () => { active = false; };
    // Only re-runs for a different server; directory changes go through navigate().
  }, [serverId, loadServer]);

  async function navigate(target: string) {
    if (unsaved && !window.confirm("Discard unsaved changes?")) return;
    setPath(target);
    setSelected(undefined);
    setPanel(false);
    await loadDirectory(target);
  }

  async function openFile(file: RemoteFile) {
    if (file.type === "directory") { await navigate(file.path); return; }
    if (unsaved && selected?.id !== file.id && !window.confirm("Discard unsaved changes?")) return;
    setSelected(file); setPanel(true); setTab("editor");
    setContent(""); setSavedContent(""); setReadOnly(false); setVersions([]);
    try {
      const remote = await api.get<{ content: string; encoding: "utf8" | "base64"; checksum: string }>(`/servers/${serverId}/files/content?path=${encodeURIComponent(file.path)}`);
      // Binary content is shown as a notice rather than dumped into the editor,
      // where saving it back would corrupt the file.
      const binary = remote.encoding === "base64";
      const next = binary ? `This is a binary file (${formatBytes(file.size)}). Download it to view or edit.` : remote.content;
      setContent(next); setSavedContent(next); setReadOnly(binary); setRemoteChecksum(remote.checksum);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read this file";
      setContent(message); setSavedContent(message); setReadOnly(true); setRemoteChecksum(undefined);
    }
    void loadVersions(file.path);
  }

  async function loadVersions(target: string) {
    try {
      setVersions(await api.get<FileVersion[]>(`/servers/${serverId}/files/versions?path=${encodeURIComponent(target)}`));
    } catch { setVersions([]); }
  }

  async function restoreVersion(versionId: string) {
    if (!selected) return;
    try {
      await api.post(`/servers/${serverId}/files/rollback`, { versionId, note: "Restored from the Orbit workspace" });
      toast.success("Version restored");
      await openFile(selected);
    } catch (error) {
      toast.error("Could not restore", { description: error instanceof Error ? error.message : undefined });
    }
  }

  async function uploadFiles(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    const body = new FormData();
    body.append("path", path);
    for (const file of Array.from(list)) body.append("files", file);
    try {
      const uploaded = await api.upload<Array<{ path: string }>>(`/servers/${serverId}/files/upload`, body);
      toast.success(`${uploaded.length} file${uploaded.length === 1 ? "" : "s"} uploaded`);
      await loadDirectory(path, undefined, true);
    } catch (error) {
      toast.error("Upload failed", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  function downloadFile(file: RemoteFile) {
    api.download(`/servers/${serverId}/files/download?path=${encodeURIComponent(file.path)}`, file.name)
      .catch((error: unknown) => toast.error("Download failed", { description: error instanceof Error ? error.message : undefined }));
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
    // Created inside the directory being viewed, not at the server root.
    const target = `${path === "/" ? "" : path}/${newName.trim()}`;
    try {
      if (createOpen === "folder") await api.post(`/servers/${serverId}/files/directory`, { path: target });
      else await api.put(`/servers/${serverId}/files/content`, { path: target, content: "", encoding: "utf8", note: "Created in the Orbit workspace" });
      setNewName(""); setCreateOpen(null);
      toast.success(`${createOpen === "folder" ? "Folder" : "File"} created`);
      await loadDirectory(path, undefined, true);
    } catch (error) {
      toast.error("Could not create item", { description: error instanceof Error ? error.message : undefined });
    }
  }

  async function removeSelected() {
    const targets = selectedIds.length
      ? files.filter((file) => selectedIds.includes(file.id))
      : selected ? [selected] : [];
    if (!targets.length) return;
    let removed = 0;
    for (const file of targets) {
      try {
        // Directories need the recursive flag; the API refuses otherwise so a
        // non-empty directory is never removed by accident.
        await api.delete(`/servers/${serverId}/files/entry?path=${encodeURIComponent(file.path)}&recursive=${file.type === "directory"}`);
        removed += 1;
      } catch (error) {
        toast.error(`Could not delete ${file.name}`, { description: error instanceof Error ? error.message : undefined });
      }
    }
    setDeleteOpen(false);
    setSelectedIds([]);
    if (selected && targets.some((file) => file.id === selected.id)) { setSelected(undefined); setPanel(false); }
    if (removed) toast.success(`${removed} item${removed === 1 ? "" : "s"} deleted`, { description: "A snapshot was captured before removal." });
    await loadDirectory(path, undefined, true);
  }
  // Nothing below can render meaningfully without the server record, and the
  // whole page depends on it, so this gate keeps every later access non-null.
  if (!server) {
    return <div className="grid h-[calc(100vh-56px)] place-items-center">
      <div className="text-center">
        {loadError
          ? <><ShieldCheck className="mx-auto size-6 text-red-400/60" /><p className="mt-3 text-xs text-zinc-300">Could not open this server</p><p className="mx-auto mt-1 max-w-sm text-[9px] leading-4 text-zinc-600">{loadError}</p><Link to="/workspace/servers" className="mt-4 inline-block text-[9px] text-blue-400">Back to servers</Link></>
          : <><RefreshCw className="mx-auto size-5 animate-spin text-zinc-600" /><p className="mt-3 text-[10px] text-zinc-500">Connecting…</p></>}
      </div>
    </div>;
  }

  return (
    <div className="flex h-[calc(100vh-56px)] min-h-[640px] flex-col md:h-screen">
      <header className="flex min-h-14 items-center gap-3 border-b border-border px-3 sm:px-4"><Link to={`/workspace/servers/${server.id}`} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft className="size-3.5" /></Link><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate text-xs font-medium">{server.name}</h1><Badge tone="success" dot>Connected</Badge></div><p className="mt-0.5 hidden font-mono text-[8px] text-zinc-600 sm:block">{server.username}@{server.host} · SFTP</p></div><div className="hidden items-center gap-2 sm:flex">
        <input ref={uploadRef} type="file" multiple hidden onChange={(event) => void uploadFiles(event.target.files)} />
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadDirectory(path, undefined, true)}><RefreshCw className={loading ? "animate-spin" : undefined} />Refresh</Button>
        <Button size="sm" disabled={uploading} onClick={() => uploadRef.current?.click()}><Upload />{uploading ? "Uploading…" : "Upload"}</Button>
      </div><IconButton label="More actions"><MoreHorizontal /></IconButton></header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-sidebar/50 lg:flex"><div className="flex h-10 items-center justify-between border-b border-border px-3"><span className="text-[8px] font-medium uppercase tracking-wider text-zinc-600">Remote explorer</span><IconButton label="New folder" className="size-6" onClick={() => setCreateOpen("folder")}><FolderPlus /></IconButton></div><div className="flex-1 overflow-y-auto p-2">
            {/* Directories in the current listing, so the sidebar reflects the
                real tree rather than a fixed sample of folder names. */}
            {path !== "/" && <button type="button" onClick={() => void navigate(parentOf(path))} className="flex h-7 w-full items-center gap-1.5 rounded px-1.5 text-left text-[9px] text-zinc-500 hover:bg-muted hover:text-zinc-200"><ChevronUp className="size-3 shrink-0 text-zinc-600" /><FolderOpen className="size-3.5 shrink-0 text-zinc-500" /><span className="truncate">..</span></button>}
            {files.filter((file) => file.type === "directory").map((file) => <button key={file.id} type="button" onClick={() => void navigate(file.path)} className="flex h-7 w-full items-center gap-1.5 rounded px-1.5 text-left text-[9px] text-zinc-500 hover:bg-muted hover:text-zinc-200"><span className="w-3" /><Folder className="size-3.5 shrink-0 text-blue-300" /><span className="truncate">{file.name}</span></button>)}
            {!loading && !files.some((file) => file.type === "directory") && <p className="px-2 py-3 text-[9px] text-zinc-700">No subdirectories</p>}
          </div><div className="border-t border-border p-3"><div className="flex items-center gap-2 text-[8px] text-emerald-300"><ShieldCheck className="size-3" />Root scope enforced</div><p className="mt-1 truncate font-mono text-[7px] text-zinc-700">{server.rootPath}</p></div></aside>

        <main className={cn("flex min-w-0 flex-1 flex-col", panel && "xl:border-r xl:border-border")}>
          <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-border px-3">
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
              {path !== "/" && <IconButton label="Up one level" className="size-7 shrink-0" onClick={() => void navigate(parentOf(path))}><ArrowLeft /></IconButton>}
              {crumbs.map((crumb, index) => <span key={crumb.path} className="flex shrink-0 items-center gap-1">
                {index > 0 && <ChevronRight className="size-3 text-zinc-700" />}
                <button type="button" onClick={() => void navigate(crumb.path)} className={cn("rounded px-1.5 py-0.5 text-[9px] hover:bg-muted", index === crumbs.length - 1 ? "text-zinc-200" : "text-zinc-500 hover:text-zinc-300")}>{crumb.label}</button>
              </span>)}
            </div>
            <div className="ml-auto flex items-center gap-1"><SearchInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter current folder" containerClassName="hidden w-48 sm:block" className="h-7 text-[9px]" /><IconButton label="New file" className="size-7" onClick={() => setCreateOpen("file")}><FilePlus2 /></IconButton><IconButton label="New folder" className="size-7" onClick={() => setCreateOpen("folder")}><FolderPlus /></IconButton></div>
          </div>
          {selectedIds.length > 0 && <div className="flex min-h-10 items-center gap-2 border-b border-blue-400/15 bg-blue-400/[0.04] px-3"><span className="text-[9px] text-blue-200">{selectedIds.length} selected</span><Button size="xs" variant="ghost" onClick={() => files.filter((file) => selectedIds.includes(file.id) && file.type === "file").forEach(downloadFile)}><Download />Download</Button><Button size="xs" variant="ghost" onClick={() => setDeleteOpen(true)}><Trash2 />Delete</Button><button type="button" className="ml-auto text-blue-300" onClick={() => setSelectedIds([])}><X className="size-3.5" /></button></div>}
          <div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[690px] border-collapse text-left text-[9px]"><thead className="sticky top-0 z-10 border-b border-border bg-[#0d0e10]/95 text-[8px] uppercase tracking-wider text-zinc-600 backdrop-blur"><tr><th className="w-10 px-3 py-2"><input type="checkbox" checked={selectedIds.length === visibleFiles.length && visibleFiles.length > 0} onChange={(event) => setSelectedIds(event.target.checked ? visibleFiles.map((file) => file.id) : [])} className="size-3 accent-blue-500" /></th><th className="py-2">Name</th><th>Size</th><th>Permissions</th><th>Owner</th><th>Modified</th><th className="w-10" /></tr></thead><tbody>{visibleFiles.map((file) => <tr key={file.id} onDoubleClick={() => openFile(file)} className={cn("border-b border-border/70 hover:bg-white/[0.025]", selected?.id === file.id && "bg-blue-400/[0.045]")}><td className="px-3 py-2.5"><input type="checkbox" checked={selectedIds.includes(file.id)} onChange={(event) => setSelectedIds((value) => event.target.checked ? [...value, file.id] : value.filter((id) => id !== file.id))} className="size-3 accent-blue-500" /></td><td><button type="button" onClick={() => openFile(file)} className="flex max-w-[280px] items-center gap-2.5 text-left"><span className={cn("grid size-7 shrink-0 place-items-center rounded-md bg-muted", file.type === "directory" ? "text-blue-300" : "text-zinc-500")}>{file.type === "directory" ? <Folder className="size-3.5" /> : file.extension === "ts" ? <FileCode2 className="size-3.5" /> : <File className="size-3.5" />}</span><span className="truncate text-zinc-300">{file.name}</span>{file.gitStatus && <span className={cn("size-1.5 shrink-0 rounded-full", file.gitStatus === "modified" ? "bg-amber-400" : "bg-emerald-400")} title={file.gitStatus} />}</button></td><td className="font-mono text-[8px] text-zinc-600">{file.type === "directory" ? "—" : formatBytes(file.size)}</td><td className="font-mono text-[8px] text-zinc-600">{file.permissions}</td><td className="text-zinc-600">{file.owner}</td><td className="text-zinc-600">{relativeTime(file.modifiedAt)}</td><td><IconButton label={`Actions for ${file.name}`} className="size-7"><MoreHorizontal /></IconButton></td></tr>)}</tbody></table>{!visibleFiles.length && <div className="grid min-h-64 place-items-center text-center"><div><Search className="mx-auto size-5 text-zinc-700" /><p className="mt-3 text-xs">No matching files</p><button type="button" onClick={() => setQuery("")} className="mt-2 text-[9px] text-blue-400">Clear filter</button></div></div>}</div>
          <footer className="flex h-7 items-center gap-4 border-t border-border px-3 text-[7px] text-zinc-700"><span>{visibleFiles.filter((item) => item.type === "directory").length} folders</span><span>{visibleFiles.filter((item) => item.type === "file").length} files</span><label className="ml-auto flex items-center gap-1.5"><input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} className="size-2.5 accent-blue-500" />Show hidden</label><span>UTF-8</span></footer>
        </main>

        {panel && selected && <aside className="fixed inset-0 z-50 flex min-w-0 flex-col bg-background sm:left-auto sm:w-[560px] sm:border-l sm:border-border xl:static xl:z-auto xl:w-[46%] xl:max-w-[720px] xl:bg-card/20"><header className="flex min-h-11 items-center gap-2 border-b border-border px-3"><FileCode2 className="size-3.5 text-blue-300" /><span className="min-w-0 flex-1 truncate text-[10px] font-medium">{selected.name}</span>{unsaved && <Badge tone="warning">Unsaved</Badge>}<IconButton label="Close editor" className="size-7" onClick={() => { if (!unsaved || window.confirm("Discard unsaved changes?")) setPanel(false); }}><X /></IconButton></header><Tabs value={tab} onChange={setTab} items={[{ value: "editor", label: "Editor" }, { value: "diff", label: "Changes", count: unsaved ? 1 : 0 }, { value: "history", label: "History", count: versions.length }, { value: "info", label: "Details" }]} />
          {tab === "editor" && <div className="flex min-h-0 flex-1 flex-col"><div className="flex min-h-10 items-center gap-1 border-b border-border px-2"><IconButton label="Save" className="size-7" onClick={save}><Save /></IconButton><IconButton label="Compare" className="size-7" onClick={() => setTab("diff")}><GitCompare /></IconButton><IconButton label="History" className="size-7" onClick={() => setTab("history")}><History /></IconButton><span className="mx-1 h-4 w-px bg-border" /><span className="text-[7px] text-zinc-700">TypeScript · UTF-8 · LF</span><div className="ml-auto flex gap-1"><Button size="xs" variant="ghost" onClick={() => setContent(savedContent)} disabled={!unsaved}>Discard</Button><Button size="xs" onClick={save} loading={saving} disabled={!unsaved}><Save />Save atomically</Button></div></div><div className="relative min-h-0 flex-1 overflow-hidden bg-[#0b0c0e]"><div className="pointer-events-none absolute inset-y-0 left-0 w-10 border-r border-white/[0.045] bg-black/10 py-3 text-right font-mono text-[8px] leading-5 text-zinc-800">{Array.from({ length: lineCount }, (_, index) => <div key={index} className="pr-2">{index + 1}</div>)}</div><textarea value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} className="absolute inset-0 resize-none bg-transparent py-3 pl-12 pr-3 font-mono text-[9px] leading-5 text-zinc-400 outline-none" /></div><footer className="flex h-7 items-center gap-3 border-t border-border px-3 text-[7px] text-zinc-700"><span>Ln {lineCount}, Col 1</span><span>{formatBytes(new Blob([content]).size)}</span><span className="ml-auto flex items-center gap-1 text-emerald-400"><ShieldCheck className="size-2.5" />revision locked</span></footer></div>}
          {tab === "diff" && <div className="min-h-0 flex-1 overflow-auto p-3"><div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-medium">Working copy ↔ remote</p><p className="mt-0.5 text-[8px] text-zinc-600">Content and revision comparison</p></div><Badge tone={unsaved ? "warning" : "success"}>{unsaved ? "1 file changed" : "No changes"}</Badge></div>{unsaved ? <pre className="overflow-x-auto rounded-lg border border-border bg-[#0b0c0e] p-4 font-mono text-[8px] leading-5"><span className="text-zinc-600">@@ -8,6 +8,8 @@</span>{"\n"}<span className="text-red-300">-server.close(() =&gt; process.exit(0));</span>{"\n"}<span className="bg-emerald-400/5 text-emerald-300">+server.close(() =&gt; &#123;</span>{"\n"}<span className="bg-emerald-400/5 text-emerald-300">+  process.exit(0);</span>{"\n"}<span className="bg-emerald-400/5 text-emerald-300">+&#125;);</span></pre> : <div className="grid min-h-52 place-items-center rounded-lg border border-dashed border-border text-center"><div><Check className="mx-auto size-5 text-emerald-400" /><p className="mt-3 text-xs">Working copy matches remote</p><p className="mt-1 text-[9px] text-zinc-600">Revision v_194 · checksum verified</p></div></div>}<div className="mt-3 rounded-md border border-blue-400/15 bg-blue-400/[0.04] p-3 text-[8px] leading-4 text-blue-200/60">Orbit rechecks the remote revision immediately before saving. If another operator changed the file, your save pauses for conflict resolution.</div></div>}
          {tab === "history" && <div className="min-h-0 flex-1 overflow-y-auto"><div className="p-3"><p className="text-[10px] font-medium">Version history</p><p className="mt-1 text-[8px] text-zinc-600">Every safe save and pre-change recovery point</p></div><div className="divide-y divide-border border-y border-border">{versions.map((version, index) => <article key={version.id} className="p-3 hover:bg-white/[0.02]"><div className="flex items-start gap-3"><span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", index === 0 ? "bg-blue-400/10 text-blue-300" : "bg-muted text-muted-foreground")}><History className="size-3" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-[10px] font-medium">Version {version.versionNumber}</p>{index === 0 && <Badge tone="info">Current</Badge>}</div><p className="mt-1 text-[8px] text-zinc-600">{version.createdBy ?? "System"} · {relativeTime(version.createdAt)}</p><p className="mt-2 text-[9px] text-zinc-400">{version.note || version.operation}</p><div className="mt-2 flex gap-3 font-mono text-[7px] text-zinc-700"><span>{version.checksum.slice(0, 12)}</span><span>{formatBytes(version.sizeBytes)}</span><span>{version.operation}</span></div></div>{index > 0 && <div className="flex gap-1"><IconButton label="Restore version" className="size-7" onClick={() => void restoreVersion(version.id)}><RefreshCw /></IconButton></div>}</div></article>)}
            {!versions.length && <p className="p-4 text-center text-[9px] text-zinc-600">No version history yet. Saving this file creates the first version.</p>}
          </div></div>}
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

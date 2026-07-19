import { useState } from "react";
import { Braces, Check, ChevronRight, Copy, KeyRound, LockKeyhole, Search } from "lucide-react";
import { Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const endpoints = [
  { method: "GET", path: "/servers", title: "List servers" },
  { method: "POST", path: "/servers", title: "Create server" },
  { method: "POST", path: "/servers/:id/test", title: "Test connection" },
  { method: "GET", path: "/servers/:id/files", title: "List remote files" },
  { method: "PUT", path: "/servers/:id/files/content", title: "Save file" },
  { method: "POST", path: "/servers/:id/files/rollback", title: "Roll back file" },
  { method: "POST", path: "/transfers", title: "Create transfer" },
  { method: "POST", path: "/backups", title: "Create backup" },
  { method: "POST", path: "/deployments", title: "Create deployment" },
];

export function ApiPage() {
  const [active, setActive] = useState(endpoints[0]);
  const [query, setQuery] = useState("");
  const code = `curl --request GET \\\n+  --url https://api.orbit.dev/v1/servers \\\n+  --header 'Authorization: Bearer orb_live_••••••' \\\n+  --header 'X-Organization-Id: org_acme'`;
  return (
    <div className="min-h-[calc(100vh-64px)] lg:grid lg:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="border-r border-white/8 bg-[#0c0d10] p-4"><div className="flex items-center gap-2 px-2 py-3"><Braces className="size-4 text-blue-300" /><div><p className="text-[10px] font-medium">Orbit API</p><p className="text-[8px] text-zinc-600">REST · v1</p></div></div><label className="relative mt-2 block"><Search className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-zinc-600" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter endpoints" className="pl-8 text-[9px]" /></label><nav className="mt-5"><p className="mb-2 px-2 text-[8px] uppercase tracking-wider text-zinc-700">Core endpoints</p>{endpoints.filter((item) => `${item.title} ${item.path}`.toLowerCase().includes(query.toLowerCase())).map((item) => <button type="button" key={`${item.method}-${item.path}`} onClick={() => setActive(item)} className={cn("flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left", active === item ? "bg-white/[0.06]" : "hover:bg-white/[0.025]")}><span className={cn("w-9 font-mono text-[7px]", item.method === "GET" ? "text-emerald-400" : item.method === "POST" ? "text-blue-400" : "text-amber-400")}>{item.method}</span><span className="truncate font-mono text-[8px] text-zinc-500">{item.path}</span></button>)}</nav></aside>
      <main className="min-w-0"><header className="border-b border-white/8 px-5 py-6 sm:px-8"><div className="flex items-center gap-1.5 text-[8px] text-zinc-600"><span>API</span><ChevronRight className="size-3" /><span>Servers</span><ChevronRight className="size-3" /><span className="text-zinc-300">{active.title}</span></div><h1 className="mt-4 text-3xl font-semibold">{active.title}</h1><div className="mt-3 flex items-center gap-2"><span className="rounded border border-emerald-400/15 bg-emerald-400/5 px-2 py-1 font-mono text-[8px] text-emerald-300">{active.method}</span><code className="text-[10px] text-zinc-400">/v1{active.path}</code></div></header><div className="grid xl:grid-cols-2"><article className="px-5 py-8 sm:px-8"><h2 className="text-xl font-semibold">Request</h2><p className="mt-3 text-[10px] leading-5 text-zinc-500">Returns every server connection visible to the authenticated member in the selected organization. Results are tenant scoped and paginated.</p><div className="mt-6 rounded-lg border border-blue-400/15 bg-blue-400/[0.045] p-4"><div className="flex gap-3"><LockKeyhole className="size-4 shrink-0 text-blue-300" /><div><p className="text-[10px] font-medium text-blue-200">Authentication required</p><p className="mt-1 text-[9px] leading-4 text-blue-200/55">Use a workspace API key with <code>servers:read</code>. Never embed a key in browser code.</p></div></div></div><h3 className="mt-8 text-sm font-semibold">Query parameters</h3><div className="mt-3 divide-y divide-white/8 border-y border-white/8">{[["status", "string", "Filter by online, degraded, offline, or maintenance."], ["environment", "string", "Filter by an environment slug."], ["cursor", "string", "Opaque cursor from the previous page."], ["limit", "integer", "Results per page, 1–100. Defaults to 25."]].map(([name, type, detail]) => <div key={name} className="grid grid-cols-[100px_70px_1fr] gap-3 py-3 text-[9px]"><code className="text-zinc-300">{name}</code><span className="text-blue-400">{type}</span><span className="leading-4 text-zinc-600">{detail}</span></div>)}</div></article>
        <aside className="border-t border-white/8 bg-[#0c0d10] px-5 py-8 sm:px-8 xl:border-l xl:border-t-0"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Example request</h2><button type="button" onClick={() => void navigator.clipboard.writeText(code).then(() => toast.success("Request copied"))} className="flex items-center gap-1.5 text-[8px] text-zinc-600 hover:text-white"><Copy className="size-3" />Copy</button></div><pre className="mt-3 overflow-x-auto rounded-lg border border-white/8 bg-[#101115] p-4 text-[9px] leading-6 text-zinc-400">{code}</pre><h2 className="mt-8 text-sm font-semibold">Response · 200</h2><pre className="mt-3 overflow-x-auto rounded-lg border border-white/8 bg-[#101115] p-4 text-[9px] leading-5 text-zinc-500">{`{
  "data": [
    {
      "id": "srv_prod_01",
      "name": "Production API",
      "protocol": "sftp",
      "status": "online",
      "environment": "production",
      "latencyMs": 31,
      "lastSeenAt": "2026-07-19T02:14:42Z"
    }
  ],
  "meta": { "nextCursor": null }
}`}</pre><div className="mt-5 flex items-center gap-2 text-[8px] text-emerald-400"><Check className="size-3" />Credentials and secret fields are never returned.</div></aside></div></main>
    </div>
  );
}

export default ApiPage;

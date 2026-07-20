import { useEffect, useMemo, useState } from "react";
import { Check, Clipboard, Eye, EyeOff, KeyRound, Plus, SearchX, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAction } from "@/hooks/use-action";
import { relativeTime } from "@/lib/utils";
import { buttonClass, controlClass, EmptyState, IconButton, Modal, PageHeader, Panel, primaryButtonClass, SearchField, Stat, StatusBadge, pageContainerClass } from "./_shared";

/**
 * API key management.
 *
 * This page previously generated a key in the browser, showed it once, and
 * stored nothing. The value it displayed authenticated nothing, so anyone who
 * put it in a CI pipeline received 401s from a credential the product had told
 * them was live. Keys are now issued, stored as hashes, and enforced by the API.
 */

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  requestCount: number | string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdByName?: string | null;
}

const EXPIRY_CHOICES: Array<{ label: string; days: number | null }> = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "Never", days: null },
];

export function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const [show, setShow] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ name: string; days: number | null; scopes: string[] }>({
    name: "", days: 365, scopes: ["servers:read"],
  });

  async function load() {
    try {
      const response = await api.getWithMeta<ApiKey[]>("/api-keys");
      setKeys(response.data);
      // Offered choices come from the API, so the list can never drift from
      // what the middleware actually enforces.
      setScopes((response.meta?.scopes as string[] | undefined) ?? []);
    } catch (error) {
      toast.error("Could not load API keys", { description: error instanceof Error ? error.message : undefined });
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(
    () => keys.filter((key) => `${key.name} ${key.prefix} ${key.scopes.join(" ")}`.toLowerCase().includes(query.toLowerCase())),
    [keys, query],
  );
  const active = keys.filter((key) => !key.revokedAt);

  async function create() {
    if (!draft.name.trim()) { toast.error("Name the key so it can be identified later"); return; }
    if (draft.scopes.length === 0) { toast.error("Select at least one scope"); return; }
    setCreating(true);
    try {
      const created = await api.post<ApiKey & { secret: string }>("/api-keys", {
        name: draft.name.trim(), scopes: draft.scopes, expiresInDays: draft.days,
      });
      setSecret(created.secret);
      setShow(false);
      await load();
    } catch (error) {
      toast.error("Could not create the key", { description: error instanceof Error ? error.message : undefined });
    } finally { setCreating(false); }
  }

  // A second click while the first request is in flight is ignored, and each
  // button reports that it is working — silence is what invites the second click.
  const [revoke, revokePending] = useAction(revokeRequest);

  async function revokeRequest(key: ApiKey) {
    if (!window.confirm(`Revoke "${key.name}"? Anything using it stops working immediately.`)) return;
    try {
      await api.delete(`/api-keys/${key.id}`);
      toast.success("Key revoked");
      await load();
    } catch (error) {
      toast.error("Could not revoke the key", { description: error instanceof Error ? error.message : undefined });
    }
  }

  function toggleScope(scope: string) {
    setDraft((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((item) => item !== scope)
        : [...current.scopes, scope],
    }));
  }

  return <div className={pageContainerClass}>
    <PageHeader
      eyebrow="Developer platform"
      title="API keys"
      description="Scoped credentials for CI, internal tools, and direct API access."
      actions={<button className={primaryButtonClass} onClick={() => { setOpen(true); setSecret(""); setDraft({ name: "", days: 365, scopes: ["servers:read"] }); }}>
        <Plus className="size-3.5" />Create API key
      </button>}
    />

    <div className="grid gap-3 sm:grid-cols-3">
      <Stat label="Active keys" value={active.length} detail={`${keys.length - active.length} revoked`} icon={KeyRound} />
      <Stat label="Requests" value={keys.reduce((sum, key) => sum + Number(key.requestCount ?? 0), 0).toLocaleString()} detail="Across all keys" icon={ShieldCheck} tone="sky" />
      <Stat label="Storage" value="Hashed" detail="Secrets cannot be recovered" icon={ShieldCheck} tone="emerald" />
    </div>

    <Panel title="Workspace API keys" description="A secret is shown once at creation and never again" flush>
      <div className="border-b border-white/[0.06] p-3">
        <SearchField value={query} onChange={setQuery} placeholder="Search keys and scopes" />
      </div>
      {loading
        ? <p className="p-6 text-center text-[10px] text-zinc-600">Loading…</p>
        : filtered.length
          ? <div className="divide-y divide-white/[0.06]">
              {filtered.map((key) => <div key={key.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(200px,1fr)_150px_110px_auto] lg:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-200">{key.name}</p>
                    <StatusBadge status={key.revokedAt ? "revoked" : "active"} />
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-zinc-600">{key.prefix}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {key.scopes.map((scope) => <span key={scope} className="rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-1 font-mono text-[9px] text-zinc-500">{scope}</span>)}
                </div>
                <div className="text-[10px]">
                  <p className="text-zinc-400">{key.lastUsedAt ? `Used ${relativeTime(key.lastUsedAt)}` : "Never used"}</p>
                  <p className="mt-1 text-zinc-600">{Number(key.requestCount ?? 0).toLocaleString()} requests</p>
                </div>
                <span className="text-[10px] text-zinc-500">
                  {key.expiresAt ? `Expires ${relativeTime(key.expiresAt)}` : "No expiry"}
                </span>
                <div className="flex justify-end">
                  {!key.revokedAt && <IconButton title="Revoke" onClick={() => void revoke(key)} disabled={revokePending}><Trash2 className="size-3.5" /></IconButton>}
                </div>
              </div>)}
            </div>
          : <EmptyState icon={SearchX} title="No API keys" description="Create a scoped key to use the Orbit API from CI or your own tools." />}
    </Panel>

    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={secret ? "Save your API key" : "Create API key"}
      description={secret ? "This is the only time it can be shown. It is stored as a hash." : "Give the key the least privilege and the shortest useful lifetime."}
      footer={secret
        ? <button className={primaryButtonClass} onClick={() => { setOpen(false); setSecret(""); }}><Check className="size-3.5" />I saved the key</button>
        : <><button className={buttonClass} onClick={() => setOpen(false)}>Cancel</button><button className={primaryButtonClass} disabled={creating} onClick={() => void create()}>{creating ? "Creating…" : "Create key"}</button></>}
    >
      {secret
        ? <div>
            <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] p-3">
              <code className="min-w-0 flex-1 break-all text-xs text-emerald-200">{show ? secret : secret.replace(/.(?=.{4})/g, "•")}</code>
              <IconButton title="Show or hide" onClick={() => setShow(!show)}>{show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</IconButton>
              <IconButton title="Copy" onClick={() => { void navigator.clipboard.writeText(secret); toast.success("Copied"); }}><Clipboard className="size-3.5" /></IconButton>
            </div>
            <p className="mt-3 text-[10px] leading-5 text-zinc-500">
              Store it in a secrets manager. Never commit it or include it in client-side code.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-white/[0.07] bg-black/30 p-3 text-[10px] leading-5 text-emerald-300">{`curl ${location.origin}/api/v1/servers \\
  -H "Authorization: Bearer ${show ? secret : "orb_…"}"`}</pre>
          </div>
        : <div className="space-y-4">
            <label className="block text-xs text-zinc-400">
              Key name
              <input autoFocus className={`${controlClass} mt-1.5 w-full`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="CI deploy runner" />
            </label>
            <label className="block text-xs text-zinc-400">
              Expiration
              <select className={`${controlClass} mt-1.5 w-full`} value={String(draft.days)} onChange={(event) => setDraft({ ...draft, days: event.target.value === "null" ? null : Number(event.target.value) })}>
                {EXPIRY_CHOICES.map((choice) => <option key={choice.label} value={String(choice.days)}>{choice.label}</option>)}
              </select>
            </label>
            <div>
              <p className="text-xs text-zinc-400">Scopes</p>
              <p className="mt-1 text-[10px] text-zinc-600">The key can only reach what you select here.</p>
              <div className="mt-2 grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto">
                {scopes.map((scope) => <label key={scope} className="flex cursor-pointer items-center gap-2 rounded-md border border-white/[0.06] px-2.5 py-2 text-[10px] text-zinc-400 hover:bg-white/[0.03]">
                  <input type="checkbox" checked={draft.scopes.includes(scope)} onChange={() => toggleScope(scope)} className="size-3 accent-blue-500" />
                  <span className="font-mono">{scope}</span>
                </label>)}
              </div>
            </div>
          </div>}
    </Modal>
  </div>;
}

export const APIKeysPage = ApiKeysPage;
export default ApiKeysPage;

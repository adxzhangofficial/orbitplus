import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clipboard, MessageSquare, Plus, Send, Trash2, Webhook, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAction } from "@/hooks/use-action";
import { relativeTime } from "@/lib/utils";
import { buttonClass, controlClass, EmptyState, IconButton, Modal, PageHeader, Panel, primaryButtonClass, Stat, StatusBadge, Toggle, pageContainerClass } from "./_shared";

/**
 * Outbound integrations.
 *
 * This page previously listed a catalogue of well-known products with Connect
 * buttons that toggled local state. Nothing was stored and no event was ever
 * delivered anywhere. It now manages real destinations that receive alerts,
 * transfer results, backup outcomes, and server state changes.
 */

interface Integration {
  id: string;
  kind: "webhook" | "slack" | "discord";
  name: string;
  targetHint: string;
  events: string[];
  enabled: boolean;
  lastDeliveryAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  deliveryCount: number | string;
  createdAt: string;
}

interface Delivery {
  event: string; status: string; responseStatus: number | null;
  errorMessage: string | null; durationMs: number | null; createdAt: string;
}

const KIND_LABEL: Record<Integration["kind"], { label: string; hint: string; placeholder: string }> = {
  slack: { label: "Slack", hint: "Incoming webhook URL from your Slack app", placeholder: "https://hooks.slack.com/services/…" },
  discord: { label: "Discord", hint: "Channel webhook URL from Discord settings", placeholder: "https://discord.com/api/webhooks/…" },
  webhook: { label: "Webhook", hint: "Any HTTPS endpoint. Deliveries are signed so you can verify them.", placeholder: "https://example.com/hooks/orbit" },
};

export function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string>();
  const [testing, setTesting] = useState<string>();
  const [deliveries, setDeliveries] = useState<{ id: string; rows: Delivery[] }>();
  const [draft, setDraft] = useState<{ kind: Integration["kind"]; name: string; url: string; events: string[] }>({
    kind: "slack", name: "", url: "", events: [],
  });

  async function load() {
    try {
      const response = await api.getEnvelope<Integration[]>("/integrations");
      setIntegrations(response.data);
      setEvents((response.meta?.events as string[] | undefined) ?? []);
    } catch (error) {
      toast.error("Could not load integrations", { description: error instanceof Error ? error.message : undefined });
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const connected = useMemo(() => integrations.filter((item) => item.enabled), [integrations]);
  const failing = useMemo(() => integrations.filter((item) => item.consecutiveFailures > 0), [integrations]);

  async function create() {
    if (!draft.name.trim() || !draft.url.trim()) { toast.error("Enter a name and a destination URL"); return; }
    setCreating(true);
    try {
      const created = await api.post<Integration & { signingSecret?: string }>("/integrations", {
        kind: draft.kind, name: draft.name.trim(), url: draft.url.trim(), events: draft.events,
      });
      await load();
      if (created.signingSecret) setSecret(created.signingSecret);
      else { setOpen(false); toast.success("Integration connected"); }
      setDraft({ kind: "slack", name: "", url: "", events: [] });
    } catch (error) {
      toast.error("Could not connect", { description: error instanceof Error ? error.message : undefined });
    } finally { setCreating(false); }
  }

  async function test(integration: Integration) {
    setTesting(integration.id);
    try {
      const result = await api.post<{ delivered: number; failed: number; delivery?: Delivery }>(`/integrations/${integration.id}/test`, {});
      if (result.delivered > 0) toast.success("Test delivered", { description: `${integration.name} responded in ${result.delivery?.durationMs ?? 0} ms` });
      else toast.error("Test failed", { description: result.delivery?.errorMessage ?? "The destination did not accept the delivery" });
      await load();
    } catch (error) {
      toast.error("Could not send a test", { description: error instanceof Error ? error.message : undefined });
    } finally { setTesting(undefined); }
  }

  async function toggle(integration: Integration, enabled: boolean) {
    try {
      await api.patch(`/integrations/${integration.id}`, { enabled });
      await load();
    } catch (error) {
      toast.error("Could not update", { description: error instanceof Error ? error.message : undefined });
    }
  }

  // A second click while the first request is in flight is ignored, and each
  // button reports that it is working — silence is what invites the second click.
  const [remove, removePending] = useAction(removeRequest);

  async function removeRequest(integration: Integration) {
    if (!window.confirm(`Remove "${integration.name}"? Events will stop being delivered there.`)) return;
    try {
      await api.delete(`/integrations/${integration.id}`);
      toast.success("Integration removed");
      await load();
    } catch (error) {
      toast.error("Could not remove", { description: error instanceof Error ? error.message : undefined });
    }
  }

  async function showDeliveries(integration: Integration) {
    try {
      setDeliveries({ id: integration.id, rows: await api.get<Delivery[]>(`/integrations/${integration.id}/deliveries`) });
    } catch (error) {
      toast.error("Could not load deliveries", { description: error instanceof Error ? error.message : undefined });
    }
  }

  return <div className={pageContainerClass}>
    <PageHeader
      eyebrow="Connected services"
      title="Integrations"
      description="Send alerts, transfer results, backup outcomes, and server state changes to Slack, Discord, or your own endpoint."
      actions={<button className={primaryButtonClass} onClick={() => { setOpen(true); setSecret(undefined); }}>
        <Plus className="size-3.5" />Add integration
      </button>}
    />

    <div className="grid gap-3 sm:grid-cols-3">
      <Stat label="Connected" value={connected.length} detail={`${integrations.length} total`} icon={Webhook} />
      <Stat label="Deliveries" value={integrations.reduce((sum, item) => sum + Number(item.deliveryCount ?? 0), 0).toLocaleString()} detail="All time" icon={Send} tone="sky" />
      <Stat label="Failing" value={failing.length} detail={failing.length ? "Check the destination" : "All healthy"} icon={failing.length ? XCircle : CheckCircle2} tone={failing.length ? "rose" : "emerald"} />
    </div>

    <Panel title="Your integrations" description="Events are delivered as they happen" flush>
      {loading
        ? <p className="p-6 text-center text-[10px] text-zinc-600">Loading…</p>
        : integrations.length
          ? <div className="divide-y divide-white/[0.06]">
              {integrations.map((integration) => <div key={integration.id} className="px-4 py-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px_150px_auto] lg:items-center">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-zinc-400">
                      {integration.kind === "webhook" ? <Webhook className="size-4" /> : <MessageSquare className="size-4" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-zinc-200">{integration.name}</p>
                        <StatusBadge status={integration.enabled ? (integration.consecutiveFailures > 0 ? "degraded" : "active") : "disabled"} />
                      </div>
                      <p className="mt-1 truncate font-mono text-[10px] text-zinc-600">
                        {KIND_LABEL[integration.kind].label} · {integration.targetHint}
                      </p>
                    </div>
                  </div>
                  <div className="text-[10px]">
                    <p className="text-zinc-400">
                      {integration.events.length === 0 ? "All events" : `${integration.events.length} event${integration.events.length === 1 ? "" : "s"}`}
                    </p>
                    <p className="mt-1 text-zinc-600">{Number(integration.deliveryCount ?? 0).toLocaleString()} delivered</p>
                  </div>
                  <button type="button" onClick={() => void showDeliveries(integration)} className="text-left text-[10px] text-zinc-500 hover:text-zinc-300">
                    {integration.lastDeliveryAt ? `Last ${relativeTime(integration.lastDeliveryAt)}` : "Never delivered"}
                    <span className="mt-1 block text-zinc-600 underline decoration-dotted">View deliveries</span>
                  </button>
                  <div className="flex items-center justify-end gap-1.5">
                    <Toggle label="Enabled" checked={integration.enabled} onChange={(enabled) => void toggle(integration, enabled)} />
                    <button className={buttonClass} disabled={testing === integration.id} onClick={() => void test(integration)}>
                      <Send className="size-3" />{testing === integration.id ? "Sending…" : "Test"}
                    </button>
                    <IconButton title="Remove" onClick={() => void remove(integration)} disabled={removePending}><Trash2 className="size-3.5" /></IconButton>
                  </div>
                </div>

                {integration.consecutiveFailures > 0 && integration.lastError && (
                  <p className="mt-3 rounded-md border border-rose-400/15 bg-rose-400/[0.04] p-2.5 text-[9px] leading-4 text-rose-200/90">
                    {integration.consecutiveFailures} consecutive failure{integration.consecutiveFailures === 1 ? "" : "s"}: {integration.lastError}
                    {integration.consecutiveFailures >= 15 && " Deliveries are suspended until this is re-enabled."}
                  </p>
                )}

                {deliveries?.id === integration.id && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06]">
                    {deliveries.rows.length === 0
                      ? <p className="p-3 text-[9px] text-zinc-600">No deliveries yet</p>
                      : deliveries.rows.slice(0, 8).map((delivery, index) => <div key={index} className="flex items-center justify-between gap-3 border-b border-white/[0.04] px-3 py-2 text-[9px] last:border-0">
                          <span className="font-mono text-zinc-500">{delivery.event}</span>
                          <span className={delivery.status === "delivered" ? "text-emerald-300" : delivery.status === "skipped" ? "text-zinc-500" : "text-rose-300"}>
                            {delivery.status}{delivery.responseStatus ? ` · ${delivery.responseStatus}` : ""}
                          </span>
                          <span className="text-zinc-600">{relativeTime(delivery.createdAt)}</span>
                        </div>)}
                  </div>
                )}
              </div>)}
            </div>
          : <EmptyState icon={Webhook} title="No integrations yet" description="Connect Slack, Discord, or your own endpoint to receive events as they happen." />}
    </Panel>

    <Modal
      open={open}
      onClose={() => { setOpen(false); setSecret(undefined); }}
      title={secret ? "Save your signing secret" : "Add integration"}
      description={secret ? "Use this to verify that deliveries came from Orbit." : "Choose a destination and which events it should receive."}
      footer={secret
        ? <button className={primaryButtonClass} onClick={() => { setOpen(false); setSecret(undefined); toast.success("Integration connected"); }}>Done</button>
        : <><button className={buttonClass} onClick={() => setOpen(false)}>Cancel</button><button className={primaryButtonClass} disabled={creating} onClick={() => void create()}>{creating ? "Connecting…" : "Connect"}</button></>}
    >
      {secret
        ? <div>
            <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] p-3">
              <code className="min-w-0 flex-1 break-all text-xs text-emerald-200">{secret}</code>
              <IconButton title="Copy" onClick={() => { void navigator.clipboard.writeText(secret); toast.success("Copied"); }}><Clipboard className="size-3.5" /></IconButton>
            </div>
            <p className="mt-3 text-[10px] leading-5 text-zinc-500">
              Each delivery carries <code className="text-zinc-400">x-orbit-signature</code> and
              {" "}<code className="text-zinc-400">x-orbit-timestamp</code>. Recompute
              HMAC-SHA256 over <code className="text-zinc-400">timestamp.body</code> with this secret to verify it.
              The timestamp is signed too, so an old delivery cannot be replayed.
            </p>
          </div>
        : <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(KIND_LABEL) as Array<Integration["kind"]>).map((kind) => <button
                key={kind}
                type="button"
                onClick={() => setDraft({ ...draft, kind })}
                className={`rounded-lg border p-3 text-left text-[10px] ${draft.kind === kind ? "border-white/25 bg-white/[0.06] text-zinc-200" : "border-white/[0.07] text-zinc-500 hover:bg-white/[0.03]"}`}
              >
                <span className="block font-medium">{KIND_LABEL[kind].label}</span>
              </button>)}
            </div>
            <label className="block text-xs text-zinc-400">
              Name
              <input autoFocus className={`${controlClass} mt-1.5 w-full`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Production alerts" />
            </label>
            <label className="block text-xs text-zinc-400">
              Destination URL
              <input className={`${controlClass} mt-1.5 w-full font-mono`} value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder={KIND_LABEL[draft.kind].placeholder} />
              <span className="mt-1 block text-[10px] text-zinc-600">{KIND_LABEL[draft.kind].hint}</span>
            </label>
            <div>
              <p className="text-xs text-zinc-400">Events</p>
              <p className="mt-1 text-[10px] text-zinc-600">Select none to receive everything.</p>
              <div className="mt-2 grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto">
                {events.map((event) => <label key={event} className="flex cursor-pointer items-center gap-2 rounded-md border border-white/[0.06] px-2.5 py-2 text-[10px] text-zinc-400 hover:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    checked={draft.events.includes(event)}
                    onChange={() => setDraft({
                      ...draft,
                      events: draft.events.includes(event) ? draft.events.filter((item) => item !== event) : [...draft.events, event],
                    })}
                    className="size-3 accent-blue-500"
                  />
                  <span className="font-mono">{event}</span>
                </label>)}
              </div>
            </div>
          </div>}
    </Modal>
  </div>;
}

export default IntegrationsPage;

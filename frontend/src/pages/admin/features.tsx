import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Flag, GitBranch, MoreHorizontal, Plus, Rocket, Save, ShieldCheck, Target, Users } from "lucide-react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/utils";
import { featureFlags, type FeatureFlag } from "./_data";
import { adminApi, AdminDataNotice, toFlagInput, toPageFeatureFlag, useAdminResource, type AdminCustomer } from "./_api";
import { AdminButton, AdminPageHeader, DetailGrid, Drawer, IconAction, Modal, Pagination, ProgressBar, SearchBox, Stat, StatusPill, Toggle, usePagination } from "./_shared";

/**
 * Flags are read from and written to the platform API. Every toggle here
 * changes what real tenants can see, so nothing is kept in local state alone:
 * a change is sent, and the row reflects what came back.
 *
 * The rollout slider is the exception to writing immediately. It fires on every
 * step, so the visible value updates at once and the write is debounced behind
 * it — otherwise dragging from 0 to 50 would issue ten requests and ten audit
 * entries for one decision.
 */

const emptyFlag = { key: "", name: "", description: "", owner: "Platform", risk: "low" as FeatureFlag["risk"] };

export function FeatureFlagsAdminPage() {
  const { data: rows, source, error, refresh } = useAdminResource<FeatureFlag[]>(
    "admin.feature-flags",
    featureFlags,
    async () => (await adminApi.featureFlags()).map(toPageFeatureFlag),
  );
  const [pending, setPending] = useState<Record<string, FeatureFlag>>({});
  const [organizations, setOrganizations] = useState<AdminCustomer[]>([]);
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const [risk, setRisk] = useState("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState(emptyFlag);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Overrides are stored as organization ids. Names make the drawer readable.
  useEffect(() => {
    if (source !== "live") return;
    adminApi.customers().then(setOrganizations).catch(() => undefined);
  }, [source]);

  useEffect(() => () => { for (const timer of Object.values(timers.current)) clearTimeout(timer); }, []);

  // What the page renders: the server's rows, with any not-yet-saved edit on top.
  const visible = useMemo(() => rows.map((flag) => pending[flag.id] ?? flag), [pending, rows]);
  const selected = visible.find((flag) => flag.id === selectedId);
  const filtered = useMemo(() => visible.filter((flag) => `${flag.name} ${flag.key} ${flag.owner}`.toLowerCase().includes(query.toLowerCase()) && (state === "all" || (state === "enabled" ? flag.production : !flag.production)) && (risk === "all" || flag.risk === risk)), [query, risk, state, visible]);
  const pagination = usePagination(filtered, 8);
  const productionCount = visible.filter((flag) => flag.production).length;

  async function persist(flag: FeatureFlag, message?: string) {
    try {
      const saved = toPageFeatureFlag(await adminApi.saveFeatureFlag(flag.key, toFlagInput(flag)));
      setPending((current) => { const next = { ...current }; delete next[flag.id]; return next; });
      await refresh();
      if (message) toast.success(message);
      return saved;
    } catch (reason) {
      // The optimistic row is dropped so the table stops showing a state the
      // server never accepted.
      setPending((current) => { const next = { ...current }; delete next[flag.id]; return next; });
      toast.error(`Could not update ${flag.name}`, { description: reason instanceof Error ? reason.message : undefined });
      return undefined;
    }
  }

  function patch(id: string, values: Partial<FeatureFlag>, message?: string) {
    const current = visible.find((flag) => flag.id === id);
    if (!current) return;
    const next = { ...current, ...values };
    setPending((state) => ({ ...state, [id]: next }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => { void persist(next, message); }, 400);
  }

  async function createFlag() {
    if (!draft.key.trim() || !draft.name.trim()) { toast.error("Flag key and name are required"); return; }
    if (rows.some((flag) => flag.key === draft.key)) { toast.error(`${draft.key} already exists`); return; }
    try {
      await adminApi.saveFeatureFlag(draft.key, {
        name: draft.name, description: draft.description, owner: draft.owner, risk: draft.risk,
        enabled: false, stagingEnabled: false, rolloutPercent: 0,
      });
      await refresh();
      setCreateOpen(false);
      setDraft(emptyFlag);
      toast.success(`${draft.name} created in disabled state`);
    } catch (reason) {
      toast.error("Could not create the flag", { description: reason instanceof Error ? reason.message : undefined });
    }
  }

  function organizationName(id: string) {
    return organizations.find((organization) => organization.id === id)?.name ?? id;
  }

  return <>
    <AdminPageHeader title="Feature flags" description="Stage platform capabilities safely with environment gates, percentage rollouts, tenant targeting, and owner accountability." actions={<><AdminDataNotice source={source} error={error} /><AdminButton onClick={() => void refresh().then(() => toast.success("Flag configuration reloaded"))}><GitBranch />Sync environments</AdminButton><AdminButton variant="primary" onClick={() => setCreateOpen(true)}><Plus />Create flag</AdminButton></>} />
    <div className="adm-stats"><Stat label="Total flags" value={visible.length} change={`${visible.filter((flag) => !flag.production && !flag.staging).length} idle`} detail="in catalog" icon={Flag} /><Stat label="Production enabled" value={productionCount} change={`${visible.length ? Math.round(productionCount / visible.length * 100) : 0}%`} detail="of catalog" icon={Rocket} /><Stat label="Targeted tenants" value={visible.reduce((sum, flag) => sum + flag.targets, 0)} change={`${new Set(visible.flatMap((flag) => [...flag.enabledOrganizations, ...flag.disabledOrganizations])).size} unique`} detail="organizations" icon={Target} /><Stat label="High-risk changes" value={visible.filter((flag) => flag.risk === "high").length} change="Review" detail="before rollout" icon={AlertTriangle} /></div>
    <div className="adm-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search flag key, name, or owner…" /><select className="adm-select" value={state} onChange={(event) => setState(event.target.value)}><option value="all">Any production state</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select><select className="adm-select" value={risk} onChange={(event) => setRisk(event.target.value)}><option value="all">Any risk</option><option value="low">Low risk</option><option value="medium">Medium risk</option><option value="high">High risk</option></select></div>
    <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Feature</th><th>Owner</th><th>Risk</th><th>Production</th><th>Staging</th><th>Rollout</th><th>Targets</th><th>Updated</th><th /></tr></thead><tbody>{pagination.rows.map((flag) => <tr className="clickable" key={flag.id} onClick={() => setSelectedId(flag.id)}><td><div className="adm-primary-cell"><span className="adm-cell-icon"><Flag /></span><div className="adm-cell-copy"><b>{flag.name}</b><small className="adm-mono">{flag.key}</small></div></div></td><td>{flag.owner}</td><td><StatusPill status={flag.risk} /></td><td><Toggle checked={flag.production} onChange={(checked) => patch(flag.id, { production: checked }, `${flag.name} ${checked ? "enabled" : "disabled"} in production`)} label={`Production ${flag.name}`} /></td><td><Toggle checked={flag.staging} onChange={(checked) => patch(flag.id, { staging: checked }, `${flag.name} ${checked ? "enabled" : "disabled"} in staging`)} label={`Staging ${flag.name}`} /></td><td><div style={{ width: 110 }}><ProgressBar value={flag.rollout} /></div></td><td>{flag.targets ? `${flag.targets} orgs` : "All eligible"}</td><td>{relativeTime(flag.updatedAt)}</td><td><IconAction label="Configure flag" onClick={(event) => { event.stopPropagation(); setSelectedId(flag.id); }}><MoreHorizontal /></IconAction></td></tr>)}{pagination.rows.length === 0 && <tr><td colSpan={9} className="adm-empty">{source === "loading" ? "Loading flags…" : "No feature flags are defined yet."}</td></tr>}</tbody></table><Pagination {...pagination} onPage={pagination.setPage} /></div>

    <Drawer open={Boolean(selected)} onClose={() => setSelectedId(undefined)} title={selected?.name ?? "Feature flag"} description={selected?.key} footer={selected && <><AdminButton variant="danger" onClick={() => patch(selected.id, { production: false, staging: false, rollout: 0 }, "Emergency kill switch applied")}>Kill switch</AdminButton><AdminButton variant="primary" onClick={() => void persist(selected, "Flag configuration saved")}><Save />Save configuration</AdminButton></>}>
      {selected && <><div className="flex items-center justify-between mb-4"><StatusPill status={selected.risk} label={`${selected.risk} risk`} /><StatusPill status={selected.production ? "enabled" : "disabled"} label={selected.production ? "Production on" : "Production off"} /></div><DetailGrid items={[["Owner", selected.owner], ["Flag ID", selected.id], ["Production", selected.production ? "Enabled" : "Disabled"], ["Staging", selected.staging ? "Enabled" : "Disabled"], ["Targets", selected.targets || "All eligible"], ["Updated", relativeTime(selected.updatedAt)]]} /><p className="adm-section-label">Rollout percentage · {selected.rollout}%</p><input className="adm-range" type="range" min="0" max="100" step="5" value={selected.rollout} onChange={(event) => patch(selected.id, { rollout: Number(event.target.value) })} /><div className="flex justify-between text-[7px] text-zinc-600 mt-2"><span>0% holdout</span><span>50%</span><span>100% full</span></div><p className="adm-section-label">Environment gates</p><div className="adm-check-row"><span><b>Production</b><small>Apply percentage and targeting rules to live traffic.</small></span><Toggle checked={selected.production} onChange={(checked) => patch(selected.id, { production: checked }, `Production gate ${checked ? "enabled" : "disabled"}`)} label="Production" /></div><div className="adm-check-row"><span><b>Staging</b><small>Enable for internal and customer staging workspaces.</small></span><Toggle checked={selected.staging} onChange={(checked) => patch(selected.id, { staging: checked }, `Staging gate ${checked ? "enabled" : "disabled"}`)} label="Staging" /></div><p className="adm-section-label">Target rules</p><div className="adm-notice"><Users />{selected.targets ? `${selected.targets} organizations have explicit overrides. Percentage rollout applies to all remaining eligible tenants.` : "No organization overrides. Percentage rollout applies uniformly to all eligible tenants."}</div>{selected.enabledOrganizations.map((id) => <div className="adm-check-row" key={`on-${id}`}><span><b>{organizationName(id)}</b><small>Always on, regardless of rollout</small></span><StatusPill status="enabled" /></div>)}{selected.disabledOrganizations.map((id) => <div className="adm-check-row" key={`off-${id}`}><span><b>{organizationName(id)}</b><small>Always off, regardless of rollout</small></span><StatusPill status="disabled" /></div>)}<p className="adm-section-label">Evaluation snippet</p><pre className="adm-code">{`if (flags.enabled("${selected.key}", { organizationId })) {\n  // gated platform behavior\n}`}</pre></>}
    </Drawer>

    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create feature flag" description="New flags begin disabled in every environment." footer={<><AdminButton onClick={() => setCreateOpen(false)}>Cancel</AdminButton><AdminButton variant="primary" onClick={() => void createFlag()}><Flag />Create disabled flag</AdminButton></>}><div className="adm-form-grid"><div className="adm-field span-2"><label>Flag key</label><input autoFocus className="adm-input adm-mono" value={draft.key} onChange={(event) => setDraft((current) => ({ ...current, key: event.target.value.toLowerCase().replaceAll(/[^a-z0-9_.]/g, "_") }))} placeholder="domain.capability_name" /></div><div className="adm-field"><label>Display name</label><input className="adm-input" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Capability name" /></div><div className="adm-field"><label>Owner team</label><input className="adm-input" value={draft.owner} onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))} /></div><div className="adm-field"><label>Change risk</label><select className="adm-select w-full" value={draft.risk} onChange={(event) => setDraft((current) => ({ ...current, risk: event.target.value as FeatureFlag["risk"] }))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div><div className="adm-field span-2"><label>Description</label><textarea className="adm-textarea" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></div></div><div className="adm-notice mt-4"><ShieldCheck />Enabling a flag in production is recorded in the platform audit log with your account, the previous state, and the rollout percentage.</div></Modal>
  </>;
}

export default FeatureFlagsAdminPage;

import { FormEvent, useEffect, useState } from "react";
import { Building2, Copy, Globe2, Save, Shield } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/utils";
import { buttonClass, controlClass, Field, PageHeader, Panel, primaryButtonClass, Toggle } from "./_shared";

/**
 * Workspace identity and governance policy.
 *
 * Every control here previously edited local state and reported "saved" while
 * sending nothing. The policy toggles are the ones that mattered most: a
 * workspace could appear to require host-key pinning while the API happily
 * accepted unpinned connections. They are now stored and enforced server-side
 * when a connection is created.
 */

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  defaultEnvironment: "development" | "staging" | "production";
  defaultRootPath: string;
  timezone: string;
  requireDeployApproval: boolean;
  enforceHostKeyPinning: boolean;
  allowPasswordAuth: boolean;
  auditRetentionDays: number;
  currentUserRole: string;
  createdAt: string;
  counts: { members: number; servers: number; workspaces: number };
}

const TIMEZONES = ["UTC", "Asia/Shanghai", "Asia/Karachi", "Europe/London", "America/New_York"];
const RETENTION = [90, 365, 730, 2555];

export function WorkspaceSettingsPage() {
  const [organization, setOrganization] = useState<Organization>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Organization>("/organization")
      .then(setOrganization)
      .catch((error: unknown) => toast.error("Could not load workspace settings", {
        description: error instanceof Error ? error.message : undefined,
      }));
  }, []);

  function set<K extends keyof Organization>(key: K, value: Organization[K]) {
    setOrganization((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!organization) return;
    if (!organization.name.trim() || !/^[a-z0-9-]+$/.test(organization.slug)) {
      toast.error("Use a valid workspace name, and a URL of lowercase letters, numbers, and hyphens");
      return;
    }
    setSaving(true);
    try {
      const saved = await api.patch<Organization>("/organization", {
        name: organization.name.trim(),
        slug: organization.slug,
        defaultEnvironment: organization.defaultEnvironment,
        defaultRootPath: organization.defaultRootPath,
        timezone: organization.timezone,
        requireDeployApproval: organization.requireDeployApproval,
        enforceHostKeyPinning: organization.enforceHostKeyPinning,
        allowPasswordAuth: organization.allowPasswordAuth,
        auditRetentionDays: organization.auditRetentionDays,
      });
      setOrganization((current) => (current ? { ...current, ...saved } : current));
      toast.success("Workspace settings saved");
    } catch (error) {
      toast.error("Could not save", { description: error instanceof Error ? error.message : undefined });
    } finally { setSaving(false); }
  }

  if (!organization) return <p className="p-8 text-center text-xs text-zinc-600">Loading workspace settings…</p>;

  const canEdit = ["owner", "admin"].includes(organization.currentUserRole);

  return <form onSubmit={save} className="space-y-5">
    <PageHeader
      eyebrow="Organization settings"
      title="Workspace"
      description={`Shared defaults and governance for ${organization.name}.`}
      actions={canEdit
        ? <button type="submit" disabled={saving} className={primaryButtonClass}>
            <Save className="size-3.5" />{saving ? "Saving…" : "Save changes"}
          </button>
        : undefined}
    />

    {!canEdit && (
      <p className="rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-3 text-[10px] leading-4 text-amber-200/90">
        You can view these settings but not change them. Changing workspace settings requires the admin or owner role.
      </p>
    )}

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
      <Panel title="Workspace identity" description="Organization-wide profile and URL">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Workspace name">
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" />
              <input disabled={!canEdit} className={`${controlClass} w-full pl-9`} value={organization.name} onChange={(event) => set("name", event.target.value)} />
            </div>
          </Field>
          <Field label="Workspace URL" hint="Changing this updates shared links.">
            <div className="flex">
              <span className="flex h-9 items-center rounded-l-lg border border-r-0 border-white/[0.08] bg-white/[0.025] px-2 text-[10px] text-zinc-600">orbit.dev/</span>
              <input disabled={!canEdit} className={`${controlClass} min-w-0 flex-1 rounded-l-none`} value={organization.slug} onChange={(event) => set("slug", event.target.value.toLowerCase())} />
            </div>
          </Field>
          <Field label="Workspace ID">
            <div className="flex gap-2">
              <input readOnly className={`${controlClass} min-w-0 flex-1 font-mono opacity-60`} value={organization.id} />
              <button type="button" className={buttonClass} onClick={() => { void navigator.clipboard.writeText(organization.id); toast.success("Workspace ID copied"); }}>
                <Copy className="size-3" />
              </button>
            </div>
          </Field>
          <Field label="Default timezone">
            <select disabled={!canEdit} className={`${controlClass} w-full`} value={organization.timezone} onChange={(event) => set("timezone", event.target.value)}>
              {TIMEZONES.map((zone) => <option key={zone}>{zone}</option>)}
            </select>
          </Field>
        </div>
      </Panel>

      <Panel title="This workspace" description="Current usage">
        <dl className="space-y-3 text-[10px]">
          {[
            ["Plan", organization.plan],
            ["Status", organization.status],
            ["Members", String(organization.counts.members)],
            ["Servers", String(organization.counts.servers)],
            ["Created", relativeTime(organization.createdAt)],
          ].map(([term, value]) => <div key={term} className="flex items-center justify-between">
            <dt className="text-zinc-600">{term}</dt>
            <dd className="font-mono text-zinc-300">{value}</dd>
          </div>)}
        </dl>
        <div className="mt-4 border-t border-white/[0.06] pt-3 text-[10px] leading-4 text-zinc-600">
          <Globe2 className="mr-1 inline size-3" />Your role: {organization.currentUserRole}
        </div>
      </Panel>
    </div>

    <Panel title="Server defaults" description="Pre-filled when connecting a server; every value can be overridden">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Environment">
          <select disabled={!canEdit} className={`${controlClass} w-full`} value={organization.defaultEnvironment} onChange={(event) => set("defaultEnvironment", event.target.value as Organization["defaultEnvironment"])}>
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
          </select>
        </Field>
        <Field label="Root path">
          <input disabled={!canEdit} className={`${controlClass} w-full font-mono`} value={organization.defaultRootPath} onChange={(event) => set("defaultRootPath", event.target.value)} />
        </Field>
        <Field label="Audit retention">
          <select disabled={!canEdit} className={`${controlClass} w-full`} value={organization.auditRetentionDays} onChange={(event) => set("auditRetentionDays", Number(event.target.value))}>
            {RETENTION.map((days) => <option key={days} value={days}>{days >= 365 ? `${Math.round(days / 365)} year${days >= 730 ? "s" : ""}` : `${days} days`}</option>)}
          </select>
        </Field>
      </div>
    </Panel>

    <Panel title="Governance" description="Enforced by the API when a server is connected">
      <div className="divide-y divide-white/[0.06]">
        {[
          { key: "enforceHostKeyPinning" as const, title: "Require a pinned host key", description: "Refuse connections that have not pinned the server's SSH host key." },
          { key: "allowPasswordAuth" as const, title: "Allow password authentication", description: "When off, connections must use a private key." },
          { key: "requireDeployApproval" as const, title: "Require deployment approval", description: "Production releases wait for a second person." },
        ].map((policy) => <div key={policy.key} className="flex items-center justify-between gap-3 py-3">
          <div>
            <p className="text-xs font-medium text-zinc-300">{policy.title}</p>
            <p className="mt-1 text-[10px] text-zinc-600">{policy.description}</p>
          </div>
          <Toggle
            label={policy.title}
            checked={organization[policy.key]}
            onChange={(checked) => canEdit && set(policy.key, checked)}
          />
        </div>)}
      </div>
      <p className="mt-3 flex items-start gap-2 text-[10px] leading-4 text-zinc-600">
        <Shield className="mt-0.5 size-3 shrink-0" />
        These are checked server-side when a connection is created, so they hold regardless of
        which client is used.
      </p>
    </Panel>
  </form>;
}

export const WorkspacePage = WorkspaceSettingsPage;
export default WorkspaceSettingsPage;

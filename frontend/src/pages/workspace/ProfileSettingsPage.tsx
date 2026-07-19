import { FormEvent, useEffect, useState } from "react";
import { Globe2, Mail, Save, User } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { buttonClass, controlClass, Field, PageHeader, Panel, primaryButtonClass, Toggle, pageContainerClass } from "./_shared";

/**
 * The signed-in person's profile.
 *
 * Every field here previously edited local state and reported "saved" without
 * sending anything, so a reload restored the old values. They now read from and
 * write to the profile API.
 */

interface Profile {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  timezone: string;
  locale: string;
  dateFormat: string;
  preferences: Record<string, boolean | string | number>;
  emailVerified: boolean;
  mfaEnabled: boolean;
  announcementEmailOptOut: boolean;
}

const TIMEZONES = ["UTC", "Asia/Shanghai", "Asia/Karachi", "Europe/London", "America/New_York", "America/Los_Angeles"];
const DATE_FORMATS = ["MMM d, yyyy", "dd/MM/yyyy", "yyyy-MM-dd"];
const TOGGLES = [
  { key: "compactTables", title: "Compact data tables", description: "Show more rows per screen" },
  { key: "relativeTimes", title: "Relative timestamps", description: "Show “8 minutes ago” where possible" },
  { key: "confirmDestructive", title: "Confirm destructive actions", description: "Ask before deleting or overwriting" },
];

export function ProfileSettingsPage() {
  const { updateUser } = useAuth();
  const [profile, setProfile] = useState<Profile>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Profile>("/profile")
      .then(setProfile)
      .catch((error: unknown) => toast.error("Could not load your profile", {
        description: error instanceof Error ? error.message : undefined,
      }));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    if (!profile.name.trim() || !/^\S+@\S+\.\S+$/.test(profile.email)) {
      toast.error("Enter a name and a valid email address");
      return;
    }
    setSaving(true);
    try {
      const response = await api.getEnvelope<Profile>("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: profile.name.trim(),
          email: profile.email,
          jobTitle: profile.jobTitle,
          timezone: profile.timezone,
          locale: profile.locale,
          dateFormat: profile.dateFormat,
          preferences: profile.preferences,
          announcementEmailOptOut: profile.announcementEmailOptOut,
        }),
        headers: { "content-type": "application/json" },
      });
      setProfile(response.data);
      // Keeps the shell's header in step with the saved name.
      updateUser({ name: response.data.name, email: response.data.email });
      toast.success("Profile saved", {
        description: response.meta?.emailVerificationSent
          ? "Confirm your new email address using the link we just sent."
          : undefined,
      });
    } catch (error) {
      toast.error("Could not save your profile", { description: error instanceof Error ? error.message : undefined });
    } finally { setSaving(false); }
  }

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((current) => (current ? { ...current, [key]: value } : current));
  }

  if (!profile) return <p className="p-8 text-center text-xs text-zinc-600">Loading your profile…</p>;

  const initials = profile.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return <form onSubmit={submit} className={pageContainerClass}>
    <PageHeader
      eyebrow="Personal settings"
      title="Profile"
      description="Your identity, locale, and interface preferences."
      actions={<button type="submit" disabled={saving} className={primaryButtonClass}>
        <Save className="size-3.5" />{saving ? "Saving…" : "Save profile"}
      </button>}
    />

    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Panel title="Identity" description="Shown on activity and audit records">
        <div className="grid place-items-center py-4 text-center">
          <span className="grid size-24 place-items-center rounded-full border border-white/[0.09] bg-gradient-to-br from-indigo-500/25 to-violet-500/10 text-2xl font-semibold text-white">{initials}</span>
          <p className="mt-4 text-sm font-medium text-zinc-200">{profile.name}</p>
          <p className="mt-1 text-xs text-zinc-600">{profile.email}</p>
          {!profile.emailVerified && (
            <button
              type="button"
              className={`${buttonClass} mt-3`}
              onClick={() => void api.auth.resendVerification()
                .then(() => toast.success("Confirmation email sent"))
                .catch(() => toast.error("Could not send the confirmation email"))}
            >
              Resend confirmation
            </button>
          )}
        </div>
      </Panel>

      <Panel title="Personal information" description="Used for activity records and notifications">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name">
            <div className="relative">
              <User className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" />
              <input value={profile.name} onChange={(event) => set("name", event.target.value)} className={`${controlClass} w-full pl-9`} />
            </div>
          </Field>
          <Field label="Job title">
            <input value={profile.jobTitle ?? ""} onChange={(event) => set("jobTitle", event.target.value)} className={`${controlClass} w-full`} placeholder="Platform engineer" />
          </Field>
          <Field label="Email address" hint={profile.emailVerified ? "Confirmed" : "Changing this requires confirming the new address."}>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" />
              <input type="email" value={profile.email} onChange={(event) => set("email", event.target.value)} className={`${controlClass} w-full pl-9`} />
            </div>
          </Field>
          <Field label="Account ID">
            <input readOnly value={profile.id} className={`${controlClass} w-full font-mono opacity-60`} />
          </Field>
        </div>
      </Panel>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Locale and formats" description="Timestamps are stored in UTC and rendered in your timezone">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Timezone">
            <select value={profile.timezone} onChange={(event) => set("timezone", event.target.value)} className={`${controlClass} w-full`}>
              {TIMEZONES.map((zone) => <option key={zone}>{zone}</option>)}
            </select>
          </Field>
          <Field label="Language">
            <select value={profile.locale} onChange={(event) => set("locale", event.target.value)} className={`${controlClass} w-full`}>
              <option value="en">English</option>
              <option value="zh">Chinese</option>
              <option value="es">Spanish</option>
              <option value="de">German</option>
            </select>
          </Field>
          <Field label="Date format">
            <select value={profile.dateFormat} onChange={(event) => set("dateFormat", event.target.value)} className={`${controlClass} w-full`}>
              {DATE_FORMATS.map((format) => <option key={format}>{format}</option>)}
            </select>
          </Field>
          <div className="flex items-end">
            <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-white/[0.07] px-3 text-xs text-zinc-500">
              <Globe2 className="size-3.5" />
              {new Date().toLocaleString(profile.locale, { timeZone: profile.timezone, dateStyle: "medium", timeStyle: "short" })}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Interface preferences" description="Applied to your account only">
        <div className="divide-y divide-white/[0.06]">
          {TOGGLES.map((item) => <div key={item.key} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-xs font-medium text-zinc-300">{item.title}</p>
              <p className="mt-1 text-[10px] text-zinc-600">{item.description}</p>
            </div>
            <Toggle
              label={item.title}
              checked={Boolean(profile.preferences[item.key])}
              onChange={(checked) => set("preferences", { ...profile.preferences, [item.key]: checked })}
            />
          </div>)}
          <div className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-xs font-medium text-zinc-300">Product announcement email</p>
              <p className="mt-1 text-[10px] text-zinc-600">
                Turning this off stops product announcements only. Password resets and security
                notices are always sent.
              </p>
            </div>
            <Toggle
              label="Product announcement email"
              checked={!profile.announcementEmailOptOut}
              onChange={(checked) => set("announcementEmailOptOut", !checked)}
            />
          </div>
        </div>
      </Panel>
    </div>
  </form>;
}

export const ProfilePage = ProfileSettingsPage;
export default ProfileSettingsPage;

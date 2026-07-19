import { FormEvent, useCallback, useEffect, useState } from "react";
import { Laptop, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type SessionSummary } from "@/lib/api";
import { relativeTime } from "@/lib/utils";
import { buttonClass, controlClass, IconButton, PageHeader, Panel, StatusBadge } from "./_shared";

/**
 * Account protection.
 *
 * This page previously showed invented sessions and SSH keys, and offered an
 * MFA toggle with a placeholder QR code that enrolled nothing. Someone could
 * have believed their account was protected by a second factor when it was not,
 * which is worse than the feature being absent.
 *
 * Password changes and session revocation are real. Enrolment for MFA and
 * account-level SSH keys is not built, and the page says so rather than
 * simulating it.
 */

function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown client";
  const browser = /Edg\//.test(userAgent) ? "Edge"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) && !/Chrome/.test(userAgent) ? "Safari"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : "Browser";
  const platform = /Windows/.test(userAgent) ? "Windows"
    : /Macintosh|Mac OS/.test(userAgent) ? "macOS"
    : /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Android/.test(userAgent) ? "Android"
    : /Linux/.test(userAgent) ? "Linux"
    : "";
  return platform ? `${browser} on ${platform}` : browser;
}

export function SecuritySettingsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);

  const load = useCallback(async () => {
    try { setSessions(await api.auth.sessions()); }
    catch (error) {
      toast.error("Could not load your sessions", { description: error instanceof Error ? error.message : undefined });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const next = String(data.get("new"));
    if (next.length < 10) { toast.error("Use at least 10 characters"); return; }
    if (next !== String(data.get("confirm"))) { toast.error("The new passwords do not match"); return; }

    setChanging(true);
    try {
      await api.auth.changePassword(String(data.get("current")), next);
      form.reset();
      // The server ends every other session on a password change, so the list
      // is reloaded to reflect that rather than left stale.
      await load();
      toast.success("Password changed", { description: "Your other sessions were signed out." });
    } catch (error) {
      toast.error("Could not change your password", { description: error instanceof Error ? error.message : undefined });
    } finally { setChanging(false); }
  }

  async function revoke(session: SessionSummary) {
    try {
      await api.auth.revokeSession(session.id);
      toast.success("Session revoked");
      await load();
    } catch (error) {
      toast.error("Could not revoke that session", { description: error instanceof Error ? error.message : undefined });
    }
  }

  async function revokeOthers() {
    const others = sessions.filter((session) => !session.current);
    if (others.length === 0) { toast.info("There are no other sessions"); return; }
    for (const session of others) {
      await api.auth.revokeSession(session.id).catch(() => undefined);
    }
    await load();
    toast.success(`${others.length} session${others.length === 1 ? "" : "s"} revoked`);
  }

  return <div className="space-y-5">
    <PageHeader
      eyebrow="Account protection"
      title="Security"
      description="Your password and the devices signed into this account."
    />

    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Change password" description="Signs out every other session">
        <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-2">
          <label className="text-[10px] text-zinc-400 sm:col-span-2">
            Current password
            <input name="current" type="password" required autoComplete="current-password" className={`${controlClass} mt-1.5 w-full`} />
          </label>
          <label className="text-[10px] text-zinc-400">
            New password
            <input name="new" type="password" required minLength={10} autoComplete="new-password" className={`${controlClass} mt-1.5 w-full`} />
          </label>
          <label className="text-[10px] text-zinc-400">
            Confirm password
            <input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={`${controlClass} mt-1.5 w-full`} />
          </label>
          <button disabled={changing} className={`${buttonClass} sm:col-span-2`}>{changing ? "Updating…" : "Update password"}</button>
        </form>
      </Panel>

      <Panel title="Additional protection" description="Not yet available">
        <div className="space-y-3 text-[10px] leading-5 text-zinc-500">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-zinc-600" />
            Multi-factor authentication and account-level SSH keys are not built yet. This page
            will not offer a toggle that enrols nothing, because believing an account is protected
            when it is not is worse than knowing it is not.
          </p>
          <p className="text-zinc-600">
            Sessions expire on their own, a password change signs out every other device, and
            server credentials are encrypted at rest.
          </p>
        </div>
      </Panel>
    </div>

    <Panel
      title="Active sessions"
      description="Devices signed into this account"
      actions={<button className={buttonClass} onClick={() => void revokeOthers()}>Revoke others</button>}
      flush
    >
      {loading
        ? <p className="p-6 text-center text-[10px] text-zinc-600">Loading…</p>
        : <div className="divide-y divide-white/[0.06]">
            {sessions.map((session) => <div key={session.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_170px_140px_auto] sm:items-center">
              <div className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-lg bg-white/[0.04] text-zinc-500"><Laptop className="size-3.5" /></span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-zinc-300">{deviceLabel(session.userAgent)}</p>
                    {session.current && <StatusBadge status="current" />}
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-600">Signed in {relativeTime(session.createdAt)}</p>
                </div>
              </div>
              <span className="font-mono text-[10px] text-zinc-500">{session.ip ?? "unknown"}</span>
              <span className="text-[10px] text-zinc-500">
                {session.lastUsedAt ? `Active ${relativeTime(session.lastUsedAt)}` : "Not used"}
              </span>
              {session.current
                ? <span />
                : <IconButton title="Revoke session" onClick={() => void revoke(session)}><Trash2 className="size-3.5" /></IconButton>}
            </div>)}
            {sessions.length === 0 && <p className="p-6 text-center text-[10px] text-zinc-600">No active sessions</p>}
          </div>}
    </Panel>
  </div>;
}

export const SecurityPage = SecuritySettingsPage;
export default SecuritySettingsPage;

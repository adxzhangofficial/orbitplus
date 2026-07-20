import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, ShieldCheck, ShieldOff } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAction } from "@/hooks/use-action";
import { relativeTime } from "@/lib/utils";
import { buttonClass, controlClass, dangerButtonClass, Panel, primaryButtonClass } from "./_shared";

/**
 * Two-factor enrolment.
 *
 * The account holds SSH credentials for production servers, so a password alone
 * being enough was the weakest link in the product. This is the interface for
 * closing it.
 *
 * Enrolment is two steps because a scan can silently fail. A secret is issued
 * and held pending until a code proves it works; only then does sign-in start
 * requiring one. Enabling on issue would lock people out of their own accounts.
 */

interface Status {
  enabled: boolean;
  enrolledAt: string | null;
  remainingRecoveryCodes: number;
}

export function MfaPanel() {
  const [status, setStatus] = useState<Status>();
  const [secret, setSecret] = useState<string>();
  const [qr, setQr] = useState<string>();
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>();
  const [disabling, setDisabling] = useState(false);
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try { setStatus(await api.auth.mfaStatus()); }
    catch { /* the panel renders its loading state */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const [begin, beginning] = useAction(async () => {
    const result = await api.auth.beginMfaEnrolment();
    setSecret(result.secret);
    setCode("");
    // Rendered locally rather than fetched from an image service, so the
    // secret never leaves the browser to a third party.
    setQr(await QRCode.toDataURL(result.otpauthUri, { margin: 1, width: 220, color: { dark: "#e4e4e7", light: "#00000000" } }));
  });

  const [enable, enabling] = useAction(async () => {
    try {
      const result = await api.auth.enableMfa(code.trim());
      setRecoveryCodes(result.recoveryCodes);
      setSecret(undefined);
      setQr(undefined);
      setCode("");
      await refresh();
      toast.success("Two-factor authentication enabled");
    } catch (error) {
      toast.error("That code was not accepted", {
        description: error instanceof Error ? error.message : "Check your authenticator and try the next code.",
      });
    }
  });

  const [disable, disablingNow] = useAction(async () => {
    try {
      await api.auth.disableMfa(password, code.trim());
      setDisabling(false);
      setPassword("");
      setCode("");
      await refresh();
      toast.success("Two-factor authentication disabled");
    } catch (error) {
      toast.error("Could not disable", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  });

  const [regenerate, regenerating] = useAction(async () => {
    try {
      const result = await api.auth.regenerateRecoveryCodes(code.trim());
      setRecoveryCodes(result.recoveryCodes);
      setCode("");
      await refresh();
      toast.success("New recovery codes issued", { description: "The previous set no longer works." });
    } catch (error) {
      toast.error("Could not issue new codes", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  });

  function copyCodes() {
    if (!recoveryCodes) return;
    void navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  // Shown once, immediately after they are issued. They are stored hashed, so
  // this is genuinely the only time they can be read.
  if (recoveryCodes) {
    return (
      <Panel title="Save your recovery codes" description="Shown once. Each works a single time if you lose your device.">
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-3">
          {recoveryCodes.map((recovery) => (
            <code key={recovery} className="font-mono text-[11px] tracking-wide text-amber-100">{recovery}</code>
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-4 text-zinc-500">
          Store these somewhere you can reach without this device. They are kept hashed, so
          nobody — including us — can show them to you again.
        </p>
        <div className="mt-4 flex gap-2">
          <button className={buttonClass} onClick={copyCodes}>
            {copied ? <><Check className="size-3" />Copied</> : <><Copy className="size-3" />Copy all</>}
          </button>
          <button className={primaryButtonClass} onClick={() => setRecoveryCodes(undefined)}>
            I have saved them
          </button>
        </div>
      </Panel>
    );
  }

  if (!status) {
    return <Panel title="Two-factor authentication" description="Loading…"><p className="text-[10px] text-zinc-600">Checking your account…</p></Panel>;
  }

  if (status.enabled) {
    return (
      <Panel
        title="Two-factor authentication"
        description={status.enrolledAt ? `Enabled ${relativeTime(status.enrolledAt)}` : "Enabled"}
      >
        <div className="flex items-start gap-2.5 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] p-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
          <div>
            <p className="text-xs font-medium text-emerald-200">Your account requires a second factor</p>
            <p className="mt-1 text-[10px] leading-4 text-zinc-400">
              A password alone will not sign you in. {status.remainingRecoveryCodes} recovery
              {status.remainingRecoveryCodes === 1 ? " code remains" : " codes remain"}.
            </p>
          </div>
        </div>

        {status.remainingRecoveryCodes <= 2 && (
          <p className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-3 text-[10px] leading-4 text-amber-200/90">
            You are running low on recovery codes. Issue a new set before you run out, or losing
            your device would lock you out of the account.
          </p>
        )}

        <div className="mt-4 space-y-3">
          <label className="block text-[10px] text-zinc-400">
            Current authentication code
            <input
              className={`${controlClass} mt-1.5 w-full font-mono tracking-[0.2em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>

          {disabling && (
            <label className="block text-[10px] text-zinc-400">
              Your password
              <input
                type="password"
                autoComplete="current-password"
                className={`${controlClass} mt-1.5 w-full`}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClass}
              disabled={regenerating || code.trim().length < 6}
              onClick={() => void regenerate()}
            >
              <KeyRound className="size-3" />{regenerating ? "Issuing…" : "New recovery codes"}
            </button>

            {disabling ? (
              <>
                <button
                  className={dangerButtonClass}
                  disabled={disablingNow || code.trim().length < 6 || !password}
                  onClick={() => void disable()}
                >
                  <ShieldOff className="size-3" />{disablingNow ? "Disabling…" : "Confirm disable"}
                </button>
                <button className={buttonClass} onClick={() => { setDisabling(false); setPassword(""); }}>Cancel</button>
              </>
            ) : (
              <button className={buttonClass} onClick={() => setDisabling(true)}>
                <ShieldOff className="size-3" />Disable
              </button>
            )}
          </div>

          {disabling && (
            <p className="text-[10px] leading-4 text-zinc-600">
              Both your password and a current code are required. Removing a protection is exactly
              when to prove both, so a stolen session cannot strip it.
            </p>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Two-factor authentication" description="Not enabled">
      {!secret ? (
        <>
          <p className="text-[10px] leading-5 text-zinc-500">
            Your account can reach the servers you have connected. A second factor means a stolen
            password is not enough to use them.
          </p>
          <button className={`${primaryButtonClass} mt-4`} onClick={() => void begin()} disabled={beginning}>
            {beginning ? <LoaderCircle className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            {beginning ? "Preparing…" : "Set up two-factor"}
          </button>
        </>
      ) : (
        <>
          <p className="text-[10px] leading-4 text-zinc-500">
            Scan this with your authenticator, then enter the code it shows to confirm it worked.
          </p>
          <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {qr && <img src={qr} alt="Two-factor setup QR code" className="shrink-0 rounded-lg bg-black/20 p-2" width={180} height={180} />}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-zinc-500">Or enter this key by hand:</p>
              <code className="mt-1.5 block break-all rounded-lg border border-white/[0.08] bg-black/20 p-2.5 font-mono text-[11px] tracking-wide text-zinc-300">
                {secret}
              </code>
              <label className="mt-3 block text-[10px] text-zinc-400">
                Code from your app
                <input
                  autoFocus
                  className={`${controlClass} mt-1.5 w-full font-mono tracking-[0.2em]`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </label>
              <div className="mt-3 flex gap-2">
                <button className={primaryButtonClass} disabled={enabling || code.trim().length < 6} onClick={() => void enable()}>
                  {enabling ? "Confirming…" : "Confirm and enable"}
                </button>
                <button className={buttonClass} onClick={() => { setSecret(undefined); setQr(undefined); setCode(""); }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

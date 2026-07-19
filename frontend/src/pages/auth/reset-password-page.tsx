import { FormEvent, useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, Loader2, LockKeyhole, TriangleAlert } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [complete, setComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    setError("");
    setSubmitting(true);
    try {
      await api.auth.resetPassword(token, password);
      // Every session was revoked server-side, so any stale local token is dead.
      api.clearSession();
      setComplete(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This reset link is invalid or has expired.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return <AuthLayout title="Reset link required" description="Open the link from your reset email to continue.">
      <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-6 text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-full bg-amber-400/10 text-amber-300"><TriangleAlert className="size-4" /></span>
        <p className="mt-4 text-[10px] leading-5 text-zinc-500">This page needs a reset token. Request a new link and open it from your inbox.</p>
        <Link to="/forgot-password"><Button variant="outline" className="mt-5">Request a new link<ArrowRight /></Button></Link>
      </div>
    </AuthLayout>;
  }

  return <AuthLayout title={complete ? "Password updated" : "Choose a new password"} description={complete ? "Your other active sessions were safely revoked." : "Use a unique password you do not use for server credentials."}>
    {complete
      ? <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-6 text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check className="size-4" /></span>
          <p className="mt-4 text-[10px] leading-5 text-zinc-500">You can now sign in with the new password.</p>
          <Link to="/sign-in"><Button className="mt-5">Continue to sign in<ArrowRight /></Button></Link>
        </div>
      : <form onSubmit={submit} className="space-y-4">
          <Field label="New password">
            <div className="relative">
              <LockKeyhole className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" />
              <Input type={visible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="px-8" autoComplete="new-password" required />
              <button type="button" onClick={() => setVisible((value) => !value)} className="absolute right-0 top-0 grid size-8 place-items-center text-zinc-600">{visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button>
            </div>
          </Field>
          <Field label="Confirm password">
            <Input type={visible ? "text" : "password"} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" required />
          </Field>
          {error && <p className="rounded-md border border-red-400/15 bg-red-400/5 p-3 text-[9px] text-red-300">{error}</p>}
          <Button type="submit" size="lg" disabled={submitting} className="w-full">
            {submitting ? <><Loader2 className="animate-spin" />Updating…</> : <>Update password<ArrowRight /></>}
          </Button>
        </form>}
  </AuthLayout>;
}

export default ResetPasswordPage;

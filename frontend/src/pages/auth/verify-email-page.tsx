import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, Mail, RefreshCw, TriangleAlert } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";

type State = "idle" | "confirming" | "confirmed" | "failed";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<State>(token ? "confirming" : "idle");
  const [error, setError] = useState<string>();
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  // React 18+ mounts effects twice in development; the token is single-use, so
  // a second confirm would fail against an already-consumed token.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    void api.auth.verifyEmail(token)
      .then(() => setState("confirmed"))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "This confirmation link is invalid or has expired.");
        setState("failed");
      });
  }, [token]);

  async function resend() {
    setResending(true);
    try {
      await api.auth.resendVerification();
      setResent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send a new link. Sign in and try again.");
    } finally {
      setResending(false);
    }
  }

  if (state === "confirming") {
    return <AuthLayout title="Confirming your email" description="This only takes a moment.">
      <div className="rounded-xl border border-white/10 bg-white/[0.018] p-8 text-center">
        <Loader2 className="mx-auto size-6 animate-spin text-zinc-500" />
      </div>
    </AuthLayout>;
  }

  if (state === "confirmed") {
    return <AuthLayout title="Email confirmed" description="Your workspace is ready to connect infrastructure.">
      <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-6 text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check className="size-4" /></span>
        <p className="mt-4 text-[10px] leading-5 text-zinc-500">Your email address has been confirmed.</p>
        <Link to="/sign-in"><Button className="mt-5">Continue to sign in<ArrowRight /></Button></Link>
      </div>
    </AuthLayout>;
  }

  return <AuthLayout title="Verify your email" description="Confirm your address before connecting production infrastructure.">
    <div className="rounded-xl border border-white/10 bg-white/[0.018] p-6 text-center">
      <span className={`mx-auto grid size-11 place-items-center rounded-full border ${state === "failed" ? "border-amber-400/15 bg-amber-400/5 text-amber-300" : "border-blue-400/15 bg-blue-400/5 text-blue-300"}`}>
        {state === "failed" ? <TriangleAlert className="size-4" /> : <Mail className="size-4" />}
      </span>
      <p className="mt-5 text-[10px] leading-5 text-zinc-500">
        {state === "failed"
          ? error ?? "This confirmation link is invalid or has expired."
          : "We sent a confirmation link to your work email. The link expires in 24 hours and can be used once."}
      </p>
      {resent && <p className="mt-3 flex items-center justify-center gap-1.5 text-[9px] text-emerald-300"><Check className="size-3" />A new link was sent.</p>}
      <Button variant="outline" className="mt-5" onClick={resend} disabled={resending}>
        {resending ? <><Loader2 className="animate-spin" />Sending…</> : <><RefreshCw />Resend email</>}
      </Button>
      <p className="mt-3 text-[9px] text-zinc-600">Resending requires an active session.</p>
    </div>
    <Link to="/sign-in" className="mt-5 flex items-center justify-center gap-1.5 text-[9px] text-zinc-500 hover:text-white">Return to sign in<ArrowRight className="size-3" /></Link>
  </AuthLayout>;
}

export default VerifyEmailPage;

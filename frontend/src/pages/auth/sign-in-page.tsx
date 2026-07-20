import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Github, LoaderCircle, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Field, Input } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import { ApiError } from "@/lib/api";
import type { User } from "@/types";

export function SignInPage() {
  const [email, setEmail] = useState("demo@orbit.dev");
  const [password, setPassword] = useState("OrbitDemo123!");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  /** Set when the password was accepted but a second factor is still required. */
  const [challengeToken, setChallengeToken] = useState<string>();
  const [code, setCode] = useState("");
  const { signIn, completeMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  function goOnward(user: User) {
    void navigate(user.role === "platform_admin" ? "/admin" : from ?? "/workspace", { replace: true });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const outcome = await signIn(email, password);
      // A correct password is not a session when a second factor is enrolled.
      if (outcome.mfaRequired) {
        setChallengeToken(outcome.challengeToken);
        setCode("");
        return;
      }
      goOnward(outcome.user);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We could not sign you in. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      goOnward(await completeMfa(challengeToken!, code));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That code was not accepted. Try the next one.");
    } finally {
      setLoading(false);
    }
  }

  if (challengeToken) {
    return (
      <AuthLayout title="Two-factor authentication" description="Enter the code from your authenticator app.">
        <form onSubmit={submitCode} className="space-y-4">
          <Field label="Authentication code" hint="Or enter one of your recovery codes.">
            <Input
              autoFocus
              // A numeric keypad on mobile, and nothing autocorrecting the digits.
              inputMode="numeric"
              autoComplete="one-time-code"
              spellCheck={false}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              className="text-center font-mono text-base tracking-[0.3em]"
            />
          </Field>

          {error && <p className="rounded-md border border-red-400/15 bg-red-400/5 p-3 text-[9px] text-red-300">{error}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={loading || code.trim().length < 6}>
            {loading ? <LoaderCircle className="animate-spin" /> : <>Verify<ArrowRight /></>}
          </Button>

          <button
            type="button"
            onClick={() => { setChallengeToken(undefined); setError(""); setCode(""); }}
            className="flex w-full items-center justify-center gap-1.5 text-[9px] text-zinc-500 transition hover:text-zinc-300"
          >
            <ArrowLeft className="size-3" />Back to sign in
          </button>
        </form>

        <p className="mt-7 text-center text-[10px] leading-4 text-zinc-600">
          Lost your device? Use a recovery code above, or ask your workspace owner.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Welcome back" description="Sign in to your server workspace.">
      <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="w-full"><Github />GitHub</Button><Button variant="outline" className="w-full"><ShieldCheck />SSO</Button></div><div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-white/8" /><span className="text-[8px] uppercase tracking-wider text-zinc-700">or use email</span><span className="h-px flex-1 bg-white/8" /></div>
      <form onSubmit={submit} className="space-y-4"><Field label="Work email"><Input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></Field><Field label="Password"><div className="relative"><Input type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="pr-9" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-0 top-0 grid size-8 place-items-center text-zinc-600 hover:text-zinc-300">{showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button></div></Field><div className="flex items-center justify-between"><label className="flex items-center gap-2 text-[9px] text-zinc-500"><input type="checkbox" defaultChecked className="size-3 accent-blue-500" />Keep me signed in</label><Link to="/forgot-password" className="text-[9px] text-zinc-400 hover:text-white">Forgot password?</Link></div>{error && <p className="rounded-md border border-red-400/15 bg-red-400/5 p-3 text-[9px] text-red-300">{error}</p>}<Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? <LoaderCircle className="animate-spin" /> : <>Sign in<ArrowRight /></>}</Button></form>
      
      <p className="mt-7 text-center text-[10px] text-zinc-600">New to Orbit? <Link to="/register" className="text-zinc-300 hover:text-white">Create a free workspace</Link></p>
    </AuthLayout>
  );
}

export default SignInPage;

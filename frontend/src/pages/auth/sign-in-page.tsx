import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Github, LoaderCircle, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Field, Input } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import { ApiError } from "@/lib/api";

export function SignInPage() {
  const [email, setEmail] = useState("demo@orbit.dev");
  const [password, setPassword] = useState("OrbitDemo123!");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { signIn, enterDemo, demoEnabled } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await signIn(email, password);
      void navigate(user.role === "platform_admin" ? "/admin" : from ?? "/workspace", { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We could not sign you in. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" description="Sign in to your server workspace.">
      <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="w-full"><Github />GitHub</Button><Button variant="outline" className="w-full"><ShieldCheck />SSO</Button></div><div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-white/8" /><span className="text-[8px] uppercase tracking-wider text-zinc-700">or use email</span><span className="h-px flex-1 bg-white/8" /></div>
      <form onSubmit={submit} className="space-y-4"><Field label="Work email"><Input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></Field><Field label="Password"><div className="relative"><Input type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="pr-9" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-0 top-0 grid size-8 place-items-center text-zinc-600 hover:text-zinc-300">{showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button></div></Field><div className="flex items-center justify-between"><label className="flex items-center gap-2 text-[9px] text-zinc-500"><input type="checkbox" defaultChecked className="size-3 accent-blue-500" />Keep me signed in</label><Link to="/forgot-password" className="text-[9px] text-zinc-400 hover:text-white">Forgot password?</Link></div>{error && <p className="rounded-md border border-red-400/15 bg-red-400/5 p-3 text-[9px] text-red-300">{error}</p>}<Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? <LoaderCircle className="animate-spin" /> : <>Sign in<ArrowRight /></>}</Button></form>
      {demoEnabled && <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => { enterDemo("customer"); void navigate("/workspace"); }} className="h-8 rounded-md border border-white/8 text-[9px] text-zinc-500 hover:bg-white/5 hover:text-white">Customer demo</button><button type="button" onClick={() => { enterDemo("admin"); void navigate("/admin"); }} className="h-8 rounded-md border border-[#d8ff4f]/15 text-[9px] text-[#d8ff4f]/70 hover:bg-[#d8ff4f]/5">Admin demo</button></div>}
      <p className="mt-7 text-center text-[10px] text-zinc-600">New to Orbit? <Link to="/register" className="text-zinc-300 hover:text-white">Create a free workspace</Link></p>
    </AuthLayout>
  );
}

export default SignInPage;

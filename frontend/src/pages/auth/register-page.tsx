import { useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Field, Input } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";

export function RegisterPage() {
  const [form, setForm] = useState({ name: "", organizationName: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { register } = useAuth();
  const navigate = useNavigate();
  const strength = [form.password.length >= 10, /[A-Z]/.test(form.password), /\d/.test(form.password), /[^A-Za-z0-9]/.test(form.password)].filter(Boolean).length;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (strength < 3) { setError("Choose a stronger password before continuing."); return; }
    setLoading(true); setError("");
    try { await register(form); void navigate("/workspace"); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create the workspace."); } finally { setLoading(false); }
  }
  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((value) => ({ ...value, [key]: event.target.value }));
  return (
    <AuthLayout title="Create your workspace" description="Connect two servers free. No card, no trial clock.">
      <form onSubmit={submit} className="space-y-4"><div className="grid grid-cols-2 gap-3"><Field label="Your name"><Input required autoComplete="name" value={form.name} onChange={update("name")} placeholder="Adeel Khan" /></Field><Field label="Workspace"><Input required value={form.organizationName} onChange={update("organizationName")} placeholder="Acme Engineering" /></Field></div><Field label="Work email"><Input required type="email" autoComplete="email" value={form.email} onChange={update("email")} placeholder="you@company.com" /></Field><Field label="Password"><div className="relative"><Input required minLength={10} type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={update("password")} className="pr-9" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-0 top-0 grid size-8 place-items-center text-zinc-600">{showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button></div><div className="mt-2 flex gap-1">{[0, 1, 2, 3].map((index) => <span key={index} className={`h-1 flex-1 rounded-full ${index < strength ? strength < 3 ? "bg-amber-400" : "bg-emerald-400" : "bg-zinc-800"}`} />)}</div></Field>{error && <p className="rounded-md border border-red-400/15 bg-red-400/5 p-3 text-[9px] text-red-300">{error}</p>}<Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? <LoaderCircle className="animate-spin" /> : <>Create free workspace<ArrowRight /></>}</Button></form>
      <ul className="mt-5 grid grid-cols-2 gap-2 text-[8px] text-zinc-600">{["2 SFTP servers", "Remote editor", "7-day history", "1 GB backup storage"].map((item) => <li key={item} className="flex items-center gap-1.5"><Check className="size-2.5 text-emerald-400" />{item}</li>)}</ul><p className="mt-7 text-center text-[10px] text-zinc-600">Already have a workspace? <Link to="/sign-in" className="text-zinc-300 hover:text-white">Sign in</Link></p>
    </AuthLayout>
  );
}

export default RegisterPage;

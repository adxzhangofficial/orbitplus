import { useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Field, Input } from "@/components/ui";

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    setError(""); setComplete(true);
  }
  return <AuthLayout title={complete ? "Password updated" : "Choose a new password"} description={complete ? "Your other active sessions were safely revoked." : "Use a unique password you do not use for server credentials."}>{complete ? <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-6 text-center"><span className="mx-auto grid size-10 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check className="size-4" /></span><p className="mt-4 text-[10px] leading-5 text-zinc-500">You can now sign in with the new password.</p><Link to="/sign-in"><Button className="mt-5">Continue to sign in<ArrowRight /></Button></Link></div> : <form onSubmit={submit} className="space-y-4"><Field label="New password"><div className="relative"><LockKeyhole className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" /><Input type={visible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="px-8" autoComplete="new-password" required /><button type="button" onClick={() => setVisible((value) => !value)} className="absolute right-0 top-0 grid size-8 place-items-center text-zinc-600">{visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button></div></Field><Field label="Confirm password"><Input type={visible ? "text" : "password"} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" required /></Field>{error && <p className="rounded-md border border-red-400/15 bg-red-400/5 p-3 text-[9px] text-red-300">{error}</p>}<Button type="submit" size="lg" className="w-full">Update password<ArrowRight /></Button></form>}</AuthLayout>;
}

export default ResetPasswordPage;

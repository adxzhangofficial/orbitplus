import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Field, Input } from "@/components/ui";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return <AuthLayout title="Reset your password" description="We’ll send a secure, single-use link to your work email.">{sent ? <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-6 text-center"><span className="mx-auto grid size-10 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check className="size-4" /></span><h3 className="mt-4 text-base font-semibold">Check your inbox</h3><p className="mt-2 text-[10px] leading-5 text-zinc-500">If an account exists for <span className="text-zinc-300">{email}</span>, a reset link is on its way.</p><Link to="/sign-in"><Button variant="outline" className="mt-5"><ArrowLeft />Back to sign in</Button></Link></div> : <form onSubmit={(event) => { event.preventDefault(); setSent(true); }}><Field label="Work email"><div className="relative"><Mail className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" /><Input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="pl-8" placeholder="you@company.com" /></div></Field><Button type="submit" size="lg" className="mt-5 w-full">Send reset link<ArrowRight /></Button><Link to="/sign-in" className="mt-5 flex items-center justify-center gap-1.5 text-[9px] text-zinc-500 hover:text-white"><ArrowLeft className="size-3" />Back to sign in</Link></form>}</AuthLayout>;
}

export default ForgotPasswordPage;

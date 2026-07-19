import { useState } from "react";
import { ArrowRight, Check, Mail, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui";

export function VerifyEmailPage() {
  const [sent, setSent] = useState(false);
  return <AuthLayout title="Verify your email" description="Confirm your address before connecting production infrastructure."><div className="rounded-xl border border-white/10 bg-white/[0.018] p-6 text-center"><span className="mx-auto grid size-11 place-items-center rounded-full border border-blue-400/15 bg-blue-400/5 text-blue-300"><Mail className="size-4" /></span><p className="mt-5 text-[10px] leading-5 text-zinc-500">We sent a verification link to your work email. The link expires in 30 minutes and can be used once.</p>{sent && <p className="mt-3 flex items-center justify-center gap-1.5 text-[9px] text-emerald-300"><Check className="size-3" />A new link was sent.</p>}<Button variant="outline" className="mt-5" onClick={() => setSent(true)}><RefreshCw />Resend email</Button></div><Link to="/sign-in" className="mt-5 flex items-center justify-center gap-1.5 text-[9px] text-zinc-500 hover:text-white">Return to sign in<ArrowRight className="size-3" /></Link></AuthLayout>;
}

export default VerifyEmailPage;

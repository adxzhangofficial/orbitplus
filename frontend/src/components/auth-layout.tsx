import type { ReactNode } from "react";
import { Activity, ArchiveRestore, Check, FileCode2, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";

export function AuthLayout({ children, title, description }: { children: ReactNode; title: string; description: string }) {
  return (
    <div className="grid min-h-screen bg-[#08090b] text-zinc-100 lg:grid-cols-[minmax(0,1fr)_520px]">
      <section className="marketing-glow surface-grid relative hidden overflow-hidden border-r border-white/8 p-12 lg:flex lg:flex-col"><Brand /><div className="my-auto max-w-xl"><p className="text-[9px] uppercase tracking-[0.15em] text-blue-400">A calmer way to operate</p><h1 className="mt-5 text-balance text-5xl font-semibold leading-tight">Every server, file, deployment, and recovery point in one secure orbit.</h1><p className="mt-5 text-sm leading-6 text-zinc-500">Built for the developers and operators responsible for keeping production healthy.</p><div className="mt-9 grid grid-cols-2 gap-3">{[[FileCode2, "Atomic remote editing"], [ArchiveRestore, "Backups and rollback"], [Activity, "Live fleet health"], [ShieldCheck, "Complete audit trail"]].map(([Icon, label]) => <div key={String(label)} className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.018] p-3 text-[9px] text-zinc-400"><Icon className="size-3.5 text-blue-300" />{String(label)}</div>)}</div></div><div className="flex items-center gap-2 text-[8px] text-zinc-700"><Check className="size-3 text-emerald-400" />Host-key verified · encrypted · recoverable by default</div></section>
      <main className="flex min-h-screen items-center justify-center p-5 sm:p-8"><div className="w-full max-w-sm"><div className="mb-10 lg:hidden"><Brand /></div><h2 className="text-3xl font-semibold tracking-tight">{title}</h2><p className="mt-2 text-[11px] leading-5 text-zinc-500">{description}</p><div className="mt-8">{children}</div><p className="mt-8 text-center text-[8px] leading-4 text-zinc-700">By continuing, you agree to Orbit’s Terms and acknowledge the Privacy Policy.</p></div></main>
    </div>
  );
}

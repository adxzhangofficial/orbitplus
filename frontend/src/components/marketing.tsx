import type { ReactNode } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/15 bg-blue-400/[0.06] px-3 py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-blue-300"><span className="size-1.5 rounded-full bg-blue-400" />{children}</span>;
}

export function SectionHeading({ eyebrow, title, description, align = "left", className }: { eyebrow?: string; title: ReactNode; description?: ReactNode; align?: "left" | "center"; className?: string }) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.15em] text-blue-400">{eyebrow}</p>}
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-sm leading-6 text-zinc-500">{description}</p>}
    </div>
  );
}

export function MarketingCTA({ title = "Bring every server into one orbit.", description = "Start free, connect your first server in under a minute, and keep your card in your wallet.", primary = "Start free" }: { title?: string; description?: string; primary?: string }) {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="marketing-glow surface-grid relative mx-auto max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-[#111216] px-6 py-16 text-center sm:px-12">
        <div className="relative z-10 mx-auto max-w-2xl"><p className="mb-3 text-[9px] font-medium uppercase tracking-[0.15em] text-blue-400">Ready when you are</p><h2 className="text-balance text-3xl font-semibold sm:text-4xl">{title}</h2><p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-zinc-500">{description}</p><div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row"><Link to="/register"><Button size="lg">{primary}<ArrowRight /></Button></Link><Link to="/contact"><Button size="lg" variant="outline">Talk to an engineer</Button></Link></div></div>
      </div>
    </section>
  );
}

export function CheckList({ items, className }: { items: string[]; className?: string }) {
  return <ul className={cn("space-y-3", className)}>{items.map((item) => <li key={item} className="flex gap-2.5 text-[11px] leading-5 text-zinc-400"><span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-emerald-400/20 bg-emerald-400/5 text-emerald-300"><Check className="size-2.5" /></span>{item}</li>)}</ul>;
}

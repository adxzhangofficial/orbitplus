import type { ReactNode } from "react";
import { ArrowRight, FileText, Mail } from "lucide-react";
import { Link } from "react-router-dom";

export interface LegalSection {
  title: string;
  content: ReactNode;
}

export function LegalDocument({ eyebrow, title, summary, updated, sections }: { eyebrow: string; title: string; summary: string; updated: string; sections: LegalSection[] }) {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-20 sm:px-6 lg:px-8">
      <header className="max-w-3xl"><p className="text-[9px] font-medium uppercase tracking-[0.15em] text-blue-400">{eyebrow}</p><h1 className="mt-5 text-5xl font-semibold tracking-tight sm:text-6xl">{title}</h1><p className="mt-5 text-sm leading-7 text-zinc-500">{summary}</p><div className="mt-6 flex flex-wrap items-center gap-4 text-[9px] text-zinc-700"><span>Effective {updated}</span><span>Version 1.0</span><a href="mailto:legal@orbit.dev" className="flex items-center gap-1.5 text-zinc-500 hover:text-white"><Mail className="size-3" />legal@orbit.dev</a></div></header>
      <div className="mt-14 grid gap-12 lg:grid-cols-[220px_minmax(0,720px)] lg:gap-20"><aside className="hidden lg:block"><div className="sticky top-28 rounded-lg border border-white/8 bg-white/[0.018] p-3"><p className="px-2 pb-2 text-[8px] font-medium uppercase tracking-wider text-zinc-700">On this page</p><nav>{sections.map((section, index) => <a key={section.title} href={`#legal-${index + 1}`} className="flex min-h-7 items-center rounded px-2 text-[9px] text-zinc-600 hover:bg-white/[0.035] hover:text-zinc-300">{index + 1}. {section.title}</a>)}</nav><Link to="/contact" className="mt-3 flex items-center justify-between border-t border-white/8 px-2 pt-3 text-[9px] text-zinc-500 hover:text-white">Questions?<ArrowRight className="size-3" /></Link></div></aside><article className="min-w-0"><div className="mb-8 flex gap-3 rounded-lg border border-blue-400/15 bg-blue-400/[0.04] p-4"><FileText className="mt-0.5 size-4 shrink-0 text-blue-300" /><p className="text-[9px] leading-5 text-blue-200/60">This document is written to explain the agreement clearly. Headings help navigation but do not limit the meaning of a section. Contact us if any obligation is unclear.</p></div><div className="space-y-12">{sections.map((section, index) => <section id={`legal-${index + 1}`} key={section.title} className="scroll-mt-28"><div className="flex items-baseline gap-3"><span className="font-mono text-[9px] text-zinc-700">{String(index + 1).padStart(2, "0")}</span><h2 className="text-2xl font-semibold">{section.title}</h2></div><div className="mt-4 space-y-4 text-[11px] leading-6 text-zinc-500 [&_a]:text-zinc-300 [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-zinc-300">{section.content}</div></section>)}</div><footer className="mt-14 border-t border-white/8 pt-6 text-[9px] text-zinc-700">Orbit Systems, Inc. · Legal team · legal@orbit.dev</footer></article></div>
    </div>
  );
}

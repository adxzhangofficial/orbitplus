import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, eyebrow, actions }: { title: string; subtitle?: string; eyebrow?: string; actions?: ReactNode }) {
  return (
    <header className="border-b border-border px-4 py-5 sm:px-6 md:px-8">
      <div className="mx-auto flex max-w-[1500px] flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-[8px] font-medium uppercase tracking-[0.14em] text-blue-400">{eyebrow}</p>}
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
      </div>
    </header>
  );
}

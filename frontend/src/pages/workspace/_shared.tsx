import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import { EmptyState as BaseEmptyState, Modal as BaseModal, Progress, StatusBadge as BaseStatusBadge, Toggle as BaseToggle } from "@/components/ui";
import { cn } from "@/lib/utils";

export const controlClass =
  "h-9 rounded-lg border border-white/[0.08] bg-[#0b0d12] px-3 text-sm text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-400/10";

export const buttonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-zinc-200 transition hover:border-white/[0.14] hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-40";

export const primaryButtonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-indigo-400/30 bg-indigo-500 px-3 text-xs font-semibold text-white shadow-[0_8px_24px_-12px_rgba(99,102,241,.8)] transition hover:bg-indigo-400 disabled:pointer-events-none disabled:opacity-40";

export const dangerButtonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:pointer-events-none disabled:opacity-40";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-white/[0.06] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-300">{eyebrow}</p> : null}
        <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  flush = false,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-white/[0.07] bg-[#101218] shadow-[0_18px_70px_-45px_rgba(0,0,0,.9)]", className)}>
      {title || actions ? (
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <div className="min-w-0">
            {title ? <h2 className="truncate text-sm font-semibold text-zinc-100">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-[11px] text-zinc-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  detail,
  icon: Icon,
  tone = "indigo",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: LucideIcon;
  tone?: "indigo" | "emerald" | "amber" | "rose" | "sky";
}) {
  const tones = {
    indigo: "bg-indigo-500/10 text-indigo-300 ring-indigo-500/20",
    emerald: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
    rose: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
    sky: "bg-sky-500/10 text-sky-300 ring-sky-500/20",
  };
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#101218] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">{value}</p>
        </div>
        {Icon ? <span className={cn("grid size-8 place-items-center rounded-lg ring-1", tones[tone])}><Icon className="size-4" /></span> : null}
      </div>
      {detail ? <div className="mt-2 text-[11px] text-zinc-500">{detail}</div> : null}
    </div>
  );
}

export function StatusBadge({ status, children }: { status: string; children?: ReactNode }) {
  return children ? <span className="inline-flex h-5 items-center rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[9px] text-zinc-300">{children}</span> : <BaseStatusBadge status={status} className="rounded-md" />;
}

export function SearchField({ value, onChange, placeholder = "Search" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="relative block min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" />
      <input aria-label={placeholder} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={cn(controlClass, "w-full pl-9")} />
    </label>
  );
}

export function ProgressBar({ value, tone = "indigo" }: { value: number; tone?: "indigo" | "emerald" | "amber" | "rose" }) {
  const fill = { indigo: "bg-indigo-400", emerald: "bg-emerald-400", amber: "bg-amber-400", rose: "bg-rose-400" }[tone];
  return <Progress value={value} className="bg-white/[0.06]" indicatorClassName={fill} />;
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return <BaseEmptyState className="m-4 border-white/[0.07]" icon={<Icon />} title={title} description={description} action={action} />;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <BaseToggle checked={checked} onChange={onChange} label={label} />;
}

export function Modal({ open, onClose, title, description, children, footer, wide = false }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return <BaseModal open={open} onClose={onClose} title={title} description={description} footer={footer} size={wide ? "lg" : "md"}>{children}</BaseModal>;
}

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={cn("grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-30", className)} />;
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: Array<{ value: T; label: string }> }) {
  return <div className="inline-flex rounded-lg border border-white/[0.07] bg-[#0b0d12] p-1">{options.map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)} className={cn("h-7 rounded-md px-3 text-[11px] font-medium transition", value === option.value ? "bg-white/[0.08] text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300")}>{option.label}</button>)}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-medium text-zinc-400">{label}</span>{children}{hint ? <span className="mt-1.5 block text-[10px] leading-4 text-zinc-600">{hint}</span> : null}</label>;
}

export const tableWrapClass = "overflow-x-auto";
export const tableClass = "w-full min-w-[720px] text-left text-xs";
export const thClass = "border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600";
export const tdClass = "border-b border-white/[0.05] px-4 py-3 text-zinc-400";

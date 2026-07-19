import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import { EmptyState as BaseEmptyState, Modal as BaseModal, Progress, StatusBadge as BaseStatusBadge, Toggle as BaseToggle } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Shared controls for the workspace pages.
 *
 * These are expressed in the same theme tokens as `@/components/ui`, which the
 * overview, servers, and file explorer already use. They previously carried
 * hardcoded indigo and zinc values, so those three pages and the other fourteen
 * rendered as two visibly different products: different accent colour, panel
 * background, border, and heading treatment. Anything defined here must resolve
 * through a token, otherwise the split reappears the next time the theme moves.
 */

export const controlClass =
  "h-9 rounded-md border border-input bg-black/20 px-3 text-xs text-foreground outline-none transition placeholder:text-zinc-600 focus:border-zinc-500 focus:ring-2 focus:ring-white/5 disabled:cursor-not-allowed disabled:opacity-50";

export const buttonClass =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-transparent px-3 text-[11px] font-medium text-foreground transition hover:bg-muted disabled:pointer-events-none disabled:opacity-40";

export const primaryButtonClass =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-primary bg-primary px-3 text-[11px] font-medium text-primary-foreground transition hover:bg-white disabled:pointer-events-none disabled:opacity-40";

export const dangerButtonClass =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 text-[11px] font-medium text-destructive transition hover:bg-destructive/20 disabled:pointer-events-none disabled:opacity-40";

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
    <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</p> : null}
        {/* Serif heading, matching the overview and server pages. */}
        <h1 className="font-heading text-xl tracking-tight text-foreground sm:text-2xl">{title}</h1>
        <p className="mt-1 max-w-3xl text-[11px] leading-5 text-muted-foreground">{description}</p>
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
    <section className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      {title || actions ? (
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title ? <h2 className="truncate text-xs font-medium text-foreground">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p> : null}
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
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: LucideIcon;
  tone?: "neutral" | "indigo" | "emerald" | "amber" | "rose" | "sky";
}) {
  // Neutral by default. Colour is reserved for a state that means something,
  // so a screen of tiles does not compete for attention with a real alert.
  const tones = {
    neutral: "bg-muted text-muted-foreground ring-border",
    indigo: "bg-indigo-500/10 text-indigo-300 ring-indigo-500/20",
    emerald: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
    rose: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
    sky: "bg-sky-500/10 text-sky-300 ring-sky-500/20",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-xl font-medium tracking-tight text-foreground">{value}</p>
        </div>
        {Icon ? <span className={cn("grid size-8 place-items-center rounded-lg ring-1", tones[tone])}><Icon className="size-4" /></span> : null}
      </div>
      {detail ? <div className="mt-2 text-[10px] text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

export function StatusBadge({ status, children }: { status: string; children?: ReactNode }) {
  return children ? <span className="inline-flex h-5 items-center rounded-md border border-border bg-muted px-2 text-[9px] text-foreground">{children}</span> : <BaseStatusBadge status={status} className="rounded-md" />;
}

export function SearchField({ value, onChange, placeholder = "Search" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="relative block min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input aria-label={placeholder} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={cn(controlClass, "w-full pl-9")} />
    </label>
  );
}

export function ProgressBar({ value, tone = "indigo" }: { value: number; tone?: "indigo" | "emerald" | "amber" | "rose" }) {
  const fill = { indigo: "bg-indigo-400", emerald: "bg-emerald-400", amber: "bg-amber-400", rose: "bg-rose-400" }[tone];
  return <Progress value={value} className="bg-muted" indicatorClassName={fill} />;
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return <BaseEmptyState className="m-4 border-border" icon={<Icon />} title={title} description={description} action={action} />;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <BaseToggle checked={checked} onChange={onChange} label={label} />;
}

export function Modal({ open, onClose, title, description, children, footer, wide = false }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return <BaseModal open={open} onClose={onClose} title={title} description={description} footer={footer} size={wide ? "lg" : "md"}>{children}</BaseModal>;
}

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={cn("grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30", className)} />;
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: Array<{ value: T; label: string }> }) {
  return <div className="inline-flex rounded-md border border-border bg-black/20 p-1">{options.map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)} className={cn("h-7 rounded-md px-3 text-[11px] font-medium transition", value === option.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>{option.label}</button>)}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-medium text-muted-foreground">{label}</span>{children}{hint ? <span className="mt-1.5 block text-[9px] leading-4 text-muted-foreground">{hint}</span> : null}</label>;
}

export const tableWrapClass = "overflow-x-auto";
export const tableClass = "w-full min-w-[720px] text-left text-xs";
export const thClass = "border-b border-border bg-muted/30 px-4 py-2.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground";
export const tdClass = "border-b border-border px-4 py-3 text-[11px] text-muted-foreground";

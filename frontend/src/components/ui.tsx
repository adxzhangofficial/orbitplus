import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
} from "react";
import { AlertTriangle, Check, ChevronRight, LoaderCircle, Search, X } from "lucide-react";
import { cn, initials, statusTone } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "lime";
type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const variants: Record<ButtonVariant, string> = {
    primary: "border-primary bg-primary text-primary-foreground hover:bg-white",
    secondary: "border-border bg-muted text-foreground hover:bg-zinc-700/70",
    outline: "border-border bg-transparent text-foreground hover:bg-muted",
    ghost: "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
    danger: "border-red-400/20 bg-red-500/10 text-red-300 hover:bg-red-500/20",
    lime: "border-[#d8ff4f] bg-[#d8ff4f] text-black hover:bg-[#e2ff79]",
  };
  const sizes: Record<ButtonSize, string> = {
    xs: "h-6 gap-1.5 rounded-md px-2 text-[9px]",
    sm: "h-7 gap-1.5 rounded-md px-2.5 text-[10px]",
    md: "h-8 gap-2 rounded-md px-3 text-xs",
    lg: "h-10 gap-2 rounded-lg px-4 text-sm",
    icon: "size-8 rounded-md p-0",
  };
  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center border font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-3.5",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="animate-spin" /> : children}
    </button>
  );
}

export function IconButton({ label, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground [&_svg]:size-3.5",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "success" | "warning" | "danger" | "info" | "neutral" | "purple";
  dot?: boolean;
}

export function Badge({ className, tone = "neutral", dot = false, children, ...props }: BadgeProps) {
  const tones = {
    success: "border-emerald-400/20 bg-emerald-400/8 text-emerald-300",
    warning: "border-amber-400/20 bg-amber-400/8 text-amber-300",
    danger: "border-red-400/20 bg-red-400/8 text-red-300",
    info: "border-blue-400/20 bg-blue-400/8 text-blue-300",
    neutral: "border-border bg-white/[0.035] text-zinc-300",
    purple: "border-violet-400/20 bg-violet-400/8 text-violet-300",
  };
  const dots = {
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    danger: "bg-red-400",
    info: "bg-blue-400",
    neutral: "bg-zinc-500",
    purple: "bg-violet-400",
  };
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full items-center gap-1.5 rounded-full border px-2 text-[9px] font-medium capitalize leading-none",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("size-1.5 shrink-0 rounded-full", dots[tone])} />}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <Badge tone={statusTone(status)} dot className={className}>{status.replaceAll("_", " ")}</Badge>;
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-lg border border-border bg-card text-card-foreground", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-4 border-b border-border px-4 py-3", className)} {...props}>{children}</div>;
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold", className)} {...props}>{children}</h3>;
}

export function CardDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-0.5 text-[10px] text-muted-foreground", className)} {...props}>{children}</p>;
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props}>{children}</div>;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded-md border border-input bg-black/20 px-2.5 text-xs text-foreground outline-none transition placeholder:text-zinc-600 focus:border-zinc-500 focus:ring-2 focus:ring-white/5 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function SearchInput({ className, containerClassName, ...props }: InputHTMLAttributes<HTMLInputElement> & { containerClassName?: string }) {
  return (
    <label className={cn("relative block", containerClassName)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" />
      <Input className={cn("pl-8", className)} type="search" {...props} />
    </label>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-y rounded-md border border-input bg-black/20 px-2.5 py-2 text-xs leading-5 text-foreground outline-none placeholder:text-zinc-600 focus:border-zinc-500 focus:ring-2 focus:ring-white/5",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-8 rounded-md border border-input bg-[#111214] px-2.5 text-xs text-foreground outline-none focus:border-zinc-500",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, children, ...props }: HTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[10px] font-medium text-zinc-300", className)} {...props}>{children}</label>;
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {error ? <p className="mt-1.5 text-[9px] text-red-400">{error}</p> : hint ? <p className="mt-1.5 text-[9px] leading-4 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Progress({ value, className, indicatorClassName }: { value: number; className?: string; indicatorClassName?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-zinc-800", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full bg-zinc-200 transition-[width] duration-500", indicatorClassName)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-5 w-9 rounded-full border transition-colors disabled:opacity-50", checked ? "border-blue-500/40 bg-blue-600" : "border-border bg-zinc-800")}
    >
      <span className={cn("absolute top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-[17px]" : "translate-x-0.5")} />
    </button>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return <span className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-semibold text-zinc-200", className)}>{initials(name)}</span>;
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border bg-black/20 px-1.5 py-0.5 font-mono text-[8px] text-zinc-500">{children}</kbd>;
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("size-4 animate-spin text-muted-foreground", className)} />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("grid min-h-52 place-items-center rounded-lg border border-dashed border-border p-8 text-center", className)}>
      <div className="max-w-xs">
        {icon && <span className="mx-auto mb-3 grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">{icon}</span>}
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{description}</p>
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "danger" | "success"; title: string; children?: ReactNode; className?: string }) {
  const tones = {
    info: "border-blue-400/20 bg-blue-400/[0.06] text-blue-200",
    warning: "border-amber-400/20 bg-amber-400/[0.06] text-amber-200",
    danger: "border-red-400/20 bg-red-400/[0.06] text-red-200",
    success: "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200",
  };
  return (
    <div className={cn("flex gap-3 rounded-lg border p-3", tones[tone], className)}>
      {tone === "success" ? <Check className="mt-0.5 size-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
      <div><p className="text-[10px] font-semibold">{title}</p>{children && <div className="mt-1 text-[9px] leading-4 opacity-75">{children}</div>}</div>
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button type="button" aria-label="Close dialog" onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className={cn("relative max-h-[90vh] w-full overflow-hidden rounded-xl border border-border bg-[#171717] shadow-2xl shadow-black/60", widths[size])}>
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div><h2 id="modal-title" className="text-base font-semibold">{title}</h2>{description && <p className="mt-1 text-[10px] text-muted-foreground">{description}</p>}</div>
          <IconButton label="Close" onClick={onClose}><X /></IconButton>
        </header>
        <div className="max-h-[calc(90vh-130px)] overflow-y-auto p-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Tabs({ value, onChange, items, className }: { value: string; onChange: (value: string) => void; items: Array<{ value: string; label: string; count?: number }>; className?: string }) {
  return (
    <div className={cn("flex min-w-0 gap-1 overflow-x-auto border-b border-border", className)} role="tablist">
      {items.map((item) => (
        <button
          type="button"
          role="tab"
          aria-selected={value === item.value}
          key={item.value}
          onClick={() => onChange(item.value)}
          className={cn("relative h-9 shrink-0 px-3 text-[10px] text-muted-foreground transition-colors hover:text-foreground", value === item.value && "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-white")}
        >
          {item.label}{item.count !== undefined && <span className="ml-1.5 text-[8px] text-zinc-600">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ icon, label, value, change, detail, className }: { icon?: ReactNode; label: string; value: string | number; change?: string; detail?: string; className?: string }) {
  return (
    <div className={cn("min-w-0 p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p><strong className="mt-2 block truncate text-2xl font-semibold tabular-nums">{value}</strong></div>
        {icon && <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-3.5">{icon}</span>}
      </div>
      {(change || detail) && <div className="mt-3 flex items-center gap-2 text-[9px]"><span className="text-emerald-400">{change}</span><span className="truncate text-muted-foreground">{detail}</span></div>}
    </div>
  );
}

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto rounded-lg border border-border", className)}>{children}</div>;
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={cn("w-full min-w-[680px] border-collapse text-left text-[10px]", className)}>{children}</table>;
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-border bg-white/[0.018] text-[8px] uppercase tracking-[0.08em] text-muted-foreground">{children}</thead>;
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("h-9 px-3 font-medium", className)}>{children}</th>;
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("h-11 px-3", className)}>{children}</td>;
}

export function Tr({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return <tr onClick={onClick} className={cn("border-b border-border last:border-0 hover:bg-white/[0.02]", onClick && "cursor-pointer", className)}>{children}</tr>;
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; onClick?: () => void }> }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[9px] text-muted-foreground">
      {items.map((item, index) => <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">{index > 0 && <ChevronRight className="size-3 shrink-0 text-zinc-700" />}{item.onClick ? <button type="button" onClick={item.onClick} className="truncate hover:text-foreground">{item.label}</button> : <span className="truncate text-zinc-300">{item.label}</span>}</span>)}
    </nav>
  );
}

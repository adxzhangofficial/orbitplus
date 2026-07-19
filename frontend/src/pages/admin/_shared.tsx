import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, X, type LucideIcon } from "lucide-react";
import { cn, initials, statusTone } from "@/lib/utils";

export function AdminPageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <div className="adm-page-heading"><div><h2>{title}</h2><p>{description}</p></div>{actions && <div className="adm-page-actions">{actions}</div>}</div>;
}

export function AdminButton({ variant, size, className, children, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "ghost"; size?: "small" }) {
  return <button type={type} className={cn("adm-button", variant, size, className)} {...props}>{children}</button>;
}

export function IconAction({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className="adm-icon-action" aria-label={label} title={label} {...props}>{children}</button>;
}

export function Stat({ label, value, change, detail, icon: Icon, data = [8, 12, 10, 17, 14, 22, 21, 29] }: { label: string; value: ReactNode; change?: string; detail?: string; icon?: LucideIcon; data?: number[] }) {
  return <div className="adm-stat"><div className="adm-stat-top"><span className="adm-stat-label">{label}</span>{Icon && <span className="adm-stat-icon"><Icon /></span>}</div><strong className="adm-stat-value">{value}</strong><div className="adm-stat-foot">{change && <span className={cn("adm-stat-change", change.trim().startsWith("-") && "down")}>{change}</span>}<span>{detail}</span></div><Sparkline data={data} /></div>;
}

export function Sparkline({ data, color = "#d8ff4f" }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const points = data.map((value, index) => `${(index / Math.max(data.length - 1, 1)) * 55},${17 - ((value - min) / range) * 14}`).join(" ");
  return <svg className="adm-stat-line" viewBox="0 0 55 18" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" /></svg>;
}

export function Panel({ title, description, action, children, className, bodyClassName }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return <section className={cn("adm-panel", className)}>{(title || action) && <header className="adm-panel-head"><div>{title && <h3>{title}</h3>}{description && <p>{description}</p>}</div>{action && <div className="adm-panel-head-actions">{action}</div>}</header>}<div className={cn("adm-panel-body", bodyClassName)}>{children}</div></section>;
}

const extraTones: Record<string, "success" | "warning" | "danger" | "info" | "neutral" | "lime"> = {
  success: "success", warning: "warning", danger: "danger", info: "info", neutral: "neutral", lime: "lime",
  resolved: "success", published: "success", paid: "success", connected: "success", enabled: "success", delivered: "success", closed: "success",
  investigating: "warning", open: "warning", pending: "warning", retrying: "warning", partial: "warning", scheduled: "warning", draft: "neutral",
  breached: "danger", blocked: "danger", high: "danger", urgent: "danger", overdue: "danger", disputed: "danger", disabled: "neutral",
  acknowledged: "info", monitoring: "info", medium: "warning", low: "info", processing: "info",
};

export function StatusPill({ status, label, noDot = false }: { status: string; label?: string; noDot?: boolean }) {
  const tone = extraTones[status.toLowerCase()] ?? statusTone(status.toLowerCase());
  return <span className={cn("adm-pill", tone, noDot && "no-dot")}>{(label ?? status).replaceAll("_", " ")}</span>;
}

export function SearchBox({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="adm-search"><Search /><input className="adm-input" type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

export function ProgressBar({ value, tone }: { value: number; tone?: "warning" | "danger" }) {
  return <div className="adm-progress-line"><div className="adm-progress"><i className={tone} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div><span>{value}%</span></div>;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={cn("adm-switch", checked && "on")} onClick={() => onChange(!checked)} />;
}

export function Segments({ value, onChange, items }: { value: string; onChange: (value: string) => void; items: Array<{ value: string; label: string }> }) {
  return <div className="adm-segments">{items.map((item) => <button type="button" key={item.value} className={value === item.value ? "active" : undefined} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}

export function usePagination<T>(rows: T[], size = 8) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safePage = Math.min(page, pages);
  useEffect(() => setPage(1), [rows.length]);
  return { page: safePage, pages, setPage, rows: rows.slice((safePage - 1) * size, safePage * size), total: rows.length, from: rows.length ? (safePage - 1) * size + 1 : 0, to: Math.min(safePage * size, rows.length) };
}

export function Pagination({ page, pages, total, from, to, onPage }: { page: number; pages: number; total: number; from: number; to: number; onPage: (page: number) => void }) {
  const values = useMemo(() => Array.from({ length: Math.min(5, pages) }, (_, index) => {
    if (pages <= 5) return index + 1;
    const start = Math.max(1, Math.min(page - 2, pages - 4));
    return start + index;
  }), [page, pages]);
  return <div className="adm-pagination"><span>Showing {from}–{to} of {total}</span><div className="adm-pagination-buttons"><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft /></button>{values.map((value) => <button type="button" className={page === value ? "active" : undefined} key={value} onClick={() => onPage(value)}>{value}</button>)}<button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight /></button></div></div>;
}

export function Drawer({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  useEscape(open, onClose);
  if (!open) return null;
  return <div className="adm-drawer-layer" role="dialog" aria-modal="true"><button className="adm-drawer-backdrop" type="button" onClick={onClose} aria-label="Close drawer" /><aside className="adm-drawer"><header className="adm-drawer-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><IconAction label="Close" onClick={onClose}><X /></IconAction></header><div className="adm-drawer-body">{children}</div>{footer && <footer className="adm-drawer-foot">{footer}</footer>}</aside></div>;
}

export function Modal({ open, onClose, title, description, children, footer, large = false }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; large?: boolean }) {
  useEscape(open, onClose);
  if (!open) return null;
  return <div className="adm-modal-layer" role="dialog" aria-modal="true"><button className="adm-modal-backdrop" type="button" onClick={onClose} aria-label="Close modal" /><section className={cn("adm-modal", large && "large")}><header className="adm-modal-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><IconAction label="Close" onClick={onClose}><X /></IconAction></header><div className="adm-modal-body">{children}</div>{footer && <footer className="adm-modal-foot">{footer}</footer>}</section></div>;
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = original; };
  }, [open, onClose]);
}

export function DetailGrid({ items }: { items: Array<[string, ReactNode]> }) {
  return <div className="adm-detail-list">{items.map(([label, value]) => <div className="adm-detail" key={label}><span>{label}</span><b>{value}</b></div>)}</div>;
}

export function BarChart({ values, labels, color }: { values: number[]; labels?: string[]; color?: string }) {
  const max = Math.max(...values, 1);
  return <div className="adm-chart"><div className="adm-chart-grid"><i /><i /><i /><i /></div><div className="adm-bars">{values.map((value, index) => <div className="adm-bar-column" key={`${index}-${value}`} title={`${labels?.[index] ?? index}: ${value}`}><i style={{ height: `${(value / max) * 100}%`, ...(color ? { background: color } : {}) }} /></div>)}</div><div className="adm-chart-labels">{(labels ?? values.map((_, index) => String(index + 1))).filter((_, index, all) => index === 0 || index === all.length - 1 || index === Math.floor(all.length / 2)).map((label) => <span key={label}>{label}</span>)}</div></div>;
}

export function Avatar({ name }: { name: string }) { return <span className="adm-cell-icon">{initials(name)}</span>; }

export function downloadCsv(filename: string, rows: Array<Record<string, string | number | boolean>>) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = [columns.map(escape).join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const formatCurrency = (value: number, compact = false) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: compact ? 1 : 0, ...(compact ? { notation: "compact" as const } : {}) }).format(value);
export const formatPercent = (value: number) => `${value.toFixed(value % 1 ? 1 : 0)}%`;

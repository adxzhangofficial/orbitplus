import { clsx, type ClassValue } from "clsx";

export function cn(...values: ClassValue[]) {
  return clsx(values);
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : decimals)} ${units[index]}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: value > 9_999 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function relativeTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let duration = seconds;
  for (const [amount, unit] of divisions) {
    if (Math.abs(duration) < amount) return formatter.format(Math.round(duration), unit);
    duration /= amount;
  }
  return formatter.format(0, "second");
}

export function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["online", "active", "ready", "complete", "success", "healthy"].includes(status)) return "success";
  if (["degraded", "trial", "queued", "running", "building", "maintenance", "scheduled", "invited"].includes(status)) return "warning";
  if (["offline", "failed", "critical", "past_due", "suspended", "cancelled"].includes(status)) return "danger";
  if (["info", "development"].includes(status)) return "info";
  return "neutral";
}

/**
 * Terminal output.
 *
 * Two rules shape this file. Colour is applied only when stdout is a TTY and
 * NO_COLOR is unset, so piping into grep or a file yields plain text. And data
 * goes to stdout while progress and diagnostics go to stderr, so `orbit
 * servers ls --json | jq` is not corrupted by a status line.
 */

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && process.env.TERM !== "dumb";

function paint(code: string) {
  return (value: string) => (useColor ? `[${code}m${value}[0m` : value);
}

export const style = {
  bold: paint("1"),
  dim: paint("2"),
  red: paint("31"),
  green: paint("32"),
  yellow: paint("33"),
  cyan: paint("36"),
};

/** Colour by meaning, not by string, so an unknown status is never dressed up as healthy. */
export function statusStyle(status: string): (value: string) => string {
  switch (status) {
    case "online": case "completed": case "active": case "succeeded": case "healthy":
      return style.green;
    case "failed": case "offline": case "cancelled": case "error":
      return style.red;
    case "degraded": case "pending": case "queued": case "running": case "restoring": case "scheduled":
      return style.yellow;
    default:
      return style.dim;
  }
}

export interface Column<T> {
  header: string;
  value: (row: T) => string;
  /** Right-aligned for numbers, so magnitudes line up and are comparable. */
  align?: "right";
}

/**
 * A plain aligned table.
 *
 * Width is measured on the uncoloured text: escape sequences occupy no columns
 * on screen, and counting them would misalign every row that has any.
 */
export function table<T>(rows: T[], columns: Column<T>[]): string {
  if (rows.length === 0) return "";
  const cells = rows.map((row) => columns.map((column) => column.value(row)));
  const widths = columns.map((column, index) =>
    Math.max(visibleLength(column.header), ...cells.map((row) => visibleLength(row[index] ?? ""))),
  );

  const line = (values: string[], transform: (value: string) => string = (value) => value) =>
    values
      .map((value, index) => {
        const width = widths[index]!;
        const padding = " ".repeat(Math.max(0, width - visibleLength(value)));
        return columns[index]!.align === "right" ? padding + transform(value) : transform(value) + padding;
      })
      .join("  ")
      .trimEnd();

  return [
    line(columns.map((column) => column.header), style.dim),
    ...cells.map((row) => line(row)),
  ].join("\n");
}

function visibleLength(value: string): number {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\[\d+m/g, "").length;
}

/** Key-value detail block, for showing one record rather than a list. */
export function detail(entries: Array<[string, string]>): string {
  const width = Math.max(...entries.map(([label]) => label.length));
  return entries
    .map(([label, value]) => `${style.dim(label.padEnd(width))}  ${value}`)
    .join("\n");
}

export function print(value: string): void {
  process.stdout.write(`${value}\n`);
}

/** Progress and warnings, kept off stdout so piped output stays parseable. */
export function info(value: string): void {
  process.stderr.write(`${value}\n`);
}

export function warn(value: string): void {
  process.stderr.write(`${style.yellow("!")} ${value}\n`);
}

export function fail(value: string): void {
  process.stderr.write(`${style.red("×")} ${value}\n`);
}

export function json(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function bytes(value: number | string | null | undefined): string {
  const size = Number(value ?? 0);
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
  const scaled = size / 1024 ** exponent;
  return `${exponent === 0 ? scaled : scaled.toFixed(1)} ${units[exponent]}`;
}

export function relative(timestamp: string | null | undefined): string {
  if (!timestamp) return "never";
  const elapsed = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(elapsed)) return "unknown";
  const future = elapsed < 0;
  const seconds = Math.abs(elapsed) / 1000;
  const [value, unit] =
    seconds < 60 ? [seconds, "second"] :
    seconds < 3600 ? [seconds / 60, "minute"] :
    seconds < 86_400 ? [seconds / 3600, "hour"] :
    [seconds / 86_400, "day"];
  const rounded = Math.round(value);
  const plural = rounded === 1 ? "" : "s";
  return future ? `in ${rounded} ${unit}${plural}` : `${rounded} ${unit}${plural} ago`;
}

/** Truncates without hiding that it did. */
export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

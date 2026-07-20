/**
 * Host metrics read over the SSH connection that is already open.
 *
 * The schema notes that SFTP cannot read CPU, memory, or disk, and that is
 * true of the SFTP subsystem — but the SSH transport underneath it runs
 * commands, and the connection pool is already holding one. So every server
 * reachable by SSH can report real figures without installing anything.
 *
 * The agent remains the better source where it exists: it keeps reporting when
 * inbound SSH is blocked, and it does not spend a credential to answer. This is
 * what fills the gap for everyone who has not installed it, which today is
 * everyone.
 *
 * A value that cannot be read stays null. A host that is not Linux, or a
 * hardened one where /proc is not readable, must report "unmeasured" rather
 * than zero — a dashboard showing 0% CPU on a struggling server is worse than
 * one showing a dash.
 */

export interface HostMetrics {
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  memoryTotalBytes: number | null;
  memoryUsedBytes: number | null;
  diskTotalBytes: number | null;
  diskUsedBytes: number | null;
  uptimeSeconds: number | null;
  loadAverage: [number, number, number] | null;
}

export const EMPTY_METRICS: HostMetrics = {
  cpuPercent: null,
  memoryPercent: null,
  diskPercent: null,
  memoryTotalBytes: null,
  memoryUsedBytes: null,
  diskTotalBytes: null,
  diskUsedBytes: null,
  uptimeSeconds: null,
  loadAverage: null,
};

/**
 * Single-quotes a value for POSIX sh.
 *
 * The only interpolated value is a path from the database, but a root path
 * containing a quote would otherwise end the argument and run whatever
 * followed it as a command on the customer's server.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * One command, one round trip.
 *
 * CPU needs two samples because /proc/stat holds counters since boot, not a
 * rate. They are taken a second apart inside the same command rather than
 * across two sweeps, which keeps the reading self-contained and correct even
 * if the host rebooted since the last one.
 *
 * Every line is prefixed and every command is guarded, so a missing file
 * produces a blank field rather than shifting the output the parser expects.
 */
export function metricsCommand(rootPath: string): string {
  const target = shellQuote(rootPath || "/");
  return [
    "export LC_ALL=C 2>/dev/null || true",
    'printf "S1 %s\\n" "$(head -n1 /proc/stat 2>/dev/null)"',
    "sleep 1",
    'printf "S2 %s\\n" "$(head -n1 /proc/stat 2>/dev/null)"',
    `printf "MEM %s\\n" "$(awk '/^MemTotal:/{t=$2} /^MemAvailable:/{a=$2} END{if (t>0 && a!="") print t, a}' /proc/meminfo 2>/dev/null)"`,
    `printf "DISK %s\\n" "$(df -Pk ${target} 2>/dev/null | awk 'NR==2{print $2, $3}')"`,
    `printf "UP %s\\n" "$(awk '{print $1}' /proc/uptime 2>/dev/null)"`,
    `printf "LOAD %s\\n" "$(awk '{print $1, $2, $3}' /proc/loadavg 2>/dev/null)"`,
  ].join("; ");
}

/** A /proc/stat cpu line: user nice system idle iowait irq softirq steal. */
interface CpuSample {
  total: number;
  idle: number;
}

function parseCpuLine(line: string): CpuSample | null {
  const fields = line.trim().split(/\s+/);
  if (fields[0] !== "cpu") return null;
  const values = fields.slice(1).map(Number).filter((value) => Number.isFinite(value));
  if (values.length < 4) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  // Idle plus iowait: a core waiting on disk is not doing work, and counting
  // it as busy would report a storage stall as CPU load.
  const idle = (values[3] ?? 0) + (values[4] ?? 0);
  return { total, idle };
}

function percent(used: number, total: number): number | null {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((used / total) * 1000) / 10));
}

export function parseMetrics(output: string): HostMetrics {
  const metrics: HostMetrics = { ...EMPTY_METRICS };
  const lines = output.split("\n");
  const find = (prefix: string) => lines.find((line) => line.startsWith(`${prefix} `))?.slice(prefix.length + 1).trim() ?? "";

  const first = parseCpuLine(find("S1"));
  const second = parseCpuLine(find("S2"));
  if (first && second) {
    const totalDelta = second.total - first.total;
    const idleDelta = second.idle - first.idle;
    // A negative delta means the counters reset, which is a reboot between the
    // two samples. There is no meaningful percentage to report for that.
    if (totalDelta > 0 && idleDelta >= 0) {
      metrics.cpuPercent = percent(totalDelta - idleDelta, totalDelta);
    }
  }

  const memory = find("MEM").split(/\s+/).map(Number);
  if (memory.length === 2 && memory.every(Number.isFinite) && memory[0]! > 0) {
    const [totalKb, availableKb] = memory as [number, number];
    metrics.memoryTotalBytes = totalKb * 1024;
    // Available, not free: Linux uses spare memory for page cache, and
    // reporting cache as "used" would show almost every healthy server at 90%.
    metrics.memoryUsedBytes = (totalKb - availableKb) * 1024;
    metrics.memoryPercent = percent(totalKb - availableKb, totalKb);
  }

  const disk = find("DISK").split(/\s+/).map(Number);
  if (disk.length === 2 && disk.every(Number.isFinite) && disk[0]! > 0) {
    const [totalKb, usedKb] = disk as [number, number];
    metrics.diskTotalBytes = totalKb * 1024;
    metrics.diskUsedBytes = usedKb * 1024;
    metrics.diskPercent = percent(usedKb, totalKb);
  }

  const uptime = Number(find("UP"));
  if (Number.isFinite(uptime) && uptime > 0) metrics.uptimeSeconds = Math.round(uptime);

  const load = find("LOAD").split(/\s+/).map(Number);
  if (load.length === 3 && load.every(Number.isFinite)) {
    metrics.loadAverage = load as [number, number, number];
  }

  return metrics;
}

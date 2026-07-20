import { describe, expect, it } from "vitest";
import { EMPTY_METRICS, metricsCommand, parseMetrics } from "../adapters/host-metrics.js";

/**
 * Parsing host readings.
 *
 * The property that matters most is that an unreadable value stays null. These
 * numbers drive a dashboard someone uses to decide whether a server is in
 * trouble, and a parser that turns a missing field into 0 reports a struggling
 * host as idle — which is worse than reporting nothing at all.
 */

const sample = [
  "S1 cpu  1000 0 500 8000 200 0 0 0",
  "S2 cpu  1100 0 550 8600 220 0 0 0",
  "MEM 8000000 6000000",
  "DISK 100000000 25000000",
  "UP 1450000.42",
  "LOAD 0.15 0.22 0.30",
].join("\n");

describe("parseMetrics", () => {
  it("computes CPU from the delta between two samples", () => {
    // total 9700 → 10470 is a delta of 770; idle+iowait 8200 → 8820 is 620.
    // Busy is the remaining 150, which is 19.5% of the interval.
    expect(parseMetrics(sample).cpuPercent).toBeCloseTo(19.5, 1);
  });

  it("counts iowait as idle", () => {
    // A core waiting on disk is not doing work. Counting it as busy would
    // report a storage stall as CPU load and send someone after the wrong thing.
    const stalled = ["S1 cpu 100 0 100 1000 0 0 0 0", "S2 cpu 100 0 100 1000 500 0 0 0"].join("\n");
    expect(parseMetrics(stalled).cpuPercent).toBe(0);
  });

  it("reports memory from available, not free", () => {
    const metrics = parseMetrics(sample);
    // Linux spends spare memory on page cache. Treating cache as used would put
    // almost every healthy server above 90%.
    expect(metrics.memoryPercent).toBe(25);
    expect(metrics.memoryTotalBytes).toBe(8_000_000 * 1024);
    expect(metrics.memoryUsedBytes).toBe(2_000_000 * 1024);
  });

  it("reports disk use against the filesystem total", () => {
    const metrics = parseMetrics(sample);
    expect(metrics.diskPercent).toBe(25);
    expect(metrics.diskTotalBytes).toBe(100_000_000 * 1024);
  });

  it("reads uptime and load", () => {
    const metrics = parseMetrics(sample);
    expect(metrics.uptimeSeconds).toBe(1_450_000);
    expect(metrics.loadAverage).toEqual([0.15, 0.22, 0.3]);
  });
});

describe("Nothing is invented", () => {
  it("returns nulls for empty output", () => {
    expect(parseMetrics("")).toEqual(EMPTY_METRICS);
  });

  it("returns nulls when /proc is missing", () => {
    // What a BSD host, or a Linux one with a restricted shell, actually sends:
    // the prefixes arrive with nothing after them.
    const blank = ["S1 ", "S2 ", "MEM ", "DISK ", "UP ", "LOAD "].join("\n");
    expect(parseMetrics(blank)).toEqual(EMPTY_METRICS);
  });

  it("keeps the fields it could read when others are missing", () => {
    const partial = ["MEM 4000 1000", "DISK ", "UP "].join("\n");
    const metrics = parseMetrics(partial);
    expect(metrics.memoryPercent).toBe(75);
    expect(metrics.cpuPercent).toBeNull();
    expect(metrics.diskPercent).toBeNull();
  });

  it("gives no CPU reading when the counters reset", () => {
    // A reboot between the two samples. There is no meaningful percentage to
    // report, and a negative delta must not become a nonsense number.
    const rebooted = ["S1 cpu 9000 0 900 90000 0 0 0 0", "S2 cpu 10 0 5 100 0 0 0 0"].join("\n");
    expect(parseMetrics(rebooted).cpuPercent).toBeNull();
  });

  it("gives no CPU reading when both samples are identical", () => {
    const idle = ["S1 cpu 100 0 100 1000 0 0 0 0", "S2 cpu 100 0 100 1000 0 0 0 0"].join("\n");
    expect(parseMetrics(idle).cpuPercent).toBeNull();
  });

  it("ignores a line that is not a cpu line", () => {
    const wrong = ["S1 intr 12345 1 2 3", "S2 intr 12399 1 2 3"].join("\n");
    expect(parseMetrics(wrong).cpuPercent).toBeNull();
  });

  it("survives garbage without throwing", () => {
    for (const junk of ["\0\0\0", "S1 cpu abc def", "MEM x y", "DISK -1 -2", "<html>login</html>"]) {
      expect(() => parseMetrics(junk)).not.toThrow();
    }
  });

  it("keeps a percentage inside 0 and 100", () => {
    // A total smaller than the used figure is nonsense the host should never
    // send, but it must not escape as a 400% bar.
    const impossible = "DISK 100 400";
    expect(parseMetrics(impossible).diskPercent).toBe(100);
  });
});

describe("metricsCommand", () => {
  it("quotes the path it was given", () => {
    const command = metricsCommand("/var/www");
    expect(command).toContain("df -Pk '/var/www'");
  });

  it("neutralises a quote in the root path", () => {
    // The path comes from the database, and an unescaped quote would end the
    // argument and run whatever followed it on the customer's server.
    const command = metricsCommand("/tmp/'; rm -rf /; echo '");
    expect(command).not.toMatch(/df -Pk '\/tmp\/'; rm/);
    expect(command).toContain(`'\\''`);
  });

  it("takes two CPU samples a second apart", () => {
    const command = metricsCommand("/");
    expect(command).toContain("S1");
    expect(command).toContain("sleep 1");
    expect(command).toContain("S2");
  });

  it("guards every read so a missing file cannot shift the output", () => {
    const command = metricsCommand("/");
    // Each field is printed with its own prefix and its errors discarded, so a
    // host without /proc returns blanks in place rather than a short response
    // the parser would misalign.
    expect(command.match(/2>\/dev\/null/g)?.length).toBeGreaterThanOrEqual(5);
  });
});

import { describe, expect, it } from "vitest";
import { formatBytes, formatNumber, initials, statusTone } from "./utils";

describe("workspace formatting", () => {
  it("formats file sizes and large counters", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB");
    expect(formatNumber(12_500)).toContain("12.5");
  });

  it("derives compact initials", () => {
    expect(initials("Adeel Khan")).toBe("AK");
    expect(initials("Orbit Platform Administrator")).toBe("OP");
  });

  it("maps operational states to semantic tones", () => {
    expect(statusTone("online")).toBe("success");
    expect(statusTone("degraded")).toBe("warning");
    expect(statusTone("failed")).toBe("danger");
    expect(statusTone("unknown")).toBe("neutral");
  });
});

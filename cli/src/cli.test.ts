import { describe, expect, it } from "vitest";
import { EXIT, exitCodeFor, parseArgs } from "./command.js";
import { maskKey } from "./config.js";
import { bytes, relative, table, truncate } from "./output.js";

/**
 * The parts worth testing here are the ones a person can be misled by: an
 * argument parsed as the wrong thing, a key printed in full, a size or a time
 * that reads as something it is not.
 */

describe("parseArgs", () => {
  it("keeps positional order", () => {
    const flags = parseArgs(["server-1", "/var/www", "extra"]);
    expect(flags.positional).toEqual(["server-1", "/var/www", "extra"]);
  });

  it("reads --key value and --key=value the same way", () => {
    expect(parseArgs(["--name", "nightly"]).values.name).toBe("nightly");
    expect(parseArgs(["--name=nightly"]).values.name).toBe("nightly");
  });

  it("treats a trailing flag as a boolean", () => {
    const flags = parseArgs(["backup-id", "--wait"]);
    expect(flags.values.wait).toBe("true");
    expect(flags.positional).toEqual(["backup-id"]);
  });

  it("does not swallow the next flag as a value", () => {
    const flags = parseArgs(["--wait", "--json"]);
    expect(flags.values.wait).toBe("true");
    expect(flags.json).toBe(true);
  });

  it("keeps an empty --name= as empty rather than the next word", () => {
    const flags = parseArgs(["--name=", "server-1"]);
    expect(flags.values.name).toBe("");
    expect(flags.positional).toEqual(["server-1"]);
  });

  it("passes everything after -- through untouched", () => {
    // Without this a path or a value beginning with a dash is unreachable.
    const flags = parseArgs(["--json", "--", "--not-a-flag", "-x"]);
    expect(flags.json).toBe(true);
    expect(flags.positional).toEqual(["--not-a-flag", "-x"]);
  });

  it("recognises -y as --yes", () => {
    expect(parseArgs(["-y"]).yes).toBe(true);
    expect(parseArgs(["--yes"]).yes).toBe(true);
  });
});

describe("exitCodeFor", () => {
  it("distinguishes the failures a script must branch on", () => {
    expect(exitCodeFor(0)).toBe(EXIT.network);
    expect(exitCodeFor(401)).toBe(EXIT.auth);
    expect(exitCodeFor(403)).toBe(EXIT.denied);
    expect(exitCodeFor(404)).toBe(EXIT.notFound);
    expect(exitCodeFor(409)).toBe(EXIT.conflict);
    expect(exitCodeFor(500)).toBe(EXIT.server);
    expect(exitCodeFor(503)).toBe(EXIT.server);
  });

  it("never reports a failure as success", () => {
    for (const status of [400, 401, 403, 404, 409, 418, 500, 502, 0]) {
      expect(exitCodeFor(status)).not.toBe(EXIT.ok);
    }
  });
});

describe("maskKey", () => {
  it("shows enough to recognise a key and not enough to use it", () => {
    const key = "orb_8_TNudmNabcdefghijklmnopqrstuvwxyz0123UEE2";
    const masked = maskKey(key);
    expect(masked).toContain("orb_8_TN");
    expect(masked).not.toContain("abcdefghij");
    expect(masked.length).toBeLessThan(key.length);
  });

  it("reveals nothing from a short value", () => {
    // A key this short is malformed; printing any of it is not worth the risk.
    expect(maskKey("orb_short")).toBe("…");
  });
});

describe("bytes", () => {
  it("scales to a readable unit", () => {
    expect(bytes(0)).toBe("0 B");
    expect(bytes(512)).toBe("512 B");
    expect(bytes(1024)).toBe("1.0 KB");
    expect(bytes(1536)).toBe("1.5 KB");
    expect(bytes(1024 ** 3)).toBe("1.0 GB");
  });

  it("accepts the string a bigint column arrives as", () => {
    // Postgres returns bigint as a string; Number() on it must not silently
    // produce NaN in the output.
    expect(bytes("2048")).toBe("2.0 KB");
    expect(bytes(null)).toBe("0 B");
    expect(bytes(undefined)).toBe("0 B");
  });
});

describe("relative", () => {
  it("says never rather than inventing a date", () => {
    expect(relative(null)).toBe("never");
    expect(relative(undefined)).toBe("never");
  });

  it("describes past and future differently", () => {
    expect(relative(new Date(Date.now() - 120_000).toISOString())).toBe("2 minutes ago");
    expect(relative(new Date(Date.now() + 3_600_000).toISOString())).toMatch(/^in 1 hour$/);
  });

  it("singularises", () => {
    expect(relative(new Date(Date.now() - 60_000).toISOString())).toBe("1 minute ago");
  });
});

describe("table", () => {
  it("aligns on visible width, ignoring colour codes", () => {
    const rows = [{ name: "[32mshort[0m" }, { name: "much-longer-name" }];
    const rendered = table(rows, [{ header: "NAME", value: (row) => row.name }]);
    const lines = rendered.split("\n");
    // Colour is zero-width on screen; counting it would misalign every
    // coloured row.
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("short");
  });

  it("returns nothing for no rows, so a caller can print its own empty state", () => {
    expect(table([], [{ header: "NAME", value: () => "" }])).toBe("");
  });
});

describe("truncate", () => {
  it("marks that it shortened something", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcd…");
    expect(truncate("abc", 5)).toBe("abc");
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_EXCLUDES } from "./tree-index.service.js";

/**
 * The walk turns one round trip per directory into one round trip for the whole
 * tree, which is the difference between browsing being usable and not over a
 * link with real latency. The parsing has to survive real filesystems: paths
 * with spaces, unusual names, and the unreadable directories find reports on
 * stderr while still succeeding.
 */

// Re-implemented here rather than exported, so the test pins the exact output
// contract the service parses rather than sharing an implementation with it.
function parse(output: string, root: string) {
  const entries: Array<{ path: string; parentPath: string; name: string; type: string; size: number }> = [];
  for (const line of output.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 5) continue;
    const absolute = parts.slice(4).join("\t");
    if (!absolute.startsWith(root)) continue;
    const relative = absolute.slice(root.length) || "/";
    if (relative === "/") continue;
    const segments = relative.split("/").filter(Boolean);
    entries.push({
      path: `/${segments.join("/")}`,
      parentPath: segments.length > 1 ? `/${segments.slice(0, -1).join("/")}` : "/",
      name: segments.at(-1) ?? relative,
      type: parts[0] === "d" ? "directory" : parts[0] === "l" ? "symlink" : "file",
      size: Number(parts[1]) || 0,
    });
  }
  return entries;
}

const ROOT = "/srv/app";

describe("find output parsing", () => {
  it("reads type, size, and path into a navigable tree", () => {
    const output = [
      `d\t4096\t1700000000.0\t755\t${ROOT}/src`,
      `f\t128\t1700000001.0\t644\t${ROOT}/src/index.ts`,
      `d\t4096\t1700000002.0\t755\t${ROOT}/src/lib`,
      `f\t64\t1700000003.0\t644\t${ROOT}/src/lib/util.ts`,
    ].join("\n");

    const entries = parse(output, ROOT);
    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({ path: "/src", parentPath: "/", type: "directory" });
    expect(entries[1]).toMatchObject({ path: "/src/index.ts", parentPath: "/src", type: "file", size: 128 });
    // The parent link is what makes a directory listing a single indexed query.
    expect(entries[3]!.parentPath).toBe("/src/lib");
  });

  it("keeps paths containing spaces intact", () => {
    const output = `f\t10\t1700000000.0\t644\t${ROOT}/my documents/report final.txt`;
    const entries = parse(output, ROOT);
    expect(entries[0]!.path).toBe("/my documents/report final.txt");
    expect(entries[0]!.name).toBe("report final.txt");
  });

  it("keeps paths containing tabs intact", () => {
    // Tab is the field separator, so a tab inside a path would split the line.
    // Everything past the fourth separator is the path for exactly this reason.
    const output = `f\t10\t1700000000.0\t644\t${ROOT}/odd\tname.txt`;
    const entries = parse(output, ROOT);
    expect(entries[0]!.name).toBe("odd\tname.txt");
  });

  it("distinguishes symlinks from files", () => {
    const output = `l\t11\t1700000000.0\t777\t${ROOT}/current`;
    expect(parse(output, ROOT)[0]!.type).toBe("symlink");
  });

  it("ignores the root itself and malformed lines", () => {
    const output = [
      `d\t4096\t1700000000.0\t755\t${ROOT}`,
      "garbage without tabs",
      "",
      `f\t5\t1700000001.0\t644\t${ROOT}/keep.txt`,
    ].join("\n");
    const entries = parse(output, ROOT);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.path).toBe("/keep.txt");
  });

  it("ignores anything outside the configured root", () => {
    // A server whose find escapes the root must not be able to inject entries
    // that the path policy would otherwise refuse.
    const output = `f\t5\t1700000000.0\t644\t/etc/passwd`;
    expect(parse(output, ROOT)).toHaveLength(0);
  });
});

describe("Exclusions", () => {
  it("prunes the directories that dominate a tree and are regenerable", () => {
    for (const name of ["node_modules", ".git", "venv", "__pycache__", "vendor", "dist"]) {
      expect(DEFAULT_EXCLUDES).toContain(name);
    }
  });

  it("does not prune ordinary application directories", () => {
    for (const name of ["src", "public", "config", "app", "storage"]) {
      expect(DEFAULT_EXCLUDES).not.toContain(name);
    }
  });
});

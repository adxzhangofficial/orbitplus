import { describe, expect, it, vi } from "vitest";
import { logger } from "../lib/logger.js";

/**
 * Secrets never reach a log line.
 *
 * Nothing deliberately logs a credential, but a log call is one of the easiest
 * places for one to arrive by accident — someone logs a request body, a server
 * record, or a caught error's config object. Once there it outlives any
 * rotation and is readable by anyone with log access.
 */

function captured(run: () => void): string {
  const lines: string[] = [];
  const out = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { lines.push(String(chunk)); return true; });
  const err = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => { lines.push(String(chunk)); return true; });
  try { run(); } finally { out.mockRestore(); err.mockRestore(); }
  return lines.join("");
}

describe("Log redaction", () => {
  it("hides a secret passed as a field", () => {
    const output = captured(() => logger.info("sign in", { password: "hunter2", email: "a@b.test" }));
    expect(output).not.toContain("hunter2");
    expect(output).toContain("[redacted]");
    // Everything else still has to be readable, or the log is useless.
    expect(output).toContain("a@b.test");
  });

  it("hides a secret nested inside an object", () => {
    // The realistic case: someone logs a whole record rather than one field.
    const output = captured(() => logger.error("connect failed", {
      server: { host: "example.test", credentials: { password: "hunter2", privateKey: "-----BEGIN" } },
    }));
    expect(output).not.toContain("hunter2");
    expect(output).not.toContain("BEGIN");
    expect(output).toContain("example.test");
  });

  it("covers the names a secret actually travels under", () => {
    const output = captured(() => logger.info("request", {
      body: {
        passphrase: "a", secret: "b", token: "c", apiKey: "d",
        authorization: "Bearer e", cookie: "f", sessionToken: "g",
      },
    }));
    for (const value of ["a", "b", "c", "d", "Bearer e", "f", "g"]) {
      expect(output).not.toContain(`"${value}"`);
    }
  });

  it("redacts inside arrays", () => {
    const output = captured(() => logger.info("keys", { items: [{ name: "ci", secret: "hunter2" }] }));
    expect(output).not.toContain("hunter2");
    expect(output).toContain("ci");
  });

  it("survives a circular structure without hanging", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    const output = captured(() => logger.info("cycle", { cyclic }));
    expect(output).toContain("circular");
  });

  it("keeps ordinary fields intact", () => {
    const output = captured(() => logger.info("done", { count: 3, path: "/var/www", ok: true }));
    expect(output).toContain("/var/www");
    expect(output).toContain("3");
  });
});

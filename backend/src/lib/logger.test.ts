import { afterEach, describe, expect, it, vi } from "vitest";
import { currentLogContext, logger, withLogContext } from "./logger.js";

/**
 * The logger's job is to make a line attributable and machine-readable. The
 * cases that matter are the ones where it would silently lose information: an
 * Error that stringifies to {}, a context that does not survive an await, and
 * a level that should have suppressed the line entirely.
 */

function capture(stream: "stdout" | "stderr") {
  const lines: string[] = [];
  const spy = vi.spyOn(process[stream], "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
  return { lines, restore: () => spy.mockRestore() };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("Correlation context", () => {
  it("attaches the surrounding context to a line", () => {
    const out = capture("stdout");
    withLogContext({ requestId: "req-123" }, () => {
      logger.info("Something happened");
    });
    out.restore();
    expect(out.lines.join("")).toContain("req-123");
  });

  it("survives an await", async () => {
    let seen = "";
    await withLogContext({ requestId: "req-async" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      // Async local storage is the point: a service several calls and an await
      // deep still knows which request it belongs to.
      seen = currentLogContext().requestId ?? "";
    });
    expect(seen).toBe("req-async");
  });

  it("merges rather than replaces when nested", () => {
    let context = {};
    withLogContext({ requestId: "outer" }, () => {
      withLogContext({ organizationId: "org-1" }, () => {
        context = currentLogContext();
      });
    });
    expect(context).toMatchObject({ requestId: "outer", organizationId: "org-1" });
  });

  it("does not leak out of its scope", () => {
    withLogContext({ requestId: "scoped" }, () => undefined);
    expect(currentLogContext().requestId).toBeUndefined();
  });
});

describe("Error handling", () => {
  it("unpacks an Error, which JSON.stringify would render as an empty object", () => {
    const out = capture("stderr");
    logger.error("It failed", { error: new Error("connection reset") });
    out.restore();
    const line = out.lines.join("");
    expect(line).toContain("connection reset");
    expect(line).not.toContain("{}");
  });

  it("keeps a database error code", () => {
    const out = capture("stderr");
    const failure = Object.assign(new Error("duplicate key"), { code: "23505" });
    logger.error("Insert failed", { error: failure });
    out.restore();
    expect(out.lines.join("")).toContain("23505");
  });
});

describe("Streams and levels", () => {
  it("sends warnings and errors to stderr so they survive a one-stream pipeline", () => {
    const err = capture("stderr");
    const out = capture("stdout");
    logger.error("bad");
    logger.warn("iffy");
    err.restore();
    out.restore();
    expect(err.lines).toHaveLength(2);
    expect(out.lines).toHaveLength(0);
  });

  it("sends info to stdout", () => {
    const err = capture("stderr");
    const out = capture("stdout");
    logger.info("fine");
    err.restore();
    out.restore();
    expect(out.lines).toHaveLength(1);
    expect(err.lines).toHaveLength(0);
  });

  it("suppresses debug at the default level", () => {
    // LOG_LEVEL is info in the test environment, so a debug line is a line the
    // operator asked not to see.
    const out = capture("stdout");
    logger.debug("noisy detail");
    out.restore();
    expect(out.lines).toHaveLength(0);
  });
});

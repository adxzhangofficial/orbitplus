import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requestContext } from "./request-context.js";
import { currentLogContext } from "../lib/logger.js";

/**
 * The request id is echoed in a response header and written into every log
 * line the request produces, so its content is not a cosmetic concern: a value
 * carrying a newline would let a caller forge log entries, and Node rejects
 * such a header outright, turning a malformed request into a 500.
 *
 * A compliant HTTP client cannot send a newline in a header, which is why this
 * is tested against the middleware directly rather than over the wire.
 */

function run(incoming?: string) {
  const headers: Record<string, string> = {};
  const request = { header: () => incoming } as unknown as Request;
  const response = { setHeader: (key: string, value: string) => { headers[key] = value; } } as unknown as Response;
  let context = {};
  requestContext(request, response, () => { context = currentLogContext(); });
  return { id: request.requestId, headers, context };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("Request correlation id", () => {
  it("generates one when the caller sends none", () => {
    const result = run(undefined);
    expect(result.id).toMatch(UUID);
    expect(result.headers["x-request-id"]).toBe(result.id);
  });

  it("continues a trace the caller started", () => {
    // A load balancer or calling service should be able to correlate its own
    // logs with Orbit's.
    const result = run("lb-7f3a.2:abc-DEF");
    expect(result.id).toBe("lb-7f3a.2:abc-DEF");
  });

  it("replaces a value that could split a log line or break a header", () => {
    for (const hostile of [
      "abc\ndef",
      "abc\r\nSet-Cookie: session=stolen",
      "abc\rdef",
      '{"level":"error","message":"forged"}',
      "x".repeat(129),
      "",
    ]) {
      expect(run(hostile).id).toMatch(UUID);
    }
  });

  it("puts the id where every downstream log line will pick it up", () => {
    const result = run("trace-42");
    expect(result.context).toMatchObject({ requestId: "trace-42" });
  });

  it("does not throw when setting the header, whatever the caller sent", () => {
    // Node throws ERR_INVALID_CHAR for an illegal header value, which would
    // surface as a 500 on an otherwise valid request.
    const setHeader = vi.fn((_key: string, value: string) => {
      if (/[\r\n]/.test(value)) throw new TypeError("Invalid character in header content");
    });
    const request = { header: () => "abc\r\nevil: 1" } as unknown as Request;
    const response = { setHeader } as unknown as Response;
    expect(() => requestContext(request, response, () => undefined)).not.toThrow();
  });
});

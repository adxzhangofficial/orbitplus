import { describe, expect, it } from "vitest";
import { AppError } from "../lib/errors.js";
import { translateSftpError } from "../adapters/sftp-errors.js";

/**
 * Remote filesystem failures carry the status they actually are.
 *
 * Everything used to arrive as a 500, so asking for a path that does not exist
 * was reported as the server being broken. That misleads three audiences at
 * once: the person who made a typo, the operator watching error rates, and any
 * retry policy, which will keep retrying a request that can never succeed.
 */

describe("translateSftpError", () => {
  it("reports a missing path as not found", () => {
    for (const error of [
      { code: 2, message: "get: No such file /srv/missing.txt" },
      { code: "ENOENT", message: "open failed" },
      new Error("Error: No such file or directory"),
    ]) {
      expect(translateSftpError(error, "read /x").status).toBe(404);
    }
  });

  it("reports a refused path as forbidden, not as a fault", () => {
    // The credential is valid; this account cannot read that path. A 500 would
    // send someone looking for an outage.
    for (const error of [
      { code: 3, message: "open: Permission denied" },
      { code: "EACCES", message: "permission denied" },
    ]) {
      expect(translateSftpError(error, "read /x").status).toBe(403);
    }
  });

  it("reports a collision as a conflict", () => {
    expect(translateSftpError({ code: "EEXIST", message: "File already exists" }, "create /x").status).toBe(409);
  });

  it("reports a non-empty directory as a conflict, and says what to do", () => {
    const result = translateSftpError(new Error("Directory not empty"), "delete /x");
    expect(result.status).toBe(409);
    expect(result.message).toContain("recursive");
  });

  it("reports a file used as a directory as a bad request", () => {
    expect(translateSftpError(new Error("Not a directory"), "list /x").status).toBe(400);
  });

  it("keeps an unrecognised failure as a fault, because it might be one", () => {
    // The point of the mapping is to stop mislabelling client mistakes, not to
    // hide genuine breakage behind a 4xx.
    const result = translateSftpError(new Error("Connection reset by peer"), "read /x");
    expect(result.status).toBe(502);
    expect(result.message).toContain("Connection reset");
  });

  it("passes an AppError through untouched", () => {
    const original = new AppError(413, "TOO_LARGE", "File exceeds the limit");
    expect(translateSftpError(original, "read /x")).toBe(original);
  });

  it("names the action so the message says what was being attempted", () => {
    expect(translateSftpError({ code: 2 }, "read /srv/app.js").message).toContain("read /srv/app.js");
  });

  it("does not throw on a malformed error value", () => {
    for (const junk of [undefined, null, "a string", 42, {}]) {
      expect(() => translateSftpError(junk, "read /x")).not.toThrow();
      expect(translateSftpError(junk, "read /x")).toBeInstanceOf(AppError);
    }
  });
});

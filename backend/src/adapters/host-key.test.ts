import { describe, expect, it } from "vitest";
import { detectKeyType, fingerprintFromHostKey } from "./host-key.js";

/**
 * The fingerprint shown to a user must match `ssh-keyscan | ssh-keygen -lf`
 * exactly, otherwise comparing it against a provider's published value is
 * impossible and the whole verification step is theatre.
 */

/** Real ssh-ed25519 host key blob, base64 as it appears in known_hosts. */
const ED25519_KEY = Buffer.from(
  "AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl",
  "base64",
);

describe("Host key fingerprinting", () => {
  it("prints the OpenSSH SHA256 form without base64 padding", () => {
    const { fingerprint } = fingerprintFromHostKey(ED25519_KEY);
    expect(fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]+$/);
    // Padding would make the value differ from what ssh-keygen prints.
    expect(fingerprint).not.toContain("=");
  });

  it("matches the fingerprint OpenSSH reports for this key", () => {
    // github.com's published ed25519 fingerprint, from the key blob above.
    expect(fingerprintFromHostKey(ED25519_KEY).fingerprint)
      .toBe("SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU");
  });

  it("produces a 64-character hex digest for storage and comparison", () => {
    const { sha256 } = fingerprintFromHostKey(ED25519_KEY);
    expect(sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("agrees between the printed and stored representations", () => {
    const { fingerprint, sha256 } = fingerprintFromHostKey(ED25519_KEY);
    // SftpAdapter.connect accepts either form and normalises to hex, so the
    // two must describe the same digest.
    const fromPrinted = Buffer.from(fingerprint.replace(/^SHA256:/, ""), "base64").toString("hex");
    expect(fromPrinted).toBe(sha256);
  });

  it("reads the algorithm name from the key blob", () => {
    expect(detectKeyType(ED25519_KEY)).toBe("ssh-ed25519");
  });

  it("reports unknown rather than throwing on a malformed blob", () => {
    expect(detectKeyType(Buffer.from([0x00, 0x01]))).toBe("unknown");
    expect(detectKeyType(Buffer.alloc(0))).toBe("unknown");
    // A length prefix larger than the buffer must not be trusted.
    expect(detectKeyType(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x61]))).toBe("unknown");
  });
});

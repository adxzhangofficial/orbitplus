import { describe, expect, it } from "vitest";
import { sha256 } from "../lib/crypto.js";
import { decryptFileVersionContent, encryptFileVersionContent } from "./file-version-crypto.js";

const content = Buffer.from("sensitive remote file contents\n");
const metadata = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  serverId: "22222222-2222-4222-8222-222222222222",
  path: "/srv/app/.env",
  checksum: sha256(content),
};

describe("file version encryption", () => {
  it("round trips bytes without storing plaintext", () => {
    const ciphertext = encryptFileVersionContent(content, metadata);
    expect(ciphertext).not.toContain(content.toString("utf8").trim());
    expect(decryptFileVersionContent(ciphertext, metadata)).toEqual(content);
  });

  it("authenticates immutable tenant and file metadata", () => {
    const ciphertext = encryptFileVersionContent(content, metadata);
    expect(() => decryptFileVersionContent(ciphertext, { ...metadata, path: "/srv/app/other.env" })).toThrow(
      "could not be decrypted",
    );
  });

  it("refuses content whose checksum metadata is wrong", () => {
    expect(() => encryptFileVersionContent(content, { ...metadata, checksum: "0".repeat(64) })).toThrow(
      "do not match their checksum",
    );
  });
});

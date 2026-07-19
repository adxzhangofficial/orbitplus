import { generateKeyPairSync } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createServer, type Server as TcpServer } from "node:net";
import { Server, utils } from "ssh2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { discoverHostFingerprint, fingerprintFromHostKey } from "./host-key.js";

/**
 * Exercises fingerprint discovery against a real SSH server rather than a mock,
 * so the whole path is covered: TCP, identification banner, key exchange, the
 * hostVerifier callback, and the digest of the key actually presented.
 *
 * The assertion that matters is the last one: the fingerprint Orbit reports has
 * to equal the fingerprint of the key the server was configured with. Anything
 * else means users would compare a wrong value against their provider's.
 */

// RSA in PKCS#1 PEM: ssh2's key parser does not accept a PKCS#8 ed25519 key.
const { privateKey: hostKeyPem } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "pkcs1", format: "pem" },
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
});

/** The SSH wire-format public key is what OpenSSH fingerprints, not the PEM. */
const parsed = utils.parseKey(hostKeyPem);
if (parsed instanceof Error) throw parsed;
const expected = fingerprintFromHostKey(parsed.getPublicSSH());

// Tests reach loopback, which the production egress policy correctly refuses.
const allowLoopback = async (host: string) => host;

let sshServer: Server;
let sshPort = 0;

beforeAll(async () => {
  sshServer = new Server({ hostKeys: [hostKeyPem] }, (client) => {
    // No authentication is ever offered by the probe, so rejecting everything
    // mirrors what a real server does with an unknown user.
    client.on("authentication", (context) => context.reject());
    client.on("error", () => undefined);
  });
  await new Promise<void>((resolve) => {
    sshServer.listen(0, "127.0.0.1", () => {
      sshPort = (sshServer.address() as AddressInfo).port;
      resolve();
    });
  });
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve) => sshServer.close(() => resolve()));
});

describe("Fingerprint discovery against a real SSH server", () => {
  it("retrieves the fingerprint of the key the server actually presents", async () => {
    const result = await discoverHostFingerprint("127.0.0.1", sshPort, 8_000, allowLoopback);
    expect(result.fingerprint).toBe(expected.fingerprint);
    expect(result.sha256).toBe(expected.sha256);
  }, 20_000);

  it("reports the key type and the server banner", async () => {
    const result = await discoverHostFingerprint("127.0.0.1", sshPort, 8_000, allowLoopback);
    expect(result.keyType).toBe("ssh-rsa");
    expect(result.serverBanner).toMatch(/^SSH-2\.0-/);
  }, 20_000);

  it("needs no credentials, so it works before the user has entered any", async () => {
    // The server rejects every authentication attempt. Discovery must still
    // succeed, because the host key arrives during the handshake.
    const result = await discoverHostFingerprint("127.0.0.1", sshPort, 8_000, allowLoopback);
    expect(result.fingerprint).toMatch(/^SHA256:/);
  }, 20_000);

  it("is fast enough to sit behind a button in the UI", async () => {
    const started = Date.now();
    await discoverHostFingerprint("127.0.0.1", sshPort, 8_000, allowLoopback);
    expect(Date.now() - started).toBeLessThan(3_000);
  }, 20_000);

  it("reports a port with nothing listening as unreachable", async () => {
    // Port 1 on loopback refuses immediately.
    await expect(discoverHostFingerprint("127.0.0.1", 1, 8_000, allowLoopback))
      .rejects.toMatchObject({ code: "HOST_UNREACHABLE" });
  }, 20_000);

  it("distinguishes a non-SSH service from an unreachable host", async () => {
    // A plain TCP server that greets with something that is not an SSH banner.
    const decoy: TcpServer = createServer((socket) => socket.write("HTTP/1.1 200 OK\r\n"));
    await new Promise<void>((resolve) => decoy.listen(0, "127.0.0.1", () => resolve()));
    const decoyPort = (decoy.address() as AddressInfo).port;
    try {
      await expect(discoverHostFingerprint("127.0.0.1", decoyPort, 8_000, allowLoopback))
        .rejects.toMatchObject({ code: "NOT_AN_SSH_SERVER" });
    } finally {
      await new Promise<void>((resolve) => decoy.close(() => resolve()));
    }
  }, 20_000);

  it("names the silent-proxy case rather than timing out anonymously", async () => {
    // Accepts the connection and never speaks, which is what an intercepting
    // proxy does and what a plain handshake timeout cannot distinguish.
    const silent: TcpServer = createServer(() => undefined);
    await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", () => resolve()));
    const silentPort = (silent.address() as AddressInfo).port;
    try {
      await expect(discoverHostFingerprint("127.0.0.1", silentPort, 8_000, allowLoopback))
        .rejects.toMatchObject({ code: "SSH_BANNER_TIMEOUT" });
    } finally {
      await new Promise<void>((resolve) => silent.close(() => resolve()));
    }
  }, 20_000);
});

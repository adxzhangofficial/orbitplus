import { generateKeyPairSync } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Server, utils } from "ssh2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateOrbitKeyPair } from "./key-provisioning.service.js";

/**
 * The generated public key has to be something sshd will actually accept, which
 * means exact OpenSSH wire format. A key that looks right but is encoded wrong
 * would be written into authorized_keys and silently ignored, and the failure
 * would only surface later as "key auth doesn't work" with no explanation.
 */

const { privateKey: hostKeyPem } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "pkcs1", format: "pem" },
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
});

let sshServer: Server;
let sshPort = 0;
/** Public keys the fake sshd will accept, mimicking authorized_keys. */
const authorizedKeys: Buffer[] = [];
let lastCommand = "";

beforeAll(async () => {
  sshServer = new Server({ hostKeys: [hostKeyPem] }, (client) => {
    client.on("authentication", (context) => {
      if (context.method === "publickey") {
        const offered = context.key.data;
        const accepted = authorizedKeys.some((key) => key.equals(offered));
        return accepted ? context.accept() : context.reject(["publickey"]);
      }
      if (context.method === "password") return context.accept();
      return context.reject(["password", "publickey"]);
    });
    client.on("ready", () => {
      client.on("session", (accept) => {
        const session = accept();
        session.on("exec", (acceptExec, _reject, info) => {
          lastCommand = info.command;
          const stream = acceptExec();
          stream.write("ORBIT_KEY_INSTALLED\n");
          stream.exit(0);
          stream.end();
        });
      });
    });
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

describe("Orbit key generation", () => {
  it("emits a key OpenSSH can parse", () => {
    const keyPair = generateOrbitKeyPair("orbit+ test");
    const parsed = utils.parseKey(keyPair.publicKey);
    // If this throws, sshd would silently ignore the authorized_keys line.
    expect(parsed).not.toBeInstanceOf(Error);
    expect((parsed as ReturnType<typeof utils.parseKey> & { type: string }).type).toBe("ssh-rsa");
  });

  it("uses the three-field authorized_keys format", () => {
    // Comments are space-free, so the entry is exactly three fields and the
    // removal grep during re-provisioning matches one whole field.
    const keyPair = generateOrbitKeyPair("orbit-plus-acme-prod");
    const parts = keyPair.publicKey.split(" ");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("ssh-rsa");
    expect(parts[2]).toBe("orbit-plus-acme-prod");
  });

  it("produces a private key that pairs with the public key", () => {
    const keyPair = generateOrbitKeyPair("orbit+ pairing");
    const fromPrivate = utils.parseKey(keyPair.privateKey);
    expect(fromPrivate).not.toBeInstanceOf(Error);
    const publicFromPrivate = (fromPrivate as { getPublicSSH(): Buffer }).getPublicSSH();
    const publicFromString = (utils.parseKey(keyPair.publicKey) as { getPublicSSH(): Buffer }).getPublicSSH();
    // A mismatch would install one key and authenticate with another.
    expect(publicFromPrivate.equals(publicFromString)).toBe(true);
  });

  it("generates a distinct key every time", () => {
    const first = generateOrbitKeyPair("orbit+ one");
    const second = generateOrbitKeyPair("orbit+ two");
    expect(first.publicKey).not.toBe(second.publicKey);
    expect(first.privateKey).not.toBe(second.privateKey);
  });
});

describe("Generated key authenticates against a real SSH server", () => {
  it("is rejected before installation and accepted after", async () => {
    const keyPair = generateOrbitKeyPair("orbit+ live test");
    const publicBlob = (utils.parseKey(keyPair.publicKey) as { getPublicSSH(): Buffer }).getPublicSSH();

    const attempt = () => new Promise<boolean>((resolve) => {
      const { Client } = require("ssh2") as typeof import("ssh2");
      const client = new Client();
      client.on("ready", () => { client.end(); resolve(true); });
      client.on("error", () => resolve(false));
      client.connect({
        host: "127.0.0.1", port: sshPort, username: "deploy",
        privateKey: keyPair.privateKey, readyTimeout: 8_000,
        hostVerifier: () => true,
      });
    });

    // Not in authorized_keys yet.
    expect(await attempt()).toBe(false);

    authorizedKeys.push(publicBlob);

    // The same key now authenticates, which is the property that matters.
    expect(await attempt()).toBe(true);
  }, 30_000);
});

describe("The installation command", () => {
  it("sets the permissions sshd requires and is safe to re-run", async () => {
    const { installOrbitKey } = await import("./key-provisioning.service.js");
    const hostKeyParsed = utils.parseKey(hostKeyPem) as { getPublicSSH(): Buffer };
    const { createHash } = await import("node:crypto");
    const fingerprint = createHash("sha256").update(hostKeyParsed.getPublicSSH()).digest("hex");

    await installOrbitKey(
      { host: "127.0.0.1", port: sshPort, username: "deploy", hostFingerprintSha256: fingerprint },
      "any-password",
      "orbit-plus-cmd-check",
    ).catch(() => undefined); // Verification fails; the command is what is asserted.

    // sshd ignores authorized_keys when these permissions are wrong, which is
    // the most common silent cause of key auth not working.
    expect(lastCommand).toContain("chmod 700");
    expect(lastCommand).toContain("chmod 600");
    // Re-provisioning must replace the prior Orbit entry, not append a duplicate.
    expect(lastCommand).toContain("grep -v -F ' orbit-plus-cmd-check'");
  }, 30_000);
});

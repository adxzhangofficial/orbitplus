import { createHash, generateKeyPairSync } from "node:crypto";
// ssh2 is CommonJS. Node's ESM loader detects `Client` as a named export but
// not `utils`, so importing it by name typechecks and then throws at startup.
// The default import is destructured instead.
import ssh2 from "ssh2";
import type { Client as SshClient } from "ssh2";

const { Client, utils } = ssh2;
import { resolveAllowedSftpAddress } from "../adapters/egress-policy.js";
import { AppError } from "../lib/errors.js";

/**
 * Installs an Orbit-owned SSH key on a server so later connections need no
 * password, the equivalent of ssh-copy-id.
 *
 * The password is used once, to authenticate the installation, and is then
 * replaced by the generated private key. Storing a reusable password for every
 * customer server is a far worse thing to hold than a per-server key that can
 * be revoked by deleting one line from authorized_keys.
 */

export interface ProvisionedKey {
  privateKey: string;
  publicKey: string;
  comment: string;
  fingerprint: string;
}

interface ConnectionTarget {
  host: string;
  port: number;
  username: string;
  hostFingerprintSha256: string;
}

/**
 * RSA rather than ed25519, because ssh2 cannot parse a PKCS#8 ed25519 private
 * key and Node cannot emit the OpenSSH container that ssh2 wants. Generating a
 * key the client library cannot load would store a credential that silently
 * fails at connection time. 3072 bits is the NIST-recommended strength and
 * every sshd in service accepts it.
 */
export function generateOrbitKeyPair(comment: string): ProvisionedKey {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 3072,
    publicKeyEncoding: { type: "pkcs1", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });

  // Derived through ssh2's own parser, so the line written to authorized_keys
  // is by construction the key ssh2 will later authenticate with. Hand-encoding
  // the wire format invites a mismatch that only appears as an unexplained
  // authentication failure.
  const parsed = utils.parseKey(privateKey);
  if (parsed instanceof Error) {
    throw new AppError(500, "KEY_GENERATION_FAILED", `Generated key could not be parsed: ${parsed.message}`);
  }
  const blob = parsed.getPublicSSH();
  const publicKey = `ssh-rsa ${blob.toString("base64")} ${comment}`;

  return {
    privateKey,
    publicKey,
    comment,
    fingerprint: `SHA256:${createHash("sha256").update(blob).digest("base64").replace(/=+$/, "")}`,
  };
}

function connect(target: ConnectionTarget, auth: { password?: string; privateKey?: string }, timeoutMs = 20_000): Promise<SshClient> {
  return new Promise<SshClient>(async (resolve, reject) => {
    let resolvedHost: string;
    try {
      resolvedHost = await resolveAllowedSftpAddress(target.host);
    } catch (error) {
      reject(error);
      return;
    }

    const client = new Client();
    const timer = setTimeout(() => {
      client.destroy();
      reject(new AppError(504, "SSH_TIMEOUT", `${target.host}:${target.port} did not respond within ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    client.on("ready", () => { clearTimeout(timer); resolve(client); });
    client.on("error", (error: Error) => {
      clearTimeout(timer);
      client.destroy();
      reject(new AppError(502, "SSH_CONNECT_FAILED", error.message));
    });

    client.connect({
      host: resolvedHost,
      port: target.port,
      username: target.username,
      readyTimeout: timeoutMs,
      ...(auth.password ? { password: auth.password } : {}),
      ...(auth.privateKey ? { privateKey: auth.privateKey } : {}),
      // The pin is still enforced during provisioning; a changed host key here
      // would mean installing our key on somebody else's machine.
      hostHash: "sha256",
      hostVerifier: (fingerprint: string) =>
        fingerprint.toLowerCase().replace(/:/g, "") === target.hostFingerprintSha256.toLowerCase().replace(/:/g, ""),
    });
  });
}

function exec(client: SshClient, command: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (error, stream) => {
      if (error) { reject(new AppError(502, "SSH_EXEC_FAILED", error.message)); return; }
      let stdout = "";
      let stderr = "";
      stream.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
      stream.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
      stream.on("close", (code: number) => resolve({ code: code ?? 0, stdout, stderr }));
    });
  });
}

/**
 * Appends the public key to authorized_keys and verifies it works before the
 * caller stops relying on the password.
 *
 * The remote command is idempotent: re-running it does not duplicate the entry,
 * so a retry after a network failure is safe. Permissions are set explicitly
 * because sshd silently ignores authorized_keys when the directory or file is
 * group or world writable, which is the most common reason key auth "just
 * doesn't work" with no useful error anywhere.
 */
export async function installOrbitKey(
  target: ConnectionTarget,
  password: string,
  comment: string,
): Promise<ProvisionedKey> {
  const keyPair = generateOrbitKeyPair(comment);
  const client = await connect(target, { password });

  try {
    const entry = keyPair.publicKey.replace(/'/g, "'\\''");
    const install = [
      "set -e",
      'mkdir -p "$HOME/.ssh"',
      'chmod 700 "$HOME/.ssh"',
      'touch "$HOME/.ssh/authorized_keys"',
      'chmod 600 "$HOME/.ssh/authorized_keys"',
      // Remove any prior Orbit entry with the same comment before appending, so
      // re-provisioning replaces rather than accumulates.
      `grep -v -F ' ${comment}' "$HOME/.ssh/authorized_keys" > "$HOME/.ssh/authorized_keys.orbit-tmp" || true`,
      `printf '%s\\n' '${entry}' >> "$HOME/.ssh/authorized_keys.orbit-tmp"`,
      'mv "$HOME/.ssh/authorized_keys.orbit-tmp" "$HOME/.ssh/authorized_keys"',
      'chmod 600 "$HOME/.ssh/authorized_keys"',
      'echo ORBIT_KEY_INSTALLED',
    ].join(" && ");

    const result = await exec(client, install);
    if (result.code !== 0 || !result.stdout.includes("ORBIT_KEY_INSTALLED")) {
      throw new AppError(
        502,
        "KEY_INSTALL_FAILED",
        `Could not write authorized_keys on the server: ${(result.stderr || result.stdout).trim().slice(0, 300) || "no output"}`,
      );
    }
  } finally {
    client.end();
  }

  // Verified with a second, independent connection using only the new key. The
  // caller must not discard the password until this succeeds, otherwise a
  // server that ignores authorized_keys would lock the user out.
  let verification: SshClient;
  try {
    verification = await connect(target, { privateKey: keyPair.privateKey });
  } catch (error) {
    throw new AppError(
      502,
      "KEY_VERIFICATION_FAILED",
      `The key was written but the server did not accept it. The password has been kept. ${error instanceof AppError ? error.message : ""}`.trim(),
    );
  }
  verification.end();

  return keyPair;
}

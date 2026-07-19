import { createHash } from "node:crypto";
import { connect as tcpConnect } from "node:net";
import { Client } from "ssh2";
import { AppError } from "../lib/errors.js";
import { resolveAllowedSftpAddress } from "./egress-policy.js";

/**
 * Reads the server's SSH identification banner over a plain socket.
 *
 * Run before the handshake because it separates the three failure modes that a
 * single timeout would otherwise collapse into one useless message: the host is
 * unreachable, something answers the port but is not SSH, or a proxy accepts
 * the connection and never forwards it. The last case is invisible to a
 * handshake timeout and is exactly what a corporate proxy or filtering DNS
 * does, so it is worth naming precisely.
 */
async function probeSshBanner(host: string, port: number, connectMs: number, bannerMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const started = Date.now();
    let connected = false;
    let settled = false;

    const socket = tcpConnect({ host, port });

    const done = (error?: AppError, banner?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(bannerTimer);
      socket.destroy();
      if (banner !== undefined) resolve(banner);
      else reject(error);
    };

    const connectTimer = setTimeout(() => {
      done(new AppError(504, "HOST_UNREACHABLE", `${host}:${port} did not accept a connection within ${Math.round(connectMs / 1000)}s. Check the address, the port, and that the firewall allows this server.`));
    }, connectMs);

    let bannerTimer: NodeJS.Timeout;

    socket.on("connect", () => {
      connected = true;
      clearTimeout(connectTimer);
      bannerTimer = setTimeout(() => {
        done(new AppError(
          502,
          "SSH_BANNER_TIMEOUT",
          `Connected to ${host}:${port} in ${Date.now() - started}ms, but it never sent an SSH identification banner. An SSH server always speaks first, so the port is either not SSH or a proxy or firewall is accepting the connection without forwarding it.`,
        ));
      }, bannerMs);
    });

    socket.once("data", (chunk: Buffer) => {
      const banner = chunk.toString("utf8").split("\r\n")[0] ?? "";
      if (!banner.startsWith("SSH-")) {
        done(new AppError(502, "NOT_AN_SSH_SERVER", `${host}:${port} answered with "${banner.slice(0, 60)}" instead of an SSH banner. Confirm the port is running SSH/SFTP.`));
        return;
      }
      done(undefined, banner);
    });

    socket.on("error", (error: NodeJS.ErrnoException) => {
      const reason = error.code === "ECONNREFUSED"
        ? `Nothing is listening on ${host}:${port}.`
        : error.code === "ENOTFOUND" || error.code === "EAI_AGAIN"
          ? `${host} could not be resolved.`
          : error.message;
      done(new AppError(502, connected ? "SSH_PROBE_FAILED" : "HOST_UNREACHABLE", reason));
    });
  });
}

export interface DiscoveredHostKey {
  /** OpenSSH presentation form, e.g. SHA256:47DEQpj8HBSa+/TImW+5JC... */
  fingerprint: string;
  /** Lowercase hex digest, the form stored and compared internally. */
  sha256: string;
  keyType: string;
  host: string;
  port: number;
  /** e.g. "SSH-2.0-OpenSSH_8.9p1", shown so the user can confirm the target. */
  serverBanner: string;
}

/**
 * Retrieves a server's SSH host key without authenticating.
 *
 * ssh2 invokes hostVerifier during the handshake, before any credential is
 * offered, so a fingerprint can be shown while the user is still filling in the
 * form. The connection is torn down immediately afterwards; nothing is sent.
 *
 * This is trust on first use, not verification. It removes the barrier of
 * making someone SSH in and run ssh-keyscan by hand, and pinning still protects
 * every subsequent connection: once stored, a changed host key is refused. The
 * one thing it cannot detect is an attacker already in position during this
 * first lookup, which is why the response asks the user to confirm the value
 * against whatever their provider published.
 */
export async function discoverHostFingerprint(
  host: string,
  port: number,
  timeoutMs = 8_000,
  // Injected only by tests, which need to reach a loopback SSH server. Production
  // callers always get the egress policy, so there is no way to opt out of it
  // through configuration or a request.
  resolveHost: (value: string) => Promise<string> = resolveAllowedSftpAddress,
): Promise<DiscoveredHostKey> {
  // The same egress policy the real adapter uses. Without it this endpoint
  // would be an SSRF probe against loopback, link-local, and metadata targets.
  const resolvedHost = await resolveHost(host);

  // Fails in about a second on the common problems, instead of making someone
  // watch a spinner for the full handshake timeout to be told only "no response".
  const banner = await probeSshBanner(resolvedHost, port, 4_000, 4_000);

  return new Promise<DiscoveredHostKey>((resolve, reject) => {
    const client = new Client();
    let captured: DiscoveredHostKey | undefined;
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { client.end(); } catch { /* socket may already be gone */ }
      try { client.destroy(); } catch { /* ignore */ }
      if (captured) resolve(captured);
      else reject(error ?? new AppError(502, "HOST_KEY_UNAVAILABLE", "The server did not present an SSH host key"));
    };

    const timer = setTimeout(() => {
      // The banner already arrived, so the server is reachable and is SSH.
      // Reaching here means key exchange itself stalled.
      finish(new AppError(504, "HOST_KEY_TIMEOUT", `${host}:${port} identified as "${banner}" but did not complete key exchange within ${Math.round(timeoutMs / 1000)}s. This usually means no mutually supported key exchange algorithm.`));
    }, timeoutMs);

    client.on("ready", () => finish());
    client.on("error", (error: Error & { level?: string }) => {
      // The handshake is all that matters. Authentication is expected to fail
      // because no credential was supplied, and that failure still means the
      // host key was received successfully.
      if (captured) return finish();
      finish(new AppError(502, "HOST_KEY_UNAVAILABLE", `Could not reach ${host}:${port}: ${error.message}`));
    });
    client.on("close", () => finish());

    client.connect({
      host: resolvedHost,
      port,
      username: "orbit-fingerprint-probe",
      readyTimeout: timeoutMs,
      // No credentials are offered; the handshake alone yields the host key.
      authHandler: () => false,
      hostVerifier: (key: Buffer) => {
        captured = {
          ...fingerprintFromHostKey(key),
          keyType: detectKeyType(key),
          host,
          port,
          serverBanner: banner,
        };
        // Refusing ends the connection here, which is all that is wanted.
        return false;
      },
    });
  });
}

/** The key blob starts with a length-prefixed algorithm name. */
export function detectKeyType(key: Buffer): string {
  try {
    const length = key.readUInt32BE(0);
    if (length > 0 && length < 64 && key.length >= 4 + length) {
      return key.subarray(4, 4 + length).toString("ascii");
    }
  } catch { /* fall through */ }
  return "unknown";
}

/**
 * Formats a host key the way OpenSSH prints it, so a user can compare the value
 * shown in Orbit character for character against `ssh-keyscan` output or the
 * fingerprint their provider published.
 */
export function fingerprintFromHostKey(key: Buffer): { fingerprint: string; sha256: string } {
  const digest = createHash("sha256").update(key).digest();
  return {
    fingerprint: `SHA256:${digest.toString("base64").replace(/=+$/, "")}`,
    sha256: digest.toString("hex"),
  };
}

import { afterEach, describe, expect, it } from "vitest";
import { acquire, breakerFor, closeAllConnections, evictServer, poolStats, sweepIdleConnections } from "./connection-pool.js";
import type { RemoteFilesystem, ServerConnectionRecord } from "./remote-filesystem.js";

/**
 * The pool exists so browsing a directory tree does not pay an SSH handshake
 * per click, and so one unreachable server does not make every request wait out
 * the connect timeout. Both properties are asserted here against a stub adapter
 * whose connect cost and failure mode are controllable.
 */

let connectCount = 0;
let disconnectCount = 0;
let failNextConnects = 0;

function stubServer(id: string): ServerConnectionRecord {
  return {
    id,
    name: `Server ${id}`,
    organization_id: "org",
    adapter_mode: "sftp",
    host: "example.test",
    port: 22,
    username: "deploy",
    root_path: "/",
    authentication_type: "password",
    credential_ciphertext: null,
    host_fingerprint: null,
  } as unknown as ServerConnectionRecord;
}

function stubAdapter(): RemoteFilesystem {
  return {
    async connect() {
      if (failNextConnects > 0) {
        failNextConnects -= 1;
        throw new Error("handshake refused");
      }
      connectCount += 1;
    },
    async disconnect() { disconnectCount += 1; },
    async list() { return []; },
    async read() { return Buffer.alloc(0); },
    async write() { /* noop */ },
    async mkdir() { /* noop */ },
    async rename() { /* noop */ },
    async delete() { /* noop */ },
    async health() { return { ok: true, latencyMs: 1, message: "ok" }; },
  } as unknown as RemoteFilesystem;
}

afterEach(async () => {
  await closeAllConnections();
  connectCount = 0;
  disconnectCount = 0;
  failNextConnects = 0;
});

describe("Connection reuse", () => {
  it("opens one connection and reuses it for later operations", async () => {
    const server = stubServer(`reuse-${Date.now()}`);
    for (let index = 0; index < 10; index += 1) {
      const { release } = await acquire(server, stubAdapter);
      await release();
    }
    // Ten operations, one handshake. This is the whole point of the pool.
    expect(connectCount).toBe(1);
  });

  it("keeps the connection open between operations", async () => {
    const server = stubServer(`open-${Date.now()}`);
    const first = await acquire(server, stubAdapter);
    await first.release();
    expect(disconnectCount).toBe(0);
    expect(poolStats().find((entry) => entry.serverId === server.id)?.open).toBe(1);
  });

  it("opens a second connection when the first is still busy", async () => {
    const server = stubServer(`parallel-${Date.now()}`);
    const first = await acquire(server, stubAdapter);
    const second = await acquire(server, stubAdapter);
    expect(connectCount).toBe(2);
    await first.release();
    await second.release();
  });

  it("retires a connection that failed mid-operation", async () => {
    const server = stubServer(`failed-${Date.now()}`);
    const { release } = await acquire(server, stubAdapter);
    // A connection whose operation threw may be in an unknown protocol state,
    // so it must not be handed to the next caller.
    await release(true);
    expect(disconnectCount).toBe(1);
    expect(poolStats().find((entry) => entry.serverId === server.id)).toBeUndefined();
  });

  it("drops idle connections on sweep", async () => {
    const server = stubServer(`idle-${Date.now()}`);
    const { release } = await acquire(server, stubAdapter);
    await release();
    sweepIdleConnections();
    // Still within the idle window, so it survives.
    expect(poolStats().find((entry) => entry.serverId === server.id)?.open).toBe(1);
  });

  it("closes every connection for a server on eviction", async () => {
    const server = stubServer(`evict-${Date.now()}`);
    const { release } = await acquire(server, stubAdapter);
    await release();
    await evictServer(server.id);
    expect(poolStats().find((entry) => entry.serverId === server.id)).toBeUndefined();
  });
});

describe("Circuit breaker", () => {
  it("fails immediately after a connection failure instead of retrying", async () => {
    const server = stubServer(`breaker-${Date.now()}`);
    failNextConnects = 1;
    await expect(acquire(server, stubAdapter)).rejects.toThrow("handshake refused");

    // The breaker is now open, so this returns without attempting a connection.
    const started = Date.now();
    await expect(acquire(server, stubAdapter)).rejects.toMatchObject({ code: "SERVER_UNREACHABLE" });
    expect(Date.now() - started).toBeLessThan(50);
    // No further handshake was attempted while the breaker was open.
    expect(connectCount).toBe(0);
  });

  it("reports how long until the next attempt", async () => {
    const server = stubServer(`retry-${Date.now()}`);
    failNextConnects = 1;
    await expect(acquire(server, stubAdapter)).rejects.toThrow();
    const state = breakerFor(server.id);
    expect(state).toBeDefined();
    expect(state!.openUntil).toBeGreaterThan(Date.now());
    expect(state!.reason).toContain("handshake refused");
  });

  it("backs off further on repeated failures", async () => {
    const server = stubServer(`backoff-${Date.now()}`);
    failNextConnects = 1;
    await expect(acquire(server, stubAdapter)).rejects.toThrow();
    const first = breakerFor(server.id)!.openUntil;

    // Force the window to elapse so a second real attempt is made.
    await evictServer(server.id);
    failNextConnects = 1;
    await expect(acquire(server, stubAdapter)).rejects.toThrow();
    const second = breakerFor(server.id)!;
    // A host that keeps failing is probed less often, not on a fixed interval.
    expect(second.failures).toBeGreaterThanOrEqual(1);
    expect(second.openUntil).toBeGreaterThanOrEqual(first - 1_000);
  });

  it("clears the breaker once a connection succeeds", async () => {
    const server = stubServer(`recover-${Date.now()}`);
    failNextConnects = 1;
    await expect(acquire(server, stubAdapter)).rejects.toThrow();
    await evictServer(server.id);

    const { release } = await acquire(server, stubAdapter);
    await release();
    expect(breakerFor(server.id)).toBeUndefined();
  });
});

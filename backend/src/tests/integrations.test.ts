import "dotenv/config";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("Integration tests require a dedicated TEST_DATABASE_URL");
const testDatabaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ""));
if (!/(?:^|[-_])test(?:$|[-_])/i.test(testDatabaseName)) {
  throw new Error("TEST_DATABASE_URL must target a database explicitly named for tests");
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.ALLOW_DEVELOPMENT_SEED = "true";
process.env.SEED_DATABASE_NAME = testDatabaseName;
// The receiver below runs on loopback, which the egress policy refuses by
// default. This is the same flag single-host deployments use.
process.env.SFTP_ALLOW_LOOPBACK = "true";

let app: Express;
let closePool: () => Promise<void>;
let receiver: HttpServer;
let receiverPort = 0;
let token = "";
let organizationId = "";

/** Everything the receiver was sent, so deliveries can be asserted. */
interface Received { headers: Record<string, string | string[] | undefined>; body: unknown }
let received: Received[] = [];
/** Status the receiver answers with, so failure handling can be exercised. */
let respondWith = 200;

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

function as(method: "get" | "post" | "patch" | "delete", path: string) {
  return request(app)[method](path).set("authorization", `Bearer ${token}`).set("x-organization-id", organizationId);
}

beforeAll(async () => {
  receiver = createServer((incoming, response) => {
    let raw = "";
    incoming.on("data", (chunk) => { raw += chunk; });
    incoming.on("end", () => {
      received.push({ headers: incoming.headers, body: raw ? JSON.parse(raw) : null });
      response.writeHead(respondWith).end("ok");
    });
  });
  await new Promise<void>((resolve) => {
    receiver.listen(0, "127.0.0.1", () => { receiverPort = (receiver.address() as AddressInfo).port; resolve(); });
  });

  ({ app } = await import("../app.js"));
  const database = await import("../database/pool.js");
  const migrations = await import("../database/migrate.js");
  const seeding = await import("../database/seed.js");
  closePool = database.closePool;
  await migrations.migrate();
  await seeding.seed();
  const login = await request(app).post("/api/v1/auth/login").send({ email: "demo@orbit.dev", password: "OrbitDemo123!" });
  token = login.body.data.token as string;
  organizationId = login.body.data.organizations[0].id as string;
}, 60_000);

beforeEach(async () => {
  const database = await import("../database/pool.js");
  await database.pool.query("DELETE FROM integrations WHERE organization_id = $1", [organizationId]);
  received = [];
  respondWith = 200;
});

afterAll(async () => {
  await new Promise<void>((resolve) => receiver.close(() => resolve()));
  if (closePool) await closePool();
});

async function createIntegration(overrides: Record<string, unknown> = {}) {
  const response = await as("post", "/api/v1/integrations").send({
    kind: "webhook",
    name: `Hook ${unique()}`,
    url: `http://127.0.0.1:${receiverPort}/hook`,
    events: [],
    ...overrides,
  });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; signingSecret?: string; targetHint: string };
}

describe("Creating integrations", () => {
  it("stores the destination without ever returning it", async () => {
    const created = await createIntegration();
    const listed = await as("get", "/api/v1/integrations");
    const row = listed.body.data.find((item: { id: string }) => item.id === created.id);
    // For Slack and Discord the URL is itself the credential, so echoing it
    // back would make reading this endpoint a disclosure.
    expect(JSON.stringify(row)).not.toContain("/hook");
    expect(row.targetHint).toContain("127.0.0.1");
  });

  it("issues a signing secret for a plain webhook", async () => {
    const created = await createIntegration();
    expect(created.signingSecret).toMatch(/^whsec_/);
  });

  it("refuses a destination the egress policy blocks", async () => {
    // Without this an integration URL is a request-forgery primitive.
    const response = await as("post", "/api/v1/integrations").send({
      kind: "webhook", name: "Metadata", url: "http://169.254.169.254/latest/meta-data/", events: [],
    });
    expect(response.status).toBe(400);
  });

  it("refuses a malformed URL", async () => {
    const response = await as("post", "/api/v1/integrations").send({
      kind: "webhook", name: "Broken", url: "not-a-url", events: [],
    });
    expect(response.status).toBe(400);
  });
});

describe("Delivery", () => {
  it("delivers a test event and signs it", async () => {
    received = [];
    respondWith = 200;
    const created = await createIntegration();

    const test = await as("post", `/api/v1/integrations/${created.id}/test`).send({});
    expect(test.status).toBe(200);
    expect(test.body.data.delivered).toBe(1);

    expect(received).toHaveLength(1);
    const delivery = received[0]!;
    expect(delivery.headers["x-orbit-event"]).toBe("alert.opened");
    // A timestamp inside the signed material is what stops a captured delivery
    // being replayed later with a still-valid signature.
    expect(delivery.headers["x-orbit-signature"]).toMatch(/^v1=[a-f0-9]{64}$/);
    expect(delivery.headers["x-orbit-timestamp"]).toBeTruthy();
  });

  it("produces a signature the receiver can verify", async () => {
    received = [];
    const created = await createIntegration();
    await as("post", `/api/v1/integrations/${created.id}/test`).send({});

    const { signPayload } = await import("../services/integration.service.js");
    const delivery = received[0]!;
    const expected = `v1=${signPayload(
      created.signingSecret!,
      String(delivery.headers["x-orbit-timestamp"]),
      JSON.stringify(delivery.body),
    )}`;
    expect(delivery.headers["x-orbit-signature"]).toBe(expected);
  });

  it("records a failure and the response status", async () => {
    received = [];
    respondWith = 500;
    const created = await createIntegration();

    const test = await as("post", `/api/v1/integrations/${created.id}/test`).send({});
    expect(test.body.data.failed).toBe(1);

    const deliveries = await as("get", `/api/v1/integrations/${created.id}/deliveries`);
    expect(deliveries.body.data[0].status).toBe("failed");
    expect(deliveries.body.data[0].responseStatus).toBe(500);
    respondWith = 200;
  });

  it("sends only the events an integration subscribes to", async () => {
    received = [];
    const { dispatchEvent } = await import("../services/integration.service.js");
    await createIntegration({ events: ["backup.failed"] });

    await dispatchEvent({
      event: "transfer.completed",
      organizationId, title: "Not subscribed", message: "Should not arrive",
      severity: "info", occurredAt: new Date().toISOString(),
    });
    expect(received).toHaveLength(0);

    await dispatchEvent({
      event: "backup.failed",
      organizationId, title: "Subscribed", message: "Should arrive",
      severity: "critical", occurredAt: new Date().toISOString(),
    });
    expect(received.length).toBeGreaterThan(0);
  });

  it("formats a Slack payload as an attachment", async () => {
    received = [];
    const created = await createIntegration({ kind: "slack" });
    // Slack ignores an unsigned bare payload, so the envelope has to differ.
    await as("post", `/api/v1/integrations/${created.id}/test`).send({});
    const body = received[0]!.body as { attachments?: unknown[] };
    expect(Array.isArray(body.attachments)).toBe(true);
  });

  it("does not sign a Slack delivery", async () => {
    received = [];
    const created = await createIntegration({ kind: "slack" });
    await as("post", `/api/v1/integrations/${created.id}/test`).send({});
    // Slack authenticates by possession of the URL; a signature header would
    // be noise the receiver ignores.
    expect(received[0]!.headers["x-orbit-signature"]).toBeUndefined();
    expect(created.signingSecret).toBeUndefined();
  });
});

describe("Failure handling", () => {
  it("stops attempting a destination that keeps failing", async () => {
    const created = await createIntegration();
    const database = await import("../database/pool.js");
    await database.pool.query("UPDATE integrations SET consecutive_failures = 20 WHERE id = $1", [created.id]);

    received = [];
    const test = await as("post", `/api/v1/integrations/${created.id}/test`).send({});
    // Retrying on every event would spend the worker's time on a channel
    // nobody is reading.
    expect(received).toHaveLength(0);
    expect(test.body.data.delivered).toBe(0);

    const deliveries = await as("get", `/api/v1/integrations/${created.id}/deliveries`);
    expect(deliveries.body.data[0].status).toBe("skipped");
  });

  it("clears the failure count when re-enabled", async () => {
    const created = await createIntegration();
    const database = await import("../database/pool.js");
    await database.pool.query("UPDATE integrations SET consecutive_failures = 20, enabled = false WHERE id = $1", [created.id]);

    await as("patch", `/api/v1/integrations/${created.id}`).send({ enabled: true });
    const listed = await as("get", "/api/v1/integrations");
    const row = listed.body.data.find((item: { id: string }) => item.id === created.id);
    // A destination that has been fixed must be attempted again rather than
    // staying suppressed forever.
    expect(row.consecutiveFailures).toBe(0);
  });

  it("skips a disabled integration entirely", async () => {
    received = [];
    const created = await createIntegration();
    await as("patch", `/api/v1/integrations/${created.id}`).send({ enabled: false });

    const { dispatchEvent } = await import("../services/integration.service.js");
    await dispatchEvent({
      event: "alert.opened", organizationId,
      title: "Disabled", message: "Should not arrive",
      severity: "info", occurredAt: new Date().toISOString(),
    });
    expect(received).toHaveLength(0);
  });
});

describe("Tenant isolation", () => {
  it("does not deliver another organization's events", async () => {
    received = [];
    await createIntegration();
    const { dispatchEvent } = await import("../services/integration.service.js");

    await dispatchEvent({
      event: "alert.opened",
      organizationId: "00000000-0000-0000-0000-000000000000",
      title: "Other tenant", message: "Should not arrive",
      severity: "info", occurredAt: new Date().toISOString(),
    });
    expect(received).toHaveLength(0);
  });
});

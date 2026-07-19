import "dotenv/config";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("Integration tests require a dedicated TEST_DATABASE_URL");
const testDatabaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ""));
if (!/(?:^|[-_])test(?:$|[-_])/i.test(testDatabaseName)) {
  throw new Error("TEST_DATABASE_URL must target a database explicitly named for tests");
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.ALLOW_DEVELOPMENT_SEED = "true";
process.env.SEED_DATABASE_NAME = testDatabaseName;

/**
 * The support desk and feature flags, which the admin console drives directly.
 *
 * The cases worth holding are the ones where a figure could be quietly
 * flattered: a first-response time that gets rewritten by a later reply, an
 * internal note that stops the customer's clock, a reopened ticket that still
 * counts as resolved.
 */

let app: Express;
let closePool: () => Promise<void>;
let adminToken = "";
let adminUserId = "";

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

function admin(method: "get" | "post" | "put" | "patch" | "delete", path: string) {
  return request(app)[method](path).set("authorization", `Bearer ${adminToken}`);
}

async function newOrganization(): Promise<string> {
  const response = await request(app).post("/api/v1/auth/register").send({
    name: "Support Target",
    email: `support-target-${unique()}@orbit.test`,
    password: "OrbitTarget123!",
    organizationName: `Support Org ${unique()}`,
  });
  expect(response.status).toBe(201);
  return response.body.data.organizations[0].id as string;
}

beforeAll(async () => {
  ({ app } = await import("../app.js"));
  const database = await import("../database/pool.js");
  const migrations = await import("../database/migrate.js");
  const seeding = await import("../database/seed.js");
  closePool = database.closePool;
  await migrations.migrate();
  await seeding.seed();
  const login = await request(app).post("/api/v1/auth/login").send({ email: "admin@orbit.dev", password: "OrbitAdmin123!" });
  expect(login.status).toBe(200);
  adminToken = login.body.data.token as string;
  adminUserId = login.body.data.user.id as string;
}, 60_000);

afterAll(async () => {
  if (closePool) await closePool();
});

/** Opens a ticket for a fresh organization and returns its id. */
async function openTicket(priority = "normal", subject = "Transfers stall at the final checkpoint") {
  const organizationId = await newOrganization();
  const created = await admin("post", "/api/v1/admin/support/tickets").send({
    organizationId,
    subject,
    body: "Reported by the customer over a call.",
    priority,
  });
  expect(created.status).toBe(201);
  return created.body.data.id as string;
}

describe("Opening a ticket", () => {
  it("seeds the thread with the first message as the customer", async () => {
    const ticketId = await openTicket();
    const detail = await admin("get", `/api/v1/admin/support/tickets/${ticketId}`);
    expect(detail.status).toBe(200);
    // The opening description must read as the customer's words, not as an
    // operator reply, or the conversation starts mid-thread.
    expect(detail.body.data.messages).toHaveLength(1);
    expect(detail.body.data.messages[0].authorRole).toBe("customer");
  });

  it("refuses a ticket for an organization that does not exist", async () => {
    const response = await admin("post", "/api/v1/admin/support/tickets").send({
      organizationId: "00000000-0000-0000-0000-000000000000",
      subject: "Ghost customer",
      body: "Should not be accepted.",
    });
    expect(response.status).toBe(404);
  });

  it("refuses a customer session", async () => {
    const registration = await request(app).post("/api/v1/auth/register").send({
      name: "Not An Operator",
      email: `not-operator-${unique()}@orbit.test`,
      password: "OrbitTarget123!",
      organizationName: `Outsider ${unique()}`,
    });
    const response = await request(app)
      .get("/api/v1/admin/support/tickets")
      .set("authorization", `Bearer ${registration.body.data.token}`);
    expect(response.status).toBe(403);
  });
});

describe("First-response tracking", () => {
  it("stamps the first reply and leaves it alone afterwards", async () => {
    const ticketId = await openTicket();

    await admin("post", `/api/v1/admin/support/tickets/${ticketId}/reply`).send({ body: "Looking into it now." });
    const first = await admin("get", `/api/v1/admin/support/tickets/${ticketId}`);
    const stamped = first.body.data.firstResponseAt;
    expect(stamped).toBeTruthy();
    expect(first.body.data.status).toBe("pending");

    await admin("post", `/api/v1/admin/support/tickets/${ticketId}/reply`).send({ body: "An update for you." });
    const second = await admin("get", `/api/v1/admin/support/tickets/${ticketId}`);
    // A later reply must not rewrite when the customer was actually first
    // answered, or attainment could be repaired after the fact.
    expect(second.body.data.firstResponseAt).toBe(stamped);
  });

  it("does not let an internal note stop the clock", async () => {
    const ticketId = await openTicket();

    await admin("post", `/api/v1/admin/support/tickets/${ticketId}/reply`).send({
      body: "Escalating to whoever owns the transfer worker.",
      internal: true,
    });

    const detail = await admin("get", `/api/v1/admin/support/tickets/${ticketId}`);
    expect(detail.body.data.firstResponseAt).toBeNull();
    // Still awaiting an answer as far as the customer is concerned.
    expect(detail.body.data.status).toBe("open");
    expect(detail.body.data.sla.met).toBe(false);
    // The note is on the ticket, but it is not a customer-visible message.
    expect(detail.body.data.messages.some((message: { authorRole: string }) => message.authorRole === "internal")).toBe(true);
    expect(detail.body.data.messageCount).toBe(1);
  });

  it("carries a target that reflects priority", async () => {
    const urgent = await openTicket("urgent", "Production is down");
    const low = await openTicket("low", "Question about billing");

    const [urgentDetail, lowDetail] = await Promise.all([
      admin("get", `/api/v1/admin/support/tickets/${urgent}`),
      admin("get", `/api/v1/admin/support/tickets/${low}`),
    ]);
    expect(urgentDetail.body.data.sla.targetMinutes).toBeLessThan(lowDetail.body.data.sla.targetMinutes);
  });
});

describe("Ticket state", () => {
  it("records a reopen and an escalation under their own action names", async () => {
    const ticketId = await openTicket("normal");

    await admin("patch", `/api/v1/admin/support/tickets/${ticketId}`).send({ priority: "urgent" });
    await admin("patch", `/api/v1/admin/support/tickets/${ticketId}`).send({ status: "resolved" });
    await admin("patch", `/api/v1/admin/support/tickets/${ticketId}`).send({ status: "open" });

    const escalations = await admin("get", "/api/v1/admin/platform-audit?action=support.escalate");
    expect(escalations.body.data.some((row: { targetId: string }) => row.targetId === ticketId)).toBe(true);

    const reopens = await admin("get", "/api/v1/admin/platform-audit?action=support.reopen");
    expect(reopens.body.data.some((row: { targetId: string }) => row.targetId === ticketId)).toBe(true);

    // Reopening has to clear the resolution time, otherwise the ticket keeps
    // counting toward the weekly resolved figure while it is still open.
    const detail = await admin("get", `/api/v1/admin/support/tickets/${ticketId}`);
    expect(detail.body.data.status).toBe("open");
    expect(detail.body.data.resolvedAt).toBeNull();
  });

  it("assigns and unassigns", async () => {
    const ticketId = await openTicket();

    const assigned = await admin("patch", `/api/v1/admin/support/tickets/${ticketId}`).send({ assignedTo: adminUserId });
    expect(assigned.body.data.assignedToId).toBe(adminUserId);

    // An explicit null clears the owner; omitting the field must leave it alone.
    const untouched = await admin("patch", `/api/v1/admin/support/tickets/${ticketId}`).send({ priority: "high" });
    expect(untouched.body.data.assignedToId).toBe(adminUserId);

    const cleared = await admin("patch", `/api/v1/admin/support/tickets/${ticketId}`).send({ assignedTo: null });
    expect(cleared.body.data.assignedToId).toBeNull();
  });

  it("lists operators who can own a ticket", async () => {
    const response = await admin("get", "/api/v1/admin/support/operators");
    expect(response.status).toBe(200);
    expect(response.body.data.some((operator: { email: string }) => operator.email === "admin@orbit.dev")).toBe(true);
  });
});

describe("Queue metrics", () => {
  it("reports figures without inventing the ones it cannot measure", async () => {
    const response = await admin("get", "/api/v1/admin/support/metrics");
    expect(response.status).toBe(200);
    const metrics = response.body.data;
    expect(typeof metrics.open).toBe("number");
    // Either a real median or an explicit null; never a zero standing in for
    // "nothing has been answered yet".
    expect(metrics.medianFirstResponseMinutes === null || typeof metrics.medianFirstResponseMinutes === "number").toBe(true);
    expect(metrics.slaAttainmentPercent === null || typeof metrics.slaAttainmentPercent === "number").toBe(true);
  });

  it("counts an answered ticket toward the median", async () => {
    const ticketId = await openTicket();
    await admin("post", `/api/v1/admin/support/tickets/${ticketId}/reply`).send({ body: "Answered." });

    const response = await admin("get", "/api/v1/admin/support/metrics");
    expect(response.body.data.sampleSize).toBeGreaterThan(0);
    expect(typeof response.body.data.medianFirstResponseMinutes).toBe("number");
  });
});

describe("Feature flags", () => {
  it("stores the owner, risk, and staging gate the console collects", async () => {
    const key = `test.flag_${unique()}`;
    const saved = await admin("put", `/api/v1/admin/feature-flags/${key}`).send({
      name: "Test capability", description: "Exercised by the suite",
      owner: "Platform Reliability", risk: "high",
      enabled: true, stagingEnabled: true, rolloutPercent: 25,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.owner).toBe("Platform Reliability");
    expect(saved.body.data.risk).toBe("high");
    expect(saved.body.data.stagingEnabled).toBe(true);

    const list = await admin("get", "/api/v1/admin/feature-flags");
    const flag = list.body.data.find((row: { key: string }) => row.key === key);
    expect(flag.rolloutPercent).toBe(25);

    await admin("delete", `/api/v1/admin/feature-flags/${key}`);
  });

  it("records the previous production state alongside the new one", async () => {
    const key = `test.flag_${unique()}`;
    await admin("put", `/api/v1/admin/feature-flags/${key}`).send({ name: "Rollout check", enabled: false });
    await admin("put", `/api/v1/admin/feature-flags/${key}`).send({ name: "Rollout check", enabled: true });

    const audit = await admin("get", "/api/v1/admin/platform-audit?action=feature_flag.update");
    const entry = audit.body.data.find((row: { targetId: string; metadata: { enabled: boolean } }) =>
      row.targetId === key && row.metadata.enabled === true);
    // "Turned on" and "was already on" are different events, and only the audit
    // can tell them apart after the fact.
    expect(entry.metadata.previouslyEnabled).toBe(false);

    await admin("delete", `/api/v1/admin/feature-flags/${key}`);
  });

  it("rejects an invalid risk level", async () => {
    const response = await admin("put", `/api/v1/admin/feature-flags/test.bad_${unique()}`)
      .send({ name: "Bad risk", risk: "catastrophic" });
    expect(response.status).toBe(400);
  });
});

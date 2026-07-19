import "dotenv/config";
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

/**
 * Announcements, both ends.
 *
 * The properties worth holding are the ones that would let a figure lie or a
 * message reach the wrong person: audience targeting following the live plan,
 * unique views staying unique, and a withdrawal being honest about email that
 * has already left.
 */

let app: Express;
let closePool: () => Promise<void>;
let pool: import("pg").Pool;
let adminToken = "";

const unique = () => `${Date.now()}${Math.floor(Math.random() * 10_000)}`;

function admin(method: "get" | "post" | "patch" | "delete", path: string) {
  return request(app)[method](path).set("authorization", `Bearer ${adminToken}`);
}

interface Customer { token: string; userId: string; organizationId: string }

async function newCustomer(plan: "free" | "pro" | "enterprise" = "free"): Promise<Customer> {
  const response = await request(app).post("/api/v1/auth/register").send({
    name: "Announcement Reader",
    email: `reader-${unique()}@orbit.test`,
    password: "OrbitReader123!",
    organizationName: `Reader Org ${unique()}`,
  });
  expect(response.status).toBe(201);
  const organizationId = response.body.data.organizations[0].id as string;
  if (plan !== "free") {
    await pool.query("UPDATE organizations SET plan = $2 WHERE id = $1", [organizationId, plan]);
  }
  return { token: response.body.data.token, userId: response.body.data.user.id, organizationId };
}

async function createAnnouncement(body: Record<string, unknown> = {}) {
  const response = await admin("post", "/api/v1/admin/announcements").send({
    title: `Notice ${unique()}`,
    body: "Maintenance is scheduled for the EU region.",
    ...body,
  });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

beforeAll(async () => {
  ({ app } = await import("../app.js"));
  const database = await import("../database/pool.js");
  const migrations = await import("../database/migrate.js");
  const seeding = await import("../database/seed.js");
  pool = database.pool;
  closePool = database.closePool;
  await migrations.migrate();
  await seeding.seed();
  const login = await request(app).post("/api/v1/auth/login").send({ email: "admin@orbit.dev", password: "OrbitAdmin123!" });
  expect(login.status).toBe(200);
  adminToken = login.body.data.token as string;
}, 60_000);

beforeEach(async () => {
  // Announcements are global, so one test's published notice would otherwise
  // show up in another test's customer feed.
  await pool.query("DELETE FROM announcements");
});

afterAll(async () => {
  if (closePool) await closePool();
});

describe("Composing", () => {
  it("treats a past publish time as a draft rather than scheduling something that never sends", async () => {
    const response = await admin("post", "/api/v1/admin/announcements").send({
      title: "Backdated notice",
      body: "This time has already gone.",
      publishAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("draft");
  });

  it("schedules a future publish time", async () => {
    const response = await admin("post", "/api/v1/admin/announcements").send({
      title: "Upcoming maintenance",
      body: "Scheduled work in the EU region.",
      publishAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(response.body.data.status).toBe("scheduled");
  });

  it("refuses a link that is not http or https", async () => {
    const response = await admin("post", "/api/v1/admin/announcements").send({
      title: "Malicious link",
      body: "Click here.",
      actionLabel: "Click",
      actionUrl: "javascript:alert(1)",
    });
    // The URL lands in an href in a customer's browser, so the scheme is not a
    // matter of operator trust.
    expect(response.status).toBe(400);
  });

  it("reports the reachable audience for a plan", async () => {
    await newCustomer("enterprise");
    const response = await admin("get", "/api/v1/admin/announcements/reach?audience=enterprise");
    expect(response.status).toBe(200);
    expect(response.body.data.inApp).toBeGreaterThan(0);
    expect(response.body.data.email).toBeLessThanOrEqual(response.body.data.inApp);
  });
});

describe("Audience targeting", () => {
  it("shows an all-customers announcement to everyone", async () => {
    const customer = await newCustomer("free");
    const id = await createAnnouncement({ audience: "all" });
    await admin("post", `/api/v1/admin/announcements/${id}/publish`);

    const feed = await request(app).get("/api/v1/announcements").set("authorization", `Bearer ${customer.token}`);
    expect(feed.body.data.some((row: { id: string }) => row.id === id)).toBe(true);
  });

  it("keeps a paid announcement away from a free workspace", async () => {
    const free = await newCustomer("free");
    const paid = await newCustomer("pro");
    const id = await createAnnouncement({ audience: "paid" });
    await admin("post", `/api/v1/admin/announcements/${id}/publish`);

    const freeFeed = await request(app).get("/api/v1/announcements").set("authorization", `Bearer ${free.token}`);
    expect(freeFeed.body.data.some((row: { id: string }) => row.id === id)).toBe(false);

    const paidFeed = await request(app).get("/api/v1/announcements").set("authorization", `Bearer ${paid.token}`);
    expect(paidFeed.body.data.some((row: { id: string }) => row.id === id)).toBe(true);
  });

  it("follows the plan as it is now, not as it was at publish time", async () => {
    const customer = await newCustomer("free");
    const id = await createAnnouncement({ audience: "paid" });
    await admin("post", `/api/v1/admin/announcements/${id}/publish`);

    const before = await request(app).get("/api/v1/announcements").set("authorization", `Bearer ${customer.token}`);
    expect(before.body.data.some((row: { id: string }) => row.id === id)).toBe(false);

    await pool.query("UPDATE organizations SET plan = 'pro' WHERE id = $1", [customer.organizationId]);

    // A stored recipient list would have been wrong the moment this happened.
    const after = await request(app).get("/api/v1/announcements").set("authorization", `Bearer ${customer.token}`);
    expect(after.body.data.some((row: { id: string }) => row.id === id)).toBe(true);
  });

  it("does not show a draft to anyone", async () => {
    const customer = await newCustomer();
    const id = await createAnnouncement();

    const feed = await request(app).get("/api/v1/announcements").set("authorization", `Bearer ${customer.token}`);
    expect(feed.body.data.some((row: { id: string }) => row.id === id)).toBe(false);
  });

  it("requires a session", async () => {
    const response = await request(app).get("/api/v1/announcements");
    expect(response.status).toBe(401);
  });
});

describe("Receipts", () => {
  it("counts a view once however many times it is recorded", async () => {
    const customer = await newCustomer();
    const id = await createAnnouncement();
    await admin("post", `/api/v1/admin/announcements/${id}/publish`);

    const view = () => request(app).post(`/api/v1/announcements/${id}/view`).set("authorization", `Bearer ${customer.token}`);
    await view();
    await view();
    await view();

    const list = await admin("get", "/api/v1/admin/announcements");
    const announcement = list.body.data.find((row: { id: string }) => row.id === id);
    // "Unique views" has to mean what it says; a reload cannot inflate it.
    expect(announcement.views).toBe(1);
  });

  it("records a click and implies the view", async () => {
    const customer = await newCustomer();
    const id = await createAnnouncement({ actionLabel: "Read more", actionUrl: "https://example.com/notice" });
    await admin("post", `/api/v1/admin/announcements/${id}/publish`);

    await request(app).post(`/api/v1/announcements/${id}/click`).set("authorization", `Bearer ${customer.token}`);

    const list = await admin("get", "/api/v1/admin/announcements");
    const announcement = list.body.data.find((row: { id: string }) => row.id === id);
    expect(announcement.clicks).toBe(1);
    // A click with no view would be a receipt against nothing.
    expect(announcement.views).toBe(1);
  });

  it("keeps a dismissal across devices", async () => {
    const customer = await newCustomer();
    const id = await createAnnouncement();
    await admin("post", `/api/v1/admin/announcements/${id}/publish`);

    await request(app).post(`/api/v1/announcements/${id}/dismiss`).set("authorization", `Bearer ${customer.token}`);

    // Stored server-side, so a second machine does not re-show it.
    const feed = await request(app).get("/api/v1/announcements").set("authorization", `Bearer ${customer.token}`);
    const row = feed.body.data.find((entry: { id: string }) => entry.id === id);
    expect(row.dismissedAt).toBeTruthy();
  });

  it("refuses a view for an announcement this person cannot see", async () => {
    const free = await newCustomer("free");
    const id = await createAnnouncement({ audience: "enterprise" });
    await admin("post", `/api/v1/admin/announcements/${id}/publish`);

    const response = await request(app).post(`/api/v1/announcements/${id}/view`).set("authorization", `Bearer ${free.token}`);
    expect(response.status).toBe(404);
  });
});

describe("Publishing", () => {
  it("refuses to publish the same announcement twice", async () => {
    const id = await createAnnouncement();
    const first = await admin("post", `/api/v1/admin/announcements/${id}/publish`);
    expect(first.status).toBe(200);
    // The guard is what stops two operators both triggering the broadcast.
    const second = await admin("post", `/api/v1/admin/announcements/${id}/publish`);
    expect(second.status).toBe(409);
  });

  it("withdraws from the app and reports email that already went", async () => {
    const customer = await newCustomer();
    const id = await createAnnouncement();
    await admin("post", `/api/v1/admin/announcements/${id}/publish`);
    await pool.query(
      `INSERT INTO announcement_deliveries(announcement_id, user_id, email, status)
       VALUES($1, $2, 'reader@orbit.test', 'sent')`,
      [id, customer.userId],
    );

    const response = await admin("post", `/api/v1/admin/announcements/${id}/unpublish`);
    // Being straight about what cannot be recalled.
    expect(response.body.data.emailsAlreadySent).toBe(1);

    const feed = await request(app).get("/api/v1/announcements").set("authorization", `Bearer ${customer.token}`);
    expect(feed.body.data.some((row: { id: string }) => row.id === id)).toBe(false);
  });

  it("publishes a scheduled announcement once its time arrives", async () => {
    const id = await createAnnouncement({ publishAt: new Date(Date.now() + 3_600_000).toISOString() });
    await pool.query("UPDATE announcements SET publish_at = now() - interval '1 minute' WHERE id = $1", [id]);

    const { publishDueAnnouncements } = await import("../services/announcement.service.js");
    const published = await publishDueAnnouncements();
    expect(published).toContain(id);

    // The second sweep must find nothing, or a scheduled broadcast would send
    // again on every pass.
    const again = await publishDueAnnouncements();
    expect(again).not.toContain(id);
  });

  it("refuses a customer session", async () => {
    const customer = await newCustomer();
    const response = await request(app)
      .post("/api/v1/admin/announcements")
      .set("authorization", `Bearer ${customer.token}`)
      .send({ title: "Not allowed", body: "Should be refused." });
    expect(response.status).toBe(403);
  });
});

describe("Email opt-out", () => {
  it("excludes someone who opted out from the email audience but not the app", async () => {
    const customer = await newCustomer();
    await request(app)
      .patch("/api/v1/profile")
      .set("authorization", `Bearer ${customer.token}`)
      .send({ announcementEmailOptOut: true });

    const { audienceMembers, emailRecipients } = await import("../services/announcement.service.js");
    const [inApp, byEmail] = await Promise.all([audienceMembers("all"), emailRecipients("all")]);

    expect(inApp.some((person) => person.userId === customer.userId)).toBe(true);
    // Opting out of announcements must not remove someone from the product.
    expect(byEmail.some((person) => person.userId === customer.userId)).toBe(false);
  });
});

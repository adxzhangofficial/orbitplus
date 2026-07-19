import { describe, expect, it } from "vitest";
import { firstResponseSla, targetMinutes } from "./support-sla.js";

/**
 * The SLA clock decides what the support desk shows as overdue, so the edges
 * matter more than the typical case: a ticket that was answered late must not
 * count as attained, and a ticket nobody can answer any more must not sit in
 * the queue accruing an infinite deficit.
 */

const hourAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

describe("Response targets", () => {
  it("gives an urgent ticket less time than a low one", () => {
    expect(targetMinutes("urgent", "pro")).toBeLessThan(targetMinutes("low", "pro"));
  });

  it("weights the target by plan", () => {
    // The same priority is answered faster for a customer paying for it.
    expect(targetMinutes("high", "enterprise")).toBeLessThan(targetMinutes("high", "pro"));
    expect(targetMinutes("high", "pro")).toBeLessThan(targetMinutes("high", "free"));
  });

  it("treats an unknown plan as free rather than throwing", () => {
    expect(targetMinutes("normal", null)).toBe(targetMinutes("normal", "free"));
  });
});

describe("First-response clock", () => {
  it("counts down while a ticket waits", () => {
    const state = firstResponseSla({
      priority: "urgent", plan: "pro", createdAt: hourAgo(0.25),
      firstResponseAt: null, status: "open",
    });
    expect(state.met).toBe(false);
    // 30-minute target, 15 minutes elapsed.
    expect(state.remainingMinutes).toBeGreaterThan(10);
    expect(state.remainingMinutes).toBeLessThanOrEqual(15);
  });

  it("goes negative once the target passes", () => {
    const state = firstResponseSla({
      priority: "urgent", plan: "pro", createdAt: hourAgo(3),
      firstResponseAt: null, status: "open",
    });
    expect(state.remainingMinutes).toBeLessThan(0);
    expect(state.met).toBe(false);
  });

  it("is met when the answer came inside the target", () => {
    const created = hourAgo(5);
    const state = firstResponseSla({
      priority: "normal", plan: "pro", createdAt: created,
      firstResponseAt: new Date(created.getTime() + 60 * 60_000), status: "pending",
    });
    expect(state.met).toBe(true);
  });

  it("is missed when the answer came after the target, however long ago", () => {
    const created = hourAgo(48);
    const state = firstResponseSla({
      priority: "urgent", plan: "enterprise", createdAt: created,
      // Answered a day later against a 15-minute target.
      firstResponseAt: new Date(created.getTime() + 24 * 3_600_000), status: "resolved",
    });
    expect(state.met).toBe(false);
  });

  it("stops the clock on a ticket closed without a reply", () => {
    // Otherwise an old closed ticket would report a growing deficit forever and
    // drag the attainment figure down every day it is not deleted.
    const state = firstResponseSla({
      priority: "urgent", plan: "pro", createdAt: hourAgo(400),
      firstResponseAt: null, status: "closed",
    });
    expect(state.remainingMinutes).toBe(0);
    expect(state.met).toBe(false);
  });
});

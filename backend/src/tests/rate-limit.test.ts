import { describe, expect, it } from "vitest";
import { principalOf } from "../middleware/rate-limit.js";

/**
 * What a request counts against.
 *
 * Only /auth was limited before, which stopped password guessing and nothing
 * else. Every other route was unbounded, so one tenant could saturate the
 * workers and the SFTP connection pool for everyone else on the instance —
 * a tenant isolation failure, not only a capacity one.
 *
 * The keying is the part with real consequences: get it wrong and either a
 * whole office shares one budget, or a runaway CI job locks a person out of
 * the interface.
 */

type Req = Parameters<typeof principalOf>[0];
const request = (fields: Record<string, unknown>) => fields as unknown as Req;

describe("principalOf", () => {
  it("keys an API key separately from the person who created it", () => {
    // Otherwise a runaway CI job would spend its author's budget and lock them
    // out of the interface while they try to stop it.
    const key = principalOf(request({ auth: { apiKeyId: "key-1", userId: "user-1" }, ip: "1.2.3.4" }));
    const person = principalOf(request({ auth: { userId: "user-1" }, ip: "1.2.3.4" }));
    expect(key).not.toBe(person);
    expect(key).toContain("key-1");
  });

  it("keys by account rather than address for a signed-in request", () => {
    // A whole office behind one address is one IP but many customers; keying
    // on IP would have them throttle each other.
    const first = principalOf(request({ auth: { userId: "user-1" }, ip: "203.0.113.9" }));
    const second = principalOf(request({ auth: { userId: "user-2" }, ip: "203.0.113.9" }));
    expect(first).not.toBe(second);
  });

  it("follows the account across addresses", () => {
    // The same person on a laptop and a phone is one budget, not two.
    const office = principalOf(request({ auth: { userId: "user-1" }, ip: "203.0.113.9" }));
    const mobile = principalOf(request({ auth: { userId: "user-1" }, ip: "198.51.100.4" }));
    expect(office).toBe(mobile);
  });

  it("falls back to the address when nobody is signed in", () => {
    expect(principalOf(request({ ip: "203.0.113.9" }))).toBe("ip:203.0.113.9");
  });

  it("still produces a key when the address is unknown", () => {
    // A missing ip must not collapse to undefined and put every anonymous
    // request into one shared bucket by accident.
    expect(principalOf(request({}))).toBe("ip:unknown");
  });

  it("namespaces the kinds so a user id can never collide with a key id", () => {
    const asUser = principalOf(request({ auth: { userId: "shared-id" } }));
    const asKey = principalOf(request({ auth: { apiKeyId: "shared-id" } }));
    expect(asUser).not.toBe(asKey);
  });
});

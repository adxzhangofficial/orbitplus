import { describe, expect, it } from "vitest";
import { assertSeedAllowed, type SeedPolicyInput } from "./seed-policy.js";

const safeLocal: SeedPolicyInput = {
  nodeEnv: "development",
  allowDevelopmentSeed: true,
  expectedDatabaseName: "orbit",
  databaseUrl: "postgresql://developer:secret@127.0.0.1:5432/orbit",
};

describe("database seed policy", () => {
  it("allows the explicitly named local development database", () => {
    expect(() => assertSeedAllowed(safeLocal)).not.toThrow();
  });

  it("always rejects production", () => {
    expect(() => assertSeedAllowed({ ...safeLocal, nodeEnv: "production" })).toThrow("disabled in production");
  });

  it("requires the explicit opt-in flag and database name", () => {
    expect(() => assertSeedAllowed({ ...safeLocal, allowDevelopmentSeed: false })).toThrow("ALLOW_DEVELOPMENT_SEED");
    expect(() => assertSeedAllowed({ ...safeLocal, expectedDatabaseName: undefined })).toThrow("SEED_DATABASE_NAME");
  });

  it("rejects a different database even on localhost", () => {
    expect(() => assertSeedAllowed({ ...safeLocal, databaseUrl: "postgresql://developer:secret@127.0.0.1/orbit_prod" })).toThrow(
      "expected SEED_DATABASE_NAME",
    );
  });

  it("rejects remote databases unless their name explicitly marks them disposable", () => {
    expect(() => assertSeedAllowed({ ...safeLocal, databaseUrl: "postgresql://developer:secret@db.internal/orbit" })).toThrow(
      "Refusing to seed a remote database",
    );
    expect(() => assertSeedAllowed({
      ...safeLocal,
      expectedDatabaseName: "orbit_test",
      databaseUrl: "postgresql://developer:secret@db.internal/orbit_test",
    })).not.toThrow();
  });
});

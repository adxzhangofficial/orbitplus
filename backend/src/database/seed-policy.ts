export interface SeedPolicyInput {
  nodeEnv: "development" | "test" | "production";
  allowDevelopmentSeed: boolean;
  expectedDatabaseName?: string;
  databaseUrl: string;
}

export function assertSeedAllowed(input: SeedPolicyInput): void {
  if (input.nodeEnv === "production") {
    throw new Error("Database seeding is disabled in production");
  }
  if (!input.allowDevelopmentSeed || !input.expectedDatabaseName) {
    throw new Error("Database seeding requires ALLOW_DEVELOPMENT_SEED=true and an explicit SEED_DATABASE_NAME");
  }

  const databaseUrl = new URL(input.databaseUrl);
  const actualDatabaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  if (!actualDatabaseName || actualDatabaseName !== input.expectedDatabaseName) {
    throw new Error(`Refusing to seed database '${actualDatabaseName || "unknown"}'; expected SEED_DATABASE_NAME`);
  }

  const localHost = ["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname);
  const explicitlyDisposable = /(?:^|[-_])(dev|development|local|test)(?:$|[-_])/i.test(actualDatabaseName);
  if (!localHost && !explicitlyDisposable) {
    throw new Error("Refusing to seed a remote database that is not explicitly named as development/test/local");
  }
}
